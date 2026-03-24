# OpenClaw Visual Planner — WebOS Audit

This document captures the Phase 0 audit for integrating the Visual Planner into `openclaw-project-webos`.

It is based on the current shell, native view, styling, and workflow engine patterns in:

- `src/shell/app-registry.mjs`
- `src/shell/native-views/tasks-view.mjs`
- `src/shell/native-views/workflows-view.mjs`
- `src/shell/window-manager.mjs`
- `src/shell/native-views/helpers.mjs`
- `src/shell/view-state.mjs`
- `src/shell/view-adapter.mjs`
- `index.html`
- `src/styles/`
- `gateway-workflow-dispatcher.js`
- `schema/migrations/001_add_workflow_runs.sql`
- `schema/migrations/011_extend_workflow_business_context.sql`
- `workflow-runs-api.js`
- `WORKFLOW_INTEGRATION_GUIDE.md`

## 1. App Registration Pattern

The WebOS shell registers apps in `APP_REGISTRY`, which is an `Object.freeze([...])` array of plain objects.

### Required shape

Each native app entry uses this exact field pattern:

```js
{
  id: 'tasks',
  label: 'Tasks',
  icon: appIcon.clipboardCheck,
  url: '/?view=tasks',
  category: 'Work',
  defaultWidth: 1080,
  defaultHeight: 720,
  viewModule: './native-views/tasks-view.mjs',
}
```

### Important details

- The shell uses `label`, not `title`.
- `icon` is an inline SVG string produced by the local `iconTemplate()` helper.
- `viewModule` tells the shell to treat the app as a native view and load it into a shell window.
- `url` is still present even for native views.
- `category` is used by the Start menu grouping and app ordering.
- `defaultWidth` and `defaultHeight` drive the first-launch window bounds.
- `PINNED_APP_IDS` is a separate array if the app should appear pinned on the taskbar/start surface.

### Recommended planner entry

For later WebOS integration, the planner should follow the existing format exactly:

```js
{
  id: 'planner',
  label: 'Visual Planner',
  icon: appIcon.links,
  url: '/?view=planner',
  viewModule: './native-views/planner-view.mjs',
  category: 'Work',
  defaultWidth: 1280,
  defaultHeight: 820,
}
```

## 2. Native View Lifecycle and API

### Actual pattern in the current shell

The current native view system is function-based, not class-based.

The shell does this:

1. Creates a window in `window-manager.mjs`.
2. Detects `viewModule` and dynamically imports it.
3. Resolves a render function from:
   - `default`
   - an explicitly requested render function
   - a named export that looks like `renderXyz`
4. Calls that render function with a context object.
5. Stores the returned cleanup handler.

### Render signature to match

Current native views are built as:

```js
export async function renderSomethingView({
  mountNode,
  api,
  adapter,
  stateStore,
  state,
  sync,
  navigateToView,
}) {
  // build DOM
  // attach listeners
  // load data

  return () => {
    // cleanup listeners/subscriptions
  };
}

export default renderSomethingView;
```

### Cleanup contract

The shell accepts any of these cleanup return styles:

- a function
- an object with `destroy()`
- an object with `cleanup()`
- an object with `unmount()`

That means a future planner view can still internally use a `mount/render/destroy` object if desired, but the exported module should still resolve to a render function for the shell.

### Common implementation pattern inside views

The existing Tasks and Workflows views both follow the same structure:

1. Call `ensureNativeRoot(mountNode, 'view-specific-class')`
2. Clear `mountNode.innerHTML`
3. Create a single `root` element
4. Inject a small view-local `<style>` block
5. Build the layout using DOM creation plus `innerHTML`
6. Keep local mutable state inside the render closure
7. Track listeners in `cleanupFns`
8. Track sync subscriptions in `syncUnsubscribe`
9. Return a final cleanup function

### Event wiring pattern

Current native views do not use a framework event system.

Patterns used today:

- direct `addEventListener()` calls
- lightweight helper functions like `wireEvent(selector, event, handler)`
- event delegation for repeated row/button collections
- `cleanupFns.push(() => el.removeEventListener(...))`
- explicit subscription cleanup for realtime sync

### What the planner should mirror later

For WebOS integration, the planner should export a single async render function that:

- receives `mountNode`, `api`, `adapter`, `stateStore`, and `sync`
- mounts a self-contained planner root into `mountNode`
- unsubscribes from all listeners and timers on cleanup
- avoids global DOM assumptions outside its own subtree

## 3. Window Behavior

The window shell already handles the planner’s future desktop behavior.

### Built-in behavior from `window-manager.mjs`

- draggable windows with titlebar drag
- resizable windows with 8 resize handles
- minimize, restore, maximize, close
- z-index focus management
- open-state persistence in `localStorage`
- restore previous window positions on reload
- native-view loading into `.win11-window__native-content`

### Implications for planner integration

- The planner view does not need to implement desktop window chrome.
- The planner should assume it lives inside a resizable container.
- The planner should use `height: 100%` layouts and respond to resize naturally.
- The planner should avoid global `position: fixed` UI except for internal overlays inside its mount root.

## 4. State Management Approach

### Shell state model

`createViewState(initialState)` provides a lightweight shared state store with:

- `state` — a reactive proxy
- `getState(path?)`
- `setState(path, value)`
- `setState(patchObject)`
- `setState(updaterFn)`
- `subscribe(path, callback)`
- `onStateChange(callback)`
- `deleteState(path)`

### Key behavior

- State is cloned from the initial value.
- Dot-path access is supported, for example `project.id`.
- Plain objects are recursively merged.
- Arrays are treated as whole values, not deep-merged element-by-element.
- Direct assignment through the proxy also notifies subscribers.

### Shared shell conventions already in use

Helpers and adapters already expect these shared keys:

- `project.id`
- `project_id`
- `selection.workflowRunId`
- `workflow.selectedRunId`
- `verification.*`

### Practical recommendation for the planner

The Visual Planner should use two layers of state later:

1. **Shell-shared state** via `stateStore`
   - selected project
   - selected workflow run
   - cross-app navigation state

2. **Planner-local store**
   - graph nodes and edges
   - viewport state
   - selection state
   - runtime overlay state
   - undo/redo history
   - validation results

That matches the spec and the existing shell’s lightweight pattern.

## 5. View Adapter Pattern

`createViewAdapter()` wraps shell services and exposes convenience helpers to native views.

### Key adapter capabilities

- `state` and `stateStore`
- `fetchImpl`
- `getProjectId()`
- `resolveProjectId()`
- `navigateTo(viewId, payload)`
- `showNotice(message, type)`
- `showSessionDetails(runId)`
- `openVerificationModal(runId, taskTitle)`
- formatting helpers like `formatTimestamp()` and `formatRelativeTime()`

### Why this matters for the planner

The future planner native view should depend on `adapter` for shell integration instead of talking to unrelated global APIs directly.

Examples:

- open a workflow run in the Workflows app
- jump to a linked task
- open a verification or approval flow
- inherit project context

## 6. CSS and Styling Conventions

### Base styling system

The shell uses shared Win11-style design tokens from `src/styles/win11-theme.css`.

Important dark theme tokens include:

- `--win11-surface`
- `--win11-surface-solid`
- `--win11-surface-card`
- `--win11-border`
- `--win11-border-strong`
- `--win11-shadow`
- `--win11-shadow-active`
- `--win11-accent`
- `--win11-accent-light`
- `--win11-text`
- `--win11-text-secondary`
- `--win11-text-tertiary`

### Styling characteristics to match

- dark glassy surfaces
- subtle translucent panels
- very light borders
- small radii, mostly 8px to 12px
- restrained shadows
- accent-driven states instead of heavy saturation
- Inter/system font stack
- compact text sizing around `0.72rem` to `0.95rem`

### Current native-view CSS style pattern

Existing views commonly:

- rely on the global Win11 token palette
- use a view-local class prefix like `tv-` or `wfv-`
- inject a small `<style>` block inside the render function
- mix local class-based styles with layout-oriented inline styles

### Shell load order from `index.html`

The desktop shell loads:

1. Google Inter font
2. `win11-theme.css`
3. shell/window/taskbar/widget/start styles
4. `shell-main.mjs`

That means the planner should not redefine the theme from scratch when integrated; it should consume the same tokens.

## 7. Workflow Schema Used by the Dispatcher

### Important distinction

The dispatcher does **not** consume a planner graph directly.

It dispatches **workflow run records** from the database, and those runs are backed by **workflow templates**.

So the planner’s eventual export path needs to target the template/run model already used by the system.

### `workflow_runs` record shape

The dispatcher reads `workflow_runs` rows with the fields it needs to route work:

```js
{
  id,
  workflow_type,
  owner_agent_id,
  input_payload,
  current_step,
  status,
  gateway_session_id,
  gateway_session_active,
}
```

Relevant runtime fields on the table also include:

- `board_id`
- `task_id`
- `initiator`
- `started_at`
- `finished_at`
- `last_heartbeat_at`
- `retry_count`
- `max_retries`
- `last_error`
- `output_summary`
- `approval_state`
- `run_priority`

### Dispatcher routing expectations

The dispatcher currently:

- scans for runs in `queued`, `running`, or `in_progress`
- ignores runs already bound to an active gateway session
- determines the target agent from `workflow_type` or falls back to `owner_agent_id`
- writes a pickup payload containing:

```js
{
  run_id,
  workflow_type,
  agent_id,
  task,
  title,
  dispatched_at,
  input_payload,
}
```

### `workflow_templates` shape

The existing canonical workflow definition lives in `workflow_templates`.

Current normalized shape:

```js
{
  id,
  name,
  display_name,
  description,
  category,
  ui_category,
  default_owner_agent,
  department_id,
  service_id,
  steps,
  required_approvals,
  success_criteria,
  input_schema,
  artifact_contract,
  blocker_policy,
  escalation_policy,
  runbook_ref,
}
```

### Step schema

`steps` is stored as ordered JSON.

The seed data shows the expected structure:

```js
[
  {
    name: 'drafting',
    display_name: 'Content Drafting',
    required: true,
  }
]
```

When a run is created, the API turns this into `workflow_steps` rows by inserting `step.name` in order.

### Approval schema

`required_approvals` is a JSON array of string identifiers, for example:

```js
['draft_approval', 'publish_approval']
```

### Input schema

`input_schema` is JSON, usually shaped like:

```js
{
  fields: [
    { name: 'keyword', type: 'text' }
  ]
}
```

### Artifact contract schema

The most important artifact shape currently in use is:

```js
{
  expected_outputs: {
    live_url: {
      type: 'url',
      required: true,
      description: 'Published page URL'
    }
  }
}
```

The run API also contains a compatibility path that may infer counts from `expected_artifacts`, but `expected_outputs` is the stronger, current contract used for artifact extraction.

### Recommended planner export target

If the planner later exports a dispatcher-friendly workflow definition, it should be able to derive this shape:

```js
{
  name: 'visual-planner-template-id',
  display_name: 'Human Friendly Workflow Name',
  description: 'Workflow exported from the Visual Planner',
  category: 'general',
  ui_category: 'general',
  default_owner_agent: 'main',
  steps: [
    { name: 'step_1', display_name: 'Step 1', required: true }
  ],
  required_approvals: ['publish_approval'],
  success_criteria: {},
  input_schema: { fields: [] },
  artifact_contract: { expected_outputs: {} },
  blocker_policy: {},
  escalation_policy: {},
  runbook_ref: null,
}
```

## 8. Key Integration Points

### Frontend shell integration

The future planner integration points are straightforward:

1. Add a new planner app object to `APP_REGISTRY`
2. Add `planner-view.mjs` under `src/shell/native-views/`
3. Mount the planner into the shell-native content area
4. Consume Win11 design tokens already loaded by the shell

### Shared shell services

The future planner should hook into these existing services:

- `api.projects.*` for project context
- `api.workflows.*` for templates and runs
- `sync.subscribe(...)` for live runtime overlays
- `adapter.navigateTo(...)` for deep-linking to other apps
- `stateStore` for shared project/run selection

### Cross-app navigation opportunities

The planner can naturally open or link to:

- Tasks
- Workflows
- Agents
- Approvals
- Explorer
- Notepad
- Artifacts
- Runbooks

### Data translation boundary

The cleanest boundary is:

- **Planner graph schema** for canvas editing
- **Workflow template schema** for execution/export
- **Workflow run schema** for runtime monitoring

That translation boundary will keep the canvas expressive without forcing the editor model to mirror the runtime tables one-to-one.

## 9. Practical Build Guidance for Phase 1

Based on the audit, the standalone Phase 1 canvas app should be built so that it can later be wrapped by a native view render function with minimal changes.

Recommended constraints:

- keep a single planner root element
- keep all event listeners inside that root subtree
- keep planner state isolated from globals except for intentional persistence
- organize code around a central store and small UI modules
- keep CSS token-compatible with `--win11-*` variables
- preserve an eventual translation path from graph JSON to `workflow_templates` + `workflow_runs`

## 10. Summary

The current WebOS shell is already a good fit for the Visual Planner.

The exact implementation pattern to match later is:

- register a new app object in `APP_REGISTRY`
- export a single async render function from `planner-view.mjs`
- mount into `mountNode`
- use `adapter`, `stateStore`, `api`, and `sync`
- clean up listeners explicitly
- style against the shared Win11 dark token system
- translate planner graphs into the existing workflow template/run data model instead of inventing a parallel execution format
