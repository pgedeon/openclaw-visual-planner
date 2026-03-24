/*
 * OpenClaw Visual Planner
 * planner-serializer.js
 *
 * Serialization keeps the planner portable between local drafts, exported JSON,
 * and the eventual WebOS native-view wrapper.
 */

(() => {
  const Planner = window.OpenClawPlanner = window.OpenClawPlanner || {};

  const LOCAL_STORAGE_KEY = 'openclaw.visualPlanner.document.v1';

  const normalizeNode = (node) => Planner.createPlannerNodeRecord(node.type, node);
  const normalizeEdge = (edge) => Planner.createPlannerEdgeRecord(edge);

  const buildDocumentPayload = (state) => ({
    schemaVersion: state.document.schemaVersion || 'openclaw.visual-planner/v1',
    metadata: Planner.clonePlannerValue(state.document.metadata),
    graph: {
      nodes: state.document.graph.nodes.map((node) => Planner.clonePlannerValue(node)),
      edges: state.document.graph.edges.map((edge) => Planner.clonePlannerValue(edge)),
    },
    viewport: Planner.clonePlannerValue(state.viewport),
    preferences: Planner.clonePlannerValue(state.preferences),
    runtime: Planner.clonePlannerValue(state.runtime),
  });

  const serializePlannerState = (state) => JSON.stringify(buildDocumentPayload(state), null, 2);

  const deserializePlannerDocument = (raw) => {
    const payload = typeof raw === 'string' ? JSON.parse(raw) : Planner.clonePlannerValue(raw || {});

    const base = Planner.createDefaultPlannerState();
    const metadata = payload.metadata || payload.document?.metadata || {};
    const graph = payload.graph || payload.document?.graph || {};

    base.document.schemaVersion = payload.schemaVersion || payload.document?.schemaVersion || base.document.schemaVersion;
    Object.assign(base.document.metadata, metadata);
    base.document.graph.nodes = Array.isArray(graph.nodes) ? graph.nodes.map(normalizeNode) : [];
    base.document.graph.edges = Array.isArray(graph.edges) ? graph.edges.map(normalizeEdge) : [];

    if (payload.viewport) {
      Object.assign(base.viewport, payload.viewport);
    }

    if (payload.preferences) {
      Object.assign(base.preferences, payload.preferences);
    }

    if (payload.runtime) {
      Object.assign(base.runtime, payload.runtime);
    }

    base.meta.dirty = false;
    return base;
  };

  const saveToLocalStorage = (state, key = LOCAL_STORAGE_KEY) => {
    const payload = serializePlannerState(state);
    localStorage.setItem(key, payload);
    return payload;
  };

  const loadFromLocalStorage = (key = LOCAL_STORAGE_KEY) => {
    const payload = localStorage.getItem(key);
    if (!payload) {
      return null;
    }

    return deserializePlannerDocument(payload);
  };

  const downloadJson = (state, filename) => {
    const blob = new Blob([serializePlannerState(state)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename || `${Planner.slugify(state.document.metadata.title)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const readJsonFile = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read the selected file.'));
    reader.onload = () => {
      try {
        resolve(deserializePlannerDocument(reader.result));
      } catch (error) {
        reject(error);
      }
    };
    reader.readAsText(file);
  });

  Planner.PLANNER_LOCAL_STORAGE_KEY = LOCAL_STORAGE_KEY;
  Planner.buildPlannerDocumentPayload = buildDocumentPayload;
  Planner.serializePlannerState = serializePlannerState;
  Planner.deserializePlannerDocument = deserializePlannerDocument;
  Planner.savePlannerToLocalStorage = saveToLocalStorage;
  Planner.loadPlannerFromLocalStorage = loadFromLocalStorage;
  Planner.downloadPlannerJson = downloadJson;
  Planner.readPlannerJsonFile = readJsonFile;
})();
