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
        { keys: 'Ctrl/Cmd + S', description: 'Save a local planner draft' },
        { keys: 'Ctrl/Cmd + Z', description: 'Undo the last structural change' },
        { keys: 'Ctrl/Cmd + Shift + Z', description: 'Redo after an undo' },
        { keys: '?', description: 'Open this keyboard shortcut sheet' },
      ],
    },
  ];

  const isEditingTarget = (target) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable;

  const queryWithin = (rootNode, selector) => rootNode?.querySelector?.(selector) || document.querySelector(selector);

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
    let autosaveTimer = 0;
    let validationTimer = 0;
    let modalState = null;
    let clipboardFragment = store.getState().clipboard.fragment || null;
    let pasteCount = 0;
    let destroyed = false;

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
          ${modalState.type === 'shortcuts' ? renderShortcutsModal() : ''}
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
      saveLocal() {
        saveLocal();
      },
      loadLocal() {
        const saved = Planner.loadPlannerFromLocalStorage(Planner.PLANNER_LOCAL_STORAGE_KEY);
        if (!saved) {
          notify('No local draft found yet.', 'warning');
          return;
        }
        if (!maybeConfirmReplace('replace the current graph with the saved local draft')) {
          return;
        }
        store.actions.replaceFromPartial(saved, { history: true, reason: 'document:load' });
        store.actions.markSaved();
        runValidation({ openTray: false, silent: true });
        notify('Loaded local planner draft.', 'success');
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
        actions.saveLocal();
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
      const closeButton = event.target.closest('[data-modal-close="true"]');
      const backdrop = event.target.closest('[data-modal-backdrop="true"]');
      const insideDialog = event.target.closest('.planner-modal__dialog');

      if (closeButton) {
        setModal(null);
        return;
      }

      if (backdrop && !insideDialog) {
        setModal(null);
      }
    };

    store.subscribe((state, meta) => {
      const reason = meta.reason || '';
      if (/^(selection:|viewport|history:|meta:|validation:|subscribe$|clipboard:)/.test(reason)) {
        return;
      }

      scheduleAutosave();
      scheduleValidation();
    });

    const savedDraft = Planner.loadPlannerFromLocalStorage(Planner.PLANNER_LOCAL_STORAGE_KEY);
    if (savedDraft) {
      store.actions.replaceFromPartial(savedDraft, { history: false, reason: 'bootstrap:load' });
      store.actions.markSaved();
      notify('Loaded last local draft.', 'info');
      if (savedDraft.document.graph.nodes.length) {
        window.setTimeout(() => canvas.fitToGraph(), 24);
      }
    }

    runValidation({ openTray: false, silent: true });

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
      copySelection,
      pasteSelection,
      duplicateSelection,
      destroy,
    };
  }

  Planner.mountPlannerApp = mountPlannerApp;

  document.addEventListener('DOMContentLoaded', () => {
    const app = mountPlannerApp({ rootNode: document });

    window.addEventListener('beforeunload', () => {
      app.destroy();
    }, { once: true });
  });
})();
