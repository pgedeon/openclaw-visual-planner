/*
 * OpenClaw Visual Planner
 * planner-panels.js
 *
 * Panel manager v2: smooth collapse, hide with toast recovery,
 * double-click to collapse, proper toolbar coexistence, improved drag.
 */

(() => {
  const Planner = window.OpenClawPlanner = window.OpenClawPlanner || {};

  const PANEL_CONFIG = {
    toolbar:   { label: 'Toolbar',   canDrag: false },
    palette:   { label: 'Palette',   canDrag: true },
    inspector: { label: 'Inspector', canDrag: true },
    tray:      { label: 'Tray',      canDrag: false },
  };

  const STORAGE_KEY = 'planner-panel-state';

  function loadPanelState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  }

  function savePanelState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  function createPanelManager({ rootNode, store, canvas, notify }) {
    let panelState = loadPanelState();
    let cleanup = [];
    let dragSource = null;
    let dragOverTarget = null;
    let viewMenuOpen = false;

    const panelEls = {
      toolbar:   rootNode.querySelector('#planner-toolbar'),
      palette:   rootNode.querySelector('#planner-palette'),
      inspector: rootNode.querySelector('#planner-inspector'),
      tray:      rootNode.querySelector('#planner-tray'),
    };

    const workspace = rootNode.querySelector('.planner-workspace');
    const windowEl = rootNode.querySelector('.planner-window');

    // ========== Panel Wrappers ==========

    // Wrap each panel in a collapsible container that survives innerHTML re-renders
    function injectPanelWrappers() {
      for (const [id, el] of Object.entries(panelEls)) {
        if (!el) continue;

        // Skip if already wrapped
        if (el.parentElement?.classList.contains('planner-panel-wrap')) continue;

        const wrap = document.createElement('div');
        wrap.className = 'planner-panel-wrap';
        wrap.dataset.panelId = id;
        wrap.dataset.panelState = 'expanded'; // tracks current visual state

        const header = document.createElement('div');
        header.className = 'planner-panel-header';

        const config = PANEL_CONFIG[id];
        header.innerHTML = `
          ${config.canDrag ? '<span class="planner-panel-header__drag" title="Drag to reorder">⠿</span>' : ''}
          <span class="planner-panel-header__label">${config.label}</span>
          <span class="planner-panel-header__actions">
            <button class="planner-panel-header__btn planner-panel-header__btn--collapse" data-panel-collapse="${id}" title="Toggle panel (double-click header)">
              <svg class="planner-panel-header__chevron" width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="planner-panel-header__btn planner-panel-header__btn--hide" data-panel-hide="${id}" title="Hide panel">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              </svg>
            </button>
          </span>
        `;

        wrap.appendChild(header);
        wrap.appendChild(el);
        wrap._headerEl = header;

        // Insert wrapper where the panel was
        el.parentNode.insertBefore(wrap, el);

        // For workspace panels, keep them in the grid
        if (el.parentElement === workspace || wrap.parentElement === workspace) {
          workspace.appendChild(wrap);
        }
      }
    }

    // ========== Collapse ==========

    function setCollapsed(id, collapsed, { silent = false } = {}) {
      const wrap = rootNode.querySelector(`.planner-panel-wrap[data-panel-id="${id}"]`);
      if (!wrap) return;

      if (!panelState[id]) panelState[id] = {};
      panelState[id].collapsed = collapsed;
      savePanelState(panelState);

      wrap.classList.toggle('is-collapsed', collapsed);
      wrap.dataset.panelState = collapsed ? 'collapsed' : 'expanded';

      canvas?.requestRender?.('panel:collapse');
    }

    // ========== Hide / Show ==========

    function setPanelHidden(id, hidden, { silent = false } = {}) {
      const wrap = rootNode.querySelector(`.planner-panel-wrap[data-panel-id="${id}"]`);
      if (!wrap) return;

      if (!panelState[id]) panelState[id] = {};
      panelState[id].hidden = hidden;
      savePanelState(panelState);

      if (hidden) {
        wrap.classList.add('is-hiding');
        // Animate out, then set hidden
        setTimeout(() => {
          wrap.classList.remove('is-hiding');
          wrap.classList.add('is-hidden');
          updateLayout();
          canvas?.requestRender?.('panel:visibility');
        }, 180);

        if (!silent && notify) {
          notify(`${PANEL_CONFIG[id]?.label || id} hidden — click ⧉ to restore.`, 'info');
        }
      } else {
        wrap.classList.remove('is-hidden');
        wrap.classList.add('is-showing');
        // Animate in
        setTimeout(() => {
          wrap.classList.remove('is-showing');
        }, 200);
        updateLayout();
        canvas?.requestRender?.('panel:visibility');
      }
    }

    // ========== Layout ==========

    function updateLayout() {
      const paletteHidden = panelState.palette?.hidden;
      const inspectorHidden = panelState.inspector?.hidden;
      const paletteCollapsed = panelState.palette?.collapsed;
      const inspectorCollapsed = panelState.inspector?.collapsed;
      const trayHidden = panelState.tray?.hidden;
      const trayCollapsed = panelState.tray?.collapsed;

      // Sidebar columns
      let cols = '';
      if (paletteHidden && inspectorHidden) {
        cols = 'minmax(0, 1fr)';
      } else if (paletteHidden) {
        cols = inspectorCollapsed
          ? 'minmax(0, 1fr) 42px'
          : 'minmax(0, 1fr) minmax(320px, 360px)';
      } else if (inspectorHidden) {
        cols = paletteCollapsed
          ? '42px minmax(0, 1fr)'
          : 'minmax(280px, 320px) minmax(0, 1fr)';
      } else {
        cols = `${paletteCollapsed ? '42px' : 'minmax(280px, 320px)'} minmax(0, 1fr) ${inspectorCollapsed ? '42px' : 'minmax(320px, 360px)'}`;
      }

      workspace.style.gridTemplateColumns = cols;

      // Rows
      const rows = trayHidden
        ? 'auto minmax(0, 1fr)'
        : trayCollapsed
          ? 'auto minmax(0, 1fr) 42px'
          : 'auto minmax(0, 1fr) minmax(180px, 26vh)';

      windowEl.style.gridTemplateRows = rows;
    }

    // ========== View Menu ==========

    function injectViewMenu() {
      if (rootNode.querySelector('.planner-view-menu-btn')) return;

      const btn = document.createElement('button');
      btn.className = 'planner-view-menu-btn';
      btn.title = 'Toggle panels';
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
          <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
          <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
          <rect x="9" y="9" width="6" height="6" rx="currentColor" stroke="currentColor" stroke-width="1.3"/>
        </svg>
      `;

      const menu = document.createElement('div');
      menu.className = 'planner-view-menu';
      menu.innerHTML = `
        <div class="planner-view-menu__title">Panels</div>
        <div class="planner-view-menu__items"></div>
        <div class="planner-view-menu__footer">
          <button class="planner-view-menu__reset" data-action="reset-panels">Reset All</button>
        </div>
      `;

      rootNode.querySelector('.planner-app').appendChild(btn);
      rootNode.querySelector('.planner-app').appendChild(menu);

      const toggle = (e) => {
        e.stopPropagation();
        viewMenuOpen = !viewMenuOpen;
        menu.classList.toggle('is-open', viewMenuOpen);
        if (viewMenuOpen) refreshViewMenu();
      };

      const close = (e) => {
        if (viewMenuOpen && !menu.contains(e.target) && !btn.contains(e.target)) {
          viewMenuOpen = false;
          menu.classList.remove('is-open');
        }
      };

      btn.addEventListener('click', toggle);
      document.addEventListener('click', close);
      cleanup.push(() => {
        btn.removeEventListener('click', toggle);
        document.removeEventListener('click', close);
      });
    }

    function refreshViewMenu() {
      const container = rootNode.querySelector('.planner-view-menu__items');
      if (!container) return;

      container.innerHTML = Object.entries(PANEL_CONFIG)
        .map(([id, config]) => {
          const state = panelState[id] || {};
          const hidden = state.hidden;
          const collapsed = state.collapsed;
          return `<div class="planner-view-menu__item" data-panel-toggle="${id}">
            <label class="planner-view-menu__toggle">
              <input type="checkbox" ${hidden ? '' : 'checked'} />
              <span class="planner-view-menu__checkmark"></span>
            </label>
            <span class="planner-view-menu__item-label">${config.label}</span>
            <span class="planner-view-menu__item-status">
              ${hidden ? 'hidden' : collapsed ? 'collapsed' : 'visible'}
            </span>
          </div>`;
        }).join('');
    }

    // ========== Drag Reorder ==========

    function initDragReorder() {
      document.addEventListener('mousedown', (e) => {
        const handle = e.target.closest('.planner-panel-header__drag');
        if (!handle) return;

        const wrap = handle.closest('.planner-panel-wrap');
        if (!wrap) return;

        const id = wrap.dataset.panelId;
        if (!PANEL_CONFIG[id]?.canDrag) return;

        dragSource = id;
        wrap.classList.add('is-dragging');
        e.preventDefault();
      });

      document.addEventListener('mousemove', (e) => {
        if (!dragSource) return;

        for (const [id, el] of Object.entries(panelEls)) {
          if (!PANEL_CONFIG[id]?.canDrag || id === dragSource) continue;
          const wrap = el.closest('.planner-panel-wrap');
          if (!wrap || wrap.classList.contains('is-hidden')) continue;

          const rect = wrap.getBoundingClientRect();
          const over = e.clientX >= rect.left && e.clientX <= rect.right &&
                       e.clientY >= rect.top && e.clientY <= rect.bottom;

          wrap.classList.toggle('is-drag-over', over);
          if (over) dragOverTarget = id;
        }
      });

      document.addEventListener('mouseup', () => {
        if (!dragSource) return;

        for (const [, el] of Object.entries(panelEls)) {
          const wrap = el.closest('.planner-panel-wrap');
          if (wrap) wrap.classList.remove('is-dragging', 'is-drag-over');
        }

        if (dragOverTarget && dragOverTarget !== dragSource) {
          swapPanels(dragSource, dragOverTarget);
        }

        dragSource = null;
        dragOverTarget = null;
      });
    }

    function swapPanels(a, b) {
      const wrapA = panelEls[a]?.closest('.planner-panel-wrap');
      const wrapB = panelEls[b]?.closest('.planner-panel-wrap');
      if (!wrapA || !wrapB) return;

      if (wrapA.parentElement === workspace && wrapB.parentElement === workspace) {
        const marker = document.createElement('div');
        workspace.insertBefore(marker, wrapA);
        workspace.insertBefore(wrapA, wrapB);
        workspace.insertBefore(wrapB, marker);
        marker.remove();

        // Swap grid columns so palette stays left-styled
        // After DOM swap, first child = left sidebar
        updateLayout();
      }
    }

    // ========== Events ==========

    function handleInteraction(e) {
      // Collapse button
      const collapseBtn = e.target.closest('[data-panel-collapse]');
      if (collapseBtn) {
        const id = collapseBtn.dataset.panelCollapse;
        setCollapsed(id, !(panelState[id]?.collapsed));
        return;
      }

      // Hide button
      const hideBtn = e.target.closest('[data-panel-hide]');
      if (hideBtn) {
        setPanelHidden(hideBtn.dataset.panelHide, true);
        return;
      }

      // View menu toggle
      const toggleItem = e.target.closest('[data-panel-toggle]');
      if (toggleItem) {
        const id = toggleItem.dataset.panelToggle;
        const input = toggleItem.querySelector('input[type="checkbox"]');
        if (input) {
          input.checked = !input.checked;
          setPanelHidden(id, !input.checked, { silent: true });
        }
        return;
      }

      // Reset
      const resetBtn = e.target.closest('[data-action="reset-panels"]');
      if (resetBtn) {
        resetAllPanels();
        return;
      }
    }

    function handleDblClick(e) {
      const header = e.target.closest('.planner-panel-header');
      if (!header) return;
      const wrap = header.closest('.planner-panel-wrap');
      if (!wrap) return;
      const id = wrap.dataset.panelId;
      setCollapsed(id, !(panelState[id]?.collapsed));
    }

    function resetAllPanels() {
      panelState = {};
      savePanelState(panelState);

      for (const id of Object.keys(PANEL_CONFIG)) {
        const wrap = rootNode.querySelector(`.planner-panel-wrap[data-panel-id="${id}"]`);
        if (wrap) {
          wrap.classList.remove('is-collapsed', 'is-hidden', 'is-hiding', 'is-showing');
          wrap.dataset.panelState = 'expanded';
        }
      }

      updateLayout();
      if (viewMenuOpen) refreshViewMenu();
      canvas?.requestRender?.('panel:reset');
      if (notify) notify('All panels reset.', 'success');
    }

    // ========== Init ==========

    function init() {
      injectPanelWrappers();
      injectViewMenu();
      initDragReorder();

      // Restore state
      for (const [id, state] of Object.entries(panelState)) {
        if (state?.hidden) {
          const wrap = rootNode.querySelector(`.planner-panel-wrap[data-panel-id="${id}"]`);
          if (wrap) {
            wrap.classList.add('is-hidden');
          }
        }
        if (state?.collapsed) {
          const wrap = rootNode.querySelector(`.planner-panel-wrap[data-panel-id="${id}"]`);
          if (wrap) {
            wrap.classList.add('is-collapsed');
            wrap.dataset.panelState = 'collapsed';
          }
        }
      }

      updateLayout();

      rootNode.addEventListener('click', handleInteraction);
      rootNode.addEventListener('dblclick', handleDblClick);
      cleanup.push(() => {
        rootNode.removeEventListener('click', handleInteraction);
        rootNode.removeEventListener('dblclick', handleDblClick);
      });
    }

    init();

    return {
      destroy() {
        cleanup.forEach(fn => fn());
        cleanup = [];
      },
      setCollapsed,
      setPanelHidden,
      resetAllPanels,
      getState: () => ({ ...panelState }),
      updateLayout,
    };
  }

  Planner.createPanelManager = createPanelManager;
})();
