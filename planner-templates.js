/*
 * OpenClaw Visual Planner
 * planner-templates.js
 *
 * Built-in templates help users avoid a blank-canvas start and provide a
 * practical set of starter graphs aligned with the product spec.
 */

(() => {
  const Planner = window.OpenClawPlanner = window.OpenClawPlanner || {};

  const createTemplateState = ({ id, title, description, nodes, edges, viewport = {} }) => {
    const state = Planner.createDefaultPlannerState();
    state.document.metadata.title = title;
    state.document.metadata.description = description;
    state.document.metadata.templateId = id;
    state.document.graph.nodes = nodes;
    state.document.graph.edges = edges;
    Object.assign(state.viewport, viewport);
    state.meta.dirty = true;
    return state;
  };

  const buildLinearTemplate = ({ id, title, description, steps }) => {
    const nodes = steps.map((step, index) => Planner.createPlannerNodeRecord(step.type, {
      x: 140 + index * 300,
      y: step.y ?? 180,
      data: {
        title: step.title,
        description: step.description || '',
        ...step.data,
      },
    }));

    const edges = [];
    for (let index = 0; index < nodes.length - 1; index += 1) {
      edges.push(Planner.createPlannerEdgeRecord({
        sourceNodeId: nodes[index].id,
        sourcePortId: 'out',
        targetNodeId: nodes[index + 1].id,
        targetPortId: 'in',
        type: 'sequence',
      }));
    }

    return createTemplateState({ id, title, description, nodes, edges, viewport: { x: 100, y: 40, zoom: 0.9 } });
  };

  const templates = [
    {
      id: 'content-pipeline',
      label: 'Content Pipeline',
      category: 'Publishing',
      description: 'Research, draft, review, approve, and publish a content workflow.',
      create() {
        return buildLinearTemplate({
          id: 'content-pipeline',
          title: 'Content Pipeline',
          description: 'A reusable editorial workflow with approval and publishing stages.',
          steps: [
            { type: 'memory', title: 'Editorial Brief', data: { memoryReference: 'memory://briefs/editorial', projectNote: 'Goals, audience, sources, and constraints.' } },
            { type: 'workflow-step', title: 'Research', data: { stepName: 'research', stepType: 'prompt', timeoutMinutes: 45 } },
            { type: 'task', title: 'Draft Article', data: { assigneeAgent: 'affiliate-editorial', priority: 'high', status: 'ready' } },
            { type: 'approval', title: 'Editorial Approval', data: { approverRole: 'editor-in-chief' } },
            { type: 'external-api', title: 'Publish to CMS', data: { endpointName: 'WordPress REST API', authenticationRef: 'secrets://wordpress' } },
            { type: 'artifact', title: 'Published URL', data: { filePath: 'https://example.com/post', artifactType: 'url' } },
          ],
        });
      },
    },
    {
      id: 'bug-triage-fix',
      label: 'Bug Triage & Fix',
      category: 'Engineering',
      description: 'Triage, diagnose, implement, validate, and release a fix.',
      create() {
        return buildLinearTemplate({
          id: 'bug-triage-fix',
          title: 'Bug Triage & Fix',
          description: 'Engineering issue response with diagnostics, implementation, and QA.',
          steps: [
            { type: 'task', title: 'Capture Issue', data: { assigneeAgent: 'support-router', priority: 'medium', status: 'backlog' } },
            { type: 'workflow-step', title: 'Diagnose', data: { stepName: 'diagnose', stepType: 'prompt', timeoutMinutes: 30 } },
            { type: 'tool', title: 'Run Diagnostics', data: { toolIdentifier: 'terminal.run', riskProfile: 'medium' } },
            { type: 'task', title: 'Implement Fix', data: { assigneeAgent: 'coder', priority: 'high', status: 'ready' } },
            { type: 'workflow-step', title: 'Validate Fix', data: { stepName: 'validate_fix', stepType: 'tool', timeoutMinutes: 20 } },
            { type: 'approval', title: 'Release Approval', data: { approverRole: 'release-manager' } },
          ],
        });
      },
    },
    {
      id: 'approval-publish',
      label: 'Approval Publish Flow',
      category: 'Publishing',
      description: 'A branched publish flow with explicit approval outcomes.',
      create() {
        const draft = Planner.createPlannerNodeRecord('workflow-step', {
          x: 140,
          y: 180,
          data: { title: 'Prepare Release Draft', stepName: 'prepare_release', stepType: 'prompt', timeoutMinutes: 30 },
        });
        const approval = Planner.createPlannerNodeRecord('approval', {
          x: 470,
          y: 180,
          data: { title: 'Go-Live Approval', approverRole: 'publisher' },
        });
        const publish = Planner.createPlannerNodeRecord('external-api', {
          x: 820,
          y: 100,
          data: { title: 'Publish Live', endpointName: 'WordPress REST API', operationalStatus: 'healthy' },
        });
        const revise = Planner.createPlannerNodeRecord('task', {
          x: 820,
          y: 270,
          data: { title: 'Revise Draft', assigneeAgent: 'affiliate-editorial', priority: 'high', status: 'review' },
        });
        const artifact = Planner.createPlannerNodeRecord('artifact', {
          x: 1150,
          y: 100,
          data: { title: 'Published Page', filePath: 'https://example.com/release', artifactType: 'url' },
        });

        const edges = [
          Planner.createPlannerEdgeRecord({ sourceNodeId: draft.id, sourcePortId: 'out', targetNodeId: approval.id, targetPortId: 'in', type: 'sequence' }),
          Planner.createPlannerEdgeRecord({ sourceNodeId: approval.id, sourcePortId: 'approved', targetNodeId: publish.id, targetPortId: 'in', type: 'approval-path', label: 'Approved' }),
          Planner.createPlannerEdgeRecord({ sourceNodeId: approval.id, sourcePortId: 'rejected', targetNodeId: revise.id, targetPortId: 'in', type: 'fallback', label: 'Needs changes' }),
          Planner.createPlannerEdgeRecord({ sourceNodeId: publish.id, sourcePortId: 'out', targetNodeId: artifact.id, targetPortId: 'data-in', type: 'data-flow' }),
        ];

        return createTemplateState({
          id: 'approval-publish',
          title: 'Approval Publish Flow',
          description: 'A publish flow with explicit happy path and revision loop.',
          nodes: [draft, approval, publish, revise, artifact],
          edges,
          viewport: { x: 80, y: 40, zoom: 0.85 },
        });
      },
    },
    {
      id: 'image-generation',
      label: 'Image Generation Workflow',
      category: 'Media',
      description: 'Prompt creation, image generation, quality review, and delivery.',
      create() {
        return buildLinearTemplate({
          id: 'image-generation',
          title: 'Image Generation Workflow',
          description: 'Prompt-to-output image pipeline for editorial or design teams.',
          steps: [
            { type: 'memory', title: 'Creative Brief', data: { memoryReference: 'memory://creative-brief' } },
            { type: 'workflow-step', title: 'Create Prompt Pack', data: { stepName: 'prompt_creation', stepType: 'prompt', timeoutMinutes: 20 } },
            { type: 'tool', title: 'Generate Images', data: { toolIdentifier: 'comfyui.generate', riskProfile: 'low' } },
            { type: 'approval', title: 'Creative QA', data: { approverRole: 'design-reviewer' } },
            { type: 'artifact', title: 'Deliver Assets', data: { filePath: '/artifacts/images/', artifactType: 'bundle' } },
          ],
        });
      },
    },
    {
      id: 'multi-agent-research',
      label: 'Multi-Agent Research',
      category: 'Research',
      description: 'Split research across agents, merge findings, and produce a brief.',
      create() {
        const coordinator = Planner.createPlannerNodeRecord('agent', {
          x: 140,
          y: 180,
          data: { title: 'Coordinator', agentName: 'main', role: 'Orchestration lead' },
        });
        const market = Planner.createPlannerNodeRecord('agent', {
          x: 460,
          y: 90,
          data: { title: 'Market Analyst', agentName: 'market-research', role: 'Competitive intel' },
        });
        const technical = Planner.createPlannerNodeRecord('agent', {
          x: 460,
          y: 270,
          data: { title: 'Technical Analyst', agentName: 'technical-research', role: 'Technical validation' },
        });
        const merge = Planner.createPlannerNodeRecord('workflow-step', {
          x: 800,
          y: 180,
          data: { title: 'Synthesize Findings', stepName: 'synthesize', stepType: 'prompt', timeoutMinutes: 25 },
        });
        const brief = Planner.createPlannerNodeRecord('artifact', {
          x: 1130,
          y: 180,
          data: { title: 'Research Brief', filePath: '/artifacts/research/brief.md', artifactType: 'document' },
        });

        return createTemplateState({
          id: 'multi-agent-research',
          title: 'Multi-Agent Research',
          description: 'A fan-out research graph that converges into a final brief.',
          nodes: [coordinator, market, technical, merge, brief],
          edges: [
            Planner.createPlannerEdgeRecord({ sourceNodeId: coordinator.id, sourcePortId: 'out', targetNodeId: market.id, targetPortId: 'in', type: 'sequence' }),
            Planner.createPlannerEdgeRecord({ sourceNodeId: coordinator.id, sourcePortId: 'out', targetNodeId: technical.id, targetPortId: 'in', type: 'sequence' }),
            Planner.createPlannerEdgeRecord({ sourceNodeId: market.id, sourcePortId: 'out', targetNodeId: merge.id, targetPortId: 'in', type: 'data-flow', label: 'Market findings' }),
            Planner.createPlannerEdgeRecord({ sourceNodeId: technical.id, sourcePortId: 'out', targetNodeId: merge.id, targetPortId: 'data-in', type: 'data-flow', label: 'Technical findings' }),
            Planner.createPlannerEdgeRecord({ sourceNodeId: merge.id, sourcePortId: 'data', targetNodeId: brief.id, targetPortId: 'data-in', type: 'data-flow' }),
          ],
          viewport: { x: 90, y: 50, zoom: 0.86 },
        });
      },
    },
    {
      id: 'incident-response',
      label: 'Incident Response',
      category: 'Operations',
      description: 'Triage, decisioning, remediation, and post-incident follow-up.',
      create() {
        const intake = Planner.createPlannerNodeRecord('task', {
          x: 140,
          y: 180,
          data: { title: 'Incident Intake', assigneeAgent: 'main', priority: 'critical', status: 'in_progress' },
        });
        const triage = Planner.createPlannerNodeRecord('workflow-step', {
          x: 460,
          y: 180,
          data: { title: 'Triage', stepName: 'triage', stepType: 'prompt', timeoutMinutes: 10 },
        });
        const decision = Planner.createPlannerNodeRecord('decision', {
          x: 790,
          y: 180,
          data: { title: 'Sev-1?', ruleExpression: 'severity === "sev1"', evaluationMode: 'automatic' },
        });
        const escalated = Planner.createPlannerNodeRecord('approval', {
          x: 1120,
          y: 90,
          data: { title: 'Executive Escalation', approverRole: 'incident-commander' },
        });
        const remediation = Planner.createPlannerNodeRecord('runbook', {
          x: 1120,
          y: 270,
          data: { title: 'Runbook Remediation', runbookId: 'ops-incident-remediation', category: 'Incident' },
        });

        return createTemplateState({
          id: 'incident-response',
          title: 'Incident Response',
          description: 'An operations-ready flow with branching severity handling.',
          nodes: [intake, triage, decision, escalated, remediation],
          edges: [
            Planner.createPlannerEdgeRecord({ sourceNodeId: intake.id, sourcePortId: 'out', targetNodeId: triage.id, targetPortId: 'in', type: 'sequence' }),
            Planner.createPlannerEdgeRecord({ sourceNodeId: triage.id, sourcePortId: 'out', targetNodeId: decision.id, targetPortId: 'in', type: 'sequence' }),
            Planner.createPlannerEdgeRecord({ sourceNodeId: decision.id, sourcePortId: 'yes', targetNodeId: escalated.id, targetPortId: 'in', type: 'conditional-yes', label: 'Sev-1' }),
            Planner.createPlannerEdgeRecord({ sourceNodeId: decision.id, sourcePortId: 'no', targetNodeId: remediation.id, targetPortId: 'in', type: 'conditional-no', label: 'Standard path' }),
          ],
          viewport: { x: 80, y: 60, zoom: 0.85 },
        });
      },
    },
  ];

  const templateMap = new Map(templates.map((template) => [template.id, template]));

  const getTemplates = () => templates.slice();
  const getTemplateById = (templateId) => templateMap.get(templateId) || null;

  const instantiateTemplate = (templateId) => {
    const template = getTemplateById(templateId);
    return template ? template.create() : null;
  };

  Planner.PLANNER_TEMPLATES = templates;
  Planner.getPlannerTemplates = getTemplates;
  Planner.getPlannerTemplateById = getTemplateById;
  Planner.instantiatePlannerTemplate = instantiateTemplate;
})();
