/*
 * OpenClaw Visual Planner
 * server.js
 *
 * Express serves the standalone frontend and exposes a REST API for persisted
 * plans, validation, version history, and reusable templates.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const {
  createPlannerDatabase,
} = require('./server/planner-db');
const {
  convertPlannerGraphToWorkflowTemplate,
  simulatePlannerGraph,
} = require('./server/graph-to-workflow');

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 3000);

function createApp(options = {}) {
  const app = express();
  const database = options.database || createPlannerDatabase(options.databaseOptions || {});

  app.use(cors());
  app.use(express.json({ limit: '6mb' }));

  app.get('/api/health', (_request, response) => {
    response.json({
      ok: true,
      service: 'openclaw-visual-planner',
      time: new Date().toISOString(),
    });
  });

  app.get('/api/plans', (_request, response) => {
    response.json({ plans: database.listPlans() });
  });

  app.post('/api/plans', (request, response) => {
    const plan = database.createPlan(request.body || {});
    response.status(201).json({ plan });
  });

  app.get('/api/plans/:id', (request, response) => {
    const plan = database.getPlan(String(request.params.id || '').trim());
    if (!plan) {
      response.status(404).json({ error: 'Plan not found.' });
      return;
    }

    response.json({ plan });
  });

  app.put('/api/plans/:id', (request, response) => {
    const plan = database.updatePlan(String(request.params.id || '').trim(), request.body || {});
    if (!plan) {
      response.status(404).json({ error: 'Plan not found.' });
      return;
    }

    response.json({ plan });
  });

  app.delete('/api/plans/:id', (request, response) => {
    const deleted = database.deletePlan(String(request.params.id || '').trim());
    if (!deleted) {
      response.status(404).json({ error: 'Plan not found.' });
      return;
    }

    response.status(204).end();
  });

  app.post('/api/plans/:id/validate', (request, response) => {
    const validation = database.validatePlan(String(request.params.id || '').trim(), request.body || {});
    if (!validation) {
      response.status(404).json({ error: 'Plan not found.' });
      return;
    }

    response.json({ validation });
  });

  app.get('/api/plans/:id/versions', (request, response) => {
    const versions = database.listVersions(String(request.params.id || '').trim());
    if (!versions) {
      response.status(404).json({ error: 'Plan not found.' });
      return;
    }

    response.json({ versions });
  });

  app.post('/api/plans/:id/versions', (request, response) => {
    const payload = database.createVersion(String(request.params.id || '').trim(), request.body || {});
    if (!payload) {
      response.status(404).json({ error: 'Plan not found.' });
      return;
    }

    response.status(201).json(payload);
  });

  app.post('/api/plans/:id/export-workflow', (request, response) => {
    const plan = database.getPlan(String(request.params.id || '').trim());
    if (!plan) {
      response.status(404).json({ error: 'Plan not found.' });
      return;
    }

    const workflow = convertPlannerGraphToWorkflowTemplate(plan.document, {
      planId: plan.id,
    });
    response.json({ workflow });
  });

  app.post('/api/plans/:id/simulate', (request, response) => {
    const plan = database.getPlan(String(request.params.id || '').trim());
    if (!plan) {
      response.status(404).json({ error: 'Plan not found.' });
      return;
    }

    const simulation = simulatePlannerGraph(plan.document, {
      planId: plan.id,
    });
    response.json({ simulation });
  });

  app.get('/api/templates', (_request, response) => {
    response.json({ templates: database.listTemplates() });
  });

  app.post('/api/templates', (request, response) => {
    const template = database.createTemplate(request.body || {});
    response.status(201).json({ template });
  });

  app.get('/', (_request, response) => {
    response.sendFile(path.join(ROOT_DIR, 'index.html'));
  });

  app.get(/^\/([A-Za-z0-9._-]+\.(?:js|css|html))$/, (request, response, next) => {
    const assetName = request.params[0];
    const assetPath = path.resolve(ROOT_DIR, assetName);

    if (!assetPath.startsWith(ROOT_DIR) || !fs.existsSync(assetPath)) {
      next();
      return;
    }

    response.sendFile(assetPath);
  });

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'API route not found.' });
  });

  app.use((error, _request, response, _next) => {
    const statusCode = Number(error.status || error.statusCode || 500);
    response.status(statusCode).json({
      error: error.message || 'Unexpected server error.',
    });
  });

  return {
    app,
    database,
  };
}

function startServer(options = {}) {
  const { app, database } = createApp(options);
  const server = app.listen(options.port || PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`OpenClaw Visual Planner listening on http://localhost:${options.port || PORT}`);
  });

  const close = () => {
    try {
      database.close();
    } catch (error) {
      // Keep shutdown resilient even if the DB is already closed.
    }
    server.close();
  };

  process.once('SIGINT', close);
  process.once('SIGTERM', close);

  return { server, database };
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  startServer,
};
