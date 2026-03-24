/*
 * OpenClaw Visual Planner
 * planner-edges.js
 *
 * Edge definitions capture typed connections and the SVG path helpers used by
 * the canvas renderer.
 */

(() => {
  const Planner = window.OpenClawPlanner = window.OpenClawPlanner || {};

  const edgeTypes = [
    {
      id: 'sequence',
      label: 'Sequence',
      shortLabel: 'Sequence',
      color: '#60cdff',
      dasharray: '',
      description: 'Primary execution order between two nodes.',
    },
    {
      id: 'dependency',
      label: 'Dependency',
      shortLabel: 'Dependency',
      color: '#facc15',
      dasharray: '8 6',
      description: 'A dependency that must resolve before work continues.',
    },
    {
      id: 'conditional-yes',
      label: 'Conditional Yes',
      shortLabel: 'Yes',
      color: '#4ade80',
      dasharray: '',
      description: 'Positive branch from a decision node.',
    },
    {
      id: 'conditional-no',
      label: 'Conditional No',
      shortLabel: 'No',
      color: '#fb7185',
      dasharray: '',
      description: 'Negative branch from a decision node.',
    },
    {
      id: 'data-flow',
      label: 'Data Flow',
      shortLabel: 'Data',
      color: '#c084fc',
      dasharray: '4 6',
      description: 'Explicit transfer of data, artifacts, or context.',
    },
    {
      id: 'approval-path',
      label: 'Approval Path',
      shortLabel: 'Approved',
      color: '#22c55e',
      dasharray: '',
      description: 'Successful path out of an approval node.',
    },
    {
      id: 'fallback',
      label: 'Retry / Fallback',
      shortLabel: 'Fallback',
      color: '#f59e0b',
      dasharray: '10 6',
      description: 'Retry, rejection, or recovery branch.',
    },
  ];

  const edgeTypeMap = new Map(edgeTypes.map((edgeType) => [edgeType.id, edgeType]));

  const normalizeEdgeTypeId = (value) => String(value || 'sequence').trim().toLowerCase().replace(/[_\s]+/g, '-');

  const getEdgeType = (value) => edgeTypeMap.get(normalizeEdgeTypeId(value)) || edgeTypeMap.get('sequence');

  const createEdgeRecord = (partial = {}) => {
    const now = new Date().toISOString();
    const type = getEdgeType(partial.type || partial.edgeType || 'sequence');

    return {
      id: partial.id || Planner.createPlannerId('edge'),
      type: type.id,
      sourceNodeId: partial.sourceNodeId,
      sourcePortId: partial.sourcePortId || 'out',
      targetNodeId: partial.targetNodeId,
      targetPortId: partial.targetPortId || 'in',
      label: partial.label || '',
      condition: partial.condition || '',
      payloadNotes: partial.payloadNotes || '',
      executionPriority: partial.executionPriority || '',
      createdAt: partial.createdAt || now,
      updatedAt: partial.updatedAt || now,
    };
  };

  const isEdgeTypeCompatible = (port, edgeTypeId) => {
    if (!port) {
      return false;
    }

    if (!Array.isArray(port.edgeTypes) || !port.edgeTypes.length) {
      return true;
    }

    return port.edgeTypes.includes(normalizeEdgeTypeId(edgeTypeId));
  };

  const resolveDefaultEdgeType = (sourcePort, targetPort) => {
    const sourceTypes = Array.isArray(sourcePort?.edgeTypes) ? sourcePort.edgeTypes : [];
    const targetTypes = Array.isArray(targetPort?.edgeTypes) ? targetPort.edgeTypes : [];

    const shared = sourceTypes.find((edgeTypeId) => targetTypes.includes(edgeTypeId));
    if (shared) {
      return shared;
    }

    return sourceTypes[0] || targetTypes[0] || 'sequence';
  };

  const computeEdgePath = (source, target) => {
    const dx = Math.abs(target.x - source.x);
    const bend = Math.max(48, dx * 0.45);
    const c1x = source.x + bend;
    const c2x = target.x - bend;

    return `M ${source.x} ${source.y} C ${c1x} ${source.y}, ${c2x} ${target.y}, ${target.x} ${target.y}`;
  };

  const computeEdgeMidpoint = (source, target) => {
    const middleX = (source.x + target.x) / 2;
    const middleY = (source.y + target.y) / 2;
    return { x: middleX, y: middleY };
  };

  Planner.PLANNER_EDGE_TYPES = edgeTypes;
  Planner.getPlannerEdgeType = getEdgeType;
  Planner.createPlannerEdgeRecord = createEdgeRecord;
  Planner.isPlannerEdgeTypeCompatible = isEdgeTypeCompatible;
  Planner.resolvePlannerDefaultEdgeType = resolveDefaultEdgeType;
  Planner.computePlannerEdgePath = computeEdgePath;
  Planner.computePlannerEdgeMidpoint = computeEdgeMidpoint;
})();
