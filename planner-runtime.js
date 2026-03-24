/*
 * OpenClaw Visual Planner
 * planner-runtime.js
 *
 * Runtime mode is UI-only for Phase 1. The module provides status metadata,
 * canned scenarios, and the bottom tray that surfaces validation + runtime.
 */

(() => {
  const Planner = window.OpenClawPlanner = window.OpenClawPlanner || {};

  const runtimeStatuses = [
    { id: 'idle', label: 'Idle', tone: 'neutral', color: '#6a6a6a' },
    { id: 'queued', label: 'Queued', tone: 'info', color: '#60cdff' },
    { id: 'running', label: 'Running', tone: 'info', color: '#22d3ee' },
    { id: 'waiting', label: 'Waiting', tone: 'warning', color: '#facc15' },
    { id: 'blocked', label: 'Blocked', tone: 'warning', color: '#f97316' },
    { id: 'failed', label: 'Failed', tone: 'danger', color: '#fb7185' },
    { id: 'completed', label: 'Completed', tone: 'success', color: '#4ade80' },
    { id: 'skipped', label: 'Skipped', tone: 'neutral', color: '#94a3b8' },
  ];

  const runtimeStatusMap = new Map(runtimeStatuses.map((status) => [status.id, status]));

  const runtimeScenarios = [
    { id: 'demo-run', label: 'Demo Run', description: 'Highlight a healthy in-progress path.' },
    { id: 'approval-blocked', label: 'Approval Blocked', description: 'Stop the flow at the approval gate.' },
    { id: 'failure-path', label: 'Failure Path', description: 'Simulate a failed downstream step.' },
  ];

  const getRuntimeStatus = (statusId) => runtimeStatusMap.get(statusId || 'idle') || runtimeStatusMap.get('idle');

  const buildRuntimeScenario = (nodes, scenarioId) => {
    const statuses = {};
    const nodeIds = nodes.map((node) => node.id);

    if (!nodeIds.length) {
      return statuses;
    }

    if (scenarioId === 'demo-run') {
      nodeIds.forEach((nodeId, index) => {
        statuses[nodeId] = index === 0
          ? 'completed'
          : index === 1
            ? 'running'
            : index === 2
              ? 'queued'
              : 'idle';
      });
      return statuses;
    }

    if (scenarioId === 'approval-blocked') {
      nodes.forEach((node, index) => {
        if (node.type === 'approval') {
          statuses[node.id] = 'waiting';
          return;
        }

        statuses[node.id] = index < 2 ? 'completed' : 'queued';
      });
      return statuses;
    }

    if (scenarioId === 'failure-path') {
      nodeIds.forEach((nodeId, index) => {
        statuses[nodeId] = index < 2 ? 'completed' : index === 2 ? 'failed' : 'skipped';
      });
      return statuses;
    }

    return statuses;
  };

  const applyRuntimeScenario = (store, scenarioId) => {
    const state = store.getState();
    const statuses = buildRuntimeScenario(state.document.graph.nodes, scenarioId);
    store.actions.setRuntimeScenario(scenarioId, statuses);
    return statuses;
  };

  const buildValidationTab = (state) => {
    const issues = state.validation.issues || [];

    if (!issues.length) {
      return `
        <div class="planner-tray__empty">
          <div class="planner-tray__empty-title">No validation issues</div>
          <div class="planner-tray__empty-copy">Run validation again after structural edits to keep the graph execution-ready.</div>
        </div>
      `;
    }

    return `
      <div class="planner-tray__list">
        ${issues.map((issue) => `
          <button class="planner-tray__issue" type="button" data-focus-entity="${Planner.escapeHtml(issue.entityId)}" data-entity-type="${Planner.escapeHtml(issue.entityType)}">
            <span class="planner-tray__issue-severity is-${Planner.escapeHtml(issue.severity)}">${Planner.escapeHtml(issue.severity)}</span>
            <span class="planner-tray__issue-content">
              <span class="planner-tray__issue-message">${Planner.escapeHtml(issue.message)}</span>
              ${issue.hint ? `<span class="planner-tray__issue-hint">${Planner.escapeHtml(issue.hint)}</span>` : ''}
            </span>
          </button>
        `).join('')}
      </div>
    `;
  };

  const buildRuntimeTab = (state) => {
    const statuses = state.runtime.statuses || {};
    const nodes = state.document.graph.nodes || [];

    return `
      <div class="planner-runtime">
        <div class="planner-runtime__toolbar">
          ${runtimeScenarios.map((scenario) => `
            <button class="planner-chip-button" type="button" data-runtime-scenario="${scenario.id}">${scenario.label}</button>
          `).join('')}
          <button class="planner-chip-button" type="button" data-runtime-clear="true">Clear Overlay</button>
        </div>
        <div class="planner-runtime__legend">
          ${runtimeStatuses.filter((status) => status.id !== 'idle').map((status) => `
            <span class="planner-runtime__legend-item">
              <span class="planner-runtime__legend-dot" style="background:${status.color}"></span>
              <span>${status.label}</span>
            </span>
          `).join('')}
        </div>
        <div class="planner-runtime__rows">
          ${nodes.length ? nodes.map((node) => {
            const status = statuses[node.id] || 'idle';
            return `
              <div class="planner-runtime__row">
                <button type="button" class="planner-runtime__focus" data-focus-entity="${Planner.escapeHtml(node.id)}" data-entity-type="node">
                  <span class="planner-runtime__focus-title">${Planner.escapeHtml(Planner.truncateText(node.data?.title || 'Untitled node', 28))}</span>
                  <span class="planner-runtime__focus-meta">${Planner.escapeHtml(Planner.getPlannerNodeType(node.type).label)}</span>
                </button>
                <select class="planner-select planner-runtime__select" data-runtime-node="${Planner.escapeHtml(node.id)}">
                  ${runtimeStatuses.map((option) => `<option value="${option.id}"${status === option.id ? ' selected' : ''}>${option.label}</option>`).join('')}
                </select>
              </div>
            `;
          }).join('') : '<div class="planner-tray__empty"><div class="planner-tray__empty-title">No nodes yet</div><div class="planner-tray__empty-copy">Runtime overlays appear after the graph has nodes.</div></div>'}
        </div>
      </div>
    `;
  };

  function createPlannerTray({ mountNode, store, onFocusEntity, notify }) {
    let teardown = [];

    const render = () => {
      const state = store.getState();
      const issues = state.validation.issues || [];
      const activeTab = state.ui.trayTab || 'validation';

      mountNode.innerHTML = `
        <div class="planner-tray__header">
          <div class="planner-tray__tabs">
            <button class="planner-tray__tab ${activeTab === 'validation' ? 'is-active' : ''}" type="button" data-tray-tab="validation">
              Validation
              <span class="planner-tray__count">${issues.length}</span>
            </button>
            <button class="planner-tray__tab ${activeTab === 'runtime' ? 'is-active' : ''}" type="button" data-tray-tab="runtime">
              Runtime
            </button>
          </div>
          <div class="planner-tray__meta">
            ${state.validation.lastRunAt ? `Last checked ${new Date(state.validation.lastRunAt).toLocaleTimeString()}` : 'Validation has not run yet.'}
          </div>
        </div>
        <div class="planner-tray__body">
          ${activeTab === 'runtime' ? buildRuntimeTab(state) : buildValidationTab(state)}
        </div>
      `;
    };

    const handleClick = (event) => {
      const tabButton = event.target.closest('[data-tray-tab]');
      if (tabButton) {
        store.actions.setTrayTab(tabButton.dataset.trayTab);
        return;
      }

      const scenarioButton = event.target.closest('[data-runtime-scenario]');
      if (scenarioButton) {
        applyRuntimeScenario(store, scenarioButton.dataset.runtimeScenario);
        notify?.(`Applied “${scenarioButton.textContent.trim()}” overlay.`, 'success');
        return;
      }

      const clearButton = event.target.closest('[data-runtime-clear]');
      if (clearButton) {
        store.actions.clearRuntime();
        notify?.('Cleared runtime overlays.', 'info');
        return;
      }

      const focusButton = event.target.closest('[data-focus-entity]');
      if (focusButton) {
        onFocusEntity?.({
          type: focusButton.dataset.entityType,
          id: focusButton.dataset.focusEntity,
        });
      }
    };

    const handleChange = (event) => {
      const runtimeSelect = event.target.closest('[data-runtime-node]');
      if (!runtimeSelect) {
        return;
      }

      store.actions.setNodeRuntimeStatus(runtimeSelect.dataset.runtimeNode, runtimeSelect.value);
    };

    mountNode.addEventListener('click', handleClick);
    mountNode.addEventListener('change', handleChange);
    teardown.push(() => mountNode.removeEventListener('click', handleClick));
    teardown.push(() => mountNode.removeEventListener('change', handleChange));
    teardown.push(store.subscribe(render));

    return {
      destroy() {
        teardown.forEach((fn) => fn());
        teardown = [];
      },
    };
  }

  Planner.PLANNER_RUNTIME_STATUSES = runtimeStatuses;
  Planner.PLANNER_RUNTIME_SCENARIOS = runtimeScenarios;
  Planner.getPlannerRuntimeStatus = getRuntimeStatus;
  Planner.buildPlannerRuntimeScenario = buildRuntimeScenario;
  Planner.applyPlannerRuntimeScenario = applyRuntimeScenario;
  Planner.createPlannerTray = createPlannerTray;
})();
