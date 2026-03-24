/*
 * OpenClaw Visual Planner
 * app.js
 *
 * Bootstrap the standalone planner, wire all modules together, and keep local
 * drafts + validation fresh while the user edits the graph.
 */

(() => {
  const Planner = window.OpenClawPlanner = window.OpenClawPlanner || {};

  const isEditingTarget = (target) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable;

  const createNotifier = (host) => {
    let activeToasts = [];

    return (message, tone = 'info') => {
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

  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.dataset.theme = 'dark';

    const toolbarMount = document.getElementById('planner-toolbar');
    const paletteMount = document.getElementById('planner-palette');
    const canvasMount = document.getElementById('planner-canvas');
    const inspectorMount = document.getElementById('planner-inspector');
    const trayMount = document.getElementById('planner-tray');
    const toastHost = document.getElementById('planner-toast-host');

    const notify = createNotifier(toastHost);
    const store = Planner.createPlannerStore();

    let autosaveTimer = 0;
    let validationTimer = 0;

    const runValidation = ({ openTray = false, silent = false } = {}) => {
      const issues = Planner.validatePlannerState(store.getState());
      store.actions.setValidationIssues(issues, { openTray });

      if (!silent) {
        notify(issues.length ? `Validation finished with ${issues.length} issue${issues.length === 1 ? '' : 's'}.` : 'Validation passed with no issues.', issues.length ? 'warning' : 'success');
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

    store.subscribe((state, meta) => {
      const reason = meta.reason || '';
      if (/^(selection:|viewport|history:|meta:|validation:|subscribe$)/.test(reason)) {
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

    window.addEventListener('keydown', (event) => {
      if (isEditingTarget(event.target)) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const modifier = isMac ? event.metaKey : event.ctrlKey;

      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault();
        actions.saveLocal();
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
    });

    window.addEventListener('beforeunload', () => {
      window.clearTimeout(autosaveTimer);
      window.clearTimeout(validationTimer);
      saveLocal({ silent: true });
      toolbar.destroy();
      palette.destroy();
      inspector.destroy();
      tray.destroy();
      canvas.destroy();
    }, { once: true });
  });
})();
