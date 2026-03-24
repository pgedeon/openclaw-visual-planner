/*
 * OpenClaw Visual Planner
 * server/planner-schema.js
 *
 * The backend keeps a lightweight copy of the planner schema so validation,
 * simulation, and persistence can work without depending on browser globals.
 */

const DEFAULT_GRID_SIZE = 24;

const EDGE_TYPES = [
  'sequence',
  'dependency',
  'conditional-yes',
  'conditional-no',
  'data-flow',
  'approval-path',
  'fallback',
];

const FLOW_IN = { id: 'in', label: 'In', edgeTypes: EDGE_TYPES };
const FLOW_OUT = { id: 'out', label: 'Out', edgeTypes: ['sequence', 'dependency', 'data-flow', 'fallback'] };
const DATA_OUT = { id: 'data', label: 'Data', edgeTypes: ['data-flow'] };
const DATA_IN = { id: 'data-in', label: 'Data', edgeTypes: ['data-flow'] };

const commonFields = [
  { key: 'title', required: true, value: '' },
  { key: 'description', required: false, value: '' },
];

const appearanceFields = [
  { key: 'visualColor', required: false, value: '' },
  { key: 'visualStyle', required: false, value: 'default' },
];

const nodeTypes = {
  note: {
    label: 'Note',
    defaultSize: { width: 260, height: 164 },
    fields: [{ key: 'tone', value: 'idea' }],
    getPorts: () => ({ inputs: [FLOW_IN], outputs: [FLOW_OUT] }),
  },
  task: {
    label: 'Task',
    defaultSize: { width: 280, height: 176 },
    fields: [
      { key: 'assigneeAgent', required: true, value: '' },
      { key: 'priority', value: 'medium' },
      { key: 'status', value: 'backlog' },
      { key: 'startDate', value: '' },
      { key: 'dueDate', value: '' },
    ],
    getPorts: () => ({ inputs: [FLOW_IN], outputs: [FLOW_OUT, DATA_OUT] }),
  },
  agent: {
    label: 'Agent',
    defaultSize: { width: 260, height: 168 },
    fields: [
      { key: 'agentName', required: true, value: '' },
      { key: 'role', required: true, value: '' },
      { key: 'preferredModel', value: '' },
      { key: 'queueState', value: 'idle' },
      { key: 'healthSignal', value: 'healthy' },
    ],
    getPorts: () => ({ inputs: [FLOW_IN], outputs: [FLOW_OUT] }),
  },
  tool: {
    label: 'Tool',
    defaultSize: { width: 270, height: 172 },
    fields: [
      { key: 'toolIdentifier', required: true, value: '' },
      { key: 'inputContract', value: '' },
      { key: 'outputContract', value: '' },
      { key: 'riskProfile', value: 'medium' },
    ],
    getPorts: () => ({ inputs: [FLOW_IN, DATA_IN], outputs: [FLOW_OUT, DATA_OUT] }),
  },
  'workflow-step': {
    label: 'Workflow Step',
    defaultSize: { width: 300, height: 190 },
    fields: [
      { key: 'stepName', required: true, value: '' },
      { key: 'stepType', value: 'prompt' },
      { key: 'promptPayload', value: '' },
      { key: 'timeoutMinutes', value: 30 },
      { key: 'retryPolicy', value: '' },
      { key: 'expectedOutputs', value: '' },
    ],
    getPorts: () => ({ inputs: [FLOW_IN, DATA_IN], outputs: [FLOW_OUT, DATA_OUT] }),
  },
  decision: {
    label: 'Decision',
    defaultSize: { width: 260, height: 160 },
    fields: [
      { key: 'ruleExpression', required: true, value: '' },
      { key: 'evaluationMode', value: 'automatic' },
    ],
    getPorts: () => ({
      inputs: [FLOW_IN, DATA_IN],
      outputs: [
        { id: 'yes', label: 'Yes', edgeTypes: ['conditional-yes'] },
        { id: 'no', label: 'No', edgeTypes: ['conditional-no'] },
      ],
    }),
  },
  approval: {
    label: 'Approval',
    defaultSize: { width: 290, height: 176 },
    fields: [
      { key: 'approverRole', required: true, value: '' },
      { key: 'escalationBehavior', value: '' },
      { key: 'timeoutBehavior', value: '' },
      { key: 'rejectionHandling', value: '' },
    ],
    getPorts: () => ({
      inputs: [FLOW_IN, DATA_IN],
      outputs: [
        { id: 'approved', label: 'Approved', edgeTypes: ['approval-path'] },
        { id: 'rejected', label: 'Rejected', edgeTypes: ['fallback'] },
      ],
    }),
  },
  runbook: {
    label: 'Runbook',
    defaultSize: { width: 280, height: 172 },
    fields: [
      { key: 'runbookId', required: true, value: '' },
      { key: 'category', value: '' },
      { key: 'prerequisites', value: '' },
      { key: 'expectedOutputs', value: '' },
    ],
    getPorts: () => ({ inputs: [FLOW_IN], outputs: [FLOW_OUT, DATA_OUT] }),
  },
  artifact: {
    label: 'Artifact',
    defaultSize: { width: 270, height: 166 },
    fields: [
      { key: 'filePath', required: true, value: '' },
      { key: 'artifactType', value: 'document' },
      { key: 'sourceNode', value: '' },
    ],
    getPorts: () => ({ inputs: [FLOW_IN, DATA_IN], outputs: [DATA_OUT] }),
  },
  memory: {
    label: 'Memory / Context',
    defaultSize: { width: 280, height: 176 },
    fields: [
      { key: 'memoryReference', required: true, value: '' },
      { key: 'fileReference', value: '' },
      { key: 'projectNote', value: '' },
    ],
    getPorts: () => ({ inputs: [FLOW_IN], outputs: [DATA_OUT, FLOW_OUT] }),
  },
  'external-api': {
    label: 'External API / Service',
    defaultSize: { width: 300, height: 182 },
    fields: [
      { key: 'endpointName', required: true, value: '' },
      { key: 'authenticationRef', value: '' },
      { key: 'schemaNotes', value: '' },
      { key: 'operationalStatus', value: 'healthy' },
    ],
    getPorts: () => ({ inputs: [FLOW_IN, DATA_IN], outputs: [FLOW_OUT, DATA_OUT] }),
  },
  group: {
    label: 'Group / Subflow',
    defaultSize: { width: 320, height: 198 },
    fields: [
      { key: 'subflowName', required: true, value: '' },
      { key: 'collapsed', value: false },
      { key: 'templateExportable', value: true },
      { key: 'notes', value: '' },
    ],
    getPorts: () => ({ inputs: [FLOW_IN, DATA_IN], outputs: [FLOW_OUT, DATA_OUT] }),
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createPlannerId(prefix = 'id') {
  const random = Math.random().toString(36).slice(2, 8);
  const stamp = Date.now().toString(36);
  return `${prefix}_${stamp}_${random}`;
}

function getNodeType(type) {
  return nodeTypes[type] || nodeTypes.note;
}

function buildDefaultData(nodeType) {
  const defaults = {};
  commonFields.concat(appearanceFields, nodeType.fields || []).forEach((field) => {
    if (field.key === 'title') {
      defaults.title = nodeType.label;
      return;
    }

    if (field.key === 'description') {
      defaults.description = '';
      return;
    }

    defaults[field.key] = field.value ?? '';
  });
  return defaults;
}

function normalizeNode(node = {}) {
  const nodeType = getNodeType(node.type);
  const now = new Date().toISOString();
  const normalizedNode = {
    id: node.id || createPlannerId('node'),
    type: nodeType === nodeTypes.note && node.type && !nodeTypes[node.type] ? 'note' : (node.type || 'note'),
    x: Number(node.x || 0),
    y: Number(node.y || 0),
    width: Number(node.width || nodeType.defaultSize.width),
    height: Number(node.height || nodeType.defaultSize.height),
    data: buildDefaultData(nodeType),
    createdAt: node.createdAt || now,
    updatedAt: node.updatedAt || now,
  };

  if (node.data && typeof node.data === 'object') {
    Object.assign(normalizedNode.data, clone(node.data));
  }

  return normalizedNode;
}

function normalizeEdge(edge = {}) {
  const now = new Date().toISOString();
  return {
    id: edge.id || createPlannerId('edge'),
    type: edge.type || 'sequence',
    sourceNodeId: edge.sourceNodeId || null,
    sourcePortId: edge.sourcePortId || 'out',
    targetNodeId: edge.targetNodeId || null,
    targetPortId: edge.targetPortId || 'in',
    label: edge.label || '',
    condition: edge.condition || '',
    payloadNotes: edge.payloadNotes || '',
    executionPriority: edge.executionPriority || '',
    createdAt: edge.createdAt || now,
    updatedAt: edge.updatedAt || now,
  };
}

function getNodePorts(node = {}) {
  const nodeType = getNodeType(node.type);
  const ports = typeof nodeType.getPorts === 'function' ? nodeType.getPorts(node) : { inputs: [FLOW_IN], outputs: [FLOW_OUT] };
  return {
    inputs: (ports.inputs || []).map((port, index) => ({ role: 'input', index, ...clone(port) })),
    outputs: (ports.outputs || []).map((port, index) => ({ role: 'output', index, ...clone(port) })),
  };
}

function isEdgeTypeCompatible(port, edgeTypeId) {
  if (!port) {
    return false;
  }

  if (!Array.isArray(port.edgeTypes) || !port.edgeTypes.length) {
    return true;
  }

  return port.edgeTypes.includes(String(edgeTypeId || 'sequence').trim().toLowerCase());
}

function normalizePlanDocument(raw = {}) {
  const payload = typeof raw === 'string' ? JSON.parse(raw) : clone(raw || {});
  const now = new Date().toISOString();
  const metadata = payload.metadata || payload.document?.metadata || {};
  const graph = payload.graph || payload.document?.graph || {};

  return {
    schemaVersion: payload.schemaVersion || payload.document?.schemaVersion || 'openclaw.visual-planner/v1',
    metadata: {
      title: metadata.title || 'Untitled Visual Plan',
      description: metadata.description || 'A visual workflow canvas for OpenClaw.',
      templateId: metadata.templateId || null,
      serverPlanId: metadata.serverPlanId || null,
      serverVersionId: metadata.serverVersionId || null,
      createdAt: metadata.createdAt || now,
      updatedAt: now,
    },
    graph: {
      nodes: Array.isArray(graph.nodes) ? graph.nodes.map(normalizeNode) : [],
      edges: Array.isArray(graph.edges) ? graph.edges.map(normalizeEdge) : [],
    },
    viewport: {
      x: Number(payload.viewport?.x || 0),
      y: Number(payload.viewport?.y || 0),
      zoom: Number(payload.viewport?.zoom || 1),
    },
    preferences: {
      gridSize: Number(payload.preferences?.gridSize || DEFAULT_GRID_SIZE),
      snapToGrid: payload.preferences?.snapToGrid !== false,
      showGrid: payload.preferences?.showGrid !== false,
      showMinimap: payload.preferences?.showMinimap !== false,
    },
    runtime: {
      enabled: Boolean(payload.runtime?.enabled),
      scenario: payload.runtime?.scenario || 'idle',
      statuses: payload.runtime?.statuses && typeof payload.runtime.statuses === 'object'
        ? clone(payload.runtime.statuses)
        : {},
    },
  };
}

module.exports = {
  commonFields,
  appearanceFields,
  nodeTypes,
  createPlannerId,
  getNodeType,
  getNodePorts,
  isEdgeTypeCompatible,
  normalizeNode,
  normalizeEdge,
  normalizePlanDocument,
};
