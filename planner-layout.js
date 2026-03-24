/*
 * OpenClaw Visual Planner
 * planner-layout.js
 *
 * Layout helpers keep the canvas editor ergonomic without relying on a heavy
 * graph library. Phase 2 starts with a simple layered tidy pass and alignment
 * helpers; Phase 6 can refine the same primitives further.
 */

(() => {
  const Planner = window.OpenClawPlanner = window.OpenClawPlanner || {};

  const uniqueById = (items = []) => {
    const seen = new Set();
    return items.filter((item) => {
      if (!item?.id || seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
  };

  const snapValue = (value, preferences = {}) => {
    if (!preferences.snapToGrid) {
      return Math.round(value);
    }

    const gridSize = Number(preferences.gridSize || Planner.DEFAULT_PLANNER_GRID_SIZE || 24);
    return Math.round(value / gridSize) * gridSize;
  };

  const normalizePositions = (positions, preferences = {}) => Object.fromEntries(
    Object.entries(positions || {}).map(([nodeId, position]) => [nodeId, {
      x: snapValue(position.x, preferences),
      y: snapValue(position.y, preferences),
    }]),
  );

  const alignNodes = (nodes = [], mode = 'left', preferences = {}) => {
    const uniqueNodes = uniqueById(nodes);
    if (uniqueNodes.length < 2) {
      return {};
    }

    const left = Math.min(...uniqueNodes.map((node) => node.x));
    const right = Math.max(...uniqueNodes.map((node) => node.x + node.width));
    const top = Math.min(...uniqueNodes.map((node) => node.y));
    const bottom = Math.max(...uniqueNodes.map((node) => node.y + node.height));
    const centerX = uniqueNodes.reduce((total, node) => total + node.x + node.width / 2, 0) / uniqueNodes.length;
    const centerY = uniqueNodes.reduce((total, node) => total + node.y + node.height / 2, 0) / uniqueNodes.length;

    const positions = {};

    uniqueNodes.forEach((node) => {
      let nextX = node.x;
      let nextY = node.y;

      if (mode === 'left') {
        nextX = left;
      }
      if (mode === 'center') {
        nextX = centerX - node.width / 2;
      }
      if (mode === 'right') {
        nextX = right - node.width;
      }
      if (mode === 'top') {
        nextY = top;
      }
      if (mode === 'middle') {
        nextY = centerY - node.height / 2;
      }
      if (mode === 'bottom') {
        nextY = bottom - node.height;
      }

      positions[node.id] = { x: nextX, y: nextY };
    });

    return normalizePositions(positions, preferences);
  };

  const distributeNodes = (nodes = [], axis = 'horizontal', preferences = {}) => {
    const uniqueNodes = uniqueById(nodes);
    if (uniqueNodes.length < 3) {
      return {};
    }

    const isHorizontal = axis === 'horizontal';
    const ordered = uniqueNodes.slice().sort((leftNode, rightNode) => {
      const leftValue = isHorizontal ? leftNode.x + leftNode.width / 2 : leftNode.y + leftNode.height / 2;
      const rightValue = isHorizontal ? rightNode.x + rightNode.width / 2 : rightNode.y + rightNode.height / 2;
      return leftValue - rightValue;
    });

    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const firstCenter = isHorizontal ? first.x + first.width / 2 : first.y + first.height / 2;
    const lastCenter = isHorizontal ? last.x + last.width / 2 : last.y + last.height / 2;
    const step = (lastCenter - firstCenter) / (ordered.length - 1 || 1);
    const positions = {};

    ordered.forEach((node, index) => {
      const targetCenter = firstCenter + step * index;
      positions[node.id] = {
        x: isHorizontal ? targetCenter - node.width / 2 : node.x,
        y: isHorizontal ? node.y : targetCenter - node.height / 2,
      };
    });

    return normalizePositions(positions, preferences);
  };

  const buildLayerIndex = (nodes = [], edges = []) => {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const incoming = new Map(nodes.map((node) => [node.id, []]));
    const outgoing = new Map(nodes.map((node) => [node.id, []]));
    const indegree = new Map(nodes.map((node) => [node.id, 0]));

    edges.forEach((edge) => {
      if (!nodeMap.has(edge.sourceNodeId) || !nodeMap.has(edge.targetNodeId) || edge.sourceNodeId === edge.targetNodeId) {
        return;
      }

      outgoing.get(edge.sourceNodeId).push(edge.targetNodeId);
      incoming.get(edge.targetNodeId).push(edge.sourceNodeId);
      indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) || 0) + 1);
    });

    const queue = nodes
      .filter((node) => (indegree.get(node.id) || 0) === 0)
      .sort((leftNode, rightNode) => (leftNode.y - rightNode.y) || (leftNode.x - rightNode.x));
    const visited = new Set();
    const layerById = new Map();
    const order = [];

    while (queue.length) {
      const node = queue.shift();
      if (!node || visited.has(node.id)) {
        continue;
      }

      visited.add(node.id);
      const layer = Math.max(0, ...incoming.get(node.id).map((nodeId) => (layerById.get(nodeId) ?? -1) + 1));
      layerById.set(node.id, layer);
      order.push(node.id);

      outgoing.get(node.id).forEach((targetNodeId) => {
        indegree.set(targetNodeId, Math.max(0, (indegree.get(targetNodeId) || 0) - 1));
        if ((indegree.get(targetNodeId) || 0) === 0) {
          const targetNode = nodeMap.get(targetNodeId);
          if (targetNode) {
            queue.push(targetNode);
            queue.sort((leftNode, rightNode) => (leftNode.y - rightNode.y) || (leftNode.x - rightNode.x));
          }
        }
      });
    }

    nodes
      .filter((node) => !visited.has(node.id))
      .sort((leftNode, rightNode) => (leftNode.y - rightNode.y) || (leftNode.x - rightNode.x))
      .forEach((node) => {
        const fallbackLayer = Math.max(0, ...incoming.get(node.id).map((nodeId) => (layerById.get(nodeId) ?? -1) + 1));
        layerById.set(node.id, fallbackLayer);
        order.push(node.id);
      });

    return { layerById, order, incoming, outgoing };
  };

  const tidyGraph = (nodes = [], edges = [], preferences = {}, options = {}) => {
    const uniqueNodes = uniqueById(nodes);
    if (!uniqueNodes.length) {
      return {};
    }

    const { layerById, incoming, outgoing } = buildLayerIndex(uniqueNodes, edges);
    const layers = new Map();

    uniqueNodes.forEach((node) => {
      const layer = layerById.get(node.id) || 0;
      if (!layers.has(layer)) {
        layers.set(layer, []);
      }
      layers.get(layer).push(node);
    });

    const sortedLayers = Array.from(layers.entries()).sort((leftLayer, rightLayer) => leftLayer[0] - rightLayer[0]);
    const columnGap = Number(options.columnGap || 360);
    const rowGap = Number(options.rowGap || 220);
    const marginX = Number(options.marginX || 120);
    const marginY = Number(options.marginY || 120);
    const orderInLayer = new Map();
    const positions = {};

    sortedLayers.forEach(([layer, layerNodes]) => {
      const orderedNodes = layerNodes.slice().sort((leftNode, rightNode) => {
        const leftIncoming = incoming.get(leftNode.id) || [];
        const rightIncoming = incoming.get(rightNode.id) || [];
        const leftScore = leftIncoming.length
          ? leftIncoming.reduce((total, nodeId) => total + (orderInLayer.get(nodeId) ?? 0), 0) / leftIncoming.length
          : leftNode.y;
        const rightScore = rightIncoming.length
          ? rightIncoming.reduce((total, nodeId) => total + (orderInLayer.get(nodeId) ?? 0), 0) / rightIncoming.length
          : rightNode.y;

        if (leftScore !== rightScore) {
          return leftScore - rightScore;
        }

        const leftOutgoing = (outgoing.get(leftNode.id) || []).length;
        const rightOutgoing = (outgoing.get(rightNode.id) || []).length;
        if (leftOutgoing !== rightOutgoing) {
          return rightOutgoing - leftOutgoing;
        }

        return (leftNode.y - rightNode.y) || (leftNode.x - rightNode.x);
      });

      orderedNodes.forEach((node, index) => {
        orderInLayer.set(node.id, index);
        positions[node.id] = {
          x: marginX + layer * columnGap,
          y: marginY + index * rowGap,
        };
      });
    });

    return normalizePositions(positions, preferences);
  };

  Planner.alignPlannerNodes = alignNodes;
  Planner.distributePlannerNodes = distributeNodes;
  Planner.tidyPlannerGraph = tidyGraph;
})();
