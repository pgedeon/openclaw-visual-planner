/*
 * OpenClaw Visual Planner
 * planner-canvas.js
 *
 * The canvas uses SVG for nodes and edges, requestAnimationFrame for repaint
 * scheduling, and a transform-based viewport for smooth pan and zoom.
 */

(() => {
  const Planner = window.OpenClawPlanner = window.OpenClawPlanner || {};

  const MIN_NODE_WIDTH = 140;
  const MIN_NODE_HEIGHT = 84;
  const MAX_ZOOM = 2.5;
  const MIN_ZOOM = 0.25;

  const splitSummaryLines = (value, maxChars = 34, maxLines = 2) => {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      return [];
    }

    const lines = [];
    let current = '';
    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      if (next.length <= maxChars) {
        current = next;
        return;
      }

      if (current) {
        lines.push(current);
      }
      current = word;
    });

    if (current) {
      lines.push(current);
    }

    return lines.slice(0, maxLines).map((line, index) => {
      if (index === maxLines - 1 && lines.length > maxLines) {
        return `${Planner.truncateText(line, maxChars - 1)}`;
      }
      return Planner.truncateText(line, maxChars);
    });
  };

  const getGraphBounds = (nodes = [], padding = 140) => {
    if (!nodes.length) {
      return {
        minX: -400,
        minY: -260,
        maxX: 400,
        maxY: 260,
        width: 800,
        height: 520,
      };
    }

    const minX = Math.min(...nodes.map((node) => node.x)) - padding;
    const minY = Math.min(...nodes.map((node) => node.y)) - padding;
    const maxX = Math.max(...nodes.map((node) => node.x + node.width)) + padding;
    const maxY = Math.max(...nodes.map((node) => node.y + node.height)) + padding;

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  };

  const getPortLayout = (node) => {
    const ports = Planner.getPlannerNodePorts(node);
    const inputGap = node.height / (ports.inputs.length + 1 || 1);
    const outputGap = node.height / (ports.outputs.length + 1 || 1);

    return {
      inputs: ports.inputs.map((port, index) => ({
        ...port,
        x: 0,
        y: Math.round((index + 1) * inputGap),
      })),
      outputs: ports.outputs.map((port, index) => ({
        ...port,
        x: node.width,
        y: Math.round((index + 1) * outputGap),
      })),
    };
  };

  function createPlannerCanvas({ mountNode, store, notify }) {
    let cleanup = [];
    let interaction = null;
    let renderHandle = 0;
    let pendingReason = 'initial';
    let spacePressed = false;
    let dragOver = false;
    let edgeEditor = null;

    mountNode.innerHTML = `
      <div class="planner-canvas-shell planner-surface">
        <div class="planner-canvas__hud">
          <div class="planner-canvas__hint">Drag nodes in · Drag background to box-select · Space + drag to pan</div>
          <div class="planner-canvas__stats" data-canvas-stats="true"></div>
        </div>
        <svg class="planner-canvas__svg" xmlns="http://www.w3.org/2000/svg" aria-label="Planner canvas">
          <defs>
            <marker id="planner-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"></path>
            </marker>
          </defs>
          <g class="planner-canvas__scene" data-scene="true">
            <g data-edge-layer="true"></g>
            <g data-node-layer="true"></g>
            <g data-preview-layer="true"></g>
          </g>
        </svg>
        <div class="planner-canvas__overlay-layer" data-overlay-layer="true"></div>
        <div class="planner-canvas__empty" data-canvas-empty="true">
          <div class="planner-canvas__empty-title">Start with a template or drop a node</div>
          <div class="planner-canvas__empty-copy">Use the left palette to drag in nodes, then connect them with typed edges.</div>
        </div>
        <div class="planner-minimap" data-minimap-panel="true">
          <div class="planner-minimap__label">Minimap</div>
          <svg class="planner-minimap__svg" xmlns="http://www.w3.org/2000/svg" data-minimap-svg="true"></svg>
        </div>
      </div>
    `;

    const shell = mountNode.querySelector('.planner-canvas-shell');
    const scene = mountNode.querySelector('[data-scene]');
    const edgeLayer = mountNode.querySelector('[data-edge-layer]');
    const nodeLayer = mountNode.querySelector('[data-node-layer]');
    const previewLayer = mountNode.querySelector('[data-preview-layer]');
    const overlayLayer = mountNode.querySelector('[data-overlay-layer]');
    const statsNode = mountNode.querySelector('[data-canvas-stats]');
    const emptyNode = mountNode.querySelector('[data-canvas-empty]');
    const minimapPanel = mountNode.querySelector('[data-minimap-panel]');
    const minimapSvg = mountNode.querySelector('[data-minimap-svg]');

    const getCanvasRect = () => shell.getBoundingClientRect();

    const getViewport = () => store.getState().viewport;

    const worldFromClient = (clientX, clientY) => {
      const rect = getCanvasRect();
      const viewport = getViewport();
      return {
        x: (clientX - rect.left - viewport.x) / viewport.zoom,
        y: (clientY - rect.top - viewport.y) / viewport.zoom,
      };
    };

    const screenFromWorld = (worldX, worldY) => {
      const viewport = getViewport();
      return {
        x: worldX * viewport.zoom + viewport.x,
        y: worldY * viewport.zoom + viewport.y,
      };
    };

    const normalizeHexColor = (value, fallback) => {
      const raw = String(value || '').trim();
      if (!/^#([a-f0-9]{3}|[a-f0-9]{6})$/i.test(raw)) {
        return fallback;
      }

      if (raw.length === 4) {
        return `#${raw.slice(1).split('').map((character) => `${character}${character}`).join('')}`.toLowerCase();
      }

      return raw.toLowerCase();
    };

    const hexToRgba = (hex, alpha) => {
      const normalized = normalizeHexColor(hex, '#60cdff').replace('#', '');
      const red = Number.parseInt(normalized.slice(0, 2), 16);
      const green = Number.parseInt(normalized.slice(2, 4), 16);
      const blue = Number.parseInt(normalized.slice(4, 6), 16);
      return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    };

    const resolveNodeAppearance = (node, definition) => {
      const accent = normalizeHexColor(node.data?.visualColor, definition.accent);
      const style = String(node.data?.visualStyle || 'default').trim().toLowerCase();

      const appearance = {
        accent,
        accentSoft: hexToRgba(accent, 0.18),
        bodyFill: 'rgba(21, 21, 23, 0.95)',
        bodyStroke: 'rgba(255, 255, 255, 0.08)',
        footerFill: 'rgba(255, 255, 255, 0.04)',
        footerStroke: 'rgba(255, 255, 255, 0.06)',
        titleColor: 'var(--planner-text)',
        subtitleColor: 'var(--planner-text-secondary)',
        strokeWidth: 1.35,
      };

      if (style === 'muted') {
        appearance.bodyFill = 'rgba(16, 18, 22, 0.9)';
        appearance.bodyStroke = hexToRgba(accent, 0.28);
        appearance.footerFill = 'rgba(255, 255, 255, 0.03)';
      }

      if (style === 'emphasis') {
        appearance.bodyFill = hexToRgba(accent, 0.12);
        appearance.bodyStroke = hexToRgba(accent, 0.55);
        appearance.footerFill = hexToRgba(accent, 0.14);
        appearance.footerStroke = hexToRgba(accent, 0.22);
        appearance.strokeWidth = 1.7;
      }

      if (style === 'contrast') {
        appearance.bodyFill = 'rgba(7, 10, 14, 0.98)';
        appearance.bodyStroke = hexToRgba(accent, 0.72);
        appearance.footerFill = 'rgba(255, 255, 255, 0.09)';
        appearance.footerStroke = hexToRgba(accent, 0.34);
        appearance.subtitleColor = 'rgba(255, 255, 255, 0.82)';
        appearance.strokeWidth = 1.9;
      }

      return appearance;
    };

    const snapValue = (value) => {
      const state = store.getState();
      if (!state.preferences.snapToGrid) {
        return value;
      }
      const grid = Number(state.preferences.gridSize || Planner.DEFAULT_PLANNER_GRID_SIZE);
      return Math.round(value / grid) * grid;
    };

    const getViewportCenterWorld = () => {
      const rect = getCanvasRect();
      const viewport = getViewport();
      return {
        x: (rect.width / 2 - viewport.x) / viewport.zoom,
        y: (rect.height / 2 - viewport.y) / viewport.zoom,
      };
    };

    const getNodeById = (nodeId) => store.getState().document.graph.nodes.find((node) => node.id === nodeId) || null;

    const getPortById = (node, role, portId) => {
      const ports = getPortLayout(node);
      return (role === 'input' ? ports.inputs : ports.outputs).find((port) => port.id === portId) || null;
    };

    const getPortWorldPoint = (node, role, portId) => {
      const port = getPortById(node, role, portId);
      if (!port) {
        return { x: node.x + node.width, y: node.y + node.height / 2 };
      }

      return {
        x: node.x + port.x,
        y: node.y + port.y,
      };
    };

    const getEdgeGeometry = (edge, state = store.getState()) => {
      const sourceNode = state.document.graph.nodes.find((node) => node.id === edge.sourceNodeId);
      const targetNode = state.document.graph.nodes.find((node) => node.id === edge.targetNodeId);
      if (!sourceNode || !targetNode) {
        return null;
      }

      const sourcePoint = getPortWorldPoint(sourceNode, 'output', edge.sourcePortId);
      const targetPoint = getPortWorldPoint(targetNode, 'input', edge.targetPortId);
      return {
        sourceNode,
        targetNode,
        sourcePoint,
        targetPoint,
        path: Planner.computePlannerEdgePath(sourcePoint, targetPoint),
        midpoint: Planner.computePlannerEdgeMidpoint(sourcePoint, targetPoint),
      };
    };

    const createNodeAtPosition = (type, position) => {
      const node = Planner.createPlannerNodeRecord(type, {
        x: snapValue(position.x),
        y: snapValue(position.y),
      });
      store.actions.addNode(node, { reason: 'palette:add' });
      return node;
    };

    const updateGrid = () => {
      const state = store.getState();
      const viewport = state.viewport;
      const gridSize = Number(state.preferences.gridSize || Planner.DEFAULT_PLANNER_GRID_SIZE) * viewport.zoom;
      const majorGrid = gridSize * 4;
      const minorOffsetX = ((viewport.x % gridSize) + gridSize) % gridSize;
      const minorOffsetY = ((viewport.y % gridSize) + gridSize) % gridSize;
      const majorOffsetX = ((viewport.x % majorGrid) + majorGrid) % majorGrid;
      const majorOffsetY = ((viewport.y % majorGrid) + majorGrid) % majorGrid;

      shell.style.setProperty('--minor-grid-size', `${Math.max(gridSize, 6)}px`);
      shell.style.setProperty('--major-grid-size', `${Math.max(majorGrid, 24)}px`);
      shell.style.setProperty('--minor-grid-offset-x', `${minorOffsetX}px`);
      shell.style.setProperty('--minor-grid-offset-y', `${minorOffsetY}px`);
      shell.style.setProperty('--major-grid-offset-x', `${majorOffsetX}px`);
      shell.style.setProperty('--major-grid-offset-y', `${majorOffsetY}px`);
      shell.classList.toggle('is-grid-hidden', !state.preferences.showGrid);
      shell.classList.toggle('is-drop-target', dragOver);
      shell.classList.toggle('is-panning-ready', spacePressed);
      shell.classList.toggle('is-panning', interaction?.type === 'pan');
    };

    const buildEdgeMarkup = (edge, state) => {
      const geometry = getEdgeGeometry(edge, state);
      if (!geometry) {
        return '';
      }

      const edgeType = Planner.getPlannerEdgeType(edge.type);
      const selected = state.selection.type === 'edge' && state.selection.edgeId === edge.id;
      const labelText = edge.label || (edge.type === 'sequence' ? (selected ? 'Double-click to label' : '') : edgeType.shortLabel);
      const labelWidth = Math.max(60, labelText.length * 7 + 18);
      const placeholder = !edge.label;

      return `
        <g class="planner-edge ${selected ? 'is-selected' : ''}" data-edge-id="${edge.id}">
          <path class="planner-edge__hit" d="${geometry.path}"></path>
          <path class="planner-edge__stroke" d="${geometry.path}" style="stroke:${edgeType.color};color:${edgeType.color};stroke-dasharray:${edgeType.dasharray};" marker-end="url(#planner-arrow)"></path>
          ${labelText ? `
            <g class="planner-edge__label ${placeholder ? 'is-placeholder' : ''}" data-edge-label-id="${edge.id}" data-label-x="${geometry.midpoint.x}" data-label-y="${geometry.midpoint.y}" transform="translate(${geometry.midpoint.x - labelWidth / 2} ${geometry.midpoint.y - 12})">
              <rect width="${labelWidth}" height="24" rx="12"></rect>
              <text x="${labelWidth / 2}" y="15" text-anchor="middle">${Planner.escapeHtml(labelText)}</text>
            </g>
          ` : ''}
        </g>
      `;
    };

    const buildResizeHandles = (node) => {
      const handles = [
        { id: 'nw', x: -6, y: -6 },
        { id: 'n', x: node.width / 2 - 5, y: -6 },
        { id: 'ne', x: node.width - 4, y: -6 },
        { id: 'e', x: node.width - 4, y: node.height / 2 - 5 },
        { id: 'se', x: node.width - 4, y: node.height - 4 },
        { id: 's', x: node.width / 2 - 5, y: node.height - 4 },
        { id: 'sw', x: -6, y: node.height - 4 },
        { id: 'w', x: -6, y: node.height / 2 - 5 },
      ];

      return handles.map((handle) => `
        <rect class="planner-node__handle" width="10" height="10" rx="3" x="${handle.x}" y="${handle.y}" data-resize-handle="${handle.id}" data-node-id="${node.id}"></rect>
      `).join('');
    };

    const buildPorts = (node, isSelected) => {
      const layout = getPortLayout(node);

      const renderPort = (port) => {
        const showLabel = isSelected || !['In', 'Out'].includes(port.label);
        const labelOffset = port.role === 'input' ? 14 : -14;
        const textAnchor = port.role === 'input' ? 'start' : 'end';

        return `
          <g class="planner-port planner-port--${port.role}" transform="translate(${port.x} ${port.y})" data-node-id="${node.id}" data-port-id="${port.id}" data-port-role="${port.role}">
            <circle r="6"></circle>
            ${showLabel ? `<text class="planner-port__label" x="${labelOffset}" y="4" text-anchor="${textAnchor}">${Planner.escapeHtml(port.label)}</text>` : ''}
          </g>
        `;
      };

      return layout.inputs.concat(layout.outputs).map(renderPort).join('');
    };

    const buildNodeMarkup = (node, state) => {
      const definition = Planner.getPlannerNodeType(node.type);
      const isSelected = state.selection.type === 'node' && state.selection.nodeIds.includes(node.id);
      const isPrimarySelection = isSelected && state.selection.nodeIds.length === 1;
      const summary = Planner.getPlannerNodeSummary(node);
      const summaryLines = splitSummaryLines(summary);
      const runtimeStatusId = state.runtime.enabled
        ? (state.runtime.statuses[node.id] || (state.runtime.runStatus ? 'idle' : 'queued'))
        : 'idle';
      const runtimeStatus = Planner.getPlannerRuntimeStatus(runtimeStatusId);
      const appearance = resolveNodeAppearance(node, definition);

      return `
        <g class="planner-node ${isSelected ? 'is-selected' : ''}" data-node-id="${node.id}" transform="translate(${node.x} ${node.y})">
          <rect class="planner-node__body" width="${node.width}" height="${node.height}" rx="18" style="fill:${appearance.bodyFill};stroke:${appearance.bodyStroke};stroke-width:${appearance.strokeWidth};"></rect>
          <rect class="planner-node__accent" width="${node.width}" height="12" rx="18" style="fill:${appearance.accent};"></rect>
          <circle class="planner-node__code-disc" cx="22" cy="28" r="14" style="fill:${appearance.accentSoft};stroke:${appearance.accent};"></circle>
          <text class="planner-node__code" x="22" y="32" text-anchor="middle">${Planner.escapeHtml(definition.code)}</text>
          <text class="planner-node__title" x="46" y="27" style="fill:${appearance.titleColor};">${Planner.escapeHtml(Planner.truncateText(node.data?.title || definition.label, 28))}</text>
          <text class="planner-node__subtitle" x="46" y="45" style="fill:${appearance.subtitleColor};">${Planner.escapeHtml(definition.label)}</text>
          ${summaryLines.map((line, index) => `<text class="planner-node__summary" x="18" y="${74 + index * 18}">${Planner.escapeHtml(line)}</text>`).join('')}
          <g class="planner-node__status" transform="translate(${Math.max(14, node.width - 102)} 16)">
            <rect width="86" height="22" rx="11" style="fill:${runtimeStatus.color}22;stroke:${runtimeStatus.color};"></rect>
            <text x="43" y="15" text-anchor="middle">${Planner.escapeHtml(runtimeStatus.label)}</text>
          </g>
          <g class="planner-node__footer" transform="translate(16 ${node.height - 34})">
            <rect width="${Math.max(node.width - 32, 32)}" height="20" rx="10" style="fill:${appearance.footerFill};stroke:${appearance.footerStroke};"></rect>
            <text x="12" y="14">${Planner.escapeHtml(Planner.truncateText(summary || definition.description, 42))}</text>
          </g>
          ${buildPorts(node, isSelected)}
          ${isPrimarySelection ? buildResizeHandles(node) : ''}
        </g>
      `;
    };

    const renderPreview = () => {
      if (!interaction) {
        previewLayer.innerHTML = '';
        return;
      }

      if (interaction.type === 'marquee') {
        const x = Math.min(interaction.startWorld.x, interaction.currentWorld.x);
        const y = Math.min(interaction.startWorld.y, interaction.currentWorld.y);
        const width = Math.abs(interaction.currentWorld.x - interaction.startWorld.x);
        const height = Math.abs(interaction.currentWorld.y - interaction.startWorld.y);

        previewLayer.innerHTML = `
          <rect class="planner-selection-box" x="${x}" y="${y}" width="${width}" height="${height}" rx="14"></rect>
        `;
        return;
      }

      if (interaction.type !== 'connect') {
        previewLayer.innerHTML = '';
        return;
      }

      const sourceNode = getNodeById(interaction.sourceNodeId);
      if (!sourceNode) {
        previewLayer.innerHTML = '';
        return;
      }

      const sourcePoint = getPortWorldPoint(sourceNode, 'output', interaction.sourcePortId);
      const targetPoint = interaction.hoverTarget
        ? getPortWorldPoint(getNodeById(interaction.hoverTarget.nodeId), 'input', interaction.hoverTarget.portId)
        : interaction.currentWorld;
      const d = Planner.computePlannerEdgePath(sourcePoint, targetPoint);

      previewLayer.innerHTML = `
        <path class="planner-edge__preview" d="${d}"></path>
      `;
    };

    const renderOverlay = () => {
      const state = store.getState();
      overlayLayer.innerHTML = '';

      if (!edgeEditor) {
        return;
      }

      const edge = state.document.graph.edges.find((item) => item.id === edgeEditor.edgeId);
      const geometry = edge ? getEdgeGeometry(edge, state) : null;
      if (!edge || !geometry) {
        edgeEditor = null;
        return;
      }

      const screenPoint = screenFromWorld(geometry.midpoint.x, geometry.midpoint.y);

      overlayLayer.innerHTML = `
        <div class="planner-canvas__edge-editor" data-edge-editor-shell="true" style="left:${screenPoint.x}px;top:${screenPoint.y}px;">
          <input class="planner-input planner-canvas__edge-input" type="text" value="${Planner.escapeHtml(edgeEditor.value)}" data-edge-editor-input="true" aria-label="Edit edge label" />
        </div>
      `;

      if (edgeEditor.shouldFocus) {
        const input = overlayLayer.querySelector('[data-edge-editor-input="true"]');
        if (input) {
          window.requestAnimationFrame(() => {
            input.focus();
            input.select();
          });
        }
        edgeEditor.shouldFocus = false;
      }
    };

    const renderMinimap = () => {
      const state = store.getState();

      if (!state.preferences.showMinimap) {
        minimapPanel.hidden = true;
        return;
      }

      minimapPanel.hidden = false;

      const nodes = state.document.graph.nodes;
      const edges = state.document.graph.edges;
      const bounds = getGraphBounds(nodes, 110);
      const width = 220;
      const height = 146;
      const scale = Math.min(width / bounds.width, height / bounds.height);
      const offsetX = (width - bounds.width * scale) / 2;
      const offsetY = (height - bounds.height * scale) / 2;
      const rect = getCanvasRect();
      const viewport = state.viewport;
      const visibleWorld = {
        x: (-viewport.x) / viewport.zoom,
        y: (-viewport.y) / viewport.zoom,
        width: rect.width / viewport.zoom,
        height: rect.height / viewport.zoom,
      };

      const mapX = (value) => offsetX + (value - bounds.minX) * scale;
      const mapY = (value) => offsetY + (value - bounds.minY) * scale;

      minimapSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      minimapSvg.innerHTML = `
        <rect class="planner-minimap__bg" x="0" y="0" width="${width}" height="${height}" rx="14"></rect>
        ${edges.map((edge) => {
          const sourceNode = nodes.find((node) => node.id === edge.sourceNodeId);
          const targetNode = nodes.find((node) => node.id === edge.targetNodeId);
          if (!sourceNode || !targetNode) {
            return '';
          }
          const x1 = mapX(sourceNode.x + sourceNode.width / 2);
          const y1 = mapY(sourceNode.y + sourceNode.height / 2);
          const x2 = mapX(targetNode.x + targetNode.width / 2);
          const y2 = mapY(targetNode.y + targetNode.height / 2);
          return `<line class="planner-minimap__edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`;
        }).join('')}
        ${nodes.map((node) => `
          <rect class="planner-minimap__node ${store.getState().selection.nodeIds.includes(node.id) ? 'is-selected' : ''}" x="${mapX(node.x)}" y="${mapY(node.y)}" width="${Math.max(node.width * scale, 6)}" height="${Math.max(node.height * scale, 4)}" rx="4"></rect>
        `).join('')}
        <rect class="planner-minimap__viewport" x="${mapX(visibleWorld.x)}" y="${mapY(visibleWorld.y)}" width="${visibleWorld.width * scale}" height="${visibleWorld.height * scale}" rx="8"></rect>
      `;

      minimapSvg.dataset.bounds = JSON.stringify(bounds);
      minimapSvg.dataset.scale = String(scale);
      minimapSvg.dataset.offsetX = String(offsetX);
      minimapSvg.dataset.offsetY = String(offsetY);
    };

    const render = (reason = 'state') => {
      const state = store.getState();
      const shouldRebuildScene = !['viewport', 'preview', 'dragover', 'history:', 'meta:'].some((prefix) => String(reason).startsWith(prefix));

      updateGrid();
      scene.setAttribute('transform', `translate(${state.viewport.x} ${state.viewport.y}) scale(${state.viewport.zoom})`);

      if (shouldRebuildScene) {
        edgeLayer.innerHTML = state.document.graph.edges.map((edge) => buildEdgeMarkup(edge, state)).join('');
        nodeLayer.innerHTML = state.document.graph.nodes.map((node) => buildNodeMarkup(node, state)).join('');
      }

      renderPreview();
      renderOverlay();
      renderMinimap();

      const selectionLabel = state.selection.nodeIds.length ? ` · ${state.selection.nodeIds.length} selected` : '';
      statsNode.textContent = `${state.document.graph.nodes.length} nodes · ${state.document.graph.edges.length} edges${selectionLabel} · ${Math.round(state.viewport.zoom * 100)}%`;
      emptyNode.hidden = state.document.graph.nodes.length > 0;
    };

    const scheduleRender = (reason = 'state') => {
      pendingReason = reason;
      if (renderHandle) {
        return;
      }

      renderHandle = window.requestAnimationFrame(() => {
        renderHandle = 0;
        render(pendingReason);
      });
    };

    const centerViewportOnWorldPoint = (worldPoint) => {
      const rect = getCanvasRect();
      const viewport = getViewport();
      store.actions.setViewport({
        x: rect.width / 2 - worldPoint.x * viewport.zoom,
        y: rect.height / 2 - worldPoint.y * viewport.zoom,
      }, { reason: 'viewport:center', dirty: false });
    };

    const focusEntity = ({ type, id }) => {
      if (type === 'node') {
        const node = getNodeById(id);
        if (!node) {
          return;
        }

        centerViewportOnWorldPoint({ x: node.x + node.width / 2, y: node.y + node.height / 2 });
        store.actions.selectNode(node.id);
        return;
      }

      if (type === 'edge') {
        store.actions.selectEdge(id);
      }
    };

    const fitToGraph = () => {
      const state = store.getState();
      const bounds = getGraphBounds(state.document.graph.nodes, 120);
      const rect = getCanvasRect();
      const zoom = Planner.clamp(Math.min(rect.width / bounds.width, rect.height / bounds.height), 0.35, 1.4);
      const centerX = bounds.minX + bounds.width / 2;
      const centerY = bounds.minY + bounds.height / 2;
      store.actions.setViewport({
        zoom,
        x: rect.width / 2 - centerX * zoom,
        y: rect.height / 2 - centerY * zoom,
      }, { reason: 'viewport:fit', dirty: false });
    };

    const beginPan = (event) => {
      interaction = {
        type: 'pan',
        startClientX: event.clientX,
        startClientY: event.clientY,
        startViewport: Planner.clonePlannerValue(getViewport()),
      };
      scheduleRender('preview');
    };

    const beginMarquee = (event) => {
      const startWorld = worldFromClient(event.clientX, event.clientY);
      interaction = {
        type: 'marquee',
        startClientX: event.clientX,
        startClientY: event.clientY,
        currentClientX: event.clientX,
        currentClientY: event.clientY,
        startWorld,
        currentWorld: startWorld,
        preserveSelection: event.shiftKey || event.metaKey || event.ctrlKey,
      };
      scheduleRender('preview');
    };

    const beginMove = (event, nodeId) => {
      const state = store.getState();
      const selectedNodeIds = state.selection.type === 'node' && state.selection.nodeIds.includes(nodeId)
        ? state.selection.nodeIds.slice()
        : [nodeId];
      const originNodes = Object.fromEntries(
        selectedNodeIds
          .map((selectedNodeId) => [selectedNodeId, Planner.clonePlannerValue(getNodeById(selectedNodeId))])
          .filter(([, node]) => Boolean(node)),
      );

      if (!Object.keys(originNodes).length) {
        return;
      }

      const startWorld = worldFromClient(event.clientX, event.clientY);
      interaction = {
        type: 'move',
        nodeIds: selectedNodeIds,
        startWorld,
        originNodes,
        historySnapshot: store.snapshot(),
        checkpointPushed: false,
      };
    };

    const beginResize = (event, nodeId, handle) => {
      const node = getNodeById(nodeId);
      if (!node) {
        return;
      }

      interaction = {
        type: 'resize',
        nodeId,
        handle,
        startWorld: worldFromClient(event.clientX, event.clientY),
        originNode: Planner.clonePlannerValue(node),
        historySnapshot: store.snapshot(),
        checkpointPushed: false,
      };
    };

    const beginConnect = (event, nodeId, portId) => {
      interaction = {
        type: 'connect',
        sourceNodeId: nodeId,
        sourcePortId: portId,
        currentWorld: worldFromClient(event.clientX, event.clientY),
        hoverTarget: null,
      };
      scheduleRender('preview');
    };

    const closeEdgeEditor = ({ save = false } = {}) => {
      if (!edgeEditor) {
        return;
      }

      const currentEdge = store.getState().document.graph.edges.find((item) => item.id === edgeEditor.edgeId);
      const nextValue = String(edgeEditor.value || '').trim();
      const previousEditor = edgeEditor;
      edgeEditor = null;

      if (save && currentEdge && String(currentEdge.label || '') !== nextValue) {
        store.actions.updateEdge(previousEditor.edgeId, {
          label: nextValue,
        }, { history: true, reason: 'edge:label-inline' });
      }

      scheduleRender('edge-editor');
    };

    const openEdgeEditor = (edgeId) => {
      const edge = store.getState().document.graph.edges.find((item) => item.id === edgeId);
      if (!edge) {
        return;
      }

      store.actions.selectEdge(edgeId);
      edgeEditor = {
        edgeId,
        value: edge.label || '',
        shouldFocus: true,
      };
      scheduleRender('edge-editor');
    };

    const updateMoveInteraction = (event) => {
      const originNodes = Object.values(interaction.originNodes || {});
      if (!originNodes.length) {
        return;
      }

      const world = worldFromClient(event.clientX, event.clientY);
      const deltaX = world.x - interaction.startWorld.x;
      const deltaY = world.y - interaction.startWorld.y;
      const nextPositions = Object.fromEntries(originNodes.map((node) => [node.id, {
        x: snapValue(node.x + deltaX),
        y: snapValue(node.y + deltaY),
      }]));
      const hasMoved = originNodes.some((node) => nextPositions[node.id].x !== node.x || nextPositions[node.id].y !== node.y);

      if (!interaction.checkpointPushed && hasMoved) {
        store.pushHistorySnapshot(interaction.historySnapshot, `Move ${originNodes.length > 1 ? 'nodes' : 'node'}`);
        interaction.checkpointPushed = true;
      }

      store.actions.updateNodes(interaction.nodeIds, (node) => {
        const position = nextPositions[node.id];
        if (!position) {
          return;
        }

        node.x = position.x;
        node.y = position.y;
      }, { history: false, reason: 'node:move' });
    };

    const updateResizeInteraction = (event) => {
      const node = getNodeById(interaction.nodeId);
      if (!node) {
        return;
      }

      const world = worldFromClient(event.clientX, event.clientY);
      const deltaX = world.x - interaction.startWorld.x;
      const deltaY = world.y - interaction.startWorld.y;
      const origin = interaction.originNode;
      const nextBounds = {
        x: origin.x,
        y: origin.y,
        width: origin.width,
        height: origin.height,
      };

      if (interaction.handle.includes('e')) {
        nextBounds.width = Planner.clamp(origin.width + deltaX, MIN_NODE_WIDTH, 720);
      }
      if (interaction.handle.includes('s')) {
        nextBounds.height = Planner.clamp(origin.height + deltaY, MIN_NODE_HEIGHT, 480);
      }
      if (interaction.handle.includes('w')) {
        const nextX = origin.x + deltaX;
        nextBounds.x = snapValue(Math.min(nextX, origin.x + origin.width - MIN_NODE_WIDTH));
        nextBounds.width = Planner.clamp(origin.width - (nextBounds.x - origin.x), MIN_NODE_WIDTH, 720);
      }
      if (interaction.handle.includes('n')) {
        const nextY = origin.y + deltaY;
        nextBounds.y = snapValue(Math.min(nextY, origin.y + origin.height - MIN_NODE_HEIGHT));
        nextBounds.height = Planner.clamp(origin.height - (nextBounds.y - origin.y), MIN_NODE_HEIGHT, 480);
      }

      nextBounds.x = snapValue(nextBounds.x);
      nextBounds.y = snapValue(nextBounds.y);
      nextBounds.width = snapValue(nextBounds.width);
      nextBounds.height = snapValue(nextBounds.height);

      if (!interaction.checkpointPushed && JSON.stringify(nextBounds) !== JSON.stringify({ x: origin.x, y: origin.y, width: origin.width, height: origin.height })) {
        store.pushHistorySnapshot(interaction.historySnapshot, 'Resize node');
        interaction.checkpointPushed = true;
      }

      store.actions.resizeNode(interaction.nodeId, nextBounds, { history: false, reason: 'node:resize' });
    };

    const completeMarqueeSelection = () => {
      const state = store.getState();
      const minX = Math.min(interaction.startWorld.x, interaction.currentWorld.x);
      const minY = Math.min(interaction.startWorld.y, interaction.currentWorld.y);
      const maxX = Math.max(interaction.startWorld.x, interaction.currentWorld.x);
      const maxY = Math.max(interaction.startWorld.y, interaction.currentWorld.y);

      const hitNodeIds = state.document.graph.nodes
        .filter((node) => !(node.x > maxX || node.x + node.width < minX || node.y > maxY || node.y + node.height < minY))
        .map((node) => node.id);

      if (Math.abs(interaction.currentClientX - interaction.startClientX) < 4 && Math.abs(interaction.currentClientY - interaction.startClientY) < 4) {
        if (!interaction.preserveSelection) {
          store.actions.clearSelection();
        }
        interaction = null;
        scheduleRender('preview');
        return;
      }

      if (interaction.preserveSelection) {
        store.actions.selectNodes(state.selection.nodeIds.concat(hitNodeIds));
      } else {
        store.actions.selectNodes(hitNodeIds);
      }

      interaction = null;
      scheduleRender('preview');
    };

    const updateConnectInteraction = (event) => {
      interaction.currentWorld = worldFromClient(event.clientX, event.clientY);
      const hoverEl = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-port-role="input"]');

      if (!hoverEl) {
        interaction.hoverTarget = null;
        scheduleRender('preview');
        return;
      }

      const targetNode = getNodeById(hoverEl.dataset.nodeId);
      const sourceNode = getNodeById(interaction.sourceNodeId);
      if (!sourceNode || !targetNode || sourceNode.id === targetNode.id) {
        interaction.hoverTarget = null;
        scheduleRender('preview');
        return;
      }

      const sourcePort = getPortById(sourceNode, 'output', interaction.sourcePortId);
      const targetPort = getPortById(targetNode, 'input', hoverEl.dataset.portId);
      const defaultType = Planner.resolvePlannerDefaultEdgeType(sourcePort, targetPort);
      if (!Planner.isPlannerEdgeTypeCompatible(sourcePort, defaultType) || !Planner.isPlannerEdgeTypeCompatible(targetPort, defaultType)) {
        interaction.hoverTarget = null;
        scheduleRender('preview');
        return;
      }

      interaction.hoverTarget = {
        nodeId: hoverEl.dataset.nodeId,
        portId: hoverEl.dataset.portId,
      };
      scheduleRender('preview');
    };

    const completeConnectInteraction = () => {
      if (!interaction?.hoverTarget) {
        interaction = null;
        scheduleRender('preview');
        return;
      }

      const sourceNode = getNodeById(interaction.sourceNodeId);
      const targetNode = getNodeById(interaction.hoverTarget.nodeId);
      if (!sourceNode || !targetNode || sourceNode.id === targetNode.id) {
        interaction = null;
        scheduleRender('preview');
        return;
      }

      const sourcePort = getPortById(sourceNode, 'output', interaction.sourcePortId);
      const targetPort = getPortById(targetNode, 'input', interaction.hoverTarget.portId);
      const type = Planner.resolvePlannerDefaultEdgeType(sourcePort, targetPort);
      const duplicate = store.getState().document.graph.edges.find((edge) => edge.sourceNodeId === sourceNode.id && edge.targetNodeId === targetNode.id && edge.sourcePortId === interaction.sourcePortId && edge.targetPortId === interaction.hoverTarget.portId);

      if (duplicate) {
        notify?.('That connection already exists.', 'warning');
        store.actions.selectEdge(duplicate.id);
        interaction = null;
        scheduleRender('preview');
        return;
      }

      store.actions.addEdge(Planner.createPlannerEdgeRecord({
        sourceNodeId: sourceNode.id,
        sourcePortId: interaction.sourcePortId,
        targetNodeId: targetNode.id,
        targetPortId: interaction.hoverTarget.portId,
        type,
      }), { reason: 'edge:connect' });
      notify?.('Connected nodes.', 'success');
      interaction = null;
      scheduleRender('preview');
    };

    const handleMouseMove = (event) => {
      if (!interaction) {
        return;
      }

      if (interaction.type === 'pan') {
        const dx = event.clientX - interaction.startClientX;
        const dy = event.clientY - interaction.startClientY;
        store.actions.setViewport({
          x: interaction.startViewport.x + dx,
          y: interaction.startViewport.y + dy,
        }, { history: false, reason: 'viewport:pan', dirty: false });
        return;
      }

      if (interaction.type === 'move') {
        updateMoveInteraction(event);
        return;
      }

      if (interaction.type === 'resize') {
        updateResizeInteraction(event);
        return;
      }

      if (interaction.type === 'connect') {
        updateConnectInteraction(event);
        return;
      }

      if (interaction.type === 'marquee') {
        interaction.currentClientX = event.clientX;
        interaction.currentClientY = event.clientY;
        interaction.currentWorld = worldFromClient(event.clientX, event.clientY);
        scheduleRender('preview');
      }
    };

    const handleMouseUp = () => {
      if (interaction?.type === 'connect') {
        completeConnectInteraction();
        return;
      }

      if (interaction?.type === 'marquee') {
        completeMarqueeSelection();
        return;
      }

      interaction = null;
      scheduleRender('preview');
    };

    const handleMouseDown = (event) => {
      if (event.target.closest('[data-edge-editor-shell="true"]')) {
        return;
      }

      if (edgeEditor) {
        closeEdgeEditor({ save: true });
      }

      if (event.button === 1 || spacePressed) {
        event.preventDefault();
        beginPan(event);
        return;
      }

      if (event.button !== 0) {
        return;
      }

      const resizeHandle = event.target.closest('[data-resize-handle]');
      if (resizeHandle) {
        event.preventDefault();
        store.actions.selectNode(resizeHandle.dataset.nodeId);
        beginResize(event, resizeHandle.dataset.nodeId, resizeHandle.dataset.resizeHandle);
        return;
      }

      const outputPort = event.target.closest('[data-port-role="output"]');
      if (outputPort) {
        event.preventDefault();
        store.actions.selectNode(outputPort.dataset.nodeId);
        beginConnect(event, outputPort.dataset.nodeId, outputPort.dataset.portId);
        return;
      }

      const edge = event.target.closest('[data-edge-id]');
      if (edge) {
        store.actions.selectEdge(edge.dataset.edgeId);
        return;
      }

      const node = event.target.closest('[data-node-id]');
      if (node) {
        event.preventDefault();
        const nodeId = node.dataset.nodeId;
        const additiveSelection = event.shiftKey || event.metaKey || event.ctrlKey;
        const currentSelection = store.getState().selection.nodeIds || [];

        if (additiveSelection) {
          store.actions.toggleNodeSelection(nodeId);
          return;
        }

        if (!currentSelection.includes(nodeId) || currentSelection.length === 1) {
          store.actions.selectNode(nodeId);
        }

        beginMove(event, node.dataset.nodeId);
        return;
      }

      beginMarquee(event);
    };

    const handleDoubleClick = (event) => {
      const edgeLabel = event.target.closest('[data-edge-label-id]');
      if (!edgeLabel) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      openEdgeEditor(edgeLabel.dataset.edgeLabelId);
    };

    const handleWheel = (event) => {
      event.preventDefault();
      const rect = getCanvasRect();
      const viewport = getViewport();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const worldX = (pointerX - viewport.x) / viewport.zoom;
      const worldY = (pointerY - viewport.y) / viewport.zoom;
      const factor = Math.exp(-event.deltaY * 0.0015);
      const nextZoom = Planner.clamp(viewport.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      store.actions.setViewport({
        zoom: nextZoom,
        x: pointerX - worldX * nextZoom,
        y: pointerY - worldY * nextZoom,
      }, { history: false, reason: 'viewport:zoom', dirty: false });
    };

    const handleDragEnter = (event) => {
      if (event.dataTransfer?.types?.includes('application/x-openclaw-node') || event.dataTransfer?.types?.includes('text/plain')) {
        dragOver = true;
        scheduleRender('dragover');
      }
    };

    const handleDragOver = (event) => {
      if (event.dataTransfer?.types?.includes('application/x-openclaw-node') || event.dataTransfer?.types?.includes('text/plain')) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        dragOver = true;
        scheduleRender('dragover');
      }
    };

    const handleDragLeave = (event) => {
      if (!shell.contains(event.relatedTarget)) {
        dragOver = false;
        scheduleRender('dragover');
      }
    };

    const handleDrop = (event) => {
      event.preventDefault();
      dragOver = false;
      const type = event.dataTransfer?.getData('application/x-openclaw-node') || event.dataTransfer?.getData('text/plain');
      if (!type) {
        scheduleRender('dragover');
        return;
      }

      const world = worldFromClient(event.clientX, event.clientY);
      createNodeAtPosition(type, { x: world.x - 100, y: world.y - 60 });
      notify?.(`Added ${Planner.getPlannerNodeType(type).label}.`, 'success');
      scheduleRender('dragover');
    };

    const handleMinimapPointerDown = (event) => {
      if (event.button !== 0) {
        return;
      }

      const bounds = JSON.parse(minimapSvg.dataset.bounds || '{}');
      const scale = Number(minimapSvg.dataset.scale || 1);
      const offsetX = Number(minimapSvg.dataset.offsetX || 0);
      const offsetY = Number(minimapSvg.dataset.offsetY || 0);
      const rect = minimapSvg.getBoundingClientRect();
      const localX = ((event.clientX - rect.left) / rect.width) * 220;
      const localY = ((event.clientY - rect.top) / rect.height) * 146;
      const worldPoint = {
        x: (localX - offsetX) / scale + bounds.minX,
        y: (localY - offsetY) / scale + bounds.minY,
      };
      centerViewportOnWorldPoint(worldPoint);
    };

    const handleKeyDown = (event) => {
      const tagName = event.target?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) {
        return;
      }

      if (event.code === 'Space') {
        spacePressed = true;
        scheduleRender('preview');
      }
    };

    const handleKeyUp = (event) => {
      if (event.code === 'Space') {
        spacePressed = false;
        scheduleRender('preview');
      }
    };

    const handleWindowBlur = () => {
      interaction = null;
      dragOver = false;
      spacePressed = false;
      scheduleRender('preview');
    };

    const handleOverlayInput = (event) => {
      const input = event.target.closest('[data-edge-editor-input="true"]');
      if (!input || !edgeEditor) {
        return;
      }

      edgeEditor.value = input.value;
    };

    const handleOverlayKeyDown = (event) => {
      const input = event.target.closest('[data-edge-editor-input="true"]');
      if (!input || !edgeEditor) {
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        closeEdgeEditor({ save: true });
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        closeEdgeEditor({ save: false });
      }
    };

    const handleOverlayFocusOut = (event) => {
      if (!edgeEditor) {
        return;
      }

      if (overlayLayer.contains(event.relatedTarget)) {
        return;
      }

      closeEdgeEditor({ save: true });
    };

    shell.addEventListener('mousedown', handleMouseDown);
    shell.addEventListener('dblclick', handleDoubleClick);
    shell.addEventListener('wheel', handleWheel, { passive: false });
    shell.addEventListener('dragenter', handleDragEnter);
    shell.addEventListener('dragover', handleDragOver);
    shell.addEventListener('dragleave', handleDragLeave);
    shell.addEventListener('drop', handleDrop);
    overlayLayer.addEventListener('input', handleOverlayInput);
    overlayLayer.addEventListener('keydown', handleOverlayKeyDown);
    overlayLayer.addEventListener('focusout', handleOverlayFocusOut);
    minimapSvg.addEventListener('mousedown', handleMinimapPointerDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    cleanup.push(() => shell.removeEventListener('mousedown', handleMouseDown));
    cleanup.push(() => shell.removeEventListener('dblclick', handleDoubleClick));
    cleanup.push(() => shell.removeEventListener('wheel', handleWheel));
    cleanup.push(() => shell.removeEventListener('dragenter', handleDragEnter));
    cleanup.push(() => shell.removeEventListener('dragover', handleDragOver));
    cleanup.push(() => shell.removeEventListener('dragleave', handleDragLeave));
    cleanup.push(() => shell.removeEventListener('drop', handleDrop));
    cleanup.push(() => overlayLayer.removeEventListener('input', handleOverlayInput));
    cleanup.push(() => overlayLayer.removeEventListener('keydown', handleOverlayKeyDown));
    cleanup.push(() => overlayLayer.removeEventListener('focusout', handleOverlayFocusOut));
    cleanup.push(() => minimapSvg.removeEventListener('mousedown', handleMinimapPointerDown));
    cleanup.push(() => window.removeEventListener('mousemove', handleMouseMove));
    cleanup.push(() => window.removeEventListener('mouseup', handleMouseUp));
    cleanup.push(() => window.removeEventListener('keydown', handleKeyDown));
    cleanup.push(() => window.removeEventListener('keyup', handleKeyUp));
    cleanup.push(() => window.removeEventListener('blur', handleWindowBlur));
    cleanup.push(store.subscribe((state, meta) => {
      scheduleRender(meta.reason);
    }));

    render('initial');

    return {
      createNodeAtCenter(type) {
        const center = getViewportCenterWorld();
        return createNodeAtPosition(type, { x: center.x - 120, y: center.y - 80 });
      },
      fitToGraph,
      focusEntity,
      getViewportCenterWorld,
      destroy() {
        cleanup.forEach((fn) => fn());
        cleanup = [];
        if (renderHandle) {
          window.cancelAnimationFrame(renderHandle);
        }
      },
    };
  }

  Planner.createPlannerCanvas = createPlannerCanvas;
})();
