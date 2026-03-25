/*
 * OpenClaw Visual Planner
 * planner-panels.js
 *
 * Panel manager v3: CSS-only collapse/hide, no DOM wrapping.
 * Adds floating controls via event delegation, no element restructuring.
 */

(() => {
  const Planner = window.OpenClawPlanner = window.OpenClawPlanner || {};

  const PANEL_IDS = ['toolbar', 'palette', 'inspector', 'tray'];
  const PANEL_SELECTORS = {
    toolbar:   '#planner-toolbar',
    palette:   '#planner-palette',
    inspector: '#planner-inspector',
    tray:      '#planner-tray',
  };
  const PANEL_LABELS = {
    toolbar:   'Toolbar',
    palette:   'Palette',
    inspector: 'Inspector',
    tray:      'Tray',
  };

  const STORAGE_KEY = 'planner-panel-state';

  function load() {
    try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
  }

  function save(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
  }

  function createPanelManager({ rootNode, store, canvas, notify }) {
    let state = load();
    let cleanup = [];

    const getEl = (id) => (rootNode.querySelector || document.querySelector).call(rootNode, PANEL_SELECTORS[id]);
    const workspace = () => rootNode.querySelector('.planner-workspace') || document.querySelector('.planner-workspace');
    const windowEl = () => rootNode.querySelector('.planner-window') || document.querySelector('.planner-window');

    // --- Collapse ---
    function setCollapsed(id, collapsed) {
      if (!PANEL_IDS.includes(id)) return;
      const el = getEl(id);
      if (!el) return;
      if (!state[id]) state[id] = {};
      state[id].collapsed = collapsed;
      save(state);
      el.classList.toggle('planner-panel--collapsed', collapsed);
      el.classList.toggle('planner-panel--expanded', !collapsed);
      updateLayout();
      canvas?.requestRender?.('panel:collapse');
    }

    // --- Hide ---
    function setPanelHidden(id, hidden, { silent = false } = {}) {
      if (!PANEL_IDS.includes(id)) return;
      const el = getEl(id);
      if (!el) return;
      if (!state[id]) state[id] = {};
      state[id].hidden = hidden;
      save(state);
      el.classList.toggle('planner-panel--hidden', hidden);
      updateLayout();
      canvas?.requestRender?.('panel:visibility');
      if (hidden && !silent && notify) {
        notify(`${PANEL_LABELS[id]} hidden — use ⧉ menu to restore.`, 'info');
      }
    }

    // --- Layout grid adjustment ---
    function updateLayout() {
      const ws = workspace();
      const win = windowEl();
      if (!ws || !win) return;

      const ph = state.palette?.hidden;
      const ih = state.inspector?.hidden;
      const th = state.tray?.hidden;
      const pc = state.palette?.collapsed;
      const ic = state.inspector?.collapsed;
      const tc = state.tray?.collapsed;

      // Columns
      const pCol = ph ? '0px' : pc ? '40px' : 'minmax(260px, 300px)';
      const iCol = ih ? '0px' : ic ? '40px' : 'minmax(300px, 340px)';

      if (ph && ih) {
        ws.style.gridTemplateColumns = 'minmax(0, 1fr)';
      } else if (ph) {
        ws.style.gridTemplateColumns = `minmax(0, 1fr) ${iCol}`;
      } else if (ih) {
        ws.style.gridTemplateColumns = `${pCol} minmax(0, 1fr)`;
      } else {
        ws.style.gridTemplateColumns = `${pCol} minmax(0, 1fr) ${iCol}`;
      }

      // Rows
      if (th) {
        win.style.gridTemplateRows = 'auto 1fr';
      } else if (tc) {
        win.style.gridTemplateRows = 'auto 1fr 40px';
      } else {
        win.style.gridTemplateRows = 'auto 1fr minmax(160px, 24vh)';
      }
    }

    // --- Inject floating panel controls ---
    function injectControls() {
      // Remove old controls if any
      rootNode.querySelectorAll('.planner-panel-controls').forEach(el => el.remove());
      rootNode.querySelectorAll('.planner-view-menu-btn, .planner-view-menu').forEach(el => el.remove());

      for (const id of PANEL_IDS) {
        const el = getEl(id);
        if (!el) continue;

        const ctrl = document.createElement('div');
        ctrl.className = 'planner-panel-controls';
        ctrl.dataset.pcTarget = id;
        ctrl.innerHTML = `
          <button class="planner-panel-controls__btn" data-pc-collapse="${id}" title="Toggle ${PANEL_LABELS[id]}">
            <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
          </button>
          <button class="planner-panel-controls__btn planner-panel-controls__btn--hide" data-pc-hide="${id}" title="Hide ${PANEL_LABELS[id]}">
            <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 1L7 7M7 1L1 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" fill="none"/></svg>
          </button>
        `;

        // Toolbar re-renders innerHTML, so attach to parent instead
        if (id === 'toolbar' && el.parentElement) {
          ctrl.style.position = 'absolute';
          ctrl.style.top = '4px';
          ctrl.style.right = '4px';
          el.parentElement.appendChild(ctrl);
        } else {
          el.appendChild(ctrl);
        }
      }

      // View menu button
      const appEl = rootNode.querySelector('.planner-app') || document.querySelector('.planner-app');
      if (!appEl) return;

      const viewBtn = document.createElement('button');
      viewBtn.className = 'planner-view-menu-btn';
      viewBtn.title = 'Toggle panels';
      viewBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/>
        <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/>
        <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/>
        <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/>
      </svg>`;

      const viewMenu = document.createElement('div');
      viewMenu.className = 'planner-view-menu';
      appEl.appendChild(viewBtn);
      appEl.appendChild(viewMenu);

      let menuOpen = false;

      function refreshMenu() {
        viewMenu.innerHTML = PANEL_IDS.map(id => {
          const s = state[id] || {};
          const hidden = s.hidden;
          const collapsed = s.collapsed;
          return `<label class="planner-view-menu__row" data-pc-toggle="${id}">
            <span class="planner-view-menu__check ${hidden ? '' : 'is-checked'}">${hidden ? '' : '✓'}</span>
            <span class="planner-view-menu__label">${PANEL_LABELS[id]}</span>
            <span class="planner-view-menu__state">${hidden ? 'hidden' : collapsed ? 'collapsed' : ''}</span>
          </label>`;
        }).join('') + `<button class="planner-view-menu__reset" data-pc-reset="1">Reset All</button>`;
      }

      function toggleMenu(e) {
        e.stopPropagation();
        menuOpen = !menuOpen;
        viewMenu.classList.toggle('is-open', menuOpen);
        if (menuOpen) refreshMenu();
      }

      function closeMenu(e) {
        if (menuOpen && !viewMenu.contains(e.target) && !viewBtn.contains(e.target)) {
          menuOpen = false;
          viewMenu.classList.remove('is-open');
        }
      }

      viewBtn.addEventListener('click', toggleMenu);
      document.addEventListener('click', closeMenu);
      cleanup.push(() => {
        viewBtn.removeEventListener('click', toggleMenu);
        document.removeEventListener('click', closeMenu);
        viewBtn.remove();
        viewMenu.remove();
      });
    }

    // --- Events ---
    function handleClick(e) {
      const collapseBtn = e.target.closest('[data-pc-collapse]');
      if (collapseBtn) {
        const id = collapseBtn.dataset.pcCollapse;
        setCollapsed(id, !state[id]?.collapsed);
        return;
      }

      const hideBtn = e.target.closest('[data-pc-hide]');
      if (hideBtn) {
        setPanelHidden(hideBtn.dataset.pcHide, true);
        return;
      }

      const toggleRow = e.target.closest('[data-pc-toggle]');
      if (toggleRow) {
        const id = toggleRow.dataset.pcToggle;
        setPanelHidden(id, !state[id]?.hidden, { silent: true });
        if (menuOpen) {
          const menu = rootNode.querySelector('.planner-view-menu') || document.querySelector('.planner-view-menu');
          if (menu) menu.classList.add('is-open');
        }
        return;
      }

      const resetBtn = e.target.closest('[data-pc-reset]');
      if (resetBtn) {
        resetAll();
        return;
      }
    }

    function handleDblClick(e) {
      // Double-click on a panel header/label area to collapse
      const panel = e.target.closest('[id^="planner-toolbar"], [id^="planner-palette"], [id^="planner-inspector"], [id^="planner-tray"]');
      if (!panel) return;
      const id = panel.id.replace('planner-', '');
      if (PANEL_IDS.includes(id)) {
        setCollapsed(id, !state[id]?.collapsed);
      }
    }

    function resetAll() {
      state = {};
      save(state);
      PANEL_IDS.forEach(id => {
        const el = getEl(id);
        if (el) {
          el.classList.remove('planner-panel--collapsed', 'planner-panel--expanded', 'planner-panel--hidden');
        }
      });
      updateLayout();
      canvas?.requestRender?.('panel:reset');
      if (notify) notify('Panels reset to defaults.', 'success');
    }

    // --- Init ---
    function init() {
      injectControls();

      // Re-inject controls after panels re-render via innerHTML
      ['toolbar', 'inspector', 'tray'].forEach(id => {
        const el = getEl(id);
        if (!el) return;
        const obs = new MutationObserver(() => {
          const target = el.parentElement?.querySelector(`.planner-panel-controls[data-pc-target="${id}"]`)
            || el.querySelector(`.planner-panel-controls[data-pc-target="${id}"]`);
          if (!target) injectControls();
        });
        obs.observe(el, { childList: true });
        cleanup.push(() => obs.disconnect());
      });

      // Restore state
      for (const id of PANEL_IDS) {
        const el = getEl(id);
        if (!el) continue;
        const s = state[id] || {};
        if (s.collapsed) el.classList.add('planner-panel--collapsed');
        if (s.hidden) el.classList.add('planner-panel--hidden');
      }

      updateLayout();

      rootNode.addEventListener('click', handleClick);
      rootNode.addEventListener('dblclick', handleDblClick);
      cleanup.push(() => {
        rootNode.removeEventListener('click', handleClick);
        rootNode.removeEventListener('dblclick', handleDblClick);
        rootNode.querySelectorAll('.planner-panel-controls').forEach(el => el.remove());
      });
    }

    init();

    return {
      destroy() { cleanup.forEach(fn => fn()); cleanup = []; },
      setCollapsed,
      setPanelHidden,
      resetAll,
      getState: () => ({ ...state }),
      updateLayout,
    };
  }

  Planner.createPanelManager = createPanelManager;
})();
