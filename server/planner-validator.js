/*
 * OpenClaw Visual Planner
 * server/planner-validator.js
 *
 * Server-side validation mirrors the frontend validator so saved plans can be
 * checked consistently before export, simulation, or future execution.
 */

const {
  createPlannerId,
  getNodePorts,
  getNodeType,
  isEdgeTypeCompatible,
  normalizePlanDocument,
} = require('./planner-schema');

const EXECUTION_EDGE_TYPES = new Set([
  'sequence',
  'dependency',
  'conditional-yes',
  'conditional-no',
  'approval-path',
]);

const severityRank = {
  error: 0,
  warning: 1,
  info: 2,
};

function createIssue({ severity = 'warning', code, message, entityType, entityId, hint = '', fieldKey = '' }) {
  return {
    id: createPlannerId('issue'),
    severity,
    code,
    message,
    entityType,
    entityId,
    hint,
    fieldKey,
  };
}

function humanizeFieldLabel(field = {}) {
  if (field.label) {
    return field.label;
  }

  const value = String(field.key || 'Field')
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .trim();

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function resolveDocumentPayload(input = {}) {
  if (input?.document?.graph) {
    return normalizePlanDocument(input.document);
  }

  if (input?.graph) {
    return normalizePlanDocument(input);
  }

  return normalizePlanDocument(input);
}

function detectCycles(nodes = [], edges = []) {
  const graph = new Map(nodes.map((node) => [node.id, []]));

  edges.forEach((edge) => {
    if (!graph.has(edge.sourceNodeId) || !EXECUTION_EDGE_TYPES.has(edge.type)) {
      return;
    }

    graph.get(edge.sourceNodeId).push(edge.targetNodeId);
  });

  const visited = new Set();
  const stack = new Set();
  const cycles = [];

  const visit = (nodeId, trail = []) => {
    visited.add(nodeId);
    stack.add(nodeId);

    (graph.get(nodeId) || []).forEach((nextId) => {
      if (stack.has(nextId)) {
        cycles.push([...trail, nodeId, nextId]);
        return;
      }

      if (!visited.has(nextId)) {
        visit(nextId, [...trail, nodeId]);
      }
    });

    stack.delete(nodeId);
  };

  graph.forEach((_, nodeId) => {
    if (!visited.has(nodeId)) {
      visit(nodeId, []);
    }
  });

  return cycles;
}

function validatePlannerState(input = {}) {
  const document = resolveDocumentPayload(input);
  const issues = [];
  const nodes = document.graph.nodes || [];
  const edges = document.graph.edges || [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  if (!nodes.length) {
    issues.push(createIssue({
      severity: 'info',
      code: 'empty-graph',
      message: 'The canvas is empty. Start from a template or add a node before saving.',
      entityType: 'graph',
      entityId: 'root',
    }));
  }

  const duplicateNodeIds = new Set();
  const seenNodeIds = new Set();
  nodes.forEach((node) => {
    if (seenNodeIds.has(node.id)) {
      duplicateNodeIds.add(node.id);
    }
    seenNodeIds.add(node.id);
  });

  duplicateNodeIds.forEach((nodeId) => {
    issues.push(createIssue({
      severity: 'error',
      code: 'duplicate-node-id',
      message: `Duplicate node id detected: ${nodeId}`,
      entityType: 'node',
      entityId: nodeId,
    }));
  });

  const duplicateEdgeIds = new Set();
  const seenEdgeIds = new Set();
  edges.forEach((edge) => {
    if (seenEdgeIds.has(edge.id)) {
      duplicateEdgeIds.add(edge.id);
    }
    seenEdgeIds.add(edge.id);
  });

  duplicateEdgeIds.forEach((edgeId) => {
    issues.push(createIssue({
      severity: 'error',
      code: 'duplicate-edge-id',
      message: `Duplicate edge id detected: ${edgeId}`,
      entityType: 'edge',
      entityId: edgeId,
    }));
  });

  nodes.forEach((node) => {
    const definition = getNodeType(node.type);
    const title = String(node.data?.title || '').trim();

    if (!title) {
      issues.push(createIssue({
        severity: node.type === 'note' ? 'warning' : 'error',
        code: 'missing-title',
        message: `${definition.label} is missing a title.`,
        entityType: 'node',
        entityId: node.id,
        hint: 'Add a short descriptive title in the inspector.',
        fieldKey: 'title',
      }));
    }

    const requiredFields = (definition.fields || []).filter((field) => field.required);
    requiredFields.forEach((field) => {
      const value = node.data?.[field.key];
      const isBlank = typeof value === 'string'
        ? !value.trim()
        : value === null || value === undefined || value === false;

      if (isBlank) {
        const fieldLabel = humanizeFieldLabel(field);
        issues.push(createIssue({
          severity: 'error',
          code: 'missing-required-field',
          message: `${definition.label} is missing “${fieldLabel}”.`,
          entityType: 'node',
          entityId: node.id,
          hint: `Fill in ${fieldLabel.toLowerCase()} to make this node executable.`,
          fieldKey: field.key,
        }));
      }
    });

    if (node.type === 'task' && node.data?.startDate && node.data?.dueDate && String(node.data.dueDate) < String(node.data.startDate)) {
      issues.push(createIssue({
        severity: 'warning',
        code: 'task-date-order',
        message: 'Task due date lands before the start date.',
        entityType: 'node',
        entityId: node.id,
        hint: 'Adjust the task schedule so the due date is on or after the start date.',
        fieldKey: 'dueDate',
      }));
    }

    if (node.type === 'workflow-step' && Number(node.data?.timeoutMinutes || 0) < 1) {
      issues.push(createIssue({
        severity: 'error',
        code: 'invalid-timeout',
        message: 'Workflow steps must have a timeout of at least 1 minute.',
        entityType: 'node',
        entityId: node.id,
        hint: 'Increase the timeout so the step has time to run.',
        fieldKey: 'timeoutMinutes',
      }));
    }

    const incidentEdges = edges.filter((edge) => edge.sourceNodeId === node.id || edge.targetNodeId === node.id);
    if (!incidentEdges.length) {
      issues.push(createIssue({
        severity: 'warning',
        code: 'disconnected-node',
        message: `${definition.label} is disconnected from the rest of the graph.`,
        entityType: 'node',
        entityId: node.id,
        hint: 'Add an incoming or outgoing edge, or remove the node if it is no longer needed.',
      }));
    }

    if (node.type === 'decision') {
      const outgoing = edges.filter((edge) => edge.sourceNodeId === node.id);
      const hasYes = outgoing.some((edge) => edge.type === 'conditional-yes');
      const hasNo = outgoing.some((edge) => edge.type === 'conditional-no');

      if (!hasYes || !hasNo) {
        issues.push(createIssue({
          severity: 'error',
          code: 'decision-branching',
          message: 'Decision nodes should expose both Yes and No branches.',
          entityType: 'node',
          entityId: node.id,
          hint: 'Connect both the Yes and No output ports.',
        }));
      }
    }

    if (node.type === 'approval') {
      const outgoing = edges.filter((edge) => edge.sourceNodeId === node.id);
      const hasApprovalPath = outgoing.some((edge) => edge.type === 'approval-path');

      if (!hasApprovalPath) {
        issues.push(createIssue({
          severity: 'warning',
          code: 'approval-missing-success-path',
          message: 'Approval nodes should have an approved path.',
          entityType: 'node',
          entityId: node.id,
          hint: 'Connect the Approved output port to the next step.',
        }));
      }
    }
  });

  edges.forEach((edge) => {
    const sourceNode = nodeMap.get(edge.sourceNodeId);
    const targetNode = nodeMap.get(edge.targetNodeId);

    if (!sourceNode || !targetNode) {
      issues.push(createIssue({
        severity: 'error',
        code: 'edge-endpoint-missing',
        message: 'An edge points to a missing node.',
        entityType: 'edge',
        entityId: edge.id,
        hint: 'Reconnect or delete the orphaned edge.',
      }));
      return;
    }

    if (edge.sourceNodeId === edge.targetNodeId) {
      issues.push(createIssue({
        severity: 'warning',
        code: 'edge-self-loop',
        message: 'Self-loop edges are discouraged in the current planner.',
        entityType: 'edge',
        entityId: edge.id,
        hint: 'Route the loop through a decision or retry path node instead.',
      }));
    }

    const sourcePorts = getNodePorts(sourceNode).outputs;
    const targetPorts = getNodePorts(targetNode).inputs;
    const sourcePort = sourcePorts.find((port) => port.id === edge.sourcePortId);
    const targetPort = targetPorts.find((port) => port.id === edge.targetPortId);

    if (!sourcePort || !targetPort) {
      issues.push(createIssue({
        severity: 'error',
        code: 'edge-port-missing',
        message: 'An edge references a missing port.',
        entityType: 'edge',
        entityId: edge.id,
        hint: 'Reconnect the edge so it uses a valid port.',
      }));
      return;
    }

    if (!isEdgeTypeCompatible(sourcePort, edge.type) || !isEdgeTypeCompatible(targetPort, edge.type)) {
      issues.push(createIssue({
        severity: 'error',
        code: 'edge-type-incompatible',
        message: `The ${edge.type} edge is incompatible with its ports.`,
        entityType: 'edge',
        entityId: edge.id,
        hint: 'Change the edge type or reconnect using matching ports.',
        fieldKey: 'type',
      }));
    }
  });

  detectCycles(nodes, edges).forEach((cycle, index) => {
    issues.push(createIssue({
      severity: 'error',
      code: 'sequence-cycle',
      message: `A directed cycle was detected in the execution graph (${index + 1}).`,
      entityType: 'graph',
      entityId: cycle[0] || 'cycle',
      hint: 'Break the loop or represent the retry path explicitly with a fallback edge.',
    }));
  });

  return issues.sort((left, right) => {
    const severityCompare = (severityRank[left.severity] ?? 99) - (severityRank[right.severity] ?? 99);
    if (severityCompare !== 0) {
      return severityCompare;
    }

    return left.message.localeCompare(right.message);
  });
}

module.exports = {
  detectCycles,
  validatePlannerDocument: validatePlannerState,
  validatePlannerState,
};
