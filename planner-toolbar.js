/*
 * OpenClaw Visual Planner
 * planner-toolbar.js
 *
 * The toolbar keeps core actions discoverable while staying close to the WebOS
 * aesthetic: compact controls, segmented modes, and subtle status chips.
 */

(() => {
  const Planner = window.OpenClawPlanner = window.OpenClawPlanner || {};

  function createPlannerToolbar({ mountNode, store, actions = {} }) {
    let cleanup = [];

    const render = (_, meta = {}) => {
      const state = store.getState();
      const templates = Planner.getPlannerTemplates();
      const issues = state.validation.issues || [];
      const zoom = Math.round((state.viewport.zoom || 1) * 100);
      const canUndo = typeof store.canUndo === 'function' ? store.canUndo() : false;
      const canRedo = typeof store.canRedo === 'function' ? store.canRedo() : false;
      const selectionCount = state.selection.nodeIds.length;
      const canArrange = selectionCount >= 2;
      const canDistribute = selectionCount >= 3;
      const backendAvailability = state.backend?.availability || 'unknown';
      const backendTone = backendAvailability === 'online'
        ? 'is-success'
        : backendAvailability === 'offline'
          ? 'is-warning'
          : 'is-info';
      const backendLabel = backendAvailability === 'online'
        ? 'Backend online'
        : backendAvailability === 'offline'
          ? 'Backend offline'
          : 'Checking backend';
      const storageLabel = state.backend?.preferredStorage === 'server'
        ? 'Prefers server storage'
        : 'Using local fallback';
      const savedLabel = state.meta.lastSavedAt
        ? `Saved ${new Date(state.meta.lastSavedAt).toLocaleTimeString()}`
        : 'Not saved yet';

      mountNode.innerHTML = `
        <div class="planner-toolbar__brand">
          <div class="planner-toolbar__logo">OC</div>
          <div>
            <div class="planner-toolbar__title">OpenClaw Visual Planner</div>
            <div class="planner-toolbar__subtitle">Standalone workflow canvas with graph editing, validation, and runtime overlays</div>
          </div>
        </div>
        <div class="planner-toolbar__controls">
          <div class="planner-toolbar__group planner-toolbar__group--segmented">
            ${['sketch', 'workflow', 'runtime'].map((mode) => `
              <button class="planner-segment ${state.ui.mode === mode ? 'is-active' : ''}" type="button" data-mode="${mode}">${mode}</button>
            `).join('')}
          </div>

          <div class="planner-toolbar__group">
            <label class="planner-toolbar__label" for="planner-template-picker">Template</label>
            <select class="planner-select" id="planner-template-picker" data-template-picker="true">
              <option value="">Choose a starter template…</option>
              ${templates.map((template) => `<option value="${template.id}"${state.document.metadata.templateId === template.id ? ' selected' : ''}>${Planner.escapeHtml(template.label)}</option>`).join('')}
            </select>
          </div>

          <div class="planner-toolbar__group">
            <button class="planner-button planner-button--primary" type="button" data-action="validate">Validate</button>
            <button class="planner-button" type="button" data-action="fit">Fit View</button>
            <button class="planner-button" type="button" data-action="tidy">Tidy Graph</button>
            <button class="planner-button" type="button" data-action="new">Blank</button>
          </div>

          <div class="planner-toolbar__group">
            <button class="planner-button" type="button" data-action="align-left"${canArrange ? '' : ' disabled'}>Align Left</button>
            <button class="planner-button" type="button" data-action="align-top"${canArrange ? '' : ' disabled'}>Align Top</button>
            <button class="planner-button" type="button" data-action="distribute-x"${canDistribute ? '' : ' disabled'}>Distribute X</button>
            <button class="planner-button" type="button" data-action="distribute-y"${canDistribute ? '' : ' disabled'}>Distribute Y</button>
          </div>

          <div class="planner-toolbar__group">
            <button class="planner-button" type="button" data-action="toggle-grid">${state.preferences.showGrid ? 'Hide Grid' : 'Show Grid'}</button>
            <button class="planner-button" type="button" data-action="toggle-snap">Snap ${state.preferences.snapToGrid ? 'On' : 'Off'}</button>
            <button class="planner-button" type="button" data-action="toggle-minimap">Map ${state.preferences.showMinimap ? 'On' : 'Off'}</button>
          </div>

          <div class="planner-toolbar__group">
            <button class="planner-button" type="button" data-action="undo"${canUndo ? '' : ' disabled'}>Undo</button>
            <button class="planner-button" type="button" data-action="redo"${canRedo ? '' : ' disabled'}>Redo</button>
          </div>

          <div class="planner-toolbar__group">
            <button class="planner-button" type="button" data-action="save">Save</button>
            <button class="planner-button" type="button" data-action="load">Load</button>
            <button class="planner-button" type="button" data-action="save-server">Save to Server</button>
            <button class="planner-button" type="button" data-action="open-server">Open from Server</button>
            <button class="planner-button" type="button" data-action="export">Export</button>
            <button class="planner-button" type="button" data-action="import">Import</button>
            <button class="planner-button" type="button" data-action="shortcuts">Shortcuts</button>
            <input type="file" accept="application/json,.json" hidden data-import-input="true" />
          </div>
        </div>
        <div class="planner-toolbar__status">
          <span class="planner-chip ${issues.length ? 'is-warning' : 'is-success'}">${issues.length} issue${issues.length === 1 ? '' : 's'}</span>
          <span class="planner-chip">${state.document.graph.nodes.length} nodes</span>
          <span class="planner-chip">${state.document.graph.edges.length} edges</span>
          ${selectionCount ? `<span class="planner-chip is-info">${selectionCount} selected</span>` : ''}
          <span class="planner-chip">${zoom}% zoom</span>
          <span class="planner-chip ${state.meta.dirty ? 'is-warning' : ''}">${state.meta.dirty ? 'Unsaved changes' : savedLabel}</span>
          <span class="planner-chip ${backendTone}">${backendLabel}</span>
          <span class="planner-chip">${storageLabel}</span>
          ${meta.reason ? `<span class="planner-chip">${Planner.escapeHtml(meta.reason)}</span>` : ''}
        </div>
      `;
    };

    const handleClick = (event) => {
      const actionButton = event.target.closest('[data-action]');
      if (!actionButton) {
        const modeButton = event.target.closest('[data-mode]');
        if (modeButton) {
          actions.setMode?.(modeButton.dataset.mode);
        }
        return;
      }

      const action = actionButton.dataset.action;
      if (action === 'validate') actions.validate?.();
      if (action === 'fit') actions.fitToGraph?.();
      if (action === 'tidy') actions.tidyGraph?.();
      if (action === 'new') actions.newBlank?.();
      if (action === 'align-left') actions.alignSelection?.('left');
      if (action === 'align-top') actions.alignSelection?.('top');
      if (action === 'distribute-x') actions.distributeSelection?.('horizontal');
      if (action === 'distribute-y') actions.distributeSelection?.('vertical');
      if (action === 'toggle-grid') actions.togglePreference?.('showGrid');
      if (action === 'toggle-snap') actions.togglePreference?.('snapToGrid');
      if (action === 'toggle-minimap') actions.togglePreference?.('showMinimap');
      if (action === 'undo') actions.undo?.();
      if (action === 'redo') actions.redo?.();
      if (action === 'save') actions.saveDocument?.();
      if (action === 'load') actions.openDocument?.();
      if (action === 'save-server') actions.saveServer?.();
      if (action === 'open-server') actions.openServer?.();
      if (action === 'export') actions.exportJson?.();
      if (action === 'shortcuts') actions.openShortcuts?.();
      if (action === 'import') {
        mountNode.querySelector('[data-import-input]')?.click();
      }
    };

    const handleChange = (event) => {
      const templatePicker = event.target.closest('[data-template-picker]');
      if (templatePicker) {
        if (templatePicker.value) {
          actions.applyTemplate?.(templatePicker.value);
        }
        return;
      }

      const importInput = event.target.closest('[data-import-input]');
      if (importInput?.files?.[0]) {
        actions.importJson?.(importInput.files[0]);
        importInput.value = '';
      }
    };

    mountNode.addEventListener('click', handleClick);
    mountNode.addEventListener('change', handleChange);
    cleanup.push(() => mountNode.removeEventListener('click', handleClick));
    cleanup.push(() => mountNode.removeEventListener('change', handleChange));
    cleanup.push(store.subscribe(render));

    return {
      destroy() {
        cleanup.forEach((fn) => fn());
        cleanup = [];
      },
    };
  }

  Planner.createPlannerToolbar = createPlannerToolbar;
})();
