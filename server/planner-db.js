/*
 * OpenClaw Visual Planner
 * server/planner-db.js
 *
 * The SQLite data layer owns migrations, plan persistence, version history, and
 * reusable templates so the Express API can stay thin and predictable.
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const {
  createPlannerId,
  normalizePlanDocument,
} = require('./planner-schema');
const {
  validatePlannerState,
} = require('./planner-validator');

const DEFAULT_DATA_DIR = path.resolve(__dirname, '..', 'data');
const DEFAULT_DB_PATH = path.join(DEFAULT_DATA_DIR, 'planner.sqlite');
const DEFAULT_MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const EMPTY_DOCUMENT = () => normalizePlanDocument({
  metadata: {
    title: 'Untitled Visual Plan',
    description: 'A visual workflow canvas for OpenClaw.',
  },
  graph: {
    nodes: [],
    edges: [],
  },
});

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function stringifyJson(value) {
  return JSON.stringify(value, null, 2);
}

function runMigrations(db, migrationsDir) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `);

  if (!fs.existsSync(migrationsDir)) {
    return;
  }

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations ORDER BY id ASC').all().map((row) => row.name),
  );

  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort((leftFile, rightFile) => leftFile.localeCompare(rightFile));

  const applyMigration = db.transaction((fileName, sql) => {
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(fileName, new Date().toISOString());
  });

  migrationFiles.forEach((fileName) => {
    if (applied.has(fileName)) {
      return;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, fileName), 'utf8');
    applyMigration(fileName, sql);
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function countGraph(document = {}) {
  return {
    nodeCount: Array.isArray(document.graph?.nodes) ? document.graph.nodes.length : 0,
    edgeCount: Array.isArray(document.graph?.edges) ? document.graph.edges.length : 0,
  };
}

function buildPlanRecord(row, options = {}) {
  if (!row) {
    return null;
  }

  const includeDocument = options.includeDocument !== false;
  const document = parseJson(row.document_json, EMPTY_DOCUMENT());
  const validationIssues = parseJson(row.validation_json, []);
  const counts = countGraph(document);

  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    templateId: row.template_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    versionCount: Number(row.version_count || 0),
    latestVersionId: row.latest_version_id || null,
    nodeCount: counts.nodeCount,
    edgeCount: counts.edgeCount,
    validation: {
      issues: validationIssues,
      issueCount: validationIssues.length,
      validatedAt: row.last_validated_at || null,
    },
    document: includeDocument ? document : undefined,
  };
}

function buildVersionRecord(row) {
  if (!row) {
    return null;
  }

  const document = parseJson(row.snapshot_json, EMPTY_DOCUMENT());
  const counts = countGraph(document);

  return {
    id: row.id,
    planId: row.plan_id,
    versionNumber: Number(row.version_number || 0),
    label: row.label || '',
    source: row.source || 'manual',
    createdAt: row.created_at,
    title: document.metadata?.title || 'Untitled Visual Plan',
    nodeCount: counts.nodeCount,
    edgeCount: counts.edgeCount,
    document,
  };
}

function buildTemplateRecord(row, options = {}) {
  if (!row) {
    return null;
  }

  const includeDocument = options.includeDocument !== false;
  const document = parseJson(row.document_json, EMPTY_DOCUMENT());
  const counts = countGraph(document);

  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    category: row.category || 'Custom',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    nodeCount: counts.nodeCount,
    edgeCount: counts.edgeCount,
    document: includeDocument ? document : undefined,
  };
}

function normalizePlanInput(input = {}, existingPlan = null) {
  const now = new Date().toISOString();
  const fallbackDocument = existingPlan?.document ? clone(existingPlan.document) : EMPTY_DOCUMENT();
  const sourceDocument = input.document !== undefined ? input.document : fallbackDocument;
  const document = normalizePlanDocument(sourceDocument);
  const planId = String(input.id || existingPlan?.id || createPlannerId('plan'));

  const title = String(
    input.title
      ?? document.metadata?.title
      ?? existingPlan?.title
      ?? 'Untitled Visual Plan',
  ).trim() || 'Untitled Visual Plan';

  const description = String(
    input.description
      ?? document.metadata?.description
      ?? existingPlan?.description
      ?? '',
  ).trim();

  const templateId = input.templateId ?? document.metadata?.templateId ?? existingPlan?.templateId ?? null;

  document.metadata.title = title;
  document.metadata.description = description;
  document.metadata.templateId = templateId;
  document.metadata.serverPlanId = planId;
  document.metadata.createdAt = existingPlan?.createdAt || document.metadata.createdAt || now;
  document.metadata.updatedAt = now;

  const validationIssues = validatePlannerState(document);

  return {
    planId,
    title,
    description,
    templateId,
    document,
    validationIssues,
    validatedAt: now,
  };
}

function normalizeTemplateInput(input = {}) {
  const now = new Date().toISOString();
  const templateId = String(input.id || createPlannerId('template'));
  const document = normalizePlanDocument(input.document || EMPTY_DOCUMENT());
  const title = String(input.title || document.metadata?.title || 'Untitled Template').trim() || 'Untitled Template';
  const description = String(input.description || document.metadata?.description || '').trim();
  const category = String(input.category || 'Custom').trim() || 'Custom';

  document.metadata.title = title;
  document.metadata.description = description;
  document.metadata.templateId = templateId;
  document.metadata.updatedAt = now;

  return {
    templateId,
    title,
    description,
    category,
    document,
    timestamp: now,
  };
}

function createPlannerDatabase(options = {}) {
  const dbPath = path.resolve(options.dbPath || process.env.PLANNER_DB_PATH || DEFAULT_DB_PATH);
  const migrationsDir = path.resolve(options.migrationsDir || DEFAULT_MIGRATIONS_DIR);

  ensureDirectory(path.dirname(dbPath));

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  runMigrations(db, migrationsDir);

  const statements = {
    selectPlanById: db.prepare('SELECT * FROM plans WHERE id = ?'),
    selectAllPlans: db.prepare('SELECT * FROM plans ORDER BY updated_at DESC'),
    insertPlan: db.prepare(`
      INSERT INTO plans (
        id,
        title,
        description,
        template_id,
        document_json,
        validation_json,
        latest_version_id,
        version_count,
        last_validated_at,
        created_at,
        updated_at
      ) VALUES (
        @id,
        @title,
        @description,
        @templateId,
        @documentJson,
        @validationJson,
        @latestVersionId,
        @versionCount,
        @lastValidatedAt,
        @createdAt,
        @updatedAt
      )
    `),
    updatePlan: db.prepare(`
      UPDATE plans
      SET title = @title,
          description = @description,
          template_id = @templateId,
          document_json = @documentJson,
          validation_json = @validationJson,
          latest_version_id = @latestVersionId,
          version_count = @versionCount,
          last_validated_at = @lastValidatedAt,
          updated_at = @updatedAt
      WHERE id = @id
    `),
    deletePlan: db.prepare('DELETE FROM plans WHERE id = ?'),
    selectVersionsByPlanId: db.prepare('SELECT * FROM plan_versions WHERE plan_id = ? ORDER BY version_number DESC, created_at DESC'),
    insertVersion: db.prepare(`
      INSERT INTO plan_versions (
        id,
        plan_id,
        version_number,
        label,
        source,
        snapshot_json,
        created_at
      ) VALUES (
        @id,
        @planId,
        @versionNumber,
        @label,
        @source,
        @snapshotJson,
        @createdAt
      )
    `),
    selectTemplateById: db.prepare('SELECT * FROM templates WHERE id = ?'),
    selectAllTemplates: db.prepare('SELECT * FROM templates ORDER BY updated_at DESC'),
    insertTemplate: db.prepare(`
      INSERT INTO templates (
        id,
        title,
        description,
        category,
        document_json,
        created_at,
        updated_at
      ) VALUES (
        @id,
        @title,
        @description,
        @category,
        @documentJson,
        @createdAt,
        @updatedAt
      )
    `),
  };

  const createPlanTransaction = db.transaction((input = {}) => {
    const prepared = normalizePlanInput(input);
    const versionId = createPlannerId('version');
    const versionRecord = {
      id: versionId,
      planId: prepared.planId,
      versionNumber: 1,
      label: String(input.versionLabel || 'Initial save').trim() || 'Initial save',
      source: 'create',
      snapshotJson: stringifyJson({
        ...prepared.document,
        metadata: {
          ...prepared.document.metadata,
          serverVersionId: versionId,
        },
      }),
      createdAt: prepared.validatedAt,
    };

    const planDocument = {
      ...prepared.document,
      metadata: {
        ...prepared.document.metadata,
        serverVersionId: versionId,
      },
    };

    statements.insertPlan.run({
      id: prepared.planId,
      title: prepared.title,
      description: prepared.description,
      templateId: prepared.templateId,
      documentJson: stringifyJson(planDocument),
      validationJson: stringifyJson(prepared.validationIssues),
      latestVersionId: versionId,
      versionCount: 1,
      lastValidatedAt: prepared.validatedAt,
      createdAt: prepared.validatedAt,
      updatedAt: prepared.validatedAt,
    });

    statements.insertVersion.run(versionRecord);
    return prepared.planId;
  });

  const updatePlanTransaction = db.transaction((planId, input = {}) => {
    const currentRow = statements.selectPlanById.get(planId);
    if (!currentRow) {
      return null;
    }

    const currentPlan = buildPlanRecord(currentRow);
    const prepared = normalizePlanInput({ ...input, id: planId }, currentPlan);
    const shouldCreateVersion = input.createVersion !== false;
    let versionCount = currentPlan.versionCount;
    let latestVersionId = currentPlan.latestVersionId || null;
    let planDocument = clone(prepared.document);

    if (shouldCreateVersion) {
      versionCount += 1;
      latestVersionId = createPlannerId('version');
      planDocument.metadata.serverVersionId = latestVersionId;

      statements.insertVersion.run({
        id: latestVersionId,
        planId,
        versionNumber: versionCount,
        label: String(input.versionLabel || `Server save ${versionCount}`).trim() || `Server save ${versionCount}`,
        source: 'update',
        snapshotJson: stringifyJson(planDocument),
        createdAt: prepared.validatedAt,
      });
    } else {
      planDocument.metadata.serverVersionId = latestVersionId;
    }

    statements.updatePlan.run({
      id: planId,
      title: prepared.title,
      description: prepared.description,
      templateId: prepared.templateId,
      documentJson: stringifyJson(planDocument),
      validationJson: stringifyJson(prepared.validationIssues),
      latestVersionId,
      versionCount,
      lastValidatedAt: prepared.validatedAt,
      updatedAt: prepared.validatedAt,
    });

    return planId;
  });

  const createVersionTransaction = db.transaction((planId, input = {}) => {
    const currentRow = statements.selectPlanById.get(planId);
    if (!currentRow) {
      return null;
    }

    const currentPlan = buildPlanRecord(currentRow);
    const prepared = normalizePlanInput({
      ...input,
      id: planId,
      title: input.title ?? currentPlan.title,
      description: input.description ?? currentPlan.description,
      templateId: input.templateId ?? currentPlan.templateId,
      document: input.document ?? currentPlan.document,
    }, currentPlan);

    const versionNumber = currentPlan.versionCount + 1;
    const versionId = createPlannerId('version');
    const planDocument = {
      ...prepared.document,
      metadata: {
        ...prepared.document.metadata,
        serverVersionId: versionId,
      },
    };

    statements.insertVersion.run({
      id: versionId,
      planId,
      versionNumber,
      label: String(input.label || `Snapshot ${versionNumber}`).trim() || `Snapshot ${versionNumber}`,
      source: String(input.source || 'manual').trim() || 'manual',
      snapshotJson: stringifyJson(planDocument),
      createdAt: prepared.validatedAt,
    });

    statements.updatePlan.run({
      id: planId,
      title: prepared.title,
      description: prepared.description,
      templateId: prepared.templateId,
      documentJson: stringifyJson(planDocument),
      validationJson: stringifyJson(prepared.validationIssues),
      latestVersionId: versionId,
      versionCount: versionNumber,
      lastValidatedAt: prepared.validatedAt,
      updatedAt: prepared.validatedAt,
    });

    return versionId;
  });

  return {
    db,
    dbPath,
    listPlans() {
      return statements.selectAllPlans.all().map((row) => buildPlanRecord(row, { includeDocument: false }));
    },
    getPlan(planId) {
      return buildPlanRecord(statements.selectPlanById.get(planId));
    },
    createPlan(input = {}) {
      const planId = createPlanTransaction(input);
      return this.getPlan(planId);
    },
    updatePlan(planId, input = {}) {
      const updatedPlanId = updatePlanTransaction(planId, input);
      return updatedPlanId ? this.getPlan(updatedPlanId) : null;
    },
    deletePlan(planId) {
      const result = statements.deletePlan.run(planId);
      return result.changes > 0;
    },
    validatePlan(planId, input = {}) {
      const currentRow = statements.selectPlanById.get(planId);
      if (!currentRow) {
        return null;
      }

      const currentPlan = buildPlanRecord(currentRow);
      const prepared = normalizePlanInput({
        ...input,
        id: planId,
        title: input.title ?? currentPlan.title,
        description: input.description ?? currentPlan.description,
        templateId: input.templateId ?? currentPlan.templateId,
        document: input.document ?? currentPlan.document,
      }, currentPlan);

      if (input.persist !== false) {
        statements.updatePlan.run({
          id: planId,
          title: prepared.title,
          description: prepared.description,
          templateId: prepared.templateId,
          documentJson: stringifyJson(prepared.document),
          validationJson: stringifyJson(prepared.validationIssues),
          latestVersionId: currentPlan.latestVersionId,
          versionCount: currentPlan.versionCount,
          lastValidatedAt: prepared.validatedAt,
          updatedAt: currentPlan.updatedAt,
        });
      }

      return {
        planId,
        issues: prepared.validationIssues,
        validatedAt: prepared.validatedAt,
      };
    },
    listVersions(planId) {
      const currentRow = statements.selectPlanById.get(planId);
      if (!currentRow) {
        return null;
      }

      return statements.selectVersionsByPlanId.all(planId).map((row) => {
        const version = buildVersionRecord(row);
        return {
          id: version.id,
          planId: version.planId,
          versionNumber: version.versionNumber,
          label: version.label,
          source: version.source,
          createdAt: version.createdAt,
          title: version.title,
          nodeCount: version.nodeCount,
          edgeCount: version.edgeCount,
        };
      });
    },
    createVersion(planId, input = {}) {
      const versionId = createVersionTransaction(planId, input);
      if (!versionId) {
        return null;
      }

      const versions = statements.selectVersionsByPlanId.all(planId);
      const versionRow = versions.find((row) => row.id === versionId);

      return {
        version: buildVersionRecord(versionRow),
        plan: this.getPlan(planId),
      };
    },
    listTemplates() {
      return statements.selectAllTemplates.all().map((row) => buildTemplateRecord(row, { includeDocument: false }));
    },
    createTemplate(input = {}) {
      const prepared = normalizeTemplateInput(input);

      statements.insertTemplate.run({
        id: prepared.templateId,
        title: prepared.title,
        description: prepared.description,
        category: prepared.category,
        documentJson: stringifyJson(prepared.document),
        createdAt: prepared.timestamp,
        updatedAt: prepared.timestamp,
      });

      return buildTemplateRecord(statements.selectTemplateById.get(prepared.templateId));
    },
    close() {
      db.close();
    },
  };
}

module.exports = {
  DEFAULT_DB_PATH,
  createPlannerDatabase,
};
