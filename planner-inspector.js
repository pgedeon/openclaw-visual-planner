/*
 * OpenClaw Visual Planner
 * planner-inspector.js
 *
 * The inspector is intentionally form-driven so the same component can later be
 * mounted inside a WebOS native view without relying on a framework. Phase 2
 * adds live field health, multi-select summaries, and node appearance controls.
 */

(() => {
  const Planner = window.OpenClawPlanner = window.OpenClawPlanner || {};

  const edgeFieldDefinitions = [
    { key: 'label', label: 'Label', type: 'text', placeholder: 'Optional label' },
    {
      key: 'type',
      label: 'Type',
      type: 'select',
      options: () => Planner.PLANNER_EDGE_TYPES.map((type) => ({ value: type.id, label: type.label })),
    },
    { key: 'condition', label: 'Condition', type: 'textarea', placeholder: 'Only for conditional or approval paths.' },
    { key: 'payloadNotes', label: 'Payload Notes', type: 'textarea', placeholder: 'Mapping or contract notes.' },
    { key: 'executionPriority', label: 'Execution Priority', type: 'text', placeholder: 'high / medium / low' },
  ];

  const severityRank = {
    error: 0,
    warning: 1,
    info: 2,
  };

  const isBlankValue = (value, field = {}) => {
    if (field.type === 'checkbox') {
      return value !== true;
    }

    if (field.type === 'number') {
      return value === null || value === undefined || Number.isNaN(Number(value));
    }

    return String(value ?? '').trim() === '';
  };

  const isHexColor = (value) => /^#([a-f0-9]{3}|[a-f0-9]{6})$/i.test(String(value || '').trim());

  const parseControlValue = (control, field) => {
    if (field?.type === 'checkbox') {
      return Boolean(control.checked);
    }

    if (field?.type === 'number') {
      const parsed = Number(control.value || 0);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return control.value;
  };

  const resolveFieldDefinitions = ({ entityType, entity }) => {
    if (entityType === 'node') {
      const definition = Planner.getPlannerNodeType(entity?.type);
      return {
        definition,
        properties: Planner.PLANNER_COMMON_NODE_FIELDS.concat(definition.fields || []),
        appearance: Planner.PLANNER_NODE_APPEARANCE_FIELDS || [],
      };
    }

    return {
      definition: null,
      properties: edgeFieldDefinitions.map((field) => ({
        ...field,
        options: typeof field.options === 'function' ? field.options() : field.options,
      })),
      appearance: [],
    };
  };

  const getFieldDefinition = ({ entityType, entity, fieldKey }) => {
    const groups = resolveFieldDefinitions({ entityType, entity });
    return groups.properties.concat(groups.appearance).find((field) => field.key === fieldKey) || null;
  };

  const getFieldIssues = ({ state, entityType, entityId, fieldKey }) => (state.validation.issues || [])
    .filter((issue) => issue.entityType === entityType && issue.entityId === entityId && (!issue.fieldKey || issue.fieldKey === fieldKey))
    .sort((leftIssue, rightIssue) => (severityRank[leftIssue.severity] ?? 99) - (severityRank[rightIssue.severity] ?? 99));

  const getFieldState = ({ state, entityType, entity, field, value }) => {
    const issues = getFieldIssues({
      state,
      entityType,
      entityId: entity.id,
      fieldKey: field.key,
    }).filter((issue) => {
      if (['missing-required-field', 'missing-title'].includes(issue.code) && !isBlankValue(value, field)) {
        return false;
      }

      if (issue.code === 'invalid-timeout' && Number(value) >= 1) {
        return false;
      }

      return true;
    });
    const topIssue = issues[0] || null;

    if (field.required && isBlankValue(value, field)) {
      return {
        tone: 'error',
        label: 'Required',
        hint: `Add ${field.label.toLowerCase()} to make this ${entityType} valid.`,
      };
    }

    if (field.type === 'number') {
      const numericValue = Number(value);
      if (field.min !== undefined && numericValue < Number(field.min)) {
        return {
          tone: 'error',
          label: 'Too low',
          hint: `${field.label} must be at least ${field.min}.`,
        };
      }

      if (field.max !== undefined && numericValue > Number(field.max)) {
        return {
          tone: 'warning',
          label: 'High value',
          hint: `${field.label} should stay at or below ${field.max}.`,
        };
      }
    }

    if (field.type === 'color' && value && !isHexColor(value)) {
      return {
        tone: 'warning',
        label: 'Check color',
        hint: 'Use a standard hex color such as #60cdff.',
      };
    }

    if (topIssue) {
      const tone = topIssue.severity === 'error'
        ? 'error'
        : topIssue.severity === 'warning'
          ? 'warning'
          : 'info';

      return {
        tone,
        label: topIssue.severity === 'error'
          ? 'Needs attention'
          : topIssue.severity === 'warning'
            ? 'Check field'
            : 'Info',
        hint: topIssue.hint || topIssue.message,
      };
    }

    if (field.type === 'checkbox') {
      return {
        tone: value ? 'success' : 'neutral',
        label: value ? 'Enabled' : 'Off',
        hint: value ? `${field.label} is enabled.` : `${field.label} is disabled.`,
      };
    }

    if (!isBlankValue(value, field)) {
      return {
        tone: 'success',
        label: 'Looks good',
        hint: `${field.label} is set.`,
      };
    }

    return {
      tone: 'neutral',
      label: field.required ? 'Required' : 'Optional',
      hint: field.required
        ? `${field.label} still needs a value.`
        : `${field.label} is optional.`,
    };
  };

  const renderField = ({ value, field, binding, state, entityType, entity }) => {
    const id = `${binding}-${field.key}`;
    const fieldState = getFieldState({ state, entityType, entity, field, value });
    const options = typeof field.options === 'function' ? field.options() : field.options;
    const labelMarkup = `
      <span class="planner-field__row">
        <span class="planner-field__label">${Planner.escapeHtml(field.label)}</span>
        <span class="planner-field__indicator is-${Planner.escapeHtml(fieldState.tone)}" data-field-indicator="true">${Planner.escapeHtml(fieldState.label)}</span>
      </span>
    `;

    if (field.type === 'textarea') {
      return `
        <label class="planner-field is-${Planner.escapeHtml(fieldState.tone)}" for="${id}" data-field-wrapper="true" data-binding="${binding}" data-field-key="${field.key}">
          ${labelMarkup}
          <textarea class="planner-textarea" id="${id}" data-binding="${binding}" data-field-key="${field.key}" placeholder="${Planner.escapeHtml(field.placeholder || '')}">${Planner.escapeHtml(value ?? '')}</textarea>
          <span class="planner-field__hint" data-field-hint="true">${Planner.escapeHtml(fieldState.hint)}</span>
        </label>
      `;
    }

    if (field.type === 'select') {
      return `
        <label class="planner-field is-${Planner.escapeHtml(fieldState.tone)}" for="${id}" data-field-wrapper="true" data-binding="${binding}" data-field-key="${field.key}">
          ${labelMarkup}
          <select class="planner-select" id="${id}" data-binding="${binding}" data-field-key="${field.key}">
            ${(options || []).map((option) => `
              <option value="${Planner.escapeHtml(option.value)}"${String(option.value) === String(value ?? field.value ?? '') ? ' selected' : ''}>${Planner.escapeHtml(option.label)}</option>
            `).join('')}
          </select>
          <span class="planner-field__hint" data-field-hint="true">${Planner.escapeHtml(fieldState.hint)}</span>
        </label>
      `;
    }

    if (field.type === 'checkbox') {
      return `
        <label class="planner-field planner-field--inline is-${Planner.escapeHtml(fieldState.tone)}" for="${id}" data-field-wrapper="true" data-binding="${binding}" data-field-key="${field.key}">
          <input class="planner-checkbox" type="checkbox" id="${id}" data-binding="${binding}" data-field-key="${field.key}"${value ? ' checked' : ''} />
          <span class="planner-field__inline-copy">
            ${labelMarkup}
            <span class="planner-field__hint" data-field-hint="true">${Planner.escapeHtml(fieldState.hint)}</span>
          </span>
        </label>
      `;
    }

    return `
      <label class="planner-field is-${Planner.escapeHtml(fieldState.tone)}" for="${id}" data-field-wrapper="true" data-binding="${binding}" data-field-key="${field.key}">
        ${labelMarkup}
        <input
          class="planner-input${field.type === 'color' ? ' planner-input--color' : ''}"
          type="${Planner.escapeHtml(field.type || 'text')}"
          id="${id}"
          data-binding="${binding}"
          data-field-key="${field.key}"
          value="${Planner.escapeHtml(value ?? field.value ?? '')}"
          ${field.min !== undefined ? `min="${field.min}"` : ''}
          ${field.max !== undefined ? `max="${field.max}"` : ''}
          placeholder="${Planner.escapeHtml(field.placeholder || '')}"
        />
        <span class="planner-field__hint" data-field-hint="true">${Planner.escapeHtml(fieldState.hint)}</span>
      </label>
    `;
  };

  function createPlannerInspector({ mountNode, store, actions = {} }) {
    let cleanup = [];

    const renderInspectorHeader = ({ eyebrow = 'Inspector', title = 'Nothing Selected', extraActions = '' } = {}) => `
      <div class="planner-panel__header">
        <div>
          <div class="planner-panel__eyebrow">${Planner.escapeHtml(eyebrow)}</div>
          <h2 class="planner-panel__title">${Planner.escapeHtml(title)}</h2>
        </div>
        <div class="planner-chip-stack planner-inspector__header-actions">
          ${extraActions}
          ${actions.toggleInspector ? '<button type="button" class="planner-button planner-button--ghost" data-inspector-action="toggle">Collapse</button>' : ''}
        </div>
      </div>
    `;

    const renderNodeIntegrations = (node) => {
      const integrationButtons = [];

      if (node.type === 'task') {
        integrationButtons.push('<button type="button" class="planner-button planner-button--ghost" data-node-integration="open-task">Open in Tasks</button>');
      }
      if (node.type === 'agent') {
        integrationButtons.push('<button type="button" class="planner-button planner-button--ghost" data-node-integration="open-agent">Open Agent</button>');
      }
      if (node.type === 'artifact') {
        integrationButtons.push('<button type="button" class="planner-button planner-button--ghost" data-node-integration="open-file">Open File</button>');
      }
      if (node.type === 'workflow-step') {
        integrationButtons.push('<button type="button" class="planner-button planner-button--ghost" data-node-integration="edit-notepad">Edit in Notepad</button>');
      }

      if (!integrationButtons.length) {
        return '';
      }

      return `
        <div class="planner-inspector__section">
          <div class="planner-section-title">Integrations</div>
          <div class="planner-chip-stack planner-inspector__actions">
            ${integrationButtons.join('')}
          </div>
        </div>
      `;
    };

    const renderEmpty = (state) => `
      ${renderInspectorHeader({ eyebrow: 'Inspector', title: 'Nothing Selected' })}
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
          <li>Drag across the canvas background to marquee-select several nodes.</li>
          <li>Use the toolbar to align, distribute, or tidy selected graph regions.</li>
          <li>Press <strong>?</strong> any time for the shortcut sheet.</li>
        </ul>
      </div>
    `;

    const renderMultiSelection = (state, nodes) => {
      const issueCount = (state.validation.issues || []).filter((issue) => issue.entityType === 'node' && nodes.some((node) => node.id === issue.entityId)).length;
      const categories = Array.from(new Set(nodes.map((node) => Planner.getPlannerNodeType(node.type).label)));

      return `
        ${renderInspectorHeader({
          eyebrow: 'Inspector',
          title: `${nodes.length} Nodes Selected`,
          extraActions: '<button type="button" class="planner-button planner-button--ghost" data-delete-selection="true">Delete</button>',
        })}
        <div class="planner-inspector__summary-card">
          <div class="planner-inspector__summary-title">Batch selection</div>
          <div class="planner-inspector__summary-copy">Use the toolbar to align, distribute, tidy, duplicate, or copy the current selection.</div>
          <div class="planner-chip-stack">
            <span class="planner-chip">${nodes.length} nodes</span>
            <span class="planner-chip ${issueCount ? 'is-warning' : 'is-success'}">${issueCount} issue${issueCount === 1 ? '' : 's'}</span>
            ${categories.map((label) => `<span class="planner-chip">${Planner.escapeHtml(label)}</span>`).join('')}
          </div>
        </div>
        <div class="planner-inspector__section">
          <div class="planner-section-title">Selection Bounds</div>
          <div class="planner-inspector__stats">
            <div class="planner-inspector__stat"><span>Left</span><strong>${Math.min(...nodes.map((node) => Math.round(node.x)))}</strong></div>
            <div class="planner-inspector__stat"><span>Top</span><strong>${Math.min(...nodes.map((node) => Math.round(node.y)))}</strong></div>
            <div class="planner-inspector__stat"><span>Right</span><strong>${Math.max(...nodes.map((node) => Math.round(node.x + node.width)))}</strong></div>
            <div class="planner-inspector__stat"><span>Bottom</span><strong>${Math.max(...nodes.map((node) => Math.round(node.y + node.height)))}</strong></div>
          </div>
        </div>
        <div class="planner-inspector__section">
          <div class="planner-section-title">Selection Tips</div>
          <ul class="planner-list">
            <li>Hold <strong>Shift</strong> while clicking to add or remove a node from the selection.</li>
            <li>Press <strong>Ctrl+C</strong> then <strong>Ctrl+V</strong> to clone the whole subgraph with an offset.</li>
            <li>Use <strong>Ctrl+D</strong> to duplicate the selected nodes immediately.</li>
          </ul>
        </div>
      `;
    };

    const renderNodeInspector = (state, node) => {
      const groups = resolveFieldDefinitions({ entityType: 'node', entity: node });
      const definition = groups.definition;
      const ports = Planner.getPlannerNodePorts(node);
      const issueCount = (state.validation.issues || []).filter((issue) => issue.entityType === 'node' && issue.entityId === node.id).length;

      return `
        ${renderInspectorHeader({
          eyebrow: definition.category,
          title: definition.label,
          extraActions: '<button type="button" class="planner-button planner-button--ghost" data-delete-selection="true">Delete</button>',
        })}
        <div class="planner-inspector__summary-card">
          <div class="planner-inspector__summary-title">${Planner.escapeHtml(node.data?.title || definition.label)}</div>
          <div class="planner-inspector__summary-copy">${Planner.escapeHtml(definition.description)}</div>
          <div class="planner-chip-stack">
            <span class="planner-chip">${Planner.escapeHtml(definition.code)}</span>
            <span class="planner-chip ${issueCount ? 'is-warning' : 'is-success'}">${issueCount} issue${issueCount === 1 ? '' : 's'}</span>
            <span class="planner-chip">${Planner.escapeHtml(node.data?.visualStyle || 'default')} style</span>
          </div>
        </div>
        ${renderNodeIntegrations(node)}
        <div class="planner-inspector__section">
          <div class="planner-section-title">Properties</div>
          <div class="planner-inspector__fields">
            ${groups.properties.map((field) => renderField({ value: node.data?.[field.key], field, binding: 'node-field', state, entityType: 'node', entity: node })).join('')}
          </div>
        </div>
        <div class="planner-inspector__section">
          <div class="planner-section-title">Appearance</div>
          <div class="planner-inspector__fields planner-inspector__fields--two-col">
            ${groups.appearance.map((field) => renderField({ value: node.data?.[field.key], field, binding: 'node-field', state, entityType: 'node', entity: node })).join('')}
          </div>
        </div>
        <div class="planner-inspector__section">
          <div class="planner-section-title">Layout</div>
          <div class="planner-inspector__fields planner-inspector__fields--two-col">
            ${renderField({ value: node.x, field: { key: 'x', label: 'X', type: 'number' }, binding: 'node-layout', state, entityType: 'node', entity: node })}
            ${renderField({ value: node.y, field: { key: 'y', label: 'Y', type: 'number' }, binding: 'node-layout', state, entityType: 'node', entity: node })}
            ${renderField({ value: node.width, field: { key: 'width', label: 'Width', type: 'number', min: 140, max: 720 }, binding: 'node-layout', state, entityType: 'node', entity: node })}
            ${renderField({ value: node.height, field: { key: 'height', label: 'Height', type: 'number', min: 84, max: 480 }, binding: 'node-layout', state, entityType: 'node', entity: node })}
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

    const renderEdgeInspector = (state, edge) => {
      const edgeType = Planner.getPlannerEdgeType(edge.type);
      const groups = resolveFieldDefinitions({ entityType: 'edge', entity: edge });
      const issueCount = (state.validation.issues || []).filter((issue) => issue.entityType === 'edge' && issue.entityId === edge.id).length;

      return `
        ${renderInspectorHeader({
          eyebrow: 'Connection',
          title: edgeType.label,
          extraActions: '<button type="button" class="planner-button planner-button--ghost" data-delete-selection="true">Delete</button>',
        })}
        <div class="planner-inspector__summary-card">
          <div class="planner-inspector__summary-title">${Planner.escapeHtml(edge.label || edgeType.shortLabel)}</div>
          <div class="planner-inspector__summary-copy">${Planner.escapeHtml(edgeType.description)}</div>
          <div class="planner-chip-stack">
            <span class="planner-chip">${Planner.escapeHtml(edgeType.shortLabel)}</span>
            <span class="planner-chip ${issueCount ? 'is-warning' : 'is-success'}">${issueCount} issue${issueCount === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div class="planner-inspector__section">
          <div class="planner-section-title">Edge Properties</div>
          <div class="planner-inspector__fields">
            ${groups.properties.map((field) => renderField({ value: edge[field.key], field, binding: 'edge-field', state, entityType: 'edge', entity: edge })).join('')}
          </div>
        </div>
      `;
    };

    const updateFieldIndicators = () => {
      const state = store.getState();
      const entityType = state.selection.type === 'edge' ? 'edge' : 'node';
      const entity = entityType === 'edge'
        ? state.document.graph.edges.find((item) => item.id === state.selection.edgeId)
        : state.document.graph.nodes.find((item) => item.id === state.selection.nodeIds[0]);

      if (!entity) {
        return;
      }

      mountNode.querySelectorAll('[data-field-wrapper="true"]').forEach((wrapper) => {
        const control = wrapper.querySelector('[data-field-key]');
        if (!control) {
          return;
        }

        const field = getFieldDefinition({ entityType, entity, fieldKey: wrapper.dataset.fieldKey })
          || { key: wrapper.dataset.fieldKey, label: wrapper.dataset.fieldKey, type: control.type || 'text' };
        const value = parseControlValue(control, field);
        const fieldState = getFieldState({ state, entityType, entity, field, value });

        wrapper.classList.remove('is-error', 'is-warning', 'is-info', 'is-success', 'is-neutral');
        wrapper.classList.add(`is-${fieldState.tone}`);

        const indicator = wrapper.querySelector('[data-field-indicator="true"]');
        if (indicator) {
          indicator.className = `planner-field__indicator is-${fieldState.tone}`;
          indicator.textContent = fieldState.label;
        }

        const hint = wrapper.querySelector('[data-field-hint="true"]');
        if (hint) {
          hint.textContent = fieldState.hint;
        }
      });
    };

    const render = () => {
      const state = store.getState();

      if (state.selection.type === 'node' && state.selection.nodeIds.length > 1) {
        const nodes = state.document.graph.nodes.filter((item) => state.selection.nodeIds.includes(item.id));
        mountNode.innerHTML = nodes.length ? renderMultiSelection(state, nodes) : renderEmpty(state);
        return;
      }

      if (state.selection.type === 'node' && state.selection.nodeIds.length) {
        const node = state.document.graph.nodes.find((item) => item.id === state.selection.nodeIds[0]);
        mountNode.innerHTML = node ? renderNodeInspector(state, node) : renderEmpty(state);
        updateFieldIndicators();
        return;
      }

      if (state.selection.type === 'edge' && state.selection.edgeId) {
        const edge = state.document.graph.edges.find((item) => item.id === state.selection.edgeId);
        mountNode.innerHTML = edge ? renderEdgeInspector(state, edge) : renderEmpty(state);
        updateFieldIndicators();
        return;
      }

      mountNode.innerHTML = renderEmpty(state);
    };

    const handleInput = () => {
      updateFieldIndicators();
    };

    const handleChange = (event) => {
      const target = event.target;
      const state = store.getState();

      if (target.matches('[data-binding="node-field"]') && state.selection.type === 'node' && state.selection.nodeIds.length === 1) {
        const nodeId = state.selection.nodeIds[0];
        const node = state.document.graph.nodes.find((item) => item.id === nodeId);
        const field = getFieldDefinition({ entityType: 'node', entity: node, fieldKey: target.dataset.fieldKey });

        store.actions.updateNode(nodeId, {
          data: {
            [target.dataset.fieldKey]: parseControlValue(target, field),
          },
        }, { history: true, reason: 'inspector:node-field' });
        return;
      }

      if (target.matches('[data-binding="node-layout"]') && state.selection.type === 'node' && state.selection.nodeIds.length === 1) {
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
        const edge = state.document.graph.edges.find((item) => item.id === edgeId);
        const field = getFieldDefinition({ entityType: 'edge', entity: edge, fieldKey: target.dataset.fieldKey });

        store.actions.updateEdge(edgeId, {
          [target.dataset.fieldKey]: parseControlValue(target, field),
        }, { history: true, reason: 'inspector:edge-field' });
      }
    };

    const handleClick = (event) => {
      const inspectorAction = event.target.closest('[data-inspector-action]');
      if (inspectorAction?.dataset.inspectorAction === 'toggle') {
        actions.toggleInspector?.();
        return;
      }

      const deleteButton = event.target.closest('[data-delete-selection]');
      if (deleteButton) {
        store.actions.removeSelection();
        return;
      }

      const integrationButton = event.target.closest('[data-node-integration]');
      if (!integrationButton) {
        return;
      }

      const state = store.getState();
      const nodeId = state.selection.nodeIds?.[0];
      const node = state.selection.type === 'node' && nodeId
        ? state.document.graph.nodes.find((item) => item.id === nodeId)
        : null;

      if (!node) {
        return;
      }

      if (integrationButton.dataset.nodeIntegration === 'open-task') {
        actions.openTaskNode?.(node);
      }

      if (integrationButton.dataset.nodeIntegration === 'open-agent') {
        actions.openAgentNode?.(node);
      }

      if (integrationButton.dataset.nodeIntegration === 'open-file') {
        actions.openArtifactNode?.(node);
      }

      if (integrationButton.dataset.nodeIntegration === 'edit-notepad') {
        actions.editWorkflowStepInNotepad?.(node);
      }
    };

    mountNode.addEventListener('input', handleInput);
    mountNode.addEventListener('change', handleChange);
    mountNode.addEventListener('click', handleClick);
    cleanup.push(() => mountNode.removeEventListener('input', handleInput));
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
