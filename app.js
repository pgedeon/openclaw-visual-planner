/*
 * OpenClaw Visual Planner
 * app.js
 *
 * Bootstrap the standalone planner, wire all modules together, and keep local
 * drafts + validation fresh while the user edits the graph. The bootstrap is
 * written so the same planner can later mount inside a native WebOS view.
 */

(() => {
  const Planner = window.OpenClawPlanner = window.OpenClawPlanner || {};

  const SHORTCUT_GROUPS = [
    {
      title: 'Editing',
      items: [
        { keys: 'Ctrl/Cmd + C', description: 'Copy selected nodes and connecting subgraph edges' },
        { keys: 'Ctrl/Cmd + V', description: 'Paste the last copied selection with an offset' },
        { keys: 'Ctrl/Cmd + D', description: 'Duplicate the current node selection' },
        { keys: 'Delete / Backspace', description: 'Remove the current selection' },
      ],
    },
    {
      title: 'Canvas',
      items: [
        { keys: 'Drag background', description: 'Marquee-select multiple nodes' },
        { keys: 'Shift + Click', description: 'Add or remove a node from the selection' },
        { keys: 'Space + Drag', description: 'Pan around the canvas' },
        { keys: 'Mouse wheel', description: 'Zoom around the pointer position' },
      ],
    },
    {
      title: 'Workflow',
      items: [
        { keys: 'Ctrl/Cmd + S', description: 'Save using the preferred storage backend' },
        { keys: 'Ctrl/Cmd + Z', description: 'Undo the last structural change' },
        { keys: 'Ctrl/Cmd + Shift + Z', description: 'Redo after an undo' },
        { keys: '?', description: 'Open this keyboard shortcut sheet' },
      ],
    },
  ];

  const isEditingTarget = (target) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable;

  const queryWithin = (rootNode, selector) => rootNode?.querySelector?.(selector) || document.querySelector(selector);

  const readStateStoreValue = (stateStore, path) => {
    if (!stateStore || typeof stateStore.getState !== 'function' || !path) {
      return null;
    }

    try {
      const value = stateStore.getState(path);
      return value === undefined ? null : value;
    } catch (error) {
      return null;
    }
  };

  const subscribeStateStoreValue = (stateStore, path, callback) => {
    if (!stateStore || typeof stateStore.subscribe !== 'function' || !path || typeof callback !== 'function') {
      return () => {};
    }

    try {
      return stateStore.subscribe(path, callback);
    } catch (error) {
      return () => {};
    }
  };

  const createNotifier = (host) => {
    let activeToasts = [];

    return (message, tone = 'info') => {
      if (!host) {
        return;
      }

      const toast = document.createElement('div');
      toast.className = `planner-toast is-${tone}`;
      toast.textContent = message;
      host.appendChild(toast);
      activeToasts.push(toast);

      window.requestAnimationFrame(() => toast.classList.add('is-visible'));

      window.setTimeout(() => {
        toast.classList.remove('is-visible');
        window.setTimeout(() => {
          toast.remove();
          activeToasts = activeToasts.filter((item) => item !== toast);
        }, 220);
      }, 3000);
    };
  };

  const renderShortcutsModal = () => `
    <div class="planner-modal__dialog planner-modal__dialog--wide" role="dialog" aria-modal="true" aria-labelledby="planner-shortcuts-title">
      <div class="planner-modal__header">
        <div>
          <div class="planner-panel__eyebrow">Keyboard Help</div>
          <h2 id="planner-shortcuts-title" class="planner-panel__title">Planner Shortcuts</h2>
        </div>
        <button type="button" class="planner-button planner-button--ghost" data-modal-close="true">Close</button>
      </div>
      <div class="planner-shortcuts-grid">
        ${SHORTCUT_GROUPS.map((group) => `
          <section class="planner-shortcuts-card">
            <div class="planner-section-title">${Planner.escapeHtml(group.title)}</div>
            <div class="planner-shortcuts-list">
              ${group.items.map((item) => `
                <div class="planner-shortcuts-item">
                  <span class="planner-shortcuts-item__keys">${Planner.escapeHtml(item.keys)}</span>
                  <span class="planner-shortcuts-item__copy">${Planner.escapeHtml(item.description)}</span>
                </div>
              `).join('')}
            </div>
          </section>
        `).join('')}
      </div>
    </div>
  `;

  const renderServerPlansModal = (modalState = {}) => {
    const plans = modalState.plans || [];

    return `
      <div class="planner-modal__dialog planner-modal__dialog--wide" role="dialog" aria-modal="true" aria-labelledby="planner-server-title">
        <div class="planner-modal__header">
          <div>
            <div class="planner-panel__eyebrow">Server Storage</div>
            <h2 id="planner-server-title" class="planner-panel__title">Open from Server</h2>
          </div>
          <button type="button" class="planner-button planner-button--ghost" data-modal-close="true">Close</button>
        </div>
        ${modalState.loading ? `
          <div class="planner-tray__empty">
            <div class="planner-tray__empty-title">Loading plans…</div>
            <div class="planner-tray__empty-copy">Fetching the latest plans from the local planner server.</div>
          </div>
        ` : modalState.error ? `
          <div class="planner-tray__empty">
            <div class="planner-tray__empty-title">Unable to reach the server</div>
            <div class="planner-tray__empty-copy">${Planner.escapeHtml(modalState.error)}</div>
          </div>
        ` : plans.length ? `
          <div class="planner-server-list">
            ${plans.map((plan) => `
              <button type="button" class="planner-server-card" data-open-server-plan="${Planner.escapeHtml(plan.id)}">
                <span class="planner-server-card__title">${Planner.escapeHtml(plan.title || 'Untitled Visual Plan')}</span>
                <span class="planner-server-card__meta">
                  ${Planner.escapeHtml(plan.description || 'No description yet.')}
                </span>
                <span class="planner-server-card__chips">
                  <span class="planner-chip">${plan.nodeCount} nodes</span>
                  <span class="planner-chip">${plan.edgeCount} edges</span>
                  <span class="planner-chip ${plan.validation?.issueCount ? 'is-warning' : 'is-success'}">${plan.validation?.issueCount || 0} issue${(plan.validation?.issueCount || 0) === 1 ? '' : 's'}</span>
                  <span class="planner-chip">Updated ${Planner.escapeHtml(new Date(plan.updatedAt).toLocaleString())}</span>
                </span>
              </button>
            `).join('')}
          </div>
        ` : `
          <div class="planner-tray__empty">
            <div class="planner-tray__empty-title">No server plans yet</div>
            <div class="planner-tray__empty-copy">Use “Save to Server” to create your first persisted plan.</div>
          </div>
        `}
      </div>
    `;
  };

  const renderNotepadModal = (modalState = {}) => {
    const title = modalState.title || 'Workflow Step Payload';
    const stepName = modalState.stepName || '';
    const stepType = modalState.stepType || '';
    const payload = modalState.payload || '';

    return `
      <div class="planner-modal__dialog planner-modal__dialog--wide planner-notepad-modal" role="dialog" aria-modal="true" aria-labelledby="planner-notepad-title">
        <div class="planner-modal__header">
          <div>
            <div class="planner-panel__eyebrow">Notepad Handoff</div>
            <h2 id="planner-notepad-title" class="planner-panel__title">${Planner.escapeHtml(title)}</h2>
          </div>
          <button type="button" class="planner-button planner-button--ghost" data-modal-close="true">Close</button>
        </div>
        <div class="planner-chip-stack">
          ${stepName ? `<span class="planner-chip">${Planner.escapeHtml(stepName)}</span>` : ''}
          ${stepType ? `<span class="planner-chip">${Planner.escapeHtml(stepType)}</span>` : ''}
          <span class="planner-chip">Planner step payload</span>
        </div>
        <label class="planner-field planner-notepad-modal__field" for="planner-notepad-editor">
          <span class="planner-field__row">
            <span class="planner-field__label">Prompt / Payload</span>
            <span class="planner-field__indicator is-info">Edit</span>
          </span>
          <textarea class="planner-textarea planner-notepad-modal__editor" id="planner-notepad-editor" data-notepad-editor="true" spellcheck="false" placeholder="Draft execution notes, JSON payloads, prompts, or runbook handoff details...">${Planner.escapeHtml(payload)}</textarea>
          <span class="planner-field__hint">Save to write the latest payload back to this workflow step.</span>
        </label>
        <div class="planner-notepad-modal__actions">
          <button type="button" class="planner-button planner-button--ghost" data-modal-close="true">Cancel</button>
          <button type="button" class="planner-button planner-button--primary" data-save-notepad="true">Save Payload</button>
        </div>
      </div>
    `;
  };

  const buildSelectionFragment = (store) => {
    const state = store.getState();
    const nodeIds = state.selection.type === 'node' ? state.selection.nodeIds.slice() : [];
    if (!nodeIds.length) {
      return null;
    }

    const nodeSet = new Set(nodeIds);
    return {
      nodes: state.document.graph.nodes
        .filter((node) => nodeSet.has(node.id))
        .map((node) => Planner.clonePlannerValue(node)),
      edges: state.document.graph.edges
        .filter((edge) => nodeSet.has(edge.sourceNodeId) && nodeSet.has(edge.targetNodeId))
        .map((edge) => Planner.clonePlannerValue(edge)),
    };
  };

  const cloneFragmentWithOffset = (fragment, offsetIndex = 1) => {
    const offset = 36 * Math.max(1, offsetIndex);
    const nodeIdMap = new Map();
    const now = new Date().toISOString();

    const nodes = (fragment?.nodes || []).map((node) => {
      const clonedNode = Planner.clonePlannerValue(node);
      const nextId = Planner.createPlannerId('node');

      nodeIdMap.set(node.id, nextId);
      clonedNode.id = nextId;
      clonedNode.x = Number(node.x || 0) + offset;
      clonedNode.y = Number(node.y || 0) + offset;
      clonedNode.createdAt = now;
      clonedNode.updatedAt = now;
      return clonedNode;
    });

    const edges = (fragment?.edges || []).map((edge) => {
      const clonedEdge = Planner.clonePlannerValue(edge);
      clonedEdge.id = Planner.createPlannerId('edge');
      clonedEdge.sourceNodeId = nodeIdMap.get(edge.sourceNodeId) || edge.sourceNodeId;
      clonedEdge.targetNodeId = nodeIdMap.get(edge.targetNodeId) || edge.targetNodeId;
      clonedEdge.createdAt = now;
      clonedEdge.updatedAt = now;
      return clonedEdge;
    });

    return { nodes, edges };
  };

  const getSelectedNodes = (store) => {
    const state = store.getState();
    const selectedIds = new Set(state.selection.nodeIds || []);
    return state.document.graph.nodes.filter((node) => selectedIds.has(node.id));
  };

  function mountPlannerApp({ rootNode = document, store: providedStore = null, services = {} } = {}) {
    document.documentElement.dataset.theme = 'dark';

    const toolbarMount = queryWithin(rootNode, '#planner-toolbar');
    const paletteMount = queryWithin(rootNode, '#planner-palette');
    const canvasMount = queryWithin(rootNode, '#planner-canvas');
    const inspectorMount = queryWithin(rootNode, '#planner-inspector');
    const trayMount = queryWithin(rootNode, '#planner-tray');
    const toastHost = queryWithin(rootNode, '#planner-toast-host');
    const modalHost = queryWithin(rootNode, '#planner-modal-host');

    if (!toolbarMount || !paletteMount || !canvasMount || !inspectorMount || !trayMount) {
      throw new Error('Planner mounts are missing from the document.');
    }

    const notify = createNotifier(toastHost);
    const store = providedStore || Planner.createPlannerStore();
    const apiClient = services.apiClient || Planner.createPlannerApiClient?.({ baseUrl: services.apiBaseUrl || '' }) || null;
    const shellApi = services.api || apiClient?.getShellApi?.() || null;
    const shellStateStore = services.stateStore || apiClient?.getStateStore?.() || services.adapter?.stateStore || null;
    const shellSync = services.sync || apiClient?.getSync?.() || null;
    const shellAdapter = services.adapter || apiClient?.shell?.adapter || null;
    const navigateToView = services.navigateToView || services.navigateTo || shellAdapter?.navigateTo || null;
    let autosaveTimer = 0;
    let validationTimer = 0;
    let bootstrapPromise = Promise.resolve();
    let modalState = null;
    let clipboardFragment = store.getState().clipboard.fragment || null;
    let pasteCount = 0;
    let destroyed = false;
    let autosaveUnsubscribe = null;
    const shellCleanupFns = [];

    const navigateToShellView = (viewId, payload = {}, fallbackMessage = '') => {
      if (typeof navigateToView !== 'function') {
        if (fallbackMessage) {
          notify(fallbackMessage, 'info');
        }
        return false;
      }

      try {
        navigateToView(viewId, {
          source: 'visual-planner',
          requestedAt: new Date().toISOString(),
          ...payload,
        });
        return true;
      } catch (error) {
        notify(error.message || `Unable to open ${viewId}.`, 'error');
        return false;
      }
    };

    const getSelectedWorkflowRunId = () => readStateStoreValue(shellStateStore, 'selection.workflowRunId')
      || readStateStoreValue(shellStateStore, 'workflow.selectedRunId');

    const syncSelectedWorkflowRun = async (syncData = null) => {
      const runId = getSelectedWorkflowRunId();
      if (!runId) {
        return false;
      }

      const activeRuns = Array.isArray(syncData?.activeWorkflowRuns?.runs)
        ? syncData.activeWorkflowRuns.runs
        : Array.isArray(shellSync?.activeWorkflowRuns?.runs)
          ? shellSync.activeWorkflowRuns.runs
          : [];
      const activeRun = activeRuns.find((run) => String(run.id) === String(runId));

      if (activeRun) {
        Planner.applyPlannerWorkflowRunStatus?.(store, activeRun);
        return true;
      }

      if (typeof shellApi?.workflows?.get !== 'function') {
        return false;
      }

      try {
        const payload = await shellApi.workflows.get(runId);
        Planner.applyPlannerWorkflowRunStatus?.(store, payload);
        return true;
      } catch (error) {
        notify(error.message || 'Failed to sync the selected workflow run.', 'warning');
        return false;
      }
    };

    const openTaskNodeInShell = (node) => {
      const title = node?.data?.title || Planner.getPlannerNodeType(node?.type || 'task').label;
      navigateToShellView('tasks', {
        plannerNodeId: node?.id,
        taskId: node?.data?.taskId || null,
        title,
        query: title,
        assigneeAgent: node?.data?.assigneeAgent || '',
        priority: node?.data?.priority || '',
        status: node?.data?.status || '',
      }, 'Open in Tasks is available inside the WebOS shell.');
    };

    const openAgentNodeInShell = (node) => {
      const agentName = node?.data?.agentName || node?.data?.title || 'Selected agent';
      navigateToShellView('agents', {
        plannerNodeId: node?.id,
        agentId: node?.data?.agentId || null,
        agentName,
        role: node?.data?.role || '',
      }, 'Open Agent is available inside the WebOS shell.');
    };

    const openArtifactNodeInShell = (node) => {
      const filePath = String(node?.data?.filePath || '').trim();
      if (!filePath) {
        notify('Add a file path before opening this artifact.', 'warning');
        return;
      }

      const targetView = node?.data?.artifactType === 'url' || /^https?:\/\//i.test(filePath)
        ? 'artifacts'
        : 'explorer';

      navigateToShellView(targetView, {
        plannerNodeId: node?.id,
        path: filePath,
        filePath,
        uri: filePath,
        artifactType: node?.data?.artifactType || '',
      }, 'Open File is available inside the WebOS shell.');
    };

    const openWorkflowStepNotepad = (node) => {
      if (!node || node.type !== 'workflow-step') {
        return;
      }

      setModal({
        type: 'notepad-handoff',
        nodeId: node.id,
        title: node.data?.title || node.data?.stepName || 'Workflow Step Payload',
        stepName: node.data?.stepName || '',
        stepType: node.data?.stepType || '',
        payload: node.data?.promptPayload || '',
      });
    };

    const setModal = (nextModal) => {
      modalState = nextModal;

      if (!modalHost) {
        return;
      }

      if (!modalState) {
        modalHost.innerHTML = '';
        modalHost.hidden = true;
        return;
      }

      modalHost.hidden = false;
      modalHost.innerHTML = `
        <div class="planner-modal" data-modal-backdrop="true">
          ${modalState.type === 'shortcuts'
            ? renderShortcutsModal()
            : modalState.type === 'server-browser'
              ? renderServerPlansModal(modalState)
              : modalState.type === 'notepad-handoff'
                ? renderNotepadModal(modalState)
              : ''}
        </div>
      `;
    };

    const runValidation = ({ openTray = false, silent = false } = {}) => {
      const issues = Planner.validatePlannerState(store.getState());
      store.actions.setValidationIssues(issues, { openTray });

      if (!silent) {
        notify(
          issues.length
            ? `Validation finished with ${issues.length} issue${issues.length === 1 ? '' : 's'}.`
            : 'Validation passed with no issues.',
          issues.length ? 'warning' : 'success',
        );
      }

      return issues;
    };

    const saveLocal = ({ silent = false } = {}) => {
      Planner.savePlannerToLocalStorage(store.getState(), Planner.PLANNER_LOCAL_STORAGE_KEY);
      store.actions.markSaved();
      if (!silent) {
        notify('Saved local planner draft.', 'success');
      }
    };

    const syncBackendState = (patch = {}) => {
      store.actions.setBackendState({
        lastCheckedAt: new Date().toISOString(),
        ...patch,
      });
    };

    const loadLocalDraft = ({ silent = false } = {}) => {
      const saved = Planner.loadPlannerFromLocalStorage(Planner.PLANNER_LOCAL_STORAGE_KEY);
      if (!saved) {
        if (!silent) {
          notify('No local draft found yet.', 'warning');
        }
        return false;
      }

      if (!maybeConfirmReplace('replace the current graph with the saved local draft')) {
        return false;
      }

      store.actions.replaceFromPartial(saved, { history: true, reason: 'document:load' });
      store.actions.markSaved();
      runValidation({ openTray: false, silent: true });
      if (!silent) {
        notify('Loaded local planner draft.', 'success');
      }
      return true;
    };

    const buildServerLoadedState = (plan) => {
      const nextState = Planner.deserializePlannerDocument(plan.document || {});
      nextState.validation.issues = plan.validation?.issues || [];
      nextState.validation.lastRunAt = plan.validation?.validatedAt || null;
      nextState.backend = {
        availability: 'online',
        preferredStorage: 'server',
        lastCheckedAt: new Date().toISOString(),
        lastError: '',
      };
      nextState.meta.lastSavedAt = plan.updatedAt || new Date().toISOString();
      nextState.meta.dirty = false;
      return nextState;
    };

    const openServerPlanById = async (planId, options = {}) => {
      if (!apiClient || !planId) {
        return false;
      }

      try {
        const payload = await apiClient.getPlan(planId);
        const plan = payload?.plan || payload;
        const nextState = buildServerLoadedState(plan);
        store.actions.replaceFromPartial(nextState, {
          history: options.history !== false,
          reason: options.reason || 'document:load-server',
          dirty: false,
        });
        if (nextState.document.graph.nodes.length) {
          window.setTimeout(() => canvas.fitToGraph(), 16);
        }
        Planner.setPlannerLastServerPlanId?.(plan.id);
        syncBackendState({
          availability: 'online',
          preferredStorage: 'server',
          lastError: '',
        });
        if (!options.silent) {
          notify(`Loaded “${plan.title || 'Untitled Visual Plan'}” from server.`, 'success');
        }
        return true;
      } catch (error) {
        syncBackendState({
          availability: 'offline',
          preferredStorage: 'local',
          lastError: error.message || 'Unable to load the server plan.',
        });
        if (!options.silent) {
          notify(error.message || 'Unable to load the server plan.', 'error');
        }
        return false;
      }
    };

    const openServerBrowser = async () => {
      if (!apiClient) {
        notify('Server storage is not available in this context.', 'warning');
        return false;
      }

      setModal({ type: 'server-browser', loading: true, plans: [] });

      try {
        const plans = await apiClient.listPlans();
        syncBackendState({
          availability: 'online',
          preferredStorage: 'server',
          lastError: '',
        });
        setModal({ type: 'server-browser', loading: false, plans });
        return true;
      } catch (error) {
        syncBackendState({
          availability: 'offline',
          preferredStorage: 'local',
          lastError: error.message || 'Unable to load the server plan list.',
        });
        setModal({ type: 'server-browser', loading: false, plans: [], error: error.message || 'Unable to reach the planner server.' });
        return false;
      }
    };

    const saveToServer = async ({ silent = false } = {}) => {
      if (!apiClient) {
        saveLocal({ silent });
        return null;
      }

      const backendAvailable = await apiClient.probeBackend({ force: true });
      if (!backendAvailable) {
        syncBackendState({
          availability: 'offline',
          preferredStorage: 'local',
          lastError: 'The planner server is unavailable.',
        });
        saveLocal({ silent: true });
        if (!silent) {
          notify('Planner server is unavailable. Saved locally instead.', 'warning');
        }
        return null;
      }

      try {
        const state = store.getState();
        const existingPlanId = state.document.metadata.serverPlanId;
        const payload = {
          title: state.document.metadata.title,
          description: state.document.metadata.description,
          templateId: state.document.metadata.templateId,
          document: Planner.buildPlannerDocumentPayload(state),
        };

        const response = existingPlanId
          ? await apiClient.updatePlan(existingPlanId, payload)
          : await apiClient.createPlan(payload);

        const plan = response?.plan || response;
        const nextState = store.snapshot();
        nextState.document.metadata.serverPlanId = plan.id;
        nextState.document.metadata.serverVersionId = plan.latestVersionId || plan.document?.metadata?.serverVersionId || null;
        nextState.document.metadata.updatedAt = plan.updatedAt || nextState.document.metadata.updatedAt;
        nextState.validation.issues = plan.validation?.issues || [];
        nextState.validation.lastRunAt = plan.validation?.validatedAt || new Date().toISOString();
        nextState.backend = {
          availability: 'online',
          preferredStorage: 'server',
          lastCheckedAt: new Date().toISOString(),
          lastError: '',
        };
        nextState.meta.lastSavedAt = plan.updatedAt || new Date().toISOString();
        nextState.meta.dirty = false;
        store.actions.replaceFromPartial(nextState, { history: false, reason: 'server:save', dirty: false });
        Planner.setPlannerLastServerPlanId?.(plan.id);

        if (!silent) {
          notify(existingPlanId ? 'Saved planner to server.' : 'Created planner on server.', 'success');
        }

        return plan;
      } catch (error) {
        syncBackendState({
          availability: 'offline',
          preferredStorage: 'local',
          lastError: error.message || 'Server save failed.',
        });
        saveLocal({ silent: true });
        if (!silent) {
          notify(`${error.message || 'Server save failed.'} Saved locally instead.`, 'warning');
        }
        return null;
      }
    };

    const savePreferredDocument = async () => {
      if (apiClient && await apiClient.probeBackend({ force: true })) {
        return saveToServer();
      }

      syncBackendState({
        availability: 'offline',
        preferredStorage: 'local',
        lastError: 'The planner server is unavailable.',
      });
      saveLocal();
      return null;
    };

    const openPreferredDocument = async () => {
      if (apiClient && await apiClient.probeBackend({ force: true })) {
        syncBackendState({
          availability: 'online',
          preferredStorage: 'server',
          lastError: '',
        });
        return openServerBrowser();
      }

      syncBackendState({
        availability: 'offline',
        preferredStorage: 'local',
        lastError: 'The planner server is unavailable.',
      });
      return loadLocalDraft();
    };

    const ensureServerPlanId = async ({ silent = false } = {}) => {
      if (!apiClient) {
        if (!silent) {
          notify('Server-backed workflow features require the local planner server.', 'warning');
        }
        return '';
      }

      const backendAvailable = await apiClient.probeBackend({ force: true });
      if (!backendAvailable) {
        syncBackendState({
          availability: 'offline',
          preferredStorage: 'local',
          lastError: 'The planner server is unavailable.',
        });
        if (!silent) {
          notify('Start the planner server to export workflows or run simulations.', 'warning');
        }
        return '';
      }

      const state = store.getState();
      if (state.document.metadata.serverPlanId && !state.meta.dirty) {
        return state.document.metadata.serverPlanId;
      }

      const plan = await saveToServer({ silent: true });
      return plan?.id || '';
    };

    const downloadJsonPayload = (payload, filename) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    };

    const maybeConfirmReplace = (label = 'replace the current graph') => {
      const state = store.getState();
      const hasContent = state.document.graph.nodes.length > 0 || state.document.graph.edges.length > 0;
      if (!hasContent) {
        return true;
      }

      return window.confirm(`This will ${label}. Continue?`);
    };

    const copySelection = () => {
      const fragment = buildSelectionFragment(store);
      if (!fragment?.nodes?.length) {
        notify('Select one or more nodes to copy.', 'warning');
        return false;
      }

      clipboardFragment = fragment;
      pasteCount = 0;
      store.actions.setClipboard(fragment);
      notify(`Copied ${fragment.nodes.length} node${fragment.nodes.length === 1 ? '' : 's'}.`, 'success');
      return true;
    };

    const pasteSelection = ({ reason = 'clipboard:paste', label = 'Pasted selection.' } = {}) => {
      const fragment = clipboardFragment || store.getState().clipboard.fragment;
      if (!fragment?.nodes?.length) {
        notify('Nothing copied yet.', 'warning');
        return false;
      }

      pasteCount += 1;
      const clonedFragment = cloneFragmentWithOffset(fragment, pasteCount);
      store.actions.insertGraphFragment(clonedFragment, { history: true, reason });
      runValidation({ openTray: false, silent: true });
      notify(label, 'success');
      return true;
    };

    const duplicateSelection = () => {
      const fragment = buildSelectionFragment(store);
      if (!fragment?.nodes?.length) {
        notify('Select one or more nodes to duplicate.', 'warning');
        return false;
      }

      clipboardFragment = fragment;
      pasteCount = 0;
      return pasteSelection({ reason: 'selection:duplicate', label: 'Duplicated selection.' });
    };

    const applyPositionMap = (positionMap, label) => {
      const nodeIds = Object.keys(positionMap || {});
      if (!nodeIds.length) {
        return false;
      }

      store.pushHistorySnapshot(store.snapshot(), label);
      store.actions.updateNodes(nodeIds, (node) => {
        const nextPosition = positionMap[node.id];
        if (!nextPosition) {
          return;
        }

        node.x = nextPosition.x;
        node.y = nextPosition.y;
      }, { history: false, reason: 'layout:apply' });
      runValidation({ openTray: false, silent: true });
      return true;
    };

    const canvas = Planner.createPlannerCanvas({ mountNode: canvasMount, store, notify });

    const actions = {
      setMode(mode) {
        if (mode === 'runtime') {
          store.actions.setRuntimeEnabled(true);
          store.actions.setTrayTab('runtime');
        } else {
          store.actions.setRuntimeEnabled(false);
        }
        store.actions.setMode(mode);
      },
      validate() {
        runValidation({ openTray: true, silent: false });
      },
      async simulate() {
        const planId = await ensureServerPlanId();
        if (!planId) {
          return;
        }

        try {
          const payload = await apiClient.simulatePlan(planId);
          store.actions.setSimulationReport(payload?.simulation || payload?.report || payload);
          syncBackendState({
            availability: 'online',
            preferredStorage: 'server',
            lastError: '',
          });
          notify('Generated a simulation report.', 'success');
        } catch (error) {
          notify(error.message || 'Simulation failed.', 'error');
        }
      },
      async exportWorkflow() {
        const planId = await ensureServerPlanId();
        if (!planId) {
          return;
        }

        try {
          const payload = await apiClient.exportWorkflow(planId);
          const workflow = payload?.workflow || payload;
          downloadJsonPayload(workflow, `${Planner.slugify(store.getState().document.metadata.title || 'workflow')}.workflow.json`);
          syncBackendState({
            availability: 'online',
            preferredStorage: 'server',
            lastError: '',
          });
          notify('Exported workflow JSON.', 'success');
        } catch (error) {
          notify(error.message || 'Workflow export failed.', 'error');
        }
      },
      fitToGraph() {
        canvas.fitToGraph();
      },
      tidyGraph() {
        const state = store.getState();
        const positions = Planner.tidyPlannerGraph(state.document.graph.nodes, state.document.graph.edges, state.preferences);
        if (!applyPositionMap(positions, 'Tidy graph')) {
          notify('Add a few nodes before running tidy graph.', 'warning');
          return;
        }
        window.setTimeout(() => canvas.fitToGraph(), 16);
        notify('Tidy graph updated the layout.', 'success');
      },
      alignSelection(mode) {
        const selectedNodes = getSelectedNodes(store);
        if (selectedNodes.length < 2) {
          notify('Select at least two nodes to align them.', 'warning');
          return;
        }

        const positions = Planner.alignPlannerNodes(selectedNodes, mode, store.getState().preferences);
        applyPositionMap(positions, `Align ${mode}`);
        notify(`Aligned ${selectedNodes.length} nodes.`, 'success');
      },
      distributeSelection(axis) {
        const selectedNodes = getSelectedNodes(store);
        if (selectedNodes.length < 3) {
          notify('Select at least three nodes to distribute them.', 'warning');
          return;
        }

        const positions = Planner.distributePlannerNodes(selectedNodes, axis, store.getState().preferences);
        applyPositionMap(positions, `Distribute ${axis}`);
        notify(`Distributed ${selectedNodes.length} nodes.`, 'success');
      },
      openShortcuts() {
        setModal({ type: 'shortcuts' });
      },
      newBlank() {
        if (!maybeConfirmReplace('clear the current graph')) {
          return;
        }
        store.actions.replaceFromPartial(Planner.createDefaultPlannerState(), { history: true, reason: 'document:new' });
        store.actions.clearRuntime();
        runValidation({ openTray: false, silent: true });
        notify('Started a blank planner.', 'info');
      },
      applyTemplate(templateId) {
        const nextState = Planner.instantiatePlannerTemplate(templateId);
        if (!nextState) {
          return;
        }
        if (!maybeConfirmReplace(`load the “${Planner.getPlannerTemplateById(templateId)?.label || templateId}” template`)) {
          return;
        }
        store.actions.replaceFromPartial(nextState, { history: true, reason: 'template:apply' });
        window.setTimeout(() => canvas.fitToGraph(), 16);
        runValidation({ openTray: false, silent: true });
        notify(`Loaded ${Planner.getPlannerTemplateById(templateId)?.label || 'template'}.`, 'success');
      },
      togglePreference(key) {
        store.actions.togglePreference(key);
      },
      async saveDocument() {
        await savePreferredDocument();
      },
      async openDocument() {
        await openPreferredDocument();
      },
      async saveServer() {
        await saveToServer();
      },
      async openServer(planId) {
        if (planId) {
          if (!maybeConfirmReplace('replace the current graph with a server plan')) {
            return;
          }
          await openServerPlanById(planId);
          return;
        }

        await openServerBrowser();
      },
      saveLocal() {
        saveLocal();
      },
      loadLocal() {
        loadLocalDraft();
      },
      exportJson() {
        Planner.downloadPlannerJson(store.getState());
        notify('Exported planner JSON.', 'success');
      },
      async importJson(file) {
        try {
          const imported = await Planner.readPlannerJsonFile(file);
          if (!maybeConfirmReplace(`replace the current graph with ${file.name}`)) {
            return;
          }
          store.actions.replaceFromPartial(imported, { history: true, reason: 'document:import' });
          runValidation({ openTray: false, silent: true });
          window.setTimeout(() => canvas.fitToGraph(), 16);
          notify(`Imported ${file.name}.`, 'success');
        } catch (error) {
          notify(error.message || 'Import failed.', 'error');
        }
      },
      undo() {
        store.actions.undo();
      },
      redo() {
        store.actions.redo();
      },
    };

    const toolbar = Planner.createPlannerToolbar({
      mountNode: toolbarMount,
      store,
      actions,
    });

    const palette = Planner.createPlannerPalette({
      mountNode: paletteMount,
      onCreateNode(type) {
        canvas.createNodeAtCenter(type);
        notify(`Added ${Planner.getPlannerNodeType(type).label}.`, 'success');
      },
      onApplyTemplate: actions.applyTemplate,
    });

    const inspector = Planner.createPlannerInspector({
      mountNode: inspectorMount,
      store,
      actions: {
        openTaskNode: openTaskNodeInShell,
        openAgentNode: openAgentNodeInShell,
        openArtifactNode: openArtifactNodeInShell,
        editWorkflowStepInNotepad: openWorkflowStepNotepad,
      },
    });

    const tray = Planner.createPlannerTray({
      mountNode: trayMount,
      store,
      onFocusEntity: canvas.focusEntity,
      notify,
    });

    const scheduleAutosave = () => {
      window.clearTimeout(autosaveTimer);
      autosaveTimer = window.setTimeout(() => saveLocal({ silent: true }), 500);
    };

    const scheduleValidation = () => {
      window.clearTimeout(validationTimer);
      validationTimer = window.setTimeout(() => runValidation({ openTray: false, silent: true }), 180);
    };

    const handleGlobalKeyDown = (event) => {
      if (modalState) {
        if (event.key === 'Escape') {
          setModal(null);
        }
        return;
      }

      if (isEditingTarget(event.target)) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const modifier = isMac ? event.metaKey : event.ctrlKey;

      if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
        event.preventDefault();
        actions.openShortcuts();
        return;
      }

      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault();
        actions.saveDocument();
        return;
      }

      if (modifier && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copySelection();
        return;
      }

      if (modifier && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        pasteSelection();
        return;
      }

      if (modifier && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateSelection();
        return;
      }

      if (modifier && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        actions.undo();
        return;
      }

      if ((modifier && event.key.toLowerCase() === 'z' && event.shiftKey) || (modifier && event.key.toLowerCase() === 'y')) {
        event.preventDefault();
        actions.redo();
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        store.actions.removeSelection();
        return;
      }

      if (event.key === 'Escape') {
        store.actions.clearSelection();
      }
    };

    const handleModalClick = (event) => {
      const planButton = event.target.closest('[data-open-server-plan]');
      const saveNotepadButton = event.target.closest('[data-save-notepad="true"]');
      const closeButton = event.target.closest('[data-modal-close="true"]');
      const backdrop = event.target.closest('[data-modal-backdrop="true"]');
      const insideDialog = event.target.closest('.planner-modal__dialog');

      if (planButton) {
        setModal(null);
        actions.openServer(planButton.dataset.openServerPlan);
        return;
      }

      if (saveNotepadButton && modalState?.type === 'notepad-handoff') {
        const editor = modalHost?.querySelector('[data-notepad-editor="true"]');
        const nodeId = modalState.nodeId;

        if (!editor || !nodeId) {
          setModal(null);
          return;
        }

        store.actions.updateNode(nodeId, {
          data: {
            promptPayload: editor.value,
          },
        }, { history: true, reason: 'inspector:notepad-handoff' });
        setModal(null);
        notify('Saved the workflow step payload.', 'success');
        return;
      }

      if (closeButton) {
        setModal(null);
        return;
      }

      if (backdrop && !insideDialog) {
        setModal(null);
      }
    };

    autosaveUnsubscribe = store.subscribe((state, meta) => {
      const reason = meta.reason || '';
      if (/^(selection:|viewport|history:|meta:|validation:|simulation:|subscribe$|clipboard:|backend:|runtime:sync)/.test(reason)) {
        return;
      }

      scheduleAutosave();
      scheduleValidation();
    });

    if (shellStateStore) {
      shellCleanupFns.push(subscribeStateStoreValue(shellStateStore, 'selection.workflowRunId', () => {
        syncSelectedWorkflowRun().catch(() => {});
      }));
      shellCleanupFns.push(subscribeStateStoreValue(shellStateStore, 'workflow.selectedRunId', () => {
        syncSelectedWorkflowRun().catch(() => {});
      }));
    }

    if (shellSync?.subscribe) {
      shellCleanupFns.push(shellSync.subscribe((data, changedKeys = []) => {
        if (!Array.isArray(changedKeys) || !changedKeys.includes('activeWorkflowRuns')) {
          return;
        }

        syncSelectedWorkflowRun(data).catch(() => {});
      }));
    }

    const hydrateInitialDocument = async () => {
      const savedDraft = Planner.loadPlannerFromLocalStorage(Planner.PLANNER_LOCAL_STORAGE_KEY);

      if (apiClient) {
        const backendAvailable = await apiClient.probeBackend({ force: true });
        syncBackendState({
          availability: backendAvailable ? 'online' : 'offline',
          preferredStorage: backendAvailable ? 'server' : 'local',
          lastError: backendAvailable ? '' : 'The planner server is unavailable.',
        });

        if (backendAvailable) {
          const lastServerPlanId = Planner.getPlannerLastServerPlanId?.();
          if (lastServerPlanId) {
            const loaded = await openServerPlanById(lastServerPlanId, {
              history: false,
              reason: 'bootstrap:server',
              silent: true,
            });
            if (loaded) {
              notify('Loaded last server plan.', 'info');
              if (store.getState().document.graph.nodes.length) {
                window.setTimeout(() => canvas.fitToGraph(), 24);
              }
              return;
            }

            Planner.clearPlannerLastServerPlanId?.();
          }
        }
      } else {
        syncBackendState({
          availability: 'offline',
          preferredStorage: 'local',
          lastError: 'Server storage is not available in this context.',
        });
      }

      if (savedDraft) {
        store.actions.replaceFromPartial(savedDraft, { history: false, reason: 'bootstrap:load' });
        store.actions.markSaved();
        notify('Loaded last local draft.', 'info');
        if (savedDraft.document.graph.nodes.length) {
          window.setTimeout(() => canvas.fitToGraph(), 24);
        }
      }

      runValidation({ openTray: false, silent: true });
      await syncSelectedWorkflowRun();
    };

    bootstrapPromise = hydrateInitialDocument();

    window.addEventListener('keydown', handleGlobalKeyDown);
    modalHost?.addEventListener('click', handleModalClick);

    const destroy = () => {
      if (destroyed) {
        return;
      }

      destroyed = true;
      window.clearTimeout(autosaveTimer);
      window.clearTimeout(validationTimer);
      saveLocal({ silent: true });
      window.removeEventListener('keydown', handleGlobalKeyDown);
      modalHost?.removeEventListener('click', handleModalClick);
      autosaveUnsubscribe?.();
      shellCleanupFns.forEach((cleanup) => cleanup?.());
      setModal(null);
      toolbar.destroy();
      palette.destroy();
      inspector.destroy();
      tray.destroy();
      canvas.destroy();
    };

    return {
      store,
      services,
      ready: bootstrapPromise,
      applyWorkflowRunStatus(payload) {
        return Planner.applyPlannerWorkflowRunStatus?.(store, payload);
      },
      copySelection,
      pasteSelection,
      duplicateSelection,
      destroy,
    };
  }

  Planner.mountPlannerApp = mountPlannerApp;

  document.addEventListener('DOMContentLoaded', () => {
    if (document.body?.dataset.plannerStandalone !== 'true') {
      return;
    }

    const app = mountPlannerApp({ rootNode: document });

    window.addEventListener('beforeunload', () => {
      app.destroy();
    }, { once: true });
  });
})();
