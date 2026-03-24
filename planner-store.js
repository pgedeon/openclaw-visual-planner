/*
 * OpenClaw Visual Planner
 * planner-store.js
 *
 * The standalone planner keeps all editable state in a single store so the
 * app can later be wrapped by a WebOS native view with minimal translation.
 */

(() => {
  const Planner = window.OpenClawPlanner = window.OpenClawPlanner || {};

  const HISTORY_LIMIT = 100;
  const DEFAULT_GRID_SIZE = 24;
  const HISTORY_KEYS = ['document', 'viewport', 'preferences', 'runtime', 'ui'];

  const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

  const clone = (value) => {
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(value);
      } catch (error) {
        return JSON.parse(JSON.stringify(value));
      }
    }

    return JSON.parse(JSON.stringify(value));
  };

  const merge = (target, patch) => {
    if (!isObject(patch)) {
      return target;
    }

    Object.entries(patch).forEach(([key, value]) => {
      if (isObject(value) && isObject(target[key])) {
        merge(target[key], value);
        return;
      }

      target[key] = clone(value);
    });

    return target;
  };

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  const truncate = (value, max = 64) => {
    const text = String(value ?? '');
    return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
  };

  const slugify = (value) => String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'visual-plan';

  const createPlannerId = (prefix = 'id') => {
    const random = Math.random().toString(36).slice(2, 8);
    const stamp = Date.now().toString(36);
    return `${prefix}_${stamp}_${random}`;
  };

  const pickHistoryShape = (state) => {
    const snapshot = {};
    HISTORY_KEYS.forEach((key) => {
      snapshot[key] = clone(state[key]);
    });
    return snapshot;
  };

  const historyFingerprint = (state) => JSON.stringify(pickHistoryShape(state));

  const createDefaultState = (seed = {}) => {
    const now = new Date().toISOString();

    const base = {
      document: {
        schemaVersion: 'openclaw.visual-planner/v1',
        metadata: {
          title: 'Untitled Visual Plan',
          description: 'A visual workflow canvas for OpenClaw.',
          templateId: null,
          createdAt: now,
          updatedAt: now,
        },
        graph: {
          nodes: [],
          edges: [],
        },
      },
      viewport: {
        x: 0,
        y: 0,
        zoom: 1,
      },
      preferences: {
        gridSize: DEFAULT_GRID_SIZE,
        snapToGrid: true,
        showGrid: true,
        showMinimap: true,
      },
      selection: {
        type: 'none',
        nodeIds: [],
        edgeId: null,
      },
      clipboard: {
        fragment: null,
        copiedAt: null,
      },
      ui: {
        mode: 'workflow',
        trayTab: 'validation',
      },
      validation: {
        issues: [],
        lastRunAt: null,
      },
      runtime: {
        enabled: false,
        scenario: 'idle',
        statuses: {},
      },
      meta: {
        dirty: false,
        lastSavedAt: null,
      },
    };

    return merge(base, seed);
  };

  const updateTimestamp = (state) => {
    state.document.metadata.updatedAt = new Date().toISOString();
  };

  const uniqueIds = (values = []) => Array.from(new Set((values || []).filter(Boolean)));

  const findNodeIndex = (state, nodeId) => state.document.graph.nodes.findIndex((node) => node.id === nodeId);
  const findEdgeIndex = (state, edgeId) => state.document.graph.edges.findIndex((edge) => edge.id === edgeId);

  function createPlannerStore(seed = {}) {
    let state = createDefaultState(seed);
    let history = [];
    let future = [];
    const listeners = new Set();

    const notify = (meta = {}) => {
      const detail = {
        reason: meta.reason || 'state',
        canUndo: history.length > 0,
        canRedo: future.length > 0,
        historyDepth: history.length,
        futureDepth: future.length,
        ...meta,
      };

      listeners.forEach((listener) => listener(state, detail));
    };

    const replaceState = (nextState, options = {}) => {
      const previousState = state;
      const changed = historyFingerprint(previousState) !== historyFingerprint(nextState)
        || JSON.stringify(previousState.selection) !== JSON.stringify(nextState.selection)
        || JSON.stringify(previousState.validation) !== JSON.stringify(nextState.validation)
        || JSON.stringify(previousState.meta) !== JSON.stringify(nextState.meta);

      if (!changed) {
        return false;
      }

      if (options.history) {
        const lastSnapshot = history[history.length - 1];
        const previousFingerprint = historyFingerprint(previousState);
        if (!lastSnapshot || historyFingerprint(lastSnapshot) !== previousFingerprint) {
          history.push(clone(previousState));
          if (history.length > HISTORY_LIMIT) {
            history = history.slice(history.length - HISTORY_LIMIT);
          }
        }
        future = [];
      }

      state = nextState;
      notify({
        reason: options.reason || 'state',
        historyChanged: Boolean(options.history),
      });
      return true;
    };

    const mutate = (mutator, options = {}) => {
      const draft = clone(state);
      const result = mutator(draft);
      const nextState = result || draft;
      return replaceState(nextState, options);
    };

    const pushHistorySnapshot = (snapshot, label = 'Edit') => {
      if (!snapshot) {
        return false;
      }

      const nextFingerprint = historyFingerprint(snapshot);
      const lastSnapshot = history[history.length - 1];
      if (lastSnapshot && historyFingerprint(lastSnapshot) === nextFingerprint) {
        return false;
      }

      history.push(clone(snapshot));
      if (history.length > HISTORY_LIMIT) {
        history = history.slice(history.length - HISTORY_LIMIT);
      }
      future = [];
      notify({ reason: 'history:checkpoint', label, historyChanged: true });
      return true;
    };

    const store = {
      getState() {
        return state;
      },
      snapshot() {
        return clone(state);
      },
      subscribe(listener) {
        if (typeof listener !== 'function') {
          return () => {};
        }

        listeners.add(listener);
        listener(state, {
          reason: 'subscribe',
          canUndo: history.length > 0,
          canRedo: future.length > 0,
          historyDepth: history.length,
          futureDepth: future.length,
        });

        return () => listeners.delete(listener);
      },
      canUndo() {
        return history.length > 0;
      },
      canRedo() {
        return future.length > 0;
      },
      pushHistorySnapshot,
      actions: {
        replaceFromPartial(partial, options = {}) {
          const next = createDefaultState();
          merge(next, partial);
          next.meta.dirty = options.dirty ?? true;
          return replaceState(next, { history: Boolean(options.history), reason: options.reason || 'document:replace' });
        },
        setMetadata(patch) {
          return mutate((draft) => {
            merge(draft.document.metadata, patch || {});
            updateTimestamp(draft);
            draft.meta.dirty = true;
          }, { history: true, reason: 'document:metadata' });
        },
        setMode(mode) {
          return mutate((draft) => {
            draft.ui.mode = mode;
            if (mode === 'runtime') {
              draft.runtime.enabled = true;
            }
            if (mode !== 'runtime' && !Object.keys(draft.runtime.statuses || {}).length) {
              draft.runtime.enabled = false;
            }
          }, { reason: 'ui:mode' });
        },
        setTrayTab(tab) {
          return mutate((draft) => {
            draft.ui.trayTab = tab;
          }, { reason: 'ui:tray' });
        },
        setViewport(patch, options = {}) {
          return mutate((draft) => {
            merge(draft.viewport, patch || {});
            draft.viewport.zoom = clamp(Number(draft.viewport.zoom) || 1, 0.25, 2.5);
            draft.meta.dirty = options.dirty ?? true;
          }, { history: Boolean(options.history), reason: options.reason || 'viewport' });
        },
        resetViewport() {
          return mutate((draft) => {
            draft.viewport = { x: 0, y: 0, zoom: 1 };
            draft.meta.dirty = true;
          }, { history: true, reason: 'viewport:reset' });
        },
        setPreference(key, value) {
          return mutate((draft) => {
            draft.preferences[key] = value;
            draft.meta.dirty = true;
          }, { history: true, reason: 'preferences:update' });
        },
        togglePreference(key) {
          return mutate((draft) => {
            draft.preferences[key] = !draft.preferences[key];
            draft.meta.dirty = true;
          }, { history: true, reason: 'preferences:toggle' });
        },
        selectNode(nodeId) {
          return mutate((draft) => {
            draft.selection.type = nodeId ? 'node' : 'none';
            draft.selection.nodeIds = nodeId ? [nodeId] : [];
            draft.selection.edgeId = null;
          }, { reason: 'selection:node' });
        },
        selectNodes(nodeIds, options = {}) {
          return mutate((draft) => {
            const nextIds = uniqueIds(nodeIds);
            if (options.additive) {
              draft.selection.nodeIds = uniqueIds(draft.selection.nodeIds.concat(nextIds));
            } else {
              draft.selection.nodeIds = nextIds;
            }
            draft.selection.type = draft.selection.nodeIds.length ? 'node' : 'none';
            draft.selection.edgeId = null;
          }, { reason: 'selection:nodes' });
        },
        toggleNodeSelection(nodeId) {
          return mutate((draft) => {
            const isSelected = draft.selection.nodeIds.includes(nodeId);
            draft.selection.nodeIds = isSelected
              ? draft.selection.nodeIds.filter((id) => id !== nodeId)
              : draft.selection.nodeIds.concat(nodeId);
            draft.selection.nodeIds = uniqueIds(draft.selection.nodeIds);
            draft.selection.type = draft.selection.nodeIds.length ? 'node' : 'none';
            draft.selection.edgeId = null;
          }, { reason: 'selection:toggle-node' });
        },
        selectEdge(edgeId) {
          return mutate((draft) => {
            draft.selection.type = edgeId ? 'edge' : 'none';
            draft.selection.nodeIds = [];
            draft.selection.edgeId = edgeId || null;
          }, { reason: 'selection:edge' });
        },
        clearSelection() {
          return mutate((draft) => {
            draft.selection.type = 'none';
            draft.selection.nodeIds = [];
            draft.selection.edgeId = null;
          }, { reason: 'selection:clear' });
        },
        setClipboard(fragment) {
          return mutate((draft) => {
            draft.clipboard.fragment = fragment ? clone(fragment) : null;
            draft.clipboard.copiedAt = fragment ? new Date().toISOString() : null;
          }, { reason: 'clipboard:update' });
        },
        addNode(node, options = {}) {
          return mutate((draft) => {
            draft.document.graph.nodes.push(clone(node));
            updateTimestamp(draft);
            draft.meta.dirty = true;
            if (options.select !== false) {
              draft.selection.type = 'node';
              draft.selection.nodeIds = [node.id];
              draft.selection.edgeId = null;
            }
          }, { history: true, reason: options.reason || 'node:add' });
        },
        updateNode(nodeId, patch, options = {}) {
          return mutate((draft) => {
            const index = findNodeIndex(draft, nodeId);
            if (index === -1) {
              return draft;
            }

            const node = draft.document.graph.nodes[index];
            if (typeof patch === 'function') {
              patch(node);
            } else {
              merge(node, patch || {});
            }

            node.updatedAt = new Date().toISOString();
            updateTimestamp(draft);
            draft.meta.dirty = options.dirty ?? true;
          }, { history: Boolean(options.history), reason: options.reason || 'node:update' });
        },
        updateNodes(nodeIds, patch, options = {}) {
          return mutate((draft) => {
            const selectedIds = uniqueIds(nodeIds);
            if (!selectedIds.length) {
              return draft;
            }

            draft.document.graph.nodes.forEach((node) => {
              if (!selectedIds.includes(node.id)) {
                return;
              }

              if (typeof patch === 'function') {
                patch(node);
              } else {
                merge(node, patch || {});
              }

              node.updatedAt = new Date().toISOString();
            });

            updateTimestamp(draft);
            draft.meta.dirty = options.dirty ?? true;
          }, { history: Boolean(options.history), reason: options.reason || 'node:update-many' });
        },
        moveNodes(nodeIds, delta, options = {}) {
          return mutate((draft) => {
            draft.document.graph.nodes.forEach((node) => {
              if (!nodeIds.includes(node.id)) {
                return;
              }

              node.x = Number(node.x) + Number(delta.x || 0);
              node.y = Number(node.y) + Number(delta.y || 0);
              node.updatedAt = new Date().toISOString();
            });
            updateTimestamp(draft);
            draft.meta.dirty = options.dirty ?? true;
          }, { history: Boolean(options.history), reason: options.reason || 'node:move' });
        },
        resizeNode(nodeId, bounds, options = {}) {
          return mutate((draft) => {
            const index = findNodeIndex(draft, nodeId);
            if (index === -1) {
              return draft;
            }

            const node = draft.document.graph.nodes[index];
            node.x = Number(bounds.x ?? node.x);
            node.y = Number(bounds.y ?? node.y);
            node.width = Number(bounds.width ?? node.width);
            node.height = Number(bounds.height ?? node.height);
            node.updatedAt = new Date().toISOString();
            updateTimestamp(draft);
            draft.meta.dirty = options.dirty ?? true;
          }, { history: Boolean(options.history), reason: options.reason || 'node:resize' });
        },
        removeNode(nodeId, options = {}) {
          return mutate((draft) => {
            draft.document.graph.nodes = draft.document.graph.nodes.filter((node) => node.id !== nodeId);
            draft.document.graph.edges = draft.document.graph.edges.filter((edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId);
            if (draft.selection.nodeIds.includes(nodeId)) {
              draft.selection.type = 'none';
              draft.selection.nodeIds = [];
            }
            updateTimestamp(draft);
            draft.meta.dirty = true;
          }, { history: options.history !== false, reason: options.reason || 'node:remove' });
        },
        removeNodes(nodeIds, options = {}) {
          const selectedIds = uniqueIds(nodeIds);
          return mutate((draft) => {
            if (!selectedIds.length) {
              return draft;
            }

            draft.document.graph.nodes = draft.document.graph.nodes.filter((node) => !selectedIds.includes(node.id));
            draft.document.graph.edges = draft.document.graph.edges.filter((edge) => !selectedIds.includes(edge.sourceNodeId) && !selectedIds.includes(edge.targetNodeId));

            draft.selection.nodeIds = draft.selection.nodeIds.filter((nodeId) => !selectedIds.includes(nodeId));
            if (!draft.selection.nodeIds.length) {
              draft.selection.type = 'none';
            }

            updateTimestamp(draft);
            draft.meta.dirty = true;
          }, { history: options.history !== false, reason: options.reason || 'node:remove-many' });
        },
        insertGraphFragment(fragment, options = {}) {
          return mutate((draft) => {
            const nodes = Array.isArray(fragment?.nodes) ? fragment.nodes.map((node) => clone(node)) : [];
            const edges = Array.isArray(fragment?.edges) ? fragment.edges.map((edge) => clone(edge)) : [];

            if (!nodes.length && !edges.length) {
              return draft;
            }

            draft.document.graph.nodes.push(...nodes);
            draft.document.graph.edges.push(...edges);
            draft.selection.type = nodes.length ? 'node' : (edges.length ? 'edge' : 'none');
            draft.selection.nodeIds = nodes.map((node) => node.id);
            draft.selection.edgeId = edges.length === 1 && !nodes.length ? edges[0].id : null;

            updateTimestamp(draft);
            draft.meta.dirty = options.dirty ?? true;
          }, { history: options.history !== false, reason: options.reason || 'graph:insert-fragment' });
        },
        addEdge(edge, options = {}) {
          return mutate((draft) => {
            draft.document.graph.edges.push(clone(edge));
            updateTimestamp(draft);
            draft.meta.dirty = true;
            if (options.select !== false) {
              draft.selection.type = 'edge';
              draft.selection.nodeIds = [];
              draft.selection.edgeId = edge.id;
            }
          }, { history: true, reason: options.reason || 'edge:add' });
        },
        updateEdge(edgeId, patch, options = {}) {
          return mutate((draft) => {
            const index = findEdgeIndex(draft, edgeId);
            if (index === -1) {
              return draft;
            }

            const edge = draft.document.graph.edges[index];
            if (typeof patch === 'function') {
              patch(edge);
            } else {
              merge(edge, patch || {});
            }

            edge.updatedAt = new Date().toISOString();
            updateTimestamp(draft);
            draft.meta.dirty = options.dirty ?? true;
          }, { history: options.history !== false, reason: options.reason || 'edge:update' });
        },
        removeEdge(edgeId, options = {}) {
          return mutate((draft) => {
            draft.document.graph.edges = draft.document.graph.edges.filter((edge) => edge.id !== edgeId);
            if (draft.selection.edgeId === edgeId) {
              draft.selection.type = 'none';
              draft.selection.edgeId = null;
            }
            updateTimestamp(draft);
            draft.meta.dirty = true;
          }, { history: options.history !== false, reason: options.reason || 'edge:remove' });
        },
        removeSelection() {
          if (state.selection.type === 'node' && state.selection.nodeIds.length) {
            if (state.selection.nodeIds.length === 1) {
              return store.actions.removeNode(state.selection.nodeIds[0]);
            }

            return store.actions.removeNodes(state.selection.nodeIds);
          }

          if (state.selection.type === 'edge' && state.selection.edgeId) {
            return store.actions.removeEdge(state.selection.edgeId);
          }

          return false;
        },
        setValidationIssues(issues, options = {}) {
          return mutate((draft) => {
            draft.validation.issues = clone(issues || []);
            draft.validation.lastRunAt = new Date().toISOString();
            if (options.openTray) {
              draft.ui.trayTab = 'validation';
            }
          }, { reason: options.reason || 'validation:update' });
        },
        setRuntimeEnabled(enabled) {
          return mutate((draft) => {
            draft.runtime.enabled = Boolean(enabled);
            draft.ui.mode = enabled ? 'runtime' : (draft.ui.mode === 'runtime' ? 'workflow' : draft.ui.mode);
          }, { reason: 'runtime:enabled' });
        },
        setRuntimeScenario(scenario, statuses = {}) {
          return mutate((draft) => {
            draft.runtime.enabled = true;
            draft.runtime.scenario = scenario || 'custom';
            draft.runtime.statuses = clone(statuses || {});
            draft.ui.mode = 'runtime';
            draft.ui.trayTab = 'runtime';
            draft.meta.dirty = true;
          }, { history: true, reason: 'runtime:scenario' });
        },
        setNodeRuntimeStatus(nodeId, status) {
          return mutate((draft) => {
            draft.runtime.enabled = true;
            draft.runtime.scenario = 'custom';
            if (!status || status === 'idle') {
              delete draft.runtime.statuses[nodeId];
            } else {
              draft.runtime.statuses[nodeId] = status;
            }
            draft.ui.mode = 'runtime';
            draft.meta.dirty = true;
          }, { history: true, reason: 'runtime:node-status' });
        },
        clearRuntime() {
          return mutate((draft) => {
            draft.runtime.enabled = false;
            draft.runtime.scenario = 'idle';
            draft.runtime.statuses = {};
            if (draft.ui.mode === 'runtime') {
              draft.ui.mode = 'workflow';
            }
            draft.meta.dirty = true;
          }, { history: true, reason: 'runtime:clear' });
        },
        markSaved(timestamp = new Date().toISOString()) {
          return mutate((draft) => {
            draft.meta.lastSavedAt = timestamp;
            draft.meta.dirty = false;
          }, { reason: 'meta:saved' });
        },
        markDirty(value = true) {
          return mutate((draft) => {
            draft.meta.dirty = Boolean(value);
          }, { reason: 'meta:dirty' });
        },
        undo() {
          if (!history.length) {
            return false;
          }

          future.push(clone(state));
          const previous = history.pop();
          state = clone(previous);
          notify({ reason: 'history:undo', historyChanged: true });
          return true;
        },
        redo() {
          if (!future.length) {
            return false;
          }

          history.push(clone(state));
          const next = future.pop();
          state = clone(next);
          notify({ reason: 'history:redo', historyChanged: true });
          return true;
        },
      },
    };

    return store;
  }

  Planner.DEFAULT_PLANNER_GRID_SIZE = DEFAULT_GRID_SIZE;
  Planner.createPlannerStore = createPlannerStore;
  Planner.createDefaultPlannerState = createDefaultState;
  Planner.clonePlannerValue = clone;
  Planner.mergePlannerValue = merge;
  Planner.createPlannerId = createPlannerId;
  Planner.clamp = clamp;
  Planner.escapeHtml = escapeHtml;
  Planner.truncateText = truncate;
  Planner.slugify = slugify;
})();
