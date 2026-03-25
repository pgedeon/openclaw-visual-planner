/*
 * OpenClaw Visual Planner
 * planner-panels.js
 *
 * Panel manager: collapse, hide, show, and drag-reorder panels.
 * Panels: toolbar, palette, canvas, inspector, tray.
 */

(() => {
  const Planner = window.OpenClawPlanner = window.OpenClawPlanner || {};

  const DEFAULT_PANELS = ['toolbar', 'palette', 'canvas', 'inspector', 'tray'];
  const STORAGE_KEY = 'planner-panel-state';

  function loadPanelState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  function savePanelState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  function createPanelManager({ rootNode, store, canvas }) {
    let panelState = loadPanelState();
    let dragSource = null;
    let cleanup = [];

    const panels = {
      toolbar: rootNode.querySelector('#planner-toolbar'),
      palette: rootNode.querySelector('#planner-palette'),
      canvas: rootNode.querySelector('#planner-canvas'),
      inspector: rootNode.querySelector('#planner-inspector'),
      tray: rootNode.querySelector('#planner-tray'),
    };

    const workspace = rootNode.querySelector('.planner-workspace');
    const appEl = rootNode.querySelector('.planner-app');

    // --- Panel header with collapse toggle + drag handle + hide button ---
    function injectPanelHeaders() {
      for (const [id, el] of Object.entries(panels)) {
        if (id === 'canvas') continue; // canvas doesn't get a header

        const existing = el.querySelector('.planner-panel-header');
        if (existing) continue;

        const label = {
          toolbar: 'Toolbar',
          palette: 'Palette',
          inspector: 'Inspector',
          tray: 'Tray',
        }[id];

        const header = document.createElement('div');
        header.className = 'planner-panel-header';
        header.dataset.panelId = id;
        header.innerHTML = `
          <span class="planner-panel-header__drag" title="Drag to reorder">⠿</span>
          <span class="planner-panel-header__label">${label}</span>
          <span class="planner-panel-header__actions">
            <button class="planner-panel-header__btn" data-panel-collapse="${id}" title="Collapse panel">
              <span class="planner-panel-header__collapse-icon">▼</span>
            </button>
            <button class="planner-panel-header__btn" data-panel-hide="${id}" title="Hide panel">×</button>
          </span>
        `;

        el.prepend(header);
      }
    }

    // --- View menu (top-right button to show hidden panels) ---
    function injectViewMenu() {
      if (rootNode.querySelector('.planner-view-menu-btn')) return;

      const btn = document.createElement('button');
      btn.className = 'planner-view-menu-btn';
      btn.title = 'View panels';
      btn.innerHTML = '⧉';

      const menu = document.createElement('div');
      menu.className = 'planner-view-menu';
      menu.innerHTML = `
        <div class="planner-view-menu__title">Panels</div>
        <div class="planner-view-menu__items"></div>
      `;
      rootNode.querySelector('.planner-app').appendChild(btn);
      rootNode.querySelector('.planner-app').appendChild(menu);

      let open = false;
      const toggle = (e) => {
        e.stopPropagation();
        open = !open;
        menu.classList.toggle('is-open', open);
        if (open) refreshViewMenuItems();
      };

      const close = (e) => {
        if (open && !menu.contains(e.target) && e.target !== btn) {
          open = false;
          menu.classList.remove('is-open');
        }
      };

      btn.addEventListener('click', toggle);
      document.addEventListener('click', close);
      cleanup.push(() => {
        btn.removeEventListener('click', toggle);
        document.removeEventListener('click', close);
        btn.remove();
        menu.remove();
      });
    }

    function refreshViewMenuItems() {
      const container = rootNode.querySelector('.planner-view-menu__items');
      if (!container) return;

      container.innerHTML = DEFAULT_PANELS
        .filter(id => id !== 'canvas')
        .map(id => {
          const hidden = panelState[id]?.hidden;
          const label = id.charAt(0).toUpperCase() + id.slice(1);
          return `<label class="planner-view-menu__item">
            <input type="checkbox" ${hidden ? '' : 'checked'} data-panel-toggle="${id}" />
            <span>${label}</span>
          </label>`;
        }).join('');
    }

    // --- Collapse ---
    function setCollapsed(id, collapsed) {
      if (!panels[id] || id === 'canvas') return;
      if (!panelState[id]) panelState[id] = {};
      panelState[id].collapsed = collapsed;
      panels[id].classList.toggle('is-collapsed', collapsed);
      savePanelState(panelState);

      // Update collapse icon
      const icon = panels[id].querySelector('.planner-panel-header__collapse-icon');
      if (icon) icon.textContent = collapsed ? '▶' : '▼';

      // Trigger canvas reflow
      canvas?.requestRender?.('panel:collapse');
    }

    // --- Hide / Show ---
    function setPanelHidden(id, hidden) {
      if (!panels[id] || id === 'canvas') return;
      if (!panelState[id]) panelState[id] = {};
      panelState[id].hidden = hidden;
      panels[id].classList.toggle('is-hidden', hidden);
      savePanelState(panelState);

      // Update workspace grid when sidebar/tray hidden
      if (id === 'palette' || id === 'inspector') {
        updateWorkspaceGrid();
      }

      canvas?.requestRender?.('panel:visibility');
    }

    function updateWorkspaceGrid() {
      const paletteHidden = panelState.palette?.hidden;
      const inspectorHidden = panelState.inspector?.hidden;

      let cols = '';
      if (paletteHidden && inspectorHidden) {
        cols = 'minmax(0, 1fr)';
      } else if (paletteHidden) {
        cols = 'minmax(0, 1fr) minmax(320px, 360px)';
      } else if (inspectorHidden) {
        cols = 'minmax(280px, 320px) minmax(0, 1fr)';
      } else {
        cols = 'minmax(280px, 320px) minmax(0, 1fr) minmax(320px, 360px)';
      }

      workspace.style.gridTemplateColumns = cols;

      const trayHidden = panelState.tray?.hidden;
      const rows = trayHidden
        ? 'auto minmax(0, 1fr)'
        : 'auto minmax(0, 1fr) minmax(220px, 28vh)';
      appEl.querySelector('.planner-window').style.gridTemplateRows = rows;
    }

    // --- Drag reorder ---
    function initDragReorder() {
      for (const [id, el] of Object.entries(panels)) {
        if (id === 'canvas') continue;

        const dragHandle = el.querySelector('.planner-panel-header__drag');
        if (!dragHandle) continue;

        dragHandle.addEventListener('mousedown', (e) => {
          dragSource = id;
          el.classList.add('is-dragging');
          e.preventDefault();
        });
      }

      document.addEventListener('mouseup', handleDragEnd);
      document.addEventListener('mousemove', handleDragMove);
      cleanup.push(() => {
        document.removeEventListener('mouseup', handleDragEnd);
        document.removeEventListener('mousemove', handleDragMove);
      });
    }

    let dragOverTarget = null;

    function handleDragMove(e) {
      if (!dragSource) return;

      for (const [id, el] of Object.entries(panels)) {
        if (id === 'canvas' || id === dragSource) continue;
        const rect = el.getBoundingClientRect();
        const over = e.clientX >= rect.left && e.clientX <= rect.right &&
                     e.clientY >= rect.top && e.clientY <= rect.bottom;
        el.classList.toggle('is-drag-over', over);
        if (over) dragOverTarget = id;
      }
    }

    function handleDragEnd() {
      if (!dragSource) return;

      for (const [, el] of Object.entries(panels)) {
        el.classList.remove('is-dragging', 'is-drag-over');
      }

      if (dragOverTarget && dragOverTarget !== dragSource && dragOverTarget !== 'canvas') {
        swapPanels(dragSource, dragOverTarget);
      }

      dragSource = null;
      dragOverTarget = null;
    }

    function swapPanels(a, b) {
      // Swap sidebar panels (palette/inspector) in the workspace
      const elA = panels[a];
      const elB = panels[b];
      if (!elA || !elB) return;

      // Both must be in workspace
      if (elA.parentElement === workspace && elB.parentElement === workspace) {
        const marker = document.createElement('div');
        workspace.insertBefore(marker, elA);
        workspace.insertBefore(elA, elB);
        workspace.insertBefore(elB, marker);
        marker.remove();
      }

      if (!panelState.order) panelState.order = DEFAULT_PANELS.filter(id => id !== 'canvas');
      const order = panelState.order;
      const iA = order.indexOf(a);
      const iB = order.indexOf(b);
      if (iA >= 0 && iB >= 0) {
        [order[iA], order[iB]] = [order[iB], order[iA]];
      }
      savePanelState(panelState);
    }

    // --- Event delegation ---
    function handlePanelClick(e) {
      const collapseBtn = e.target.closest('[data-panel-collapse]');
      if (collapseBtn) {
        const id = collapseBtn.dataset.panelCollapse;
        const collapsed = panelState[id]?.collapsed;
        setCollapsed(id, !collapsed);
        return;
      }

      const hideBtn = e.target.closest('[data-panel-hide]');
      if (hideBtn) {
        const id = hideBtn.dataset.panelHide;
        setPanelHidden(id, true);
        return;
      }

      const toggleInput = e.target.closest('[data-panel-toggle]');
      if (toggleInput) {
        const id = toggleInput.dataset.panelToggle;
        const visible = toggleInput.checked;
        setPanelHidden(id, !visible);
        return;
      }
    }

    // --- Initialize ---
    function init() {
      injectPanelHeaders();
      injectViewMenu();
      initDragReorder();

      // Restore saved state
      for (const [id, state] of Object.entries(panelState)) {
        if (id === 'canvas') continue;
        if (state?.collapsed) setCollapsed(id, true);
        if (state?.hidden) setPanelHidden(id, true);
      }

      rootNode.addEventListener('click', handlePanelClick);
      cleanup.push(() => rootNode.removeEventListener('click', handlePanelClick));
    }

    init();

    return {
      destroy() {
        cleanup.forEach(fn => fn());
        cleanup = [];
      },
      setCollapsed,
      setPanelHidden,
      getState: () => panelState,
    };
  }

  Planner.createPanelManager = createPanelManager;
})();
