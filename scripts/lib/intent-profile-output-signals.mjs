import {
  buildTracks,
  isThinNeutralPrompt,
  wantsDiagramLayout,
  wantsTableLayout,
} from './intent-profile-shared.mjs';

/**
 * Derives collaboration and task-board semantics after routing intent is settled.
 */
export function deriveCollaborationSignals(seed, signals = {}) {
  const executionWorkflowRequest = Boolean(
    !signals.explain &&
    (signals.implement || signals.research || signals.review || seed.verify || seed.planRequest || signals.release || seed.parallelRequested || !seed.questionIntent)
  );
  const explicitTeamWorkflow = seed.collaborationMentioned && !seed.compare && !signals.capabilityQuery && executionWorkflowRequest;
  const proactiveTeamWorkflow =
    !explicitTeamWorkflow &&
    seed.coordinationHeavy &&
    (signals.research || signals.implement || seed.verify || signals.review);
  const tracks = buildTracks({
    frontend: seed.frontend,
    backend: seed.backend,
    research: signals.research,
    implement: signals.implement,
    review: signals.review,
    verify: seed.verify,
    release: signals.release,
  });
  const explicitParallelIntent = seed.parallelRequested || explicitTeamWorkflow;
  const teamStatus = Boolean(
    !seed.compare &&
    !signals.capabilityQuery &&
    !signals.currentInfo &&
    !signals.release &&
    !seed.planRequest &&
    !signals.review &&
    !seed.verify &&
    !seed.guideTopic &&
    !seed.explicitHostFeature &&
    !seed.skillSurface &&
    !seed.mcp &&
    (seed.handoff || Boolean(seed.activeTeam)) &&
    (seed.handoff || seed.collaborationMentioned || signals.workflowContinuation || (Boolean(seed.activeTeam) && isThinNeutralPrompt(seed.promptEnvelope))) &&
    (seed.questionIntent || signals.explain || signals.workflowContinuation)
  );

  return {
    explicitTeamWorkflow,
    proactiveTeamWorkflow,
    teamSemantics: explicitTeamWorkflow || proactiveTeamWorkflow,
    taskList: signals.plan || explicitTeamWorkflow || proactiveTeamWorkflow,
    codeResearch: signals.research && !signals.capabilityQuery && !signals.claudeGuide,
    skillWorkflowLike: seed.skillSurface || signals.workflowContinuation,
    tracks,
    swarm: explicitParallelIntent || (tracks.length > 1 && proactiveTeamWorkflow),
    teamStatus,
  };
}

/**
 * Derives presentation and tie-breaker signals once routing and collaboration are known.
 */
export function derivePresentationSignals(seed, signals = {}, collaborationSignals = {}) {
  const wantsTable = seed.compare || wantsTableLayout(seed.slots.text);
  const diagram = wantsDiagramLayout(seed.slots.text);
  const hostBoundaryGuided = signals.hostBoundaryCurrentInfo || signals.hostBoundaryRelease;

  return {
    wantsTable,
    diagram,
    wantsStructuredOutput: wantsTable || diagram || signals.review || seed.verify || signals.release || signals.plan || collaborationSignals.teamStatus || seed.handoff,
    boundedImplementation:
      signals.implement &&
      !seed.compare &&
      !signals.capabilityQuery &&
      !signals.research &&
      !signals.review &&
      !signals.release &&
      !collaborationSignals.swarm &&
      collaborationSignals.tracks.length <= 1 &&
      !seed.frontend &&
      !seed.backend,
    hostBoundaryGuided,
    artifactShapeGuided:
      signals.reviewFromPromptArtifacts ||
      signals.explainFromPromptArtifacts ||
      signals.researchFromPromptArtifacts ||
      signals.boundedArtifactExecution,
    toolSearchFirst: Boolean(
      signals.capabilityQuery &&
      seed.explicitHostFeature &&
      !signals.workflowContinuation &&
      !hostBoundaryGuided &&
      !seed.mcp &&
      !seed.skillSurface
    ),
  };
}
