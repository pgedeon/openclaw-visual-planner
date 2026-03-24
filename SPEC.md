# OpenClaw Visual Planner

## 1. Product Overview

The OpenClaw Visual Planner is a native windowed application for `openclaw-project-webos` that lets users visually design, simulate, execute, and monitor OpenClaw workflows from inside the desktop environment.

It is not just a whiteboard. It is a bridge between:

* visual planning
* agent orchestration
* task management
* workflow execution
* approvals and governance
* observability
* memory and artifact tracking

The planner should feel like a mix of:

* a structured whiteboard
* a workflow canvas
* a project planning surface
* a runtime control panel

Inside the WebOS, it should behave like a first-class desktop app alongside Tasks, Board, Timeline, Agents, Workflows, Approvals, Explorer, and Notepad.

---

## 2. Product Goals

### Primary Goals

1. Let users sketch workflows visually without needing to write JSON first.
2. Convert loose planning into structured pipeline definitions.
3. Connect planning directly to OpenClaw tasks, agents, tools, approvals, and runbooks.
4. Let users simulate and validate workflows before execution.
5. Let users run workflows and watch live state on the same canvas.
6. Fit naturally into the existing WebOS shell and backend architecture.

### Secondary Goals

1. Make workflow design easier for non-developers.
2. Improve discoverability of existing agents, models, tools, and runbooks.
3. Provide reusable templates for common operational patterns.
4. Create a visual source of truth for complex multi-agent systems.
5. Support future collaboration, versioning, and audit overlays.

---

## 3. Core Product Idea

The Visual Planner should support three modes of maturity on the same canvas:

### A. Sketch Mode

Used for early ideation.

* loose cards
* notes
* arrows
* groups
* swimlanes
* mind-map style expansion

### B. Workflow Mode

Used to formalize plans.

* typed nodes
* typed edges
* inputs and outputs
* branch conditions
* dependencies
* approval gates
* retry and failure policies

### C. Runtime Mode

Used to operate the workflow after launch.

* live execution state
* active node highlighting
* logs and errors
* timing overlays
* output artifacts
* human intervention controls

The same canvas evolves from concept to execution instead of forcing users to switch tools.

---

## 4. How It Fits Into openclaw-project-webos

The current WebOS already provides the right primitives for this application:

* desktop shell with draggable/resizable windows
* app registry for native window apps
* native views under `src/shell/native-views/`
* task and workflow APIs
* workflow dispatcher v2
* agent status endpoints
* audit and metrics surfaces
* explorer and notepad bridges
* offline state layer

This makes the Visual Planner a natural addition rather than a bolt-on.

### Natural Integration Points

* **Tasks app**: create tasks from nodes or import tasks into the planner
* **Board app**: convert visual branches into kanban work breakdowns
* **Timeline app**: derive schedule and dependencies from the workflow graph
* **Agents app**: assign nodes to agents and inspect per-agent queue health
* **Workflows app**: save, launch, duplicate, pause, and inspect planner-generated workflows
* **Approvals app**: represent approval nodes visually and route decisions back to canvas state
* **Artifacts app**: attach outputs to nodes and display produced files/results
* **Explorer app**: attach files, prompt packs, docs, and config assets to nodes
* **Notepad app**: edit prompts, node descriptions, JSON payloads, and runbook content
* **Audit app**: show change history and execution history for the plan
* **Memory app**: link past runs, prior designs, or distilled learnings to workflow nodes

---

## 5. User Stories

### Planner / Operator

* As a user, I want to sketch a workflow with boxes and arrows so I can think visually.
* As a user, I want to turn a sketch into a structured workflow without rewriting everything.
* As a user, I want to assign specific nodes to agents, tools, or runbooks.
* As a user, I want to simulate a workflow before launching it.
* As a user, I want to execute only part of a workflow.
* As a user, I want to see where a run failed directly on the graph.

### Developer / Builder

* As a developer, I want planner state saved in a stable schema so I can export/import it.
* As a developer, I want JSON definitions generated from the visual graph.
* As a developer, I want typed nodes and validation so broken graphs are caught early.
* As a developer, I want the planner to plug into existing backend endpoints and dispatchers.

### Team / Reviewer

* As a reviewer, I want to inspect what a workflow intends to do before approving it.
* As a reviewer, I want risky actions visually marked.
* As a reviewer, I want audit and execution history attached to the plan.

---

## 6. Feature Set

## 6.1 Canvas and Interaction Layer

### Infinite or Large Virtual Canvas

A pannable and zoomable planning surface.

**Why it matters**
Allows both high-level system maps and detailed subflows.

**Requirements**

* pan by drag / spacebar drag
* zoom controls and fit-to-view
* minimap
* grid and snap controls
* section frames and grouping containers

### Selection and Editing Model

Standard direct manipulation.

**Requirements**

* click and multi-select
* box select
* drag move
* resize certain node types
* duplicate, delete, copy, paste
* keyboard shortcuts
* undo/redo stack

### Auto Layout and Alignment

Helps prevent visual entropy.

**Requirements**

* snap-to-grid
* align/distribute tools
* tidy graph action
* optional auto-layout for selected subgraph

---

## 6.2 Node System

The planner needs a typed node system rather than generic boxes only.

### Node Types

#### 1. Note Node

Freeform planning text.

* used in sketch mode
* can later convert into typed nodes

#### 2. Task Node

Represents work items.

* title
* description
* assignee agent
* priority
* due/start dates
* status mapping to tasks API

#### 3. Agent Node

Represents an OpenClaw agent.

* agent name
* role
* preferred model
* queue state
* health signal

#### 4. Tool Node

Represents a callable tool or system capability.

* tool identifier
* expected input/output
* permissions/risk profile

#### 5. Workflow Step Node

Represents an execution step.

* step name
* step type
* prompt/payload/config
* timeout
* retry policy
* expected outputs

#### 6. Decision Node

Conditional branch.

* rules
* boolean expressions
* manual or automatic evaluation

#### 7. Approval Node

Human checkpoint.

* approver role
* escalation behavior
* timeout behavior
* rejection handling

#### 8. Runbook Node

Links to predefined operational procedure.

* runbook id
* category
* prerequisites
* expected outputs

#### 9. Artifact Node

Represents an output file, report, page, image, or result bundle.

* file path
* artifact type
* source node
* open in Explorer / Notepad

#### 10. Memory / Context Node

Represents reusable context.

* memory reference
* file reference
* project note
* attached document or prompt pack

#### 11. External API / Service Node

Represents outside integration.

* endpoint/system name
* authentication reference
* schema notes
* operational status

#### 12. Group / Subflow Node

Represents a reusable workflow cluster.

* nested graph
* collapse/expand
* exportable as template

---

## 6.3 Edge System

Edges should carry meaning.

### Edge Types

* dependency
* sequence
* conditional yes/no
* data flow
* approval path
* retry / fallback path
* escalation path

### Edge Metadata

* label
* condition
* payload mapping notes
* execution priority
* visual styling by type

---

## 6.4 Side Panels

### Left Panel: Palette

Contains:

* node library
* saved templates
* recent agents
* recent tools
* runbooks
* saved subflows

### Right Panel: Inspector

Contextual editor for the selected node or edge.

**Inspector fields may include**

* title and description
* type-specific settings
* input/output contract
* risk level
* linked files
* agent binding
* execution settings
* audit history
* runtime status

### Bottom Panel: Runtime / Validation Tray

Tabbed panel for:

* validation issues
* logs
* execution timeline
* warnings
* outputs
* audit events

---

## 6.5 Templates and Blueprints

The planner should ship with templates so users are not dropped into a void.

### Example Templates

* content pipeline
* bug triage and fix pipeline
* security audit loop
* approval-based publish workflow
* image generation workflow
* multi-agent research pipeline
* self-hosted ops incident response flow
* affiliate editorial workflow
* WordPress publish workflow

### Template Features

* create from template
* save current graph as template
* duplicate template
* export/import template JSON

---

## 6.6 Simulation and Validation

This is one of the most important differentiators.

### Graph Validation

Checks for:

* disconnected nodes
* missing required config
* cycles where not allowed
* missing approvers
* invalid agent references
* invalid tool references
* incompatible node connections

### Dry Run Simulation

Estimates:

* execution order
* unresolved dependencies
* likely risk points
* required human approvals
* possible dead ends
* missing resources

### Cost / Effort Estimation

Optional estimates for:

* number of agent steps
* estimated task count
* number of external operations
* approval burden
* complexity score

---

## 6.7 Runtime Mode

The graph becomes a live operational surface.

### Runtime State Overlays

* queued
* running
* waiting
* blocked
* failed
* completed
* skipped

### Node-Level Runtime Detail

For each active or finished node:

* start/end time
* responsible agent
* output preview
* log preview
* retry count
* error summary

### Controls

* run full plan
* run selected subgraph
* pause
* cancel
* retry failed node
* reroute node to another agent
* request human intervention

---

## 6.8 Task, Workflow, and Data Integration

### Task Integration

* create tasks from nodes
* sync task status back to node state
* import tasks into canvas
* convert grouped tasks into subflows

### Workflow Integration

* save graph as workflow definition
* open saved workflows in planner
* launch workflow run from planner
* inspect historical runs on the same graph

### File Integration

* attach files from Explorer
* open referenced files in Notepad
* store prompts/configs as linked files

### Agent Integration

* fetch live agents from status endpoint
* assign nodes to agents
* show heartbeat and queue state in inspector

### Approval Integration

* approval nodes surface through existing approval system
* approval result updates graph state

### Artifact Integration

* attach generated artifacts to nodes
* open artifacts in related apps

---

## 6.9 Versioning and History

### Plan Versioning

* save snapshots
* compare versions
* restore version
* label versions with notes

### Execution History

* map historical runs to the graph
* replay run path visually
* inspect failures by node

### Audit Integration

* who changed what
* when it changed
* who approved execution
* what ran and what failed

---

## 6.10 AI Assistance

The planner should use AI as structure acceleration, not decoration.

### AI Features

* convert notes to graph
* convert prompt or markdown outline to workflow
* suggest missing nodes
* suggest approvals or fallback paths
* summarize canvas
* convert graph to runbook draft
* convert graph to task breakdown

### Important Principle

AI output should always be editable and inspectable. Never hide generated structure inside black boxes.

---

## 7. Information Architecture

## Main Planner Areas

1. Toolbar
2. Canvas
3. Left palette
4. Right inspector
5. Bottom runtime tray
6. Top breadcrumb or planner title bar

### Toolbar Actions

* new plan
* open
* save
* duplicate
* export
* import
* validate
* simulate
* run
* pause
* fit view
* toggle minimap
* toggle grid

### Window Behavior

The planner should behave like a native WebOS app window:

* draggable/resizable
* taskbar presence
* reopen with last state
* deep-linkable state if desired

---

## 8. Technical Architecture for WebOS Integration

## 8.1 Frontend Placement

### New View Files

Recommended placement:

* `src/shell/native-views/planner-view.mjs`
* optional helpers under `src/shell/native-views/planner/`

Suggested helper modules:

* `planner-canvas.mjs`
* `planner-store.mjs`
* `planner-node-types.mjs`
* `planner-serializer.mjs`
* `planner-validator.mjs`
* `planner-runtime-overlay.mjs`
* `planner-templates.mjs`
* `planner-ai-tools.mjs`

### App Registry

Add a new app entry in `src/shell/app-registry.mjs`.

Suggested metadata:

* id: `planner`
* title: `Visual Planner`
* category: `Work` or `Integration`
* icon: workflow / graph / blueprint icon
* default window size: large

### State Management

Use the shell's view-state patterns plus a dedicated planner store.

Store layers:

* ephemeral UI state
* current graph state
* selection state
* runtime overlay state
* persisted graph metadata

Use IndexedDB or current offline layer for draft caching and recovery.

---

## 8.2 Backend Additions

### New API Endpoints

Recommended planner endpoints:

* `GET /api/planner/plans`
* `POST /api/planner/plans`
* `GET /api/planner/plans/:id`
* `PUT /api/planner/plans/:id`
* `DELETE /api/planner/plans/:id`
* `POST /api/planner/plans/:id/validate`
* `POST /api/planner/plans/:id/simulate`
* `POST /api/planner/plans/:id/run`
* `GET /api/planner/plans/:id/runs`
* `GET /api/planner/templates`
* `POST /api/planner/templates`

### Backend Responsibilities

* persist planner documents
* store version history
* validate graphs server-side
* translate graph to workflow definition
* dispatch runs via existing workflow engine
* attach audit records
* return runtime state for overlay rendering

---

## 8.3 Data Model

### Planner Plan Record

Fields:

* id
* title
* description
* project_id
* board_id optional
* graph_json
* workflow_json optional/generated
* mode
* created_at
* updated_at
* created_by
* version
* tags
* status

### Planner Node Record

Can be embedded inside `graph_json` initially.

Node fields:

* id
* type
* title
* position
* size optional
* config
* bindings
* style
* metadata

### Planner Edge Record

* id
* from_node_id
* to_node_id
* type
* label
* metadata

### Planner Version Record

* id
* plan_id
* version_number
* graph_json
* note
* created_at
* created_by

### Planner Run Mapping

* id
* plan_id
* workflow_run_id
* runtime_overlay_json
* started_at
* ended_at
* status

---

## 8.4 Serialization Strategy

The planner should maintain a canonical JSON representation.

### Recommended Layers

1. `graph_json` for visual representation and editing
2. `workflow_json` for execution-ready translation
3. runtime overlay structure for active/history runs

### Benefit

This separation allows visual freedom without forcing the execution engine to understand every UI detail.

---

## 9. MVP Definition

The MVP should be useful quickly and avoid overbuilding.

## MVP Scope

### Included

* native WebOS planner app window
* pannable/zoomable canvas
* node creation and editing
* typed nodes: note, task, agent, workflow step, decision, approval, artifact, subflow
* edge creation with labels
* save/load planner documents
* basic validation
* export to workflow JSON
* launch workflow from planner
* show runtime status overlays from workflow runs
* link nodes to tasks, agents, files, and runbooks
* template starter pack

### Deferred

* real-time multiplayer
* advanced AI generation
* full BPMN compatibility
* deep cost modeling
* comment threads
* branch merge tools
* rich replay animations

---

## 10. UX Principles

1. **Visual first, but structured**
 The graph must stay expressive without becoming a mess.

2. **Fast to sketch, easy to formalize**
 Notes and rough boxes should convert into typed workflow parts.

3. **Runtime should feel alive**
 When a plan is running, the canvas should become an operational map.

4. **Do not hide complexity in mystery boxes**
 Every node should remain inspectable and editable.

5. **Native to WebOS**
 The UI should match the shell, taskbar, panels, and window patterns already in the repo.

6. **Safe by design**
 Risky actions should be visible. Approvals should be explicit.

---

## 11. Delivery Plan

## Phase 0: Discovery and Design

### Goals

* audit existing workflow definitions and workflow-run structures
* inspect current shell view architecture and state patterns
* define canonical graph schema
* define node taxonomy and edge taxonomy
* design window layout and interaction model

### Deliverables

* product spec ✅ (this document)
* wireframes
* node/edge schema
* serialization plan
* technical design doc

### Estimated Tasks

1. review current workflow JSON and dispatcher expectations
2. review existing native view patterns
3. design plan schema
4. define validation rules
5. draft wireframes

---

## Phase 1: Shell Integration and Canvas Foundation

### Goals

* add planner app to registry and start menu
* render planner window
* implement base canvas and viewport controls
* implement core selection and node placement interactions

### Deliverables

* planner app shell integration
* canvas renderer
* zoom/pan/minimap
* toolbar
* local draft state

### Estimated Tasks

1. add `planner-view.mjs`
2. register app in app registry
3. build canvas scene model
4. implement pan/zoom/grid
5. implement node drag/drop
6. implement selection model
7. implement save draft to offline layer

---

## Phase 2: Graph Model and Inspector

### Goals

* implement typed nodes and edges
* build right-side inspector
* support editing config per node type
* implement serialization

### Deliverables

* node palette
* edge system
* inspector panels
* graph JSON schema
* import/export

### Estimated Tasks

1. create node type registry
2. add edge drawing and editing
3. build inspector forms
4. add keyboard shortcuts
5. add graph save/load
6. export graph JSON

---

## Phase 3: Backend Persistence and Validation

### Goals

* create planner storage layer
* add planner API routes
* implement server-side validation
* persist plan versions

### Deliverables

* planner API
* database migrations
* validation engine
* version history support

### Estimated Tasks

1. define SQL schema/migration
2. add CRUD endpoints
3. implement plan serializer/deserializer
4. implement validation rules
5. add version snapshot creation

---

## Phase 4: Workflow Translation and Execution

### Goals

* translate graph into execution-ready workflow definitions
* connect to workflow dispatcher v2
* allow run launch from planner
* display execution state on nodes

### Deliverables

* graph-to-workflow translator
* run launch controls
* runtime overlays
* run history binding

### Estimated Tasks

1. map nodes to workflow definition schema
2. map decision/approval semantics
3. map runbook integration
4. connect plan run endpoint to dispatcher
5. poll or subscribe to run status
6. render live node state overlays

---

## Phase 5: Deep App Integrations

### Goals

* connect tasks, agents, explorer, notepad, approvals, and artifacts
* support opening file links and task links directly from nodes

### Deliverables

* task sync
* file attachment support
* notepad handoff
* agent binding support
* approval node wiring
* artifact node previews

### Estimated Tasks

1. task-node sync with tasks API
2. explorer picker integration
3. notepad open/edit hooks
4. agent status binding
5. approval system bridge
6. artifact lookup and open actions

---

## Phase 6: Templates, Simulation, and Polish

### Goals

* add bundled templates
* add dry-run simulation
* improve layout tools and usability
* improve validation UX

### Deliverables

* template library
* simulation engine
* tidy graph actions
* enhanced empty states and onboarding

### Estimated Tasks

1. design starter templates
2. implement simulation report
3. add auto-layout utilities
4. add graph issue highlights
5. add contextual help

---

## Phase 7: Advanced Features

### Candidate Features

* AI-assisted graph generation
* collaboration and comments
* version diff visualization
* subflow marketplace
* replay mode
* metrics overlays
* reusable planner libraries

---

## 12. Suggested File and Module Plan

## Frontend

* `src/shell/native-views/planner-view.mjs`
* `src/shell/native-views/planner/planner-canvas.mjs`
* `src/shell/native-views/planner/planner-store.mjs`
* `src/shell/native-views/planner/planner-node-registry.mjs`
* `src/shell/native-views/planner/planner-inspector.mjs`
* `src/shell/native-views/planner/planner-toolbar.mjs`
* `src/shell/native-views/planner/planner-validator-ui.mjs`
* `src/shell/native-views/planner/planner-runtime-ui.mjs`
* `src/shell/native-views/planner/planner-templates.mjs`
* `src/styles/planner.css`

## Backend

* `planner-api.js`
* `lib/planner/plan-store.js`
* `lib/planner/plan-validator.js`
* `lib/planner/plan-simulator.js`
* `lib/planner/graph-to-workflow.js`
* `schema/migrations/<timestamp>-planner.sql`

---

## 13. Risks and Mitigations

### Risk: Canvas complexity balloons too fast

**Mitigation**
Keep MVP narrow. Prefer a small typed node set first.

### Risk: Graph model diverges from real workflow engine behavior

**Mitigation**
Define a strict translation layer early and validate against real workflow samples.

### Risk: Runtime overlay becomes noisy

**Mitigation**
Use visual hierarchy and progressive disclosure. Keep details in inspector and bottom tray.

### Risk: Whiteboard freedom undermines structured execution

**Mitigation**
Separate sketch mode from execution-ready workflow mode.

### Risk: Integration with existing APIs becomes brittle

**Mitigation**
Add planner-specific adapters rather than overloading every existing endpoint.

---

## 14. Testing Plan

### Unit Tests

* node registry behavior
* graph serialization
* validation rules
* workflow translation
* simulation logic

### Integration Tests

* planner CRUD APIs
* run launch flow
* task sync
* approval flow
* runtime overlay updates

### UI Tests

* node creation
* drag/drop
* zoom/pan
* save/load
* inspector editing
* run and monitor flow

### End-to-End Smoke Tests

* create plan from template
* validate
* launch
* observe runtime state
* open linked file in notepad
* inspect artifact node

---

## 15. Milestones

### Milestone 1

Planner window opens inside WebOS and supports a basic graph canvas.

### Milestone 2

Users can build graphs with typed nodes and save/load plans.

### Milestone 3

Graphs validate and export to workflow JSON.

### Milestone 4

Users can launch workflows from the planner and see runtime overlays.

### Milestone 5

Planner integrates deeply with tasks, agents, files, approvals, and artifacts.

### Milestone 6

Simulation, templates, and usability polish make it production-capable.

---

## 16. Recommended MVP Sequence for Fastest Real Value

If speed matters most, build in this order:

1. planner app shell integration
2. canvas with note/task/step/decision nodes
3. save/load plans
4. validation
5. graph-to-workflow export
6. run launch
7. runtime overlays
8. task/agent/file integration
9. approval and artifact integration
10. templates and simulation

This gets the planner useful early while preserving the path to a deeper operating surface later.

---

## 17. Long-Term Vision

The OpenClaw Visual Planner can become the control deck where users:

* design systems
* decompose work
* assign agents
* connect tools
* route approvals
* execute workflows
* monitor outcomes
* refine and reuse patterns

Done well, it becomes more than a planning tool. It becomes the visual nerve center for OpenClaw inside the WebOS.
