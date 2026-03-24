/*
 * OpenClaw Visual Planner
 * planner-nodes.js
 *
 * The node registry defines all planner-capable node types, their defaults,
 * inspector fields, and port layouts for typed edge creation.
 */

(() => {
  const Planner = window.OpenClawPlanner = window.OpenClawPlanner || {};

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

  const commonInspectorFields = [
    {
      key: 'title',
      label: 'Title',
      type: 'text',
      required: true,
      placeholder: 'Node title',
    },
    {
      key: 'description',
      label: 'Description',
      type: 'textarea',
      placeholder: 'Describe the purpose of this node.',
    },
  ];

  const nodeTypes = [
    {
      type: 'note',
      label: 'Note',
      code: 'NO',
      category: 'Sketch',
      accent: '#7dd3fc',
      description: 'Freeform planning text that helps early ideation.',
      defaultSize: { width: 260, height: 164 },
      fields: [
        { key: 'tone', label: 'Tone', type: 'select', value: 'idea', options: [
          { value: 'idea', label: 'Idea' },
          { value: 'risk', label: 'Risk' },
          { value: 'todo', label: 'To-do' },
        ] },
      ],
      getPorts() {
        return { inputs: [FLOW_IN], outputs: [FLOW_OUT] };
      },
      summary(node) {
        return node.data.tone ? `Tone · ${node.data.tone}` : 'Sketch note';
      },
    },
    {
      type: 'task',
      label: 'Task',
      code: 'TA',
      category: 'Execution',
      accent: '#60cdff',
      description: 'Represents work items that may sync to the Tasks app.',
      defaultSize: { width: 280, height: 176 },
      fields: [
        { key: 'assigneeAgent', label: 'Assignee Agent', type: 'text', required: true, placeholder: 'coder' },
        { key: 'priority', label: 'Priority', type: 'select', value: 'medium', options: [
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
          { value: 'critical', label: 'Critical' },
        ] },
        { key: 'status', label: 'Status', type: 'select', value: 'backlog', options: [
          { value: 'backlog', label: 'Backlog' },
          { value: 'ready', label: 'Ready' },
          { value: 'in_progress', label: 'In Progress' },
          { value: 'review', label: 'Review' },
          { value: 'completed', label: 'Completed' },
        ] },
        { key: 'startDate', label: 'Start Date', type: 'date' },
        { key: 'dueDate', label: 'Due Date', type: 'date' },
      ],
      getPorts() {
        return { inputs: [FLOW_IN], outputs: [FLOW_OUT, DATA_OUT] };
      },
      summary(node) {
        return [node.data.priority, node.data.status].filter(Boolean).join(' · ') || 'Task node';
      },
    },
    {
      type: 'agent',
      label: 'Agent',
      code: 'AG',
      category: 'Execution',
      accent: '#a78bfa',
      description: 'Represents an OpenClaw agent and its operating profile.',
      defaultSize: { width: 260, height: 168 },
      fields: [
        { key: 'agentName', label: 'Agent Name', type: 'text', required: true, placeholder: 'affiliate-editorial' },
        { key: 'role', label: 'Role', type: 'text', required: true, placeholder: 'Editorial lead' },
        { key: 'preferredModel', label: 'Preferred Model', type: 'text', placeholder: 'openrouter/... or local model' },
        { key: 'queueState', label: 'Queue State', type: 'select', value: 'idle', options: [
          { value: 'idle', label: 'Idle' },
          { value: 'queued', label: 'Queued' },
          { value: 'busy', label: 'Busy' },
          { value: 'paused', label: 'Paused' },
        ] },
        { key: 'healthSignal', label: 'Health Signal', type: 'select', value: 'healthy', options: [
          { value: 'healthy', label: 'Healthy' },
          { value: 'degraded', label: 'Degraded' },
          { value: 'offline', label: 'Offline' },
        ] },
      ],
      getPorts() {
        return { inputs: [FLOW_IN], outputs: [FLOW_OUT] };
      },
      summary(node) {
        return [node.data.role, node.data.healthSignal].filter(Boolean).join(' · ') || 'Agent';
      },
    },
    {
      type: 'tool',
      label: 'Tool',
      code: 'TL',
      category: 'Execution',
      accent: '#f59e0b',
      description: 'Represents a callable tool or system capability.',
      defaultSize: { width: 270, height: 172 },
      fields: [
        { key: 'toolIdentifier', label: 'Tool Identifier', type: 'text', required: true, placeholder: 'browser.open' },
        { key: 'inputContract', label: 'Input Contract', type: 'textarea', placeholder: 'Describe required inputs.' },
        { key: 'outputContract', label: 'Output Contract', type: 'textarea', placeholder: 'Describe expected outputs.' },
        { key: 'riskProfile', label: 'Risk Profile', type: 'select', value: 'medium', options: [
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
        ] },
      ],
      getPorts() {
        return { inputs: [FLOW_IN, DATA_IN], outputs: [FLOW_OUT, DATA_OUT] };
      },
      summary(node) {
        return [node.data.toolIdentifier, node.data.riskProfile].filter(Boolean).join(' · ') || 'Tool';
      },
    },
    {
      type: 'workflow-step',
      label: 'Workflow Step',
      code: 'WS',
      category: 'Execution',
      accent: '#34d399',
      description: 'Represents a formal execution step in a dispatcher-backed workflow.',
      defaultSize: { width: 300, height: 190 },
      fields: [
        { key: 'stepName', label: 'Step Name', type: 'text', required: true, placeholder: 'drafting' },
        { key: 'stepType', label: 'Step Type', type: 'select', value: 'prompt', options: [
          { value: 'prompt', label: 'Prompt' },
          { value: 'tool', label: 'Tool' },
          { value: 'handoff', label: 'Handoff' },
          { value: 'runbook', label: 'Runbook' },
        ] },
        { key: 'promptPayload', label: 'Prompt / Payload', type: 'textarea', placeholder: 'Execution instructions or serialized payload.' },
        { key: 'timeoutMinutes', label: 'Timeout (min)', type: 'number', value: 30, min: 1, max: 480 },
        { key: 'retryPolicy', label: 'Retry Policy', type: 'text', placeholder: '3 retries / exponential backoff' },
        { key: 'expectedOutputs', label: 'Expected Outputs', type: 'textarea', placeholder: 'summary, live_url, artifact_bundle' },
      ],
      getPorts() {
        return { inputs: [FLOW_IN, DATA_IN], outputs: [FLOW_OUT, DATA_OUT] };
      },
      summary(node) {
        return [node.data.stepType, `${node.data.timeoutMinutes || 30}m timeout`].filter(Boolean).join(' · ') || 'Workflow step';
      },
    },
    {
      type: 'decision',
      label: 'Decision',
      code: 'DE',
      category: 'Control',
      accent: '#f97316',
      description: 'Branches execution with yes/no style conditions.',
      defaultSize: { width: 260, height: 160 },
      fields: [
        { key: 'ruleExpression', label: 'Rule Expression', type: 'textarea', required: true, placeholder: 'artifact_count > 0 && qa_status === "passed"' },
        { key: 'evaluationMode', label: 'Evaluation Mode', type: 'select', value: 'automatic', options: [
          { value: 'automatic', label: 'Automatic' },
          { value: 'manual', label: 'Manual' },
        ] },
      ],
      getPorts() {
        return {
          inputs: [FLOW_IN, DATA_IN],
          outputs: [
            { id: 'yes', label: 'Yes', edgeTypes: ['conditional-yes'] },
            { id: 'no', label: 'No', edgeTypes: ['conditional-no'] },
          ],
        };
      },
      summary(node) {
        return node.data.evaluationMode ? `${node.data.evaluationMode} branch` : 'Decision';
      },
    },
    {
      type: 'approval',
      label: 'Approval',
      code: 'AP',
      category: 'Control',
      accent: '#22c55e',
      description: 'Human checkpoint with escalation and rejection handling.',
      defaultSize: { width: 290, height: 176 },
      fields: [
        { key: 'approverRole', label: 'Approver Role', type: 'text', required: true, placeholder: 'editor-in-chief' },
        { key: 'escalationBehavior', label: 'Escalation Behavior', type: 'text', placeholder: 'Escalate to ops lead after 2h' },
        { key: 'timeoutBehavior', label: 'Timeout Behavior', type: 'text', placeholder: 'Auto-block workflow and notify' },
        { key: 'rejectionHandling', label: 'Rejection Handling', type: 'textarea', placeholder: 'Return to drafting and request note.' },
      ],
      getPorts() {
        return {
          inputs: [FLOW_IN, DATA_IN],
          outputs: [
            { id: 'approved', label: 'Approved', edgeTypes: ['approval-path'] },
            { id: 'rejected', label: 'Rejected', edgeTypes: ['fallback'] },
          ],
        };
      },
      summary(node) {
        return node.data.approverRole ? `Approver · ${node.data.approverRole}` : 'Approval gate';
      },
    },
    {
      type: 'runbook',
      label: 'Runbook',
      code: 'RB',
      category: 'Resources',
      accent: '#38bdf8',
      description: 'Links a node to a predefined operational procedure.',
      defaultSize: { width: 280, height: 172 },
      fields: [
        { key: 'runbookId', label: 'Runbook ID', type: 'text', required: true, placeholder: 'incident-ops-001' },
        { key: 'category', label: 'Category', type: 'text', placeholder: 'Operations' },
        { key: 'prerequisites', label: 'Prerequisites', type: 'textarea', placeholder: 'VPN, elevated permissions, backups...' },
        { key: 'expectedOutputs', label: 'Expected Outputs', type: 'textarea', placeholder: 'Resolution note, artifact links, status summary' },
      ],
      getPorts() {
        return { inputs: [FLOW_IN], outputs: [FLOW_OUT, DATA_OUT] };
      },
      summary(node) {
        return [node.data.runbookId, node.data.category].filter(Boolean).join(' · ') || 'Runbook';
      },
    },
    {
      type: 'artifact',
      label: 'Artifact',
      code: 'AR',
      category: 'Resources',
      accent: '#eab308',
      description: 'Represents an output file, report, or result bundle.',
      defaultSize: { width: 270, height: 166 },
      fields: [
        { key: 'filePath', label: 'File Path', type: 'text', required: true, placeholder: '/artifacts/reports/summary.md' },
        { key: 'artifactType', label: 'Artifact Type', type: 'select', value: 'document', options: [
          { value: 'document', label: 'Document' },
          { value: 'image', label: 'Image' },
          { value: 'json', label: 'JSON' },
          { value: 'url', label: 'URL' },
          { value: 'bundle', label: 'Bundle' },
        ] },
        { key: 'sourceNode', label: 'Source Node', type: 'text', placeholder: 'workflow-step or task id' },
      ],
      getPorts() {
        return { inputs: [FLOW_IN, DATA_IN], outputs: [DATA_OUT] };
      },
      summary(node) {
        return [node.data.artifactType, node.data.filePath].filter(Boolean).join(' · ') || 'Artifact';
      },
    },
    {
      type: 'memory',
      label: 'Memory / Context',
      code: 'CT',
      category: 'Resources',
      accent: '#c084fc',
      description: 'Reusable context, notes, files, and prompt packs.',
      defaultSize: { width: 280, height: 176 },
      fields: [
        { key: 'memoryReference', label: 'Memory Reference', type: 'text', required: true, placeholder: 'memory://incident-2026-03-24' },
        { key: 'fileReference', label: 'File Reference', type: 'text', placeholder: 'docs/brief.md' },
        { key: 'projectNote', label: 'Project Note', type: 'textarea', placeholder: 'Important context that should follow the workflow.' },
      ],
      getPorts() {
        return { inputs: [FLOW_IN], outputs: [DATA_OUT, FLOW_OUT] };
      },
      summary(node) {
        return node.data.memoryReference || 'Context node';
      },
    },
    {
      type: 'external-api',
      label: 'External API / Service',
      code: 'API',
      category: 'Resources',
      accent: '#fb7185',
      description: 'Represents an external integration with auth and schema notes.',
      defaultSize: { width: 300, height: 182 },
      fields: [
        { key: 'endpointName', label: 'Endpoint / Service', type: 'text', required: true, placeholder: 'WordPress REST API' },
        { key: 'authenticationRef', label: 'Authentication Ref', type: 'text', placeholder: 'secrets://wordpress-prod' },
        { key: 'schemaNotes', label: 'Schema Notes', type: 'textarea', placeholder: 'POST /posts requires title, slug, content...' },
        { key: 'operationalStatus', label: 'Operational Status', type: 'select', value: 'healthy', options: [
          { value: 'healthy', label: 'Healthy' },
          { value: 'degraded', label: 'Degraded' },
          { value: 'offline', label: 'Offline' },
        ] },
      ],
      getPorts() {
        return { inputs: [FLOW_IN, DATA_IN], outputs: [FLOW_OUT, DATA_OUT] };
      },
      summary(node) {
        return [node.data.endpointName, node.data.operationalStatus].filter(Boolean).join(' · ') || 'External service';
      },
    },
    {
      type: 'group',
      label: 'Group / Subflow',
      code: 'GR',
      category: 'Control',
      accent: '#60a5fa',
      description: 'Represents a reusable or collapsible workflow cluster.',
      defaultSize: { width: 320, height: 198 },
      fields: [
        { key: 'subflowName', label: 'Subflow Name', type: 'text', required: true, placeholder: 'Publish branch' },
        { key: 'collapsed', label: 'Collapsed', type: 'checkbox', value: false },
        { key: 'templateExportable', label: 'Template Exportable', type: 'checkbox', value: true },
        { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Describe what this grouped flow owns.' },
      ],
      getPorts() {
        return { inputs: [FLOW_IN, DATA_IN], outputs: [FLOW_OUT, DATA_OUT] };
      },
      summary(node) {
        return node.data.templateExportable ? 'Reusable subflow' : 'Grouped flow';
      },
    },
  ];

  const nodeTypeMap = new Map(nodeTypes.map((nodeType) => [nodeType.type, nodeType]));

  const buildDefaultData = (nodeType) => {
    const defaults = {};

    commonInspectorFields.concat(nodeType.fields || []).forEach((field) => {
      if (field.key === 'title') {
        defaults.title = nodeType.label;
        return;
      }

      if (field.key === 'description') {
        defaults.description = '';
        return;
      }

      if (field.type === 'checkbox') {
        defaults[field.key] = Boolean(field.value);
        return;
      }

      defaults[field.key] = field.value ?? '';
    });

    return defaults;
  };

  const getNodeType = (type) => nodeTypeMap.get(type) || nodeTypeMap.get('note');

  const createNodeRecord = (type, partial = {}) => {
    const nodeType = getNodeType(type);
    const now = new Date().toISOString();

    const node = {
      id: partial.id || Planner.createPlannerId('node'),
      type: nodeType.type,
      x: Number(partial.x ?? 0),
      y: Number(partial.y ?? 0),
      width: Number(partial.width ?? nodeType.defaultSize.width),
      height: Number(partial.height ?? nodeType.defaultSize.height),
      data: buildDefaultData(nodeType),
      createdAt: partial.createdAt || now,
      updatedAt: partial.updatedAt || now,
    };

    if (partial.data) {
      Object.assign(node.data, partial.data);
    }

    if (partial.title && !partial.data?.title) {
      node.data.title = partial.title;
    }

    if (partial.description && !partial.data?.description) {
      node.data.description = partial.description;
    }

    return node;
  };

  const getNodePorts = (node) => {
    const nodeType = getNodeType(node?.type);
    const ports = typeof nodeType.getPorts === 'function' ? nodeType.getPorts(node) : { inputs: [FLOW_IN], outputs: [FLOW_OUT] };

    return {
      inputs: (ports.inputs || []).map((port, index) => ({ role: 'input', index, ...port })),
      outputs: (ports.outputs || []).map((port, index) => ({ role: 'output', index, ...port })),
    };
  };

  const getNodeCategoryGroups = () => {
    const groups = new Map();

    nodeTypes.forEach((nodeType) => {
      if (!groups.has(nodeType.category)) {
        groups.set(nodeType.category, []);
      }
      groups.get(nodeType.category).push(nodeType);
    });

    return Array.from(groups.entries()).map(([category, items]) => ({ category, items }));
  };

  const getNodeSummary = (node) => {
    const nodeType = getNodeType(node?.type);
    return typeof nodeType.summary === 'function' ? nodeType.summary(node) : nodeType.description;
  };

  Planner.PLANNER_COMMON_NODE_FIELDS = commonInspectorFields;
  Planner.PLANNER_NODE_TYPES = nodeTypes;
  Planner.getPlannerNodeType = getNodeType;
  Planner.getPlannerNodePorts = getNodePorts;
  Planner.getPlannerNodeSummary = getNodeSummary;
  Planner.getPlannerNodeCategoryGroups = getNodeCategoryGroups;
  Planner.createPlannerNodeRecord = createNodeRecord;
})();
