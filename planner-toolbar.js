/*
 * OpenClaw Visual Planner
 * planner-toolbar.js
 *
 * Compact hybrid toolbar: mini-brand + icon rows + overflow menu.
 * Keeps core actions visible, moves infrequent tools into a ⋯ dropdown.
 */

(() => {
  const Planner = window.OpenClawPlanner = window.OpenClawPlanner || {};

  function createPlannerToolbar({ mountNode, store, actions = {} }) {
    let cleanup = [];
    let overflowOpen = false;

    const closeOverflow = () => {
      overflowOpen = false;
      const menu = mountNode.querySelector('.planner-toolbar__overflow-menu');
      if (menu) menu.classList.remove('is-open');
    };

    const toggleOverflow = () => {
      overflowOpen = !overflowOpen;
      const menu = mountNode.querySelector('.planner-toolbar__overflow-menu');
      if (menu) menu.classList.toggle('is-open', overflowOpen);
    };

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
        ? 'Server storage'
        : 'Local storage';
      const savedLabel = state.meta.lastSavedAt
        ? `Saved ${new Date(state.meta.lastSavedAt).toLocaleTimeString()}`
        : 'Unsaved';

      mountNode.innerHTML = `
        <div class="planner-toolbar planner-toolbar--compact">
          <div class="planner-toolbar__brand">
            <div class="planner-toolbar__logo">OC</div>
            <div>
              <div class="planner-toolbar__title">Visual Planner</div>
            </div>
          </div>

          <div class="planner-toolbar__controls">
            <div class="planner-toolbar__group planner-toolbar__group--segmented">
              ${['sketch', 'workflow', 'runtime'].map((mode) => `
                <button class="planner-segment ${state.ui.mode === mode ? 'is-active' : ''}" type="button" data-mode="${mode}">${mode}</button>
              `).join('')}
            </div>

            <div class="planner-toolbar__group">
              <button class="planner-button planner-button--primary" type="button" data-action="validate">✓ Check</button>
              <button class="planner-button" type="button" data-action="fit">⊞ Fit</button>
              <button class="planner-button" type="button" data-action="tidy">⬡ Tidy</button>
            </div>

            <div class="planner-toolbar__group">
              <button class="planner-button" type="button" data-action="toggle-grid" title="Toggle grid">${state.preferences.showGrid ? '▣' : '▢'}</button>
              <button class="planner-button" type="button" data-action="toggle-snap" title="Toggle snap">${state.preferences.snapToGrid ? '◉' : '○'}</button>
              <button class="planner-button" type="button" data-action="toggle-minimap" title="Toggle minimap">⊞</button>
              <button class="planner-button" type="button" data-action="toggle-inspector" title="Toggle inspector">⫙</button>
            </div>

            <div class="planner-toolbar__group">
              <button class="planner-button" type="button" data-action="undo"${canUndo ? '' : ' disabled'} title="Undo (Ctrl+Z)">↩</button>
              <button class="planner-button" type="button" data-action="redo"${canRedo ? '' : ' disabled'} title="Redo (Ctrl+Y)">↪</button>
            </div>

            <div class="planner-toolbar__group">
              <button class="planner-button" type="button" data-action="save" title="Save (Ctrl+S)">💾 Save</button>
              <button class="planner-button" type="button" data-action="export" title="Export JSON">⤓ Export</button>
            </div>

            <div class="planner-toolbar__overflow-wrap">
              <button class="planner-button" type="button" data-action="toggle-overflow" title="More actions">⋯</button>
              <div class="planner-toolbar__overflow-menu${overflowOpen ? ' is-open' : ''}">
                <label class="planner-toolbar__label" style="padding:4px 10px 2px;font-size:0.68rem;">Template</label>
                <select class="planner-select" data-template-picker="true" style="margin:0 4px 4px;font-size:0.8rem;">
                  <option value="">Choose starter…</option>
                  ${templates.map((t) => `<option value="${t.id}"${state.document.metadata.templateId === t.id ? ' selected' : ''}>${Planner.escapeHtml(t.label)}</option>`).join('')}
                </select>
                <div class="planner-overflow-divider"></div>
                <button class="planner-overflow-item" type="button" data-action="simulate">▶ Simulate</button>
                <button class="planner-overflow-item" type="button" data-action="export-workflow">⤓ Export Workflow</button>
                <button class="planner-overflow-item" type="button" data-action="new">⊘ New Blank</button>
                <div class="planner-overflow-divider"></div>
                <button class="planner-overflow-item" type="button" data-action="align-left"${canArrange ? '' : ' disabled'}>Align Left${canArrange ? '' : ' (need 2+)'}</button>
                <button class="planner-overflow-item" type="button" data-action="align-top"${canArrange ? '' : ' disabled'}>Align Top${canArrange ? '' : ' (need 2+)'}</button>
                <button class="planner-overflow-item" type="button" data-action="distribute-x"${canDistribute ? '' : ' disabled'}>Distribute X${canDistribute ? '' : ' (need 3+)'}</button>
                <button class="planner-overflow-item" type="button" data-action="distribute-y"${canDistribute ? '' : ' disabled'}>Distribute Y${canDistribute ? '' : ' (need 3+)'}</button>
                <div class="planner-overflow-divider"></div>
                <button class="planner-overflow-item" type="button" data-action="load">📂 Load</button>
                <button class="planner-overflow-item" type="button" data-action="save-server">☁ Save to Server</button>
                <button class="planner-overflow-item" type="button" data-action="open-server">☁ Open from Server</button>
                <button class="planner-overflow-item" type="button" data-action="import">📥 Import</button>
                <div class="planner-overflow-divider"></div>
                <button class="planner-overflow-item" type="button" data-action="shortcuts">⌨ Shortcuts</button>
              </div>
            </div>
          </div>

          <div class="planner-toolbar__status">
            <span class="planner-chip ${issues.length ? 'is-warning' : 'is-success'}">${issues.length} issue${issues.length === 1 ? '' : 's'}</span>
            <span class="planner-chip">${state.document.graph.nodes.length} nodes</span>
            <span class="planner-chip">${state.document.graph.edges.length} edges</span>
            ${selectionCount ? `<span class="planner-chip is-info">${selectionCount} sel</span>` : ''}
            <span class="planner-chip">${zoom}%</span>
            <span class="planner-chip ${state.meta.dirty ? 'is-warning' : ''}">${state.meta.dirty ? '● modified' : savedLabel}</span>
            <span class="planner-chip ${backendTone}">${backendLabel}</span>
            <span class="planner-chip">${storageLabel}</span>
            ${meta.reason ? `<span class="planner-chip">${Planner.escapeHtml(meta.reason)}</span>` : ''}
          </div>
        </div>
      `;

      const importInput = document.createElement('input');
      importInput.type = 'file';
      importInput.accept = 'application/json,.json';
      importInput.hidden = true;
      importInput.dataset.importInput = 'true';
      mountNode.appendChild(importInput);
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

      if (action === 'toggle-overflow') {
        event.stopPropagation();
        toggleOverflow();
        return;
      }

      closeOverflow();

      if (action === 'validate') actions.validate?.();
      if (action === 'simulate') actions.simulate?.();
      if (action === 'export-workflow') actions.exportWorkflow?.();
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
      if (action === 'toggle-inspector') actions.toggleInspector?.();
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

    const handleDocClick = (event) => {
      if (overflowOpen && !mountNode.contains(event.target)) {
        closeOverflow();
      }
    };

    mountNode.addEventListener('click', handleClick);
    mountNode.addEventListener('change', handleChange);
    document.addEventListener('click', handleDocClick);
    cleanup.push(() => mountNode.removeEventListener('click', handleClick));
    cleanup.push(() => mountNode.removeEventListener('change', handleChange));
    cleanup.push(() => document.removeEventListener('click', handleDocClick));
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
