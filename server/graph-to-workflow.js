/*
 * OpenClaw Visual Planner
 * server/graph-to-workflow.js
 *
 * Workflow export and simulation share the same graph analysis pass so the
 * planner can translate editable graph JSON into dispatcher-friendly shapes.
 */

const {
  normalizePlanDocument,
} = require('./planner-schema');
const {
  detectCycles,
  validatePlannerState,
} = require('./planner-validator');

const EXECUTION_EDGE_TYPES = new Set([
  'sequence',
  'dependency',
  'conditional-yes',
  'conditional-no',
  'approval-path',
  'fallback',
]);

const EXECUTION_NODE_TYPES = new Set([
  'task',
  'agent',
  'tool',
  'workflow-step',
  'decision',
  'approval',
  'runbook',
  'external-api',
]);

const DEAD_END_EXCLUDED_TYPES = new Set(['artifact', 'memory', 'note']);

const ARTIFACT_TYPE_MAP = {
  document: 'string',
  url: 'url',
  image: 'file',
  dataset: 'file',
  json: 'json',
};

function slugify(value, fallback = 'step') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return slug || fallback;
}

function uniqueName(seed, usedNames) {
  const base = slugify(seed);
  let value = base;
  let index = 2;

  while (usedNames.has(value)) {
    value = `${base}_${index}`;
    index += 1;
  }

  usedNames.add(value);
  return value;
}

function getNodeTitle(node) {
  return String(node?.data?.title || node?.type || 'Untitled node').trim() || 'Untitled node';
}

function sortNodes(leftNode, rightNode) {
  return (Number(leftNode.x || 0) - Number(rightNode.x || 0))
    || (Number(leftNode.y || 0) - Number(rightNode.y || 0))
    || getNodeTitle(leftNode).localeCompare(getNodeTitle(rightNode));
}

function getNodeStepSeed(node) {
  if (node.type === 'workflow-step') {
    return node.data?.stepName || getNodeTitle(node);
  }

  if (node.type === 'task') {
    return getNodeTitle(node);
  }

  if (node.type === 'agent') {
    return node.data?.agentName || getNodeTitle(node);
  }

  if (node.type === 'tool') {
    return node.data?.toolIdentifier || getNodeTitle(node);
  }

  if (node.type === 'decision') {
    return getNodeTitle(node);
  }

  if (node.type === 'approval') {
    return node.data?.approverRole || getNodeTitle(node);
  }

  if (node.type === 'runbook') {
    return node.data?.runbookId || getNodeTitle(node);
  }

  if (node.type === 'external-api') {
    return node.data?.endpointName || getNodeTitle(node);
  }

  return getNodeTitle(node);
}

function splitExpectedOutputs(value = '') {
  return String(value || '')
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildExecutionAnalysis(documentInput = {}) {
  const document = normalizePlanDocument(documentInput);
  const nodes = document.graph.nodes || [];
  const edges = document.graph.edges || [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const executionNodes = nodes.filter((node) => EXECUTION_NODE_TYPES.has(node.type));
  const executionNodeIds = new Set(executionNodes.map((node) => node.id));
  const executionEdges = edges.filter((edge) => EXECUTION_EDGE_TYPES.has(edge.type)
    && executionNodeIds.has(edge.sourceNodeId)
    && executionNodeIds.has(edge.targetNodeId)
    && edge.sourceNodeId !== edge.targetNodeId);

  const incoming = new Map(executionNodes.map((node) => [node.id, []]));
  const outgoing = new Map(executionNodes.map((node) => [node.id, []]));
  const indegree = new Map(executionNodes.map((node) => [node.id, 0]));
  const outgoingCountByNodeId = new Map(nodes.map((node) => [node.id, 0]));

  executionEdges.forEach((edge) => {
    incoming.get(edge.targetNodeId)?.push(edge.sourceNodeId);
    outgoing.get(edge.sourceNodeId)?.push(edge.targetNodeId);
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) || 0) + 1);
    outgoingCountByNodeId.set(edge.sourceNodeId, (outgoingCountByNodeId.get(edge.sourceNodeId) || 0) + 1);
  });

  const queue = executionNodes
    .filter((node) => (indegree.get(node.id) || 0) === 0)
    .sort(sortNodes);

  const orderedNodes = [];
  const visited = new Set();

  while (queue.length) {
    const node = queue.shift();
    if (!node || visited.has(node.id)) {
      continue;
    }

    visited.add(node.id);
    orderedNodes.push(node);

    (outgoing.get(node.id) || []).forEach((targetNodeId) => {
      const nextIndegree = Math.max(0, (indegree.get(targetNodeId) || 0) - 1);
      indegree.set(targetNodeId, nextIndegree);
      if (nextIndegree === 0) {
        const targetNode = nodeMap.get(targetNodeId);
        if (targetNode) {
          queue.push(targetNode);
          queue.sort(sortNodes);
        }
      }
    });
  }

  executionNodes
    .filter((node) => !visited.has(node.id))
    .sort(sortNodes)
    .forEach((node) => orderedNodes.push(node));

  const usedStepNames = new Set();
  const stepNameByNodeId = new Map();
  orderedNodes.forEach((node) => {
    stepNameByNodeId.set(node.id, uniqueName(getNodeStepSeed(node), usedStepNames));
  });

  const dependenciesByNodeId = new Map();
  orderedNodes.forEach((node) => {
    const dependencies = (incoming.get(node.id) || [])
      .map((nodeId) => stepNameByNodeId.get(nodeId))
      .filter(Boolean);
    dependenciesByNodeId.set(node.id, dependencies);
  });

  const transitions = executionEdges.map((edge) => ({
    source_step: stepNameByNodeId.get(edge.sourceNodeId) || edge.sourceNodeId,
    source_node_id: edge.sourceNodeId,
    target_step: stepNameByNodeId.get(edge.targetNodeId) || edge.targetNodeId,
    target_node_id: edge.targetNodeId,
    edge_type: edge.type,
    label: edge.label || '',
    condition: edge.condition || '',
  }));

  return {
    document,
    nodes,
    edges,
    nodeMap,
    executionNodes,
    executionEdges,
    orderedNodes,
    incoming,
    outgoing,
    outgoingCountByNodeId,
    stepNameByNodeId,
    dependenciesByNodeId,
    transitions,
    cycles: detectCycles(executionNodes, executionEdges),
  };
}

function buildWorkflowSteps(analysis) {
  return analysis.orderedNodes.map((node, index) => {
    const step = {
      name: analysis.stepNameByNodeId.get(node.id) || `step_${index + 1}`,
      display_name: getNodeTitle(node),
      required: true,
      step_type: node.type,
      planner_node_id: node.id,
      planner_node_type: node.type,
    };

    const dependencies = analysis.dependenciesByNodeId.get(node.id) || [];
    if (dependencies.length) {
      step.depends_on = dependencies;
    }

    if (node.type === 'workflow-step') {
      step.timeout_minutes = Number(node.data?.timeoutMinutes || 30);
      if (node.data?.retryPolicy) {
        step.retry_policy = node.data.retryPolicy;
      }
      if (node.data?.stepType) {
        step.execution_mode = node.data.stepType;
      }
    }

    if (node.type === 'task' && node.data?.assigneeAgent) {
      step.assignee_agent = node.data.assigneeAgent;
    }

    if (node.type === 'tool' && node.data?.toolIdentifier) {
      step.tool_identifier = node.data.toolIdentifier;
    }

    if (node.type === 'approval' && node.data?.approverRole) {
      step.approver_role = node.data.approverRole;
    }

    if (node.type === 'runbook' && node.data?.runbookId) {
      step.runbook_id = node.data.runbookId;
    }

    if (node.type === 'external-api' && node.data?.endpointName) {
      step.endpoint_name = node.data.endpointName;
    }

    return step;
  });
}

function buildInputSchema(nodes = []) {
  const memoryNodes = nodes.filter((node) => node.type === 'memory');
  const usedNames = new Set();

  return {
    fields: memoryNodes.map((node, index) => ({
      name: uniqueName(node.data?.memoryReference || node.data?.fileReference || getNodeTitle(node) || `memory_${index + 1}`, usedNames),
      type: 'text',
      label: getNodeTitle(node),
      description: node.data?.projectNote || node.data?.description || '',
    })),
  };
}

function buildArtifactContract(nodes = []) {
  const expectedOutputs = {};

  nodes.filter((node) => node.type === 'artifact').forEach((node, index) => {
    const key = slugify(getNodeTitle(node), `artifact_${index + 1}`);
    expectedOutputs[key] = {
      type: ARTIFACT_TYPE_MAP[node.data?.artifactType] || 'string',
      required: true,
      description: node.data?.description || node.data?.filePath || getNodeTitle(node),
    };
  });

  nodes.filter((node) => node.type === 'workflow-step').forEach((node) => {
    splitExpectedOutputs(node.data?.expectedOutputs).forEach((outputName) => {
      const key = slugify(outputName);
      if (!expectedOutputs[key]) {
        expectedOutputs[key] = {
          type: 'string',
          required: false,
          description: `Expected output from ${getNodeTitle(node)}`,
        };
      }
    });
  });

  return { expected_outputs: expectedOutputs };
}

function convertPlannerGraphToWorkflowTemplate(documentInput = {}, options = {}) {
  const analysis = buildExecutionAnalysis(documentInput);
  const title = analysis.document.metadata?.title || 'Visual Planner Workflow';
  const description = analysis.document.metadata?.description || 'Workflow exported from the Visual Planner.';
  const validationIssues = validatePlannerState(analysis.document);
  const errorCount = validationIssues.filter((issue) => issue.severity === 'error').length;
  const approvalNodes = analysis.nodes.filter((node) => node.type === 'approval');
  const runbookNode = analysis.nodes.find((node) => node.type === 'runbook' && node.data?.runbookId);
  const defaultOwnerAgent = analysis.nodes.find((node) => node.type === 'task' && node.data?.assigneeAgent)?.data?.assigneeAgent
    || analysis.nodes.find((node) => node.type === 'agent' && node.data?.agentName)?.data?.agentName
    || 'main';

  return {
    name: slugify(options.name || analysis.document.metadata?.templateId || title, 'visual_planner_workflow'),
    display_name: title,
    description,
    category: options.category || 'general',
    ui_category: options.uiCategory || options.category || 'general',
    default_owner_agent: defaultOwnerAgent,
    steps: buildWorkflowSteps(analysis),
    required_approvals: approvalNodes.map((node) => `${slugify(getNodeTitle(node), 'approval')}_approval`),
    success_criteria: {
      required_outputs: Object.keys(buildArtifactContract(analysis.nodes).expected_outputs || {}),
      validation_error_count: errorCount,
      execution_step_count: analysis.orderedNodes.length,
    },
    input_schema: buildInputSchema(analysis.nodes),
    artifact_contract: buildArtifactContract(analysis.nodes),
    blocker_policy: {
      stop_on_validation_errors: true,
      cycle_count: analysis.cycles.length,
    },
    escalation_policy: {
      approval_gates: approvalNodes.map((node) => ({
        approval: getNodeTitle(node),
        escalation_behavior: node.data?.escalationBehavior || '',
        timeout_behavior: node.data?.timeoutBehavior || '',
      })),
    },
    runbook_ref: runbookNode?.data?.runbookId || null,
    visual_planner: {
      exported_at: new Date().toISOString(),
      source_plan_id: analysis.document.metadata?.serverPlanId || null,
      source_version_id: analysis.document.metadata?.serverVersionId || null,
      node_count: analysis.nodes.length,
      edge_count: analysis.edges.length,
      execution_node_count: analysis.executionNodes.length,
      cycle_count: analysis.cycles.length,
      execution_order: analysis.orderedNodes.map((node) => analysis.stepNameByNodeId.get(node.id)),
      transitions: analysis.transitions,
    },
  };
}

function simulatePlannerGraph(documentInput = {}, options = {}) {
  const analysis = buildExecutionAnalysis(documentInput);
  const validationIssues = validatePlannerState(analysis.document);
  const approvalNodes = analysis.nodes.filter((node) => node.type === 'approval');

  const deadEnds = analysis.nodes
    .filter((node) => !DEAD_END_EXCLUDED_TYPES.has(node.type))
    .filter((node) => (analysis.outgoingCountByNodeId.get(node.id) || 0) === 0)
    .map((node) => ({
      nodeId: node.id,
      title: getNodeTitle(node),
      type: node.type,
      stepName: analysis.stepNameByNodeId.get(node.id) || null,
    }));

  const riskPoints = [];

  analysis.nodes.filter((node) => node.type === 'external-api').forEach((node) => {
    riskPoints.push({
      nodeId: node.id,
      type: 'external-api',
      severity: node.data?.operationalStatus === 'offline' ? 'high' : 'medium',
      title: getNodeTitle(node),
      detail: `External dependency: ${node.data?.endpointName || 'Unnamed service'}`,
    });
  });

  approvalNodes.forEach((node) => {
    if (node.data?.timeoutBehavior || node.data?.escalationBehavior) {
      riskPoints.push({
        nodeId: node.id,
        type: 'approval-timeout',
        severity: node.data?.timeoutBehavior ? 'high' : 'medium',
        title: getNodeTitle(node),
        detail: node.data?.timeoutBehavior || node.data?.escalationBehavior || 'Approval gate can block execution.',
      });
    }
  });

  if (analysis.cycles.length) {
    riskPoints.push({
      nodeId: analysis.cycles[0][0] || 'cycle',
      type: 'execution-cycle',
      severity: 'high',
      title: 'Execution cycle detected',
      detail: `Detected ${analysis.cycles.length} directed cycle${analysis.cycles.length === 1 ? '' : 's'} in execution edges.`,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    planId: options.planId || analysis.document.metadata?.serverPlanId || null,
    hasCycles: analysis.cycles.length > 0,
    cycleCount: analysis.cycles.length,
    executionOrder: analysis.orderedNodes.map((node, index) => ({
      index: index + 1,
      nodeId: node.id,
      stepName: analysis.stepNameByNodeId.get(node.id) || `step_${index + 1}`,
      title: getNodeTitle(node),
      type: node.type,
      dependsOn: analysis.dependenciesByNodeId.get(node.id) || [],
    })),
    deadEnds,
    approvalGateCount: approvalNodes.length,
    riskPoints,
    metrics: {
      nodeCount: analysis.nodes.length,
      edgeCount: analysis.edges.length,
      executionNodeCount: analysis.executionNodes.length,
      validationIssueCount: validationIssues.length,
    },
    validationIssues,
  };
}

module.exports = {
  buildExecutionAnalysis,
  convertPlannerGraphToWorkflowTemplate,
  simulatePlannerGraph,
};
