import {
  buildIntentProfileSeed,
  deriveArtifactSignals,
  deriveCapabilitySignals,
  deriveCurrentInfoSignals,
  deriveExplainSignals,
  derivePlanningSignals,
  deriveWorkflowSignals,
} from './intent-profile-signal-derivation.mjs';
import {
  deriveCollaborationSignals,
  derivePresentationSignals,
} from './intent-profile-output-signals.mjs';

/**
 * Builds the host-guided intent profile that downstream routing and policy layers consume.
 */
export function buildIntentSignalProfile(prompt, sessionContext = {}) {
  const seed = buildIntentProfileSeed(prompt, sessionContext);
  const signals = buildDerivedIntentSignals(seed, sessionContext);
  return composeIntentSignalProfile(seed, signals);
}

function buildDerivedIntentSignals(seed, sessionContext) {
  const artifactSignals = deriveArtifactSignals(seed);
  const workflowSignals = deriveWorkflowSignals(seed, sessionContext, artifactSignals);
  const currentInfoSignals = deriveCurrentInfoSignals(seed, sessionContext, artifactSignals, workflowSignals);
  const explainSignals = deriveExplainSignals(seed, artifactSignals, workflowSignals, currentInfoSignals);
  const planningSignals = derivePlanningSignals(
    seed,
    artifactSignals,
    workflowSignals,
    currentInfoSignals,
    explainSignals,
  );
  const derivedSignals = {
    ...artifactSignals,
    ...workflowSignals,
    ...currentInfoSignals,
    ...explainSignals,
    ...planningSignals,
  };
  const capabilitySignals = deriveCapabilitySignals(seed, sessionContext, derivedSignals);
  const routedSignals = { ...derivedSignals, ...capabilitySignals };
  const collaborationSignals = deriveCollaborationSignals(seed, routedSignals);
  const presentationSignals = derivePresentationSignals(seed, routedSignals, collaborationSignals);

  return {
    artifactSignals,
    workflowSignals,
    currentInfoSignals,
    explainSignals,
    planningSignals,
    capabilitySignals,
    collaborationSignals,
    presentationSignals,
  };
}

function composeIntentSignalProfile(seed, signals) {
  const {
    artifactSignals,
    workflowSignals,
    currentInfoSignals,
    explainSignals,
    planningSignals,
    capabilitySignals,
    collaborationSignals,
    presentationSignals,
  } = signals;

  return {
    questionIntent: seed.questionIntent,
    compare: seed.compare,
    diagram: presentationSignals.diagram,
    wantsTable: presentationSignals.wantsTable,
    wantsStructuredOutput: presentationSignals.wantsStructuredOutput,
    research: artifactSignals.research,
    currentInfo: currentInfoSignals.currentInfo,
    swarm: collaborationSignals.swarm,
    parallelRequested: seed.parallelRequested,
    teamWorkflow: collaborationSignals.explicitTeamWorkflow,
    proactiveTeamWorkflow: collaborationSignals.proactiveTeamWorkflow,
    teamSemantics: collaborationSignals.teamSemantics,
    handoff: seed.handoff,
    teamStatus: collaborationSignals.teamStatus,
    verify: seed.verify,
    complex: planningSignals.complex,
    tools: seed.explicitHostFeature,
    claudeGuide: planningSignals.claudeGuide,
    plan: planningSignals.plan,
    taskList: collaborationSignals.taskList,
    implement: workflowSignals.implement,
    review: artifactSignals.review,
    explain: explainSignals.explain,
    release: workflowSignals.release,
    mcp: seed.mcp,
    frontend: seed.frontend,
    backend: seed.backend,
    decisionHeavy: planningSignals.decisionHeavy,
    capabilityQuery: capabilitySignals.capabilityQuery,
    capabilityProbeShape: capabilitySignals.capabilityProbeShape,
    codeResearch: collaborationSignals.codeResearch,
    skillSurface: seed.skillSurface,
    skillWorkflowLike: collaborationSignals.skillWorkflowLike,
    workflowContinuation: workflowSignals.workflowContinuation,
    tracks: collaborationSignals.tracks,
    boundedImplementation: presentationSignals.boundedImplementation,
    toolSearchFirst: presentationSignals.toolSearchFirst,
    wantsWorktree: seed.collaboration.has('worktree') || seed.topics.has('worktree'),
    webSearchRetry: currentInfoSignals.currentInfo && seed.structure.has('retry'),
    lexiconGuided: seed.lexiconGuided,
    hostBoundaryGuided: presentationSignals.hostBoundaryGuided,
    artifactShapeGuided: presentationSignals.artifactShapeGuided,
    planningProbeShape: planningSignals.planningProbeShape,
    promptEnvelope: seed.promptEnvelope,
  };
}
