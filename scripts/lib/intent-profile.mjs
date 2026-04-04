import { extractIntentSlots, promptMentionsAny } from './intent-slots.mjs';

const TABLE_OUTPUT_MARKERS = [
  'table',
  'matrix',
  '表格',
  '矩阵',
  '对照表',
];

const DIAGRAM_OUTPUT_MARKERS = [
  'chart',
  'diagram',
  'flow',
  '图',
  '流程图',
];

function appendTrack(tracks, value) {
  if (!tracks.includes(value)) {
    tracks.push(value);
  }
}

function compact(value) {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => compact(item))
      .filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, nestedValue]) => [key, compact(nestedValue)])
      .filter(([, nestedValue]) => nestedValue !== undefined);

    if (!entries.length) return undefined;
    return Object.fromEntries(entries);
  }

  if (value === '' || value === null || value === undefined || value === false) {
    return undefined;
  }

  return value;
}

function buildTracks({ frontend, backend, research, implement, review, verify }) {
  const tracks = [];

  if (frontend) appendTrack(tracks, 'frontend');
  if (backend) appendTrack(tracks, 'backend');
  if (research && (implement || review || verify) && !tracks.includes('research')) {
    tracks.unshift('research');
  }
  if (implement && (research || verify || review)) {
    appendTrack(tracks, 'implementation');
  }
  if (review && !verify) {
    appendTrack(tracks, 'review');
  }
  if (verify) {
    appendTrack(tracks, 'verification');
  }

  return tracks;
}

function knownSurfaceMentioned(text, sessionContext = {}) {
  return promptMentionsAny(text, [
    ...(Array.isArray(sessionContext?.loadedCommandNames) ? sessionContext.loadedCommandNames : []),
    ...(Array.isArray(sessionContext?.workflowNames) ? sessionContext.workflowNames : []),
    ...(Array.isArray(sessionContext?.surfacedSkillNames) ? sessionContext.surfacedSkillNames : []),
  ]);
}

function wantsTableLayout(text) {
  return promptMentionsAny(text, TABLE_OUTPUT_MARKERS);
}

function wantsDiagramLayout(text) {
  return promptMentionsAny(text, DIAGRAM_OUTPUT_MARKERS);
}

export function analyzeIntentProfile(prompt, sessionContext = {}) {
  const slots = extractIntentSlots(prompt);
  const actions = new Set(slots.actions);
  const topics = new Set(slots.topics);
  const collaboration = new Set(slots.collaboration);
  const structure = new Set(slots.structure);

  const questionIntent = slots.questionIntent;
  const research = actions.has('research');
  const implement = actions.has('implement');
  const verify = actions.has('verify');
  const review = actions.has('review');
  const planRequest = actions.has('plan');
  const compare = actions.has('compare');
  const currentInfo = actions.has('current_info');
  const frontend = topics.has('frontend');
  const backend = topics.has('backend');
  const mcp = topics.has('mcp');
  const skillSurface = topics.has('skills');
  const explicitHostFeature = topics.has('tools');
  const guideTopic =
    topics.has('claude_code') ||
    topics.has('hooks') ||
    topics.has('api_sdk') ||
    topics.has('settings');
  const workflowContinuation = structure.has('continuation') || knownSurfaceMentioned(slots.text, sessionContext);
  const collaborationMentioned = collaboration.has('team') || collaboration.has('task_board');
  const coordinationHeavy = collaboration.has('task_board') || collaboration.has('owner_handoff');
  const parallelRequested = collaboration.has('parallel');
  const architectureHeavy = structure.has('architecture');
  const decisionHeavy = questionIntent && (compare || structure.has('decision') || architectureHeavy);
  const plan = planRequest || (
    architectureHeavy &&
    !questionIntent &&
    !compare &&
    (research || implement || verify || review || structure.has('scope_heavy'))
  );
  const complex =
    structure.has('scope_heavy') ||
    architectureHeavy ||
    (frontend && backend && (research || implement || verify || review));
  const claudeGuide = guideTopic && (questionIntent || research || compare || planRequest);
  const capabilityQuery =
    (questionIntent && (guideTopic || explicitHostFeature || mcp || skillSurface || collaborationMentioned || collaboration.has('worktree'))) ||
    (explicitHostFeature && questionIntent);
  const explicitTeamWorkflow = collaborationMentioned && !compare && !capabilityQuery;
  const explicitParallelIntent = parallelRequested || explicitTeamWorkflow;
  const proactiveTeamWorkflow =
    !explicitTeamWorkflow &&
    coordinationHeavy &&
    (research || implement || verify || review);
  const teamSemantics = explicitTeamWorkflow || proactiveTeamWorkflow;
  const taskList = plan || explicitTeamWorkflow || proactiveTeamWorkflow;
  const codeResearch = research && !capabilityQuery && !claudeGuide;
  const skillWorkflowLike = skillSurface || workflowContinuation;
  const tracks = buildTracks({ frontend, backend, research, implement, review, verify });
  const swarm = explicitParallelIntent || (tracks.length > 1 && proactiveTeamWorkflow);
  const wantsTable = compare || wantsTableLayout(slots.text);
  const diagram = wantsDiagramLayout(slots.text);
  const wantsStructuredOutput = wantsTable || diagram;
  const boundedImplementation =
    implement &&
    !compare &&
    !capabilityQuery &&
    !research &&
    !review &&
    !swarm &&
    tracks.length <= 1 &&
    !frontend &&
    !backend;

  return {
    questionIntent,
    compare,
    diagram,
    wantsTable,
    wantsStructuredOutput,
    research,
    currentInfo,
    swarm,
    parallelRequested,
    teamWorkflow: explicitTeamWorkflow,
    proactiveTeamWorkflow,
    teamSemantics,
    verify,
    complex,
    tools: explicitHostFeature,
    claudeGuide,
    plan,
    taskList,
    implement,
    review,
    mcp,
    frontend,
    backend,
    decisionHeavy,
    capabilityQuery,
    codeResearch,
    skillSurface,
    skillWorkflowLike,
    workflowContinuation,
    tracks,
    boundedImplementation,
    toolSearchFirst: capabilityQuery,
    wantsWorktree: collaboration.has('worktree') || topics.has('worktree'),
    webSearchRetry: currentInfo && structure.has('retry'),
  };
}

export function summarizeIntentForState(intent = {}) {
  return compact({
    analysis_mode: 'weak_request_shape',
    question: intent.questionIntent || undefined,
    actions: compact({
      research: intent.research || undefined,
      implement: intent.implement || undefined,
      review: intent.review || undefined,
      verify: intent.verify || undefined,
      plan: intent.plan || undefined,
      compare: intent.compare || undefined,
      current_info: intent.currentInfo || undefined,
    }),
    collaboration: compact({
      parallel_requested: intent.parallelRequested || undefined,
      swarm: intent.swarm || undefined,
      team_workflow: intent.teamWorkflow || undefined,
      proactive_team: intent.proactiveTeamWorkflow || undefined,
      team_semantics: intent.teamSemantics || undefined,
      wants_worktree: intent.wantsWorktree || undefined,
      task_board: intent.taskList || undefined,
    }),
    routing: compact({
      claude_guide: intent.claudeGuide || undefined,
      capability_query: intent.capabilityQuery || undefined,
      workflow_continuation: intent.workflowContinuation || undefined,
      tool_search_first: intent.toolSearchFirst || undefined,
      bounded_implementation: intent.boundedImplementation || undefined,
      decision_heavy: intent.decisionHeavy || undefined,
      code_research: intent.codeResearch || undefined,
      complex: intent.complex || undefined,
      websearch_retry: intent.webSearchRetry || undefined,
    }),
    output: compact({
      compare: intent.compare || undefined,
      diagram: intent.diagram || undefined,
      table: intent.wantsTable || undefined,
      structured: intent.wantsStructuredOutput || undefined,
    }),
    topics: compact({
      frontend: intent.frontend || undefined,
      backend: intent.backend || undefined,
      mcp: intent.mcp || undefined,
      skill_surface: intent.skillSurface || undefined,
      host_capabilities: intent.tools || undefined,
    }),
    tracks: intent.tracks,
  });
}
