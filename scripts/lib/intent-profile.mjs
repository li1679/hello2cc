import { summarizePromptEnvelope } from './prompt-envelope.mjs';
import { buildIntentSignalProfile } from './intent-profile-analysis.mjs';
import { compact } from './intent-profile-shared.mjs';

export function analyzeIntentProfile(prompt, sessionContext = {}) {
  return buildIntentSignalProfile(prompt, sessionContext);
}

export function summarizeIntentForState(intent = {}) {
  return compact({
    analysis_mode: 'weak_request_shape_plus_prompt_envelope_host_boundaries_and_probe_shapes',
    analysis: compact({
      lexicon_guided: intent.lexiconGuided || undefined,
      host_boundary_guided: intent.hostBoundaryGuided || undefined,
      artifact_shape_guided: intent.artifactShapeGuided || undefined,
      planning_probe_shape: intent.planningProbeShape || undefined,
      capability_probe_shape: intent.capabilityProbeShape || undefined,
      prompt_shape: summarizePromptEnvelope(intent.promptEnvelope),
    }),
    question: intent.questionIntent || undefined,
    actions: compact({
      research: intent.research || undefined,
      implement: intent.implement || undefined,
      review: intent.review || undefined,
      explain: intent.explain || undefined,
      release: intent.release || undefined,
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
      handoff: intent.handoff || undefined,
      team_status: intent.teamStatus || undefined,
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
