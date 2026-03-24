/*
 * OpenClaw Visual Planner
 * planner-palette.js
 *
 * The palette exposes node types, starter templates, and drag sources for the
 * canvas surface.
 */

(() => {
  const Planner = window.OpenClawPlanner = window.OpenClawPlanner || {};

  function createPlannerPalette({ mountNode, onCreateNode, onApplyTemplate }) {
    let searchTerm = '';
    let cleanup = [];

    const getVisibleGroups = () => {
      const query = searchTerm.trim().toLowerCase();
      const groups = Planner.getPlannerNodeCategoryGroups();
      if (!query) {
        return groups;
      }

      return groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => {
            const haystack = `${item.label} ${item.description} ${item.category}`.toLowerCase();
            return haystack.includes(query);
          }),
        }))
        .filter((group) => group.items.length > 0);
    };

    const render = () => {
      const groups = getVisibleGroups();
      const templates = Planner.getPlannerTemplates();

      mountNode.innerHTML = `
        <div class="planner-panel__header">
          <div>
            <div class="planner-panel__eyebrow">Palette</div>
            <h2 class="planner-panel__title">Node Library</h2>
          </div>
        </div>
        <div class="planner-palette__search">
          <input class="planner-input" type="search" placeholder="Filter node types" value="${Planner.escapeHtml(searchTerm)}" data-palette-search="true" />
        </div>
        <div class="planner-palette__templates">
          <div class="planner-section-title">Starter Templates</div>
          <div class="planner-template-pills">
            ${templates.map((template) => `
              <button type="button" class="planner-template-pill" data-template-id="${template.id}">
                <span class="planner-template-pill__title">${Planner.escapeHtml(template.label)}</span>
                <span class="planner-template-pill__meta">${Planner.escapeHtml(template.category)}</span>
              </button>
            `).join('')}
          </div>
        </div>
        <div class="planner-palette__library">
          ${groups.length ? groups.map((group) => `
            <section class="planner-palette__group">
              <div class="planner-section-title">${Planner.escapeHtml(group.category)}</div>
              <div class="planner-palette__cards">
                ${group.items.map((item) => `
                  <div class="planner-palette__card" draggable="true" data-node-type="${item.type}">
                    <div class="planner-palette__card-head">
                      <span class="planner-palette__badge" style="background:${item.accent}20;color:${item.accent}">${Planner.escapeHtml(item.code)}</span>
                      <button type="button" class="planner-icon-button" title="Add ${Planner.escapeHtml(item.label)}" data-add-node="${item.type}">＋</button>
                    </div>
                    <div class="planner-palette__card-title">${Planner.escapeHtml(item.label)}</div>
                    <div class="planner-palette__card-copy">${Planner.escapeHtml(item.description)}</div>
                  </div>
                `).join('')}
              </div>
            </section>
          `).join('') : '<div class="planner-empty-copy">No node types match that filter.</div>'}
        </div>
        <div class="planner-palette__hint">
          <div class="planner-section-title">Tips</div>
          <ul class="planner-list">
            <li>Drag a card onto the canvas to place a node.</li>
            <li>Click the plus button to add a node to the current viewport.</li>
            <li>Use templates to jump-start common flow shapes.</li>
          </ul>
        </div>
      `;
    };

    const handleInput = (event) => {
      const input = event.target.closest('[data-palette-search]');
      if (!input) {
        return;
      }
      searchTerm = input.value || '';
      render();
    };

    const handleClick = (event) => {
      const addButton = event.target.closest('[data-add-node]');
      if (addButton) {
        onCreateNode?.(addButton.dataset.addNode);
        return;
      }

      const templateButton = event.target.closest('[data-template-id]');
      if (templateButton) {
        onApplyTemplate?.(templateButton.dataset.templateId);
      }
    };

    const handleDragStart = (event) => {
      const card = event.target.closest('[data-node-type]');
      if (!card || !event.dataTransfer) {
        return;
      }

      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('application/x-openclaw-node', card.dataset.nodeType);
      event.dataTransfer.setData('text/plain', card.dataset.nodeType);
    };

    mountNode.addEventListener('input', handleInput);
    mountNode.addEventListener('click', handleClick);
    mountNode.addEventListener('dragstart', handleDragStart);
    cleanup.push(() => mountNode.removeEventListener('input', handleInput));
    cleanup.push(() => mountNode.removeEventListener('click', handleClick));
    cleanup.push(() => mountNode.removeEventListener('dragstart', handleDragStart));

    render();

    return {
      destroy() {
        cleanup.forEach((fn) => fn());
        cleanup = [];
      },
    };
  }

  Planner.createPlannerPalette = createPlannerPalette;
})();
