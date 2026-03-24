/*
 * OpenClaw Visual Planner
 * planner-inspector.js
 *
 * The inspector is intentionally form-driven so the same component can later be
 * mounted inside a WebOS native view without relying on a framework.
 */

(() => {
  const Planner = window.OpenClawPlanner = window.OpenClawPlanner || {};

  const parseControlValue = (control, field) => {
    if (field?.type === 'checkbox') {
      return Boolean(control.checked);
    }

    if (field?.type === 'number') {
      return Number(control.value || 0);
    }

    return control.value;
  };

  const renderField = (value, field, binding) => {
    const id = `${binding}-${field.key}`;
    if (field.type === 'textarea') {
      return `
        <label class="planner-field" for="${id}">
          <span class="planner-field__label">${Planner.escapeHtml(field.label)}</span>
          <textarea class="planner-textarea" id="${id}" data-binding="${binding}" data-field-key="${field.key}" placeholder="${Planner.escapeHtml(field.placeholder || '')}">${Planner.escapeHtml(value ?? '')}</textarea>
        </label>
      `;
    }

    if (field.type === 'select') {
      return `
        <label class="planner-field" for="${id}">
          <span class="planner-field__label">${Planner.escapeHtml(field.label)}</span>
          <select class="planner-select" id="${id}" data-binding="${binding}" data-field-key="${field.key}">
            ${(field.options || []).map((option) => `
              <option value="${Planner.escapeHtml(option.value)}"${String(option.value) === String(value ?? field.value ?? '') ? ' selected' : ''}>${Planner.escapeHtml(option.label)}</option>
            `).join('')}
          </select>
        </label>
      `;
    }

    if (field.type === 'checkbox') {
      return `
        <label class="planner-field planner-field--inline" for="${id}">
          <input class="planner-checkbox" type="checkbox" id="${id}" data-binding="${binding}" data-field-key="${field.key}"${value ? ' checked' : ''} />
          <span class="planner-field__label">${Planner.escapeHtml(field.label)}</span>
        </label>
      `;
    }

    return `
      <label class="planner-field" for="${id}">
        <span class="planner-field__label">${Planner.escapeHtml(field.label)}</span>
        <input
          class="planner-input"
          type="${Planner.escapeHtml(field.type || 'text')}"
          id="${id}"
          data-binding="${binding}"
          data-field-key="${field.key}"
          value="${Planner.escapeHtml(value ?? field.value ?? '')}"
          ${field.min !== undefined ? `min="${field.min}"` : ''}
          ${field.max !== undefined ? `max="${field.max}"` : ''}
          placeholder="${Planner.escapeHtml(field.placeholder || '')}"
        />
      </label>
    `;
  };

  function createPlannerInspector({ mountNode, store }) {
    let cleanup = [];

    const renderEmpty = (state) => `
      <div class="planner-panel__header">
        <div>
          <div class="planner-panel__eyebrow">Inspector</div>
          <h2 class="planner-panel__title">Nothing Selected</h2>
        </div>
      </div>
      <div class="planner-inspector__summary-card">
        <div class="planner-inspector__summary-title">${Planner.escapeHtml(state.document.metadata.title)}</div>
        <div class="planner-inspector__summary-copy">${Planner.escapeHtml(state.document.metadata.description || 'Describe the plan, then build nodes and edges around it.')}</div>
        <div class="planner-inspector__stats">
          <div class="planner-inspector__stat"><span>Nodes</span><strong>${state.document.graph.nodes.length}</strong></div>
          <div class="planner-inspector__stat"><span>Edges</span><strong>${state.document.graph.edges.length}</strong></div>
          <div class="planner-inspector__stat"><span>Mode</span><strong>${Planner.escapeHtml(state.ui.mode)}</strong></div>
        </div>
      </div>
      <div class="planner-inspector__tips">
        <div class="planner-section-title">Quick Tips</div>
        <ul class="planner-list">
          <li>Select a node to edit its properties.</li>
          <li>Select an edge to change its label, type, or conditions.</li>
          <li>Use the toolbar to validate, save, and export the graph.</li>
        </ul>
      </div>
    `;

    const renderNodeInspector = (node) => {
      const definition = Planner.getPlannerNodeType(node.type);
      const fields = Planner.PLANNER_COMMON_NODE_FIELDS.concat(definition.fields || []);
      const ports = Planner.getPlannerNodePorts(node);

      return `
        <div class="planner-panel__header">
          <div>
            <div class="planner-panel__eyebrow">${Planner.escapeHtml(definition.category)}</div>
            <h2 class="planner-panel__title">${Planner.escapeHtml(definition.label)}</h2>
          </div>
          <button type="button" class="planner-button planner-button--ghost" data-delete-selection="true">Delete</button>
        </div>
        <div class="planner-inspector__summary-card">
          <div class="planner-inspector__summary-title">${Planner.escapeHtml(node.data?.title || definition.label)}</div>
          <div class="planner-inspector__summary-copy">${Planner.escapeHtml(definition.description)}</div>
        </div>
        <div class="planner-inspector__section">
          <div class="planner-section-title">Properties</div>
          <div class="planner-inspector__fields">
            ${fields.map((field) => renderField(node.data?.[field.key], field, 'node-field')).join('')}
          </div>
        </div>
        <div class="planner-inspector__section">
          <div class="planner-section-title">Layout</div>
          <div class="planner-inspector__fields planner-inspector__fields--two-col">
            ${renderField(node.x, { key: 'x', label: 'X', type: 'number' }, 'node-layout')}
            ${renderField(node.y, { key: 'y', label: 'Y', type: 'number' }, 'node-layout')}
            ${renderField(node.width, { key: 'width', label: 'Width', type: 'number', min: 140, max: 720 }, 'node-layout')}
            ${renderField(node.height, { key: 'height', label: 'Height', type: 'number', min: 84, max: 480 }, 'node-layout')}
          </div>
        </div>
        <div class="planner-inspector__section">
          <div class="planner-section-title">Ports</div>
          <div class="planner-chip-stack">
            ${ports.inputs.map((port) => `<span class="planner-chip">In · ${Planner.escapeHtml(port.label)}</span>`).join('')}
            ${ports.outputs.map((port) => `<span class="planner-chip">Out · ${Planner.escapeHtml(port.label)}</span>`).join('')}
          </div>
        </div>
      `;
    };

    const renderEdgeInspector = (edge) => {
      const edgeType = Planner.getPlannerEdgeType(edge.type);

      return `
        <div class="planner-panel__header">
          <div>
            <div class="planner-panel__eyebrow">Connection</div>
            <h2 class="planner-panel__title">${Planner.escapeHtml(edgeType.label)}</h2>
          </div>
          <button type="button" class="planner-button planner-button--ghost" data-delete-selection="true">Delete</button>
        </div>
        <div class="planner-inspector__summary-card">
          <div class="planner-inspector__summary-title">${Planner.escapeHtml(edge.label || edgeType.shortLabel)}</div>
          <div class="planner-inspector__summary-copy">${Planner.escapeHtml(edgeType.description)}</div>
        </div>
        <div class="planner-inspector__section">
          <div class="planner-section-title">Edge Properties</div>
          <div class="planner-inspector__fields">
            ${renderField(edge.label, { key: 'label', label: 'Label', type: 'text', placeholder: 'Optional label' }, 'edge-field')}
            ${renderField(edge.type, {
              key: 'type',
              label: 'Type',
              type: 'select',
              options: Planner.PLANNER_EDGE_TYPES.map((type) => ({ value: type.id, label: type.label })),
            }, 'edge-field')}
            ${renderField(edge.condition, { key: 'condition', label: 'Condition', type: 'textarea', placeholder: 'Only for conditional or approval paths.' }, 'edge-field')}
            ${renderField(edge.payloadNotes, { key: 'payloadNotes', label: 'Payload Notes', type: 'textarea', placeholder: 'Mapping or contract notes.' }, 'edge-field')}
            ${renderField(edge.executionPriority, { key: 'executionPriority', label: 'Execution Priority', type: 'text', placeholder: 'high / medium / low' }, 'edge-field')}
          </div>
        </div>
      `;
    };

    const render = () => {
      const state = store.getState();

      if (state.selection.type === 'node' && state.selection.nodeIds.length) {
        const node = state.document.graph.nodes.find((item) => item.id === state.selection.nodeIds[0]);
        mountNode.innerHTML = node ? renderNodeInspector(node) : renderEmpty(state);
        return;
      }

      if (state.selection.type === 'edge' && state.selection.edgeId) {
        const edge = state.document.graph.edges.find((item) => item.id === state.selection.edgeId);
        mountNode.innerHTML = edge ? renderEdgeInspector(edge) : renderEmpty(state);
        return;
      }

      mountNode.innerHTML = renderEmpty(state);
    };

    const handleChange = (event) => {
      const target = event.target;
      const state = store.getState();

      if (target.matches('[data-binding="node-field"]') && state.selection.type === 'node' && state.selection.nodeIds.length) {
        const nodeId = state.selection.nodeIds[0];
        const definition = Planner.getPlannerNodeType(state.document.graph.nodes.find((item) => item.id === nodeId)?.type);
        const field = Planner.PLANNER_COMMON_NODE_FIELDS.concat(definition.fields || []).find((item) => item.key === target.dataset.fieldKey);
        store.actions.updateNode(nodeId, {
          data: {
            [target.dataset.fieldKey]: parseControlValue(target, field),
          },
        }, { history: true, reason: 'inspector:node-field' });
        return;
      }

      if (target.matches('[data-binding="node-layout"]') && state.selection.type === 'node' && state.selection.nodeIds.length) {
        const nodeId = state.selection.nodeIds[0];
        const numericValue = Number(target.value || 0);
        const patch = { [target.dataset.fieldKey]: numericValue };
        if (target.dataset.fieldKey === 'width') {
          patch.width = Planner.clamp(numericValue, 140, 720);
        }
        if (target.dataset.fieldKey === 'height') {
          patch.height = Planner.clamp(numericValue, 84, 480);
        }
        store.actions.updateNode(nodeId, patch, { history: true, reason: 'inspector:node-layout' });
        return;
      }

      if (target.matches('[data-binding="edge-field"]') && state.selection.type === 'edge' && state.selection.edgeId) {
        const edgeId = state.selection.edgeId;
        store.actions.updateEdge(edgeId, {
          [target.dataset.fieldKey]: target.value,
        }, { history: true, reason: 'inspector:edge-field' });
      }
    };

    const handleClick = (event) => {
      const deleteButton = event.target.closest('[data-delete-selection]');
      if (deleteButton) {
        store.actions.removeSelection();
      }
    };

    mountNode.addEventListener('change', handleChange);
    mountNode.addEventListener('click', handleClick);
    cleanup.push(() => mountNode.removeEventListener('change', handleChange));
    cleanup.push(() => mountNode.removeEventListener('click', handleClick));
    cleanup.push(store.subscribe(render));

    return {
      destroy() {
        cleanup.forEach((fn) => fn());
        cleanup = [];
      },
    };
  }

  Planner.createPlannerInspector = createPlannerInspector;
})();
