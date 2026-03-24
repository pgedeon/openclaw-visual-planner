/*
 * OpenClaw Visual Planner
 * planner-view.mjs
 *
 * Native-view wrapper for the standalone planner. This mirrors the WebOS
 * native-view lifecycle while reusing the existing planner assets and mount API.
 *
 * When this file is copied into the WebOS repo, `assetBaseUrl` can point at the
 * hosted or vendored planner asset directory.
 */

const PLANNER_SCRIPT_FILES = [
  'planner-store.js',
  'planner-nodes.js',
  'planner-edges.js',
  'planner-layout.js',
  'planner-serializer.js',
  'planner-validator.js',
  'planner-templates.js',
  'planner-runtime.js',
  'planner-palette.js',
  'planner-inspector.js',
  'planner-toolbar.js',
  'planner-canvas.js',
  'planner-api.js',
  'app.js',
];

const getPlannerAssetRegistry = () => {
  if (!globalThis.__openclawPlannerNativeView) {
    globalThis.__openclawPlannerNativeView = {
      cssByBaseUrl: new Map(),
      scriptsByBaseUrl: new Map(),
    };
  }

  return globalThis.__openclawPlannerNativeView;
};

const resolveAssetBaseUrl = (options = {}) => {
  if (options.assetBaseUrl) {
    return new URL(options.assetBaseUrl, globalThis.location?.href || import.meta.url).href;
  }

  return new URL('../../../', import.meta.url).href;
};

const getFetchImpl = (options = {}) => options.fetchImpl
  || options.adapter?.fetchImpl
  || globalThis.fetch?.bind(globalThis);

const ensureNativeRoot = (mountNode, viewClass = 'planner-view') => {
  if (!mountNode) {
    throw new Error('Planner native view requires a mount node.');
  }

  mountNode.classList.add('native-view-host', viewClass);
  mountNode.style.height = '100%';
  mountNode.style.minHeight = '0';
};

const renderPlannerShell = () => `
  <div class="planner-app">
    <div class="planner-app__backdrop" aria-hidden="true"></div>
    <div class="planner-window">
      <header id="planner-toolbar" class="planner-toolbar planner-panel planner-glass" aria-label="Planner toolbar"></header>
      <main class="planner-workspace" aria-label="Planner workspace">
        <aside id="planner-palette" class="planner-sidebar planner-panel planner-glass" aria-label="Node palette"></aside>
        <section id="planner-canvas" class="planner-stage planner-glass" aria-label="Workflow canvas"></section>
        <aside id="planner-inspector" class="planner-sidebar planner-panel planner-glass" aria-label="Inspector"></aside>
      </main>
      <section id="planner-tray" class="planner-tray planner-panel planner-glass" aria-label="Validation and runtime tray"></section>
    </div>
    <div id="planner-toast-host" class="planner-toast-host" aria-live="polite" aria-atomic="true"></div>
    <div id="planner-modal-host" class="planner-modal-host" aria-live="polite"></div>
  </div>
`;

const transformPlannerCssForShadow = (cssText) => cssText.replace(/:root\b/g, ':host');

const EMBEDDED_PLANNER_OVERRIDES = `
  :host {
    display: block;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    color: var(--planner-text, #fff);
  }

  .planner-app {
    min-height: 100%;
    height: 100%;
    padding: 12px;
  }

  .planner-window {
    height: 100%;
    min-height: 0;
  }

  .planner-workspace,
  .planner-stage {
    min-height: 0;
  }

  .planner-app__backdrop {
    opacity: 0.55;
  }

  .planner-toast-host {
    position: absolute;
    right: 16px;
    bottom: 16px;
  }

  .planner-modal-host {
    position: absolute;
    inset: 0;
  }

  .planner-modal {
    position: absolute;
    inset: 0;
  }
`;

const loadCssText = async (assetBaseUrl, fetchImpl) => {
  const registry = getPlannerAssetRegistry();
  if (!registry.cssByBaseUrl.has(assetBaseUrl)) {
    registry.cssByBaseUrl.set(assetBaseUrl, (async () => {
      if (typeof fetchImpl !== 'function') {
        throw new Error('Planner native view could not load CSS because no fetch implementation is available.');
      }

      const response = await fetchImpl(new URL('planner.css', assetBaseUrl).href, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Planner CSS failed to load (${response.status}).`);
      }

      return response.text();
    })());
  }

  return registry.cssByBaseUrl.get(assetBaseUrl);
};

const loadScript = (url) => new Promise((resolve, reject) => {
  const existing = document.querySelector(`script[data-openclaw-planner-asset="${url}"]`);
  if (existing?.dataset.loaded === 'true') {
    resolve();
    return;
  }

  const handleLoad = () => {
    script.dataset.loaded = 'true';
    resolve();
  };

  const handleError = () => reject(new Error(`Planner asset failed to load: ${url}`));

  const script = existing || document.createElement('script');
  if (!existing) {
    script.src = url;
    script.async = false;
    script.dataset.openclawPlannerAsset = url;
    document.head.appendChild(script);
  }

  script.addEventListener('load', handleLoad, { once: true });
  script.addEventListener('error', handleError, { once: true });
});

const ensurePlannerScripts = async (assetBaseUrl) => {
  const registry = getPlannerAssetRegistry();
  if (!registry.scriptsByBaseUrl.has(assetBaseUrl)) {
    registry.scriptsByBaseUrl.set(assetBaseUrl, (async () => {
      for (const fileName of PLANNER_SCRIPT_FILES) {
        await loadScript(new URL(fileName, assetBaseUrl).href);
      }

      if (!globalThis.OpenClawPlanner?.mountPlannerApp) {
        throw new Error('Planner assets loaded, but the planner mount API is unavailable.');
      }
    })());
  }

  return registry.scriptsByBaseUrl.get(assetBaseUrl);
};

const normalizeRenderArgs = (containerOrContext, maybeOptions = {}) => {
  if (containerOrContext?.mountNode) {
    return containerOrContext;
  }

  return {
    mountNode: containerOrContext,
    ...(maybeOptions || {}),
  };
};

const createPlannerApiClient = (Planner, context, assetBaseUrl) => Planner.createPlannerApiClient({
  baseUrl: context.apiBaseUrl || '',
  fetchImpl: getFetchImpl(context),
  shell: {
    api: context.api || null,
    stateStore: context.stateStore || null,
    sync: context.sync || null,
    adapter: context.adapter || null,
    assetBaseUrl,
  },
});

export async function render(container, options = {}) {
  const context = normalizeRenderArgs(container, options);
  const { mountNode } = context;
  ensureNativeRoot(mountNode, 'planner-view');
  mountNode.innerHTML = '';

  const assetBaseUrl = resolveAssetBaseUrl(context);
  const fetchImpl = getFetchImpl(context);
  const root = document.createElement('div');
  root.className = 'native-view-root planner-native-view';
  root.style.cssText = 'display:block;height:100%;min-height:0;';
  mountNode.appendChild(root);

  const shadowRoot = root.attachShadow({ mode: 'open' });
  const [cssText] = await Promise.all([
    loadCssText(assetBaseUrl, fetchImpl),
    ensurePlannerScripts(assetBaseUrl),
  ]);

  shadowRoot.innerHTML = `
    <style>
      ${transformPlannerCssForShadow(cssText)}
      ${EMBEDDED_PLANNER_OVERRIDES}
    </style>
    ${renderPlannerShell()}
  `;

  const Planner = globalThis.OpenClawPlanner;
  const apiClient = context.apiClient || createPlannerApiClient(Planner, context, assetBaseUrl);
  const plannerApp = Planner.mountPlannerApp({
    rootNode: shadowRoot,
    services: {
      apiClient,
      api: context.api || null,
      adapter: context.adapter || null,
      stateStore: context.stateStore || null,
      sync: context.sync || null,
      fetchImpl,
      navigateToView: context.navigateToView || null,
      showNotice: context.showNotice || null,
    },
  });

  await plannerApp.ready;

  return () => {
    plannerApp.destroy();
    mountNode.innerHTML = '';
  };
}

export default render;
