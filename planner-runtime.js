/*
 * OpenClaw Visual Planner
 * planner-runtime.js
 *
 * Runtime mode now handles both manual overlay scenarios and workflow-run style
 * status payloads, while the bottom tray surfaces validation, simulation, and
 * runtime summaries in one place.
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

  const workflowStatusMap = {
    queued: 'queued',
    pending: 'queued',
    scheduled: 'queued',
    running: 'running',
    in_progress: 'running',
    inprogress: 'running',
    active: 'running',
    waiting: 'waiting',
    waiting_approval: 'waiting',
    waitingapproval: 'waiting',
    awaiting_approval: 'waiting',
    blocked: 'blocked',
    stalled: 'blocked',
    failed: 'failed',
    error: 'failed',
    completed: 'completed',
    success: 'completed',
    succeeded: 'completed',
    approved: 'completed',
    skipped: 'skipped',
    cancelled: 'skipped',
    canceled: 'skipped',
  };

  const getRuntimeStatus = (statusId) => runtimeStatusMap.get(statusId || 'idle') || runtimeStatusMap.get('idle');

  const normalizeRunStatus = (value) => workflowStatusMap[String(value || '').trim().toLowerCase()] || 'idle';

  const collectNodeRunKeys = (node) => {
    const keys = new Set([node.id, Planner.slugify(node.data?.title || node.type)]);

    if (node.type === 'workflow-step' && node.data?.stepName) {
      keys.add(Planner.slugify(node.data.stepName));
    }
    if (node.type === 'agent' && node.data?.agentName) {
      keys.add(Planner.slugify(node.data.agentName));
    }
    if (node.type === 'tool' && node.data?.toolIdentifier) {
      keys.add(Planner.slugify(node.data.toolIdentifier));
    }
    if (node.type === 'approval' && node.data?.approverRole) {
      keys.add(Planner.slugify(node.data.approverRole));
    }
    if (node.type === 'runbook' && node.data?.runbookId) {
      keys.add(Planner.slugify(node.data.runbookId));
    }
    if (node.type === 'external-api' && node.data?.endpointName) {
      keys.add(Planner.slugify(node.data.endpointName));
    }

    return Array.from(keys).filter(Boolean);
  };

  const resolveWorkflowNodeId = (lookup, step = {}) => {
    const rawCandidates = [
      step.planner_node_id,
      step.plannerNodeId,
      step.node_id,
      step.nodeId,
    ].filter(Boolean).map((value) => String(value));

    for (const candidate of rawCandidates) {
      if (lookup.has(candidate)) {
        return lookup.get(candidate);
      }
    }

    const labelCandidates = [
      step.name,
      step.step_name,
      step.stepName,
      step.display_name,
      step.displayName,
      step.title,
    ].filter(Boolean).map((value) => Planner.slugify(value));

    for (const candidate of labelCandidates) {
      if (lookup.has(candidate)) {
        return lookup.get(candidate);
      }
    }

    return '';
  };

  const buildWorkflowRunStatusMap = (nodes = [], payload = {}) => {
    const statuses = {};
    const lookup = new Map();
    const run = payload.run || payload || {};
    const steps = Array.isArray(payload.steps)
      ? payload.steps
      : Array.isArray(run.steps)
        ? run.steps
        : [];

    nodes.forEach((node) => {
      collectNodeRunKeys(node).forEach((key) => {
        if (!lookup.has(key)) {
          lookup.set(key, node.id);
        }
      });
    });

    steps.forEach((step) => {
      const nodeId = resolveWorkflowNodeId(lookup, step);
      if (!nodeId) {
        return;
      }

      statuses[nodeId] = normalizeRunStatus(step.status || step.state || 'idle');
    });

    if (run.current_step || run.currentStep) {
      const currentStepNodeId = resolveWorkflowNodeId(lookup, {
        name: run.current_step || run.currentStep,
      });

      if (currentStepNodeId) {
        statuses[currentStepNodeId] = normalizeRunStatus(run.status || 'running');
      }
    }

    return statuses;
  };

  const applyWorkflowRunStatus = (store, payload = {}) => {
    const nodes = store.getState().document.graph.nodes || [];
    const statuses = buildWorkflowRunStatusMap(nodes, payload);
    store.actions.setWorkflowRunStatus(payload, statuses);
    return statuses;
  };

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

  const buildSimulationList = (items = [], type = 'node') => `
    <div class="planner-tray__list">
      ${items.map((item) => `
        <button class="planner-tray__issue" type="button" data-focus-entity="${Planner.escapeHtml(item.nodeId || item.id || '')}" data-entity-type="${type}">
          <span class="planner-tray__issue-severity is-info">${Planner.escapeHtml(item.type || 'info')}</span>
          <span class="planner-tray__issue-content">
            <span class="planner-tray__issue-message">${Planner.escapeHtml(item.title || item.stepName || 'Planner item')}</span>
            <span class="planner-tray__issue-hint">${Planner.escapeHtml(item.detail || item.dependsOn?.join(', ') || '')}</span>
          </span>
        </button>
      `).join('')}
    </div>
  `;

  const buildSimulationTab = (state) => {
    const report = state.simulation.report;

    if (!report) {
      return `
        <div class="planner-tray__empty">
          <div class="planner-tray__empty-title">No simulation report yet</div>
          <div class="planner-tray__empty-copy">Run “Simulate” from the toolbar to analyze execution order, risk points, and dead ends.</div>
        </div>
      `;
    }

    return `
      <div class="planner-simulation">
        <div class="planner-simulation__summary">
          <div class="planner-chip-stack">
            <span class="planner-chip">${report.executionOrder?.length || 0} steps</span>
            <span class="planner-chip ${report.deadEnds?.length ? 'is-warning' : 'is-success'}">${report.deadEnds?.length || 0} dead ends</span>
            <span class="planner-chip">${report.approvalGateCount || 0} approvals</span>
            <span class="planner-chip ${report.riskPoints?.length ? 'is-warning' : 'is-success'}">${report.riskPoints?.length || 0} risks</span>
            <span class="planner-chip ${report.hasCycles ? 'is-warning' : 'is-success'}">${report.cycleCount || 0} cycles</span>
            <button class="planner-chip-button" type="button" data-simulation-clear="true">Clear Report</button>
          </div>
        </div>
        <div class="planner-simulation__grid">
          <section class="planner-simulation__section">
            <div class="planner-section-title">Execution Order</div>
            ${report.executionOrder?.length ? buildSimulationList(report.executionOrder.map((item) => ({
              ...item,
              type: `#${item.index}`,
              detail: item.dependsOn?.length ? `Depends on ${item.dependsOn.join(', ')}` : `Type · ${item.type}`,
            }))) : '<div class="planner-empty-copy">No executable steps were found.</div>'}
          </section>
          <section class="planner-simulation__section">
            <div class="planner-section-title">Dead Ends</div>
            ${report.deadEnds?.length ? buildSimulationList(report.deadEnds) : '<div class="planner-empty-copy">No dead ends detected.</div>'}
          </section>
          <section class="planner-simulation__section">
            <div class="planner-section-title">Risk Points</div>
            ${report.riskPoints?.length ? buildSimulationList(report.riskPoints) : '<div class="planner-empty-copy">No high-risk points were flagged.</div>'}
          </section>
        </div>
      </div>
    `;
  };

  const buildRuntimeTab = (state) => {
    const statuses = state.runtime.statuses || {};
    const nodes = state.document.graph.nodes || [];
    const run = state.runtime.runStatus?.run || state.runtime.runStatus || null;
    const runStatus = getRuntimeStatus(normalizeRunStatus(run?.status));
    const currentStep = run?.current_step || run?.currentStep || '';

    return `
      <div class="planner-runtime">
        ${run ? `
          <div class="planner-runtime__summary">
            <div class="planner-chip-stack">
              ${run.id ? `<span class="planner-chip">Run ${Planner.escapeHtml(String(run.id).slice(0, 8))}</span>` : ''}
              <span class="planner-chip ${runStatus.tone === 'success' ? 'is-success' : runStatus.tone === 'warning' ? 'is-warning' : 'is-info'}">${Planner.escapeHtml(runStatus.label)}</span>
              ${currentStep ? `<span class="planner-chip">Current step · ${Planner.escapeHtml(currentStep)}</span>` : ''}
            </div>
          </div>
        ` : ''}
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
    let trayCollapsed = false;

    const render = () => {
      const state = store.getState();
      const issues = state.validation.issues || [];
      const activeTab = state.ui.trayTab || 'validation';
      const metaText = activeTab === 'simulation'
        ? (state.simulation.lastRunAt ? `Last simulated ${new Date(state.simulation.lastRunAt).toLocaleTimeString()}` : 'Simulation has not run yet.')
        : activeTab === 'runtime'
          ? (state.runtime.runStatus ? 'Runtime overlay synced from the latest workflow payload.' : 'Runtime overlay is editable locally.')
          : (state.validation.lastRunAt ? `Last checked ${new Date(state.validation.lastRunAt).toLocaleTimeString()}` : 'Validation has not run yet.');

      mountNode.classList.toggle('is-collapsed', trayCollapsed);

      mountNode.innerHTML = `
        <div class="planner-tray__header">
          <div class="planner-tray__tabs">
            <button class="planner-tray__tab ${activeTab === 'validation' ? 'is-active' : ''}" type="button" data-tray-tab="validation">
              Validation
              <span class="planner-tray__count">${issues.length}</span>
            </button>
            <button class="planner-tray__tab ${activeTab === 'simulation' ? 'is-active' : ''}" type="button" data-tray-tab="simulation">
              Simulation
              <span class="planner-tray__count">${state.simulation.report ? (state.simulation.report.riskPoints?.length || 0) + (state.simulation.report.deadEnds?.length || 0) : 0}</span>
            </button>
            <button class="planner-tray__tab ${activeTab === 'runtime' ? 'is-active' : ''}" type="button" data-tray-tab="runtime">
              Runtime
            </button>
          </div>
          <div class="planner-tray__header-actions">
            <div class="planner-tray__meta">
              ${metaText}
            </div>
            <button type="button" class="planner-button planner-button--ghost" data-tray-toggle="true">${trayCollapsed ? 'Open Tray' : 'Close Tray'}</button>
          </div>
        </div>
        <div class="planner-tray__body">
          ${activeTab === 'runtime'
            ? buildRuntimeTab(state)
            : activeTab === 'simulation'
              ? buildSimulationTab(state)
              : buildValidationTab(state)}
        </div>
      `;
    };

    const handleClick = (event) => {
      const toggleButton = event.target.closest('[data-tray-toggle]');
      if (toggleButton) {
        trayCollapsed = !trayCollapsed;
        render();
        return;
      }

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

      const clearSimulationButton = event.target.closest('[data-simulation-clear]');
      if (clearSimulationButton) {
        store.actions.clearSimulationReport();
        notify?.('Cleared the simulation report.', 'info');
        return;
      }

      const focusButton = event.target.closest('[data-focus-entity]');
      if (focusButton && focusButton.dataset.focusEntity) {
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
  Planner.buildPlannerWorkflowRunStatusMap = buildWorkflowRunStatusMap;
  Planner.applyPlannerWorkflowRunStatus = applyWorkflowRunStatus;
  Planner.createPlannerTray = createPlannerTray;
})();
