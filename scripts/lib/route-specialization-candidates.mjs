import { resolveWebSearchGuidanceState } from './api-topology.mjs';
import { describeRouteSpecialization } from './specialization-selection.mjs';
import {
  finalizeCandidates,
  hasItems,
  trimmed,
  upsertCandidate,
} from './specialization-candidate-shared.mjs';

const SEMANTIC_ROUTE_FAMILY_IDS = [
  'compare',
  'planning',
  'capability',
  'research',
  'explanation',
  'review',
  'verification',
  'release',
];

function recommendedShapeForCandidate(id = '') {
  const candidateId = trimmed(id).toLowerCase();

  if (candidateId === 'compare') return 'one_sentence_judgment_then_markdown_table_then_recommendation';
  if (candidateId === 'current_info') return 'current_info_status_then_sources_then_uncertainty';
  if (candidateId === 'planning') return 'ordered_plan_with_validation_and_open_questions';
  if (candidateId === 'capability') return 'direct_answer_then_visible_capabilities_then_gap_or_next_step';
  if (candidateId === 'team_approval') return 'approval_status_then_compact_table_then_response_action';
  if (candidateId === 'handoff') return 'handoff_status_then_compact_table_then_reassignment_or_follow_up';
  if (candidateId === 'team_status') return 'team_status_then_compact_table_then_next_actions';
  if (candidateId === 'release_follow_up') return 'release_follow_up_status_then_checklist_then_open_items';
  if (candidateId === 'release') return 'release_status_then_checklist_then_notes';
  if (candidateId === 'review_verification') return 'findings_first_then_verification_evidence_then_risk_call';
  if (candidateId === 'review') return 'findings_first_then_open_questions_then_change_summary';
  if (candidateId === 'verification') return 'verification_status_then_evidence_then_gaps';
  if (candidateId === 'blocked_verification') return 'verification_blocker_status_then_evidence_then_unblock_path';
  if (candidateId === 'research') return 'direct_findings_with_paths_and_unknowns';
  if (candidateId === 'explanation') return 'direct_explanation_then_key_points_and_references';
  return '';
}

function genericSemanticCandidate(id = '') {
  const candidateId = trimmed(id).toLowerCase();
  const shape = recommendedShapeForCandidate(candidateId);

  if (candidateId === 'compare') {
    return {
      reasons: ['hello2cc exposed compare as a semantic route family'],
      use_when: 'the user is comparing options, choosing between paths, or asking for tradeoffs',
      avoid_when: 'a stronger continuity or protocol path already owns the next step',
      recommended_shape: shape,
    };
  }

  if (candidateId === 'planning') {
    return {
      reasons: ['hello2cc exposed planning as a semantic route family'],
      use_when: 'the user explicitly wants sequencing, phases, constraints, validation order, or an execution plan before coding',
      avoid_when: 'the next slice is already narrow enough to execute directly, or a read-only Plan/Explore helper can answer without entering session plan mode',
      recommended_shape: shape,
    };
  }

  if (candidateId === 'capability') {
    return {
      reasons: ['hello2cc exposed capability as a semantic route family'],
      use_when: 'the user is asking what Claude Code, tools, skills, workflows, MCP, or permissions can do here',
      avoid_when: 'the question is really about repo implementation rather than host capability surface',
      recommended_shape: shape,
    };
  }

  if (candidateId === 'research') {
    return {
      reasons: ['hello2cc exposed research as a semantic route family'],
      use_when: 'the user wants investigation, code reading, root-cause analysis, or path/symbol evidence before a conclusion',
      avoid_when: 'the slice is already a direct implementation or direct explanation task',
      recommended_shape: shape,
    };
  }

  if (candidateId === 'explanation') {
    return {
      reasons: ['hello2cc exposed explanation as a semantic route family'],
      use_when: 'the user wants a direct explanation, mechanism, or why/how answer anchored to visible context',
      avoid_when: 'the task is primarily execution, review, or verification',
      recommended_shape: shape,
    };
  }

  if (candidateId === 'review') {
    return {
      reasons: ['hello2cc exposed review as a semantic route family'],
      use_when: 'the user is asking whether a change, diff, or implementation has bugs, risks, or regressions',
      avoid_when: 'the user is asking to implement rather than inspect findings first',
      recommended_shape: shape,
    };
  }

  if (candidateId === 'verification') {
    return {
      reasons: ['hello2cc exposed verification as a semantic route family'],
      use_when: 'the user wants tests, validation evidence, pass/fail status, or explicit not-run boundaries',
      avoid_when: 'no validation evidence is needed for the current reply',
      recommended_shape: shape,
    };
  }

  if (candidateId === 'release') {
    return {
      reasons: ['hello2cc exposed release as a semantic route family'],
      use_when: 'the user is asking to version, tag, publish, or complete a release path',
      avoid_when: 'a stronger release-follow-up continuity candidate already owns the path',
      recommended_shape: shape,
    };
  }

  return {};
}

function seedSemanticRouteFamilies(entries, sessionContext = {}) {
  for (const id of SEMANTIC_ROUTE_FAMILY_IDS) {
    upsertCandidate(entries, id, genericSemanticCandidate(id));
  }

  if (sessionContext?.webSearchAvailable) {
    upsertCandidate(entries, 'current_info', {
      reasons: ['hello2cc exposed current-info as a semantic route family because WebSearch is visible'],
      use_when: 'the user needs current information that must be grounded in visible search surfaces',
      avoid_when: 'stable local repo state already answers the question',
      recommended_shape: recommendedShapeForCandidate('current_info'),
    });
  }
}

function hasLoadedReleaseWorkflow(sessionContext = {}) {
  return [
    ...(Array.isArray(sessionContext?.workflowNames) ? sessionContext.workflowNames : []),
    ...(Array.isArray(sessionContext?.loadedCommandNames) ? sessionContext.loadedCommandNames : []),
  ].some((name) => trimmed(name).toLowerCase() === 'release');
}

function routeTeamContinuity(continuity = {}) {
  return continuity?.team && typeof continuity.team === 'object'
    ? continuity.team
    : {};
}

export function buildRouteSpecializationCandidates(signals = {}, sessionContext = {}, continuity = {}) {
  const selection = describeRouteSpecialization(signals, sessionContext, continuity);
  const selected = selection.specialization;
  const teamContinuity = routeTeamContinuity(continuity);
  const entries = new Map();
  seedSemanticRouteFamilies(entries, sessionContext);
  const websearchState = signals?.currentInfo
    ? resolveWebSearchGuidanceState(sessionContext, { retryRequested: signals?.webSearchRetry })
    : null;

  if (signals?.compare) {
    upsertCandidate(entries, 'compare', {
      reasons: ['request asks for comparison / choice'],
      use_when: 'need a direct judgment plus compact comparison table',
      avoid_when: 'the work is already in tracked execution or team protocol',
    });
  }

  if (signals?.currentInfo) {
    upsertCandidate(entries, 'current_info', {
      reasons: [
        signals?.hostBoundaryGuided ? 'host surfaced a current-info boundary' : 'request shape implies current information',
        sessionContext?.webSearchAvailable && !signals?.hostBoundaryGuided ? 'visible WebSearch surface exists' : '',
        websearchState ? `websearch:${websearchState.mode}` : '',
      ],
      use_when: 'current information should be grounded in WebSearch or explicit search boundary',
      avoid_when: 'the answer can be given entirely from stable local repo state',
    });
  }

  if (signals?.plan || continuity?.plan_mode_entered || continuity?.plan_mode_exited) {
    upsertCandidate(entries, 'planning', {
      reasons: [
        signals?.planningProbeShape ? 'planning probe shape asks for sequencing and validation' : '',
        signals?.plan && !signals?.planningProbeShape ? 'request shape implies planning' : '',
        continuity?.plan_mode_entered ? 'plan mode is active' : '',
        continuity?.plan_mode_exited ? 'session already has approved-plan continuity' : '',
      ],
      use_when: 'constraints, blockers, ordering, or plan approval continuity genuinely need to be made explicit before implementation',
      avoid_when: 'the slice is already narrow and clear enough to execute directly, or a read-only helper can gather context without opening session plan mode',
    });
  }

  if (signals?.capabilityQuery || signals?.capabilityProbeShape) {
    upsertCandidate(entries, 'capability', {
      reasons: [
        signals?.capabilityProbeShape ? 'capability probe shape asks what the host can do' : '',
        signals?.capabilityQuery && !signals?.capabilityProbeShape ? 'request asks about host capabilities or available surfaces' : '',
      ],
      use_when: 'need to answer visible host capabilities, workflow surfaces, MCP resources, or the next discovery path',
      avoid_when: 'a stronger continuity or non-capability specialization already owns the path',
    });
  }

  if (hasItems(teamContinuity?.pending_plan_approval_requests)) {
    upsertCandidate(entries, 'team_approval', {
      reasons: ['pending teammate plan approval exists in host continuity'],
      use_when: 'the next meaningful action is approving or rejecting a teammate plan',
      avoid_when: 'there is no pending plan approval request',
      recommended_shape: recommendedShapeForCandidate('team_approval'),
    });
  }

  if (hasItems(teamContinuity?.handoff_candidates) || hasItems(teamContinuity?.current_agent_blocked_tasks)) {
    upsertCandidate(entries, 'handoff', {
      reasons: [
        hasItems(teamContinuity?.handoff_candidates) ? 'handoff candidate exists' : '',
        hasItems(teamContinuity?.current_agent_blocked_tasks) ? 'blocked task continuity exists' : '',
      ],
      use_when: 'blocker resolution, reassignment, or follow-up continuity should drive the next step',
      avoid_when: 'there is no active blocker or handoff path',
      recommended_shape: recommendedShapeForCandidate('handoff'),
    });
  }

  if (trimmed(teamContinuity?.active_team) || hasItems(teamContinuity?.team_action_items)) {
    upsertCandidate(entries, 'team_status', {
      reasons: [
        trimmed(teamContinuity?.active_team) ? 'active team continuity exists' : '',
        hasItems(teamContinuity?.team_action_items) ? 'team action summary exists' : '',
      ],
      use_when: 'the user asks for status, next step, or coordination summary inside active team continuity',
      avoid_when: 'there is no active team/task-board continuity',
      recommended_shape: recommendedShapeForCandidate('team_status'),
    });
  }

  if (signals?.release) {
    upsertCandidate(entries, 'release', {
      reasons: ['request asks for release / publish work'],
      use_when: 'release flow is requested but no stronger release continuity dominates',
      avoid_when: 'the session is clearly continuing a loaded release workflow',
    });
  }

  if (signals?.release && (signals?.workflowContinuation || hasLoadedReleaseWorkflow(sessionContext))) {
    upsertCandidate(entries, 'release_follow_up', {
      reasons: [
        signals?.workflowContinuation ? 'request continues an existing workflow' : '',
        hasLoadedReleaseWorkflow(sessionContext) ? 'loaded release workflow exists' : '',
      ],
      use_when: 'release work is already in progress and should continue on the same surfaced path',
      avoid_when: 'this is a fresh release request with no loaded continuity',
      recommended_shape: recommendedShapeForCandidate('release_follow_up'),
    });
  }

  if (signals?.review && signals?.verify) {
    upsertCandidate(entries, 'review_verification', {
      reasons: ['request combines review and verification'],
      use_when: 'need findings first and evidence-backed verification after',
      avoid_when: 'only one of review/verification is actually requested',
    });
  } else if (signals?.review) {
    upsertCandidate(entries, 'review', {
      reasons: [signals?.promptEnvelope?.reviewArtifact ? 'review-shaped artifact is present' : 'request asks for review'],
      use_when: 'need findings-first review output',
      avoid_when: 'the task is implementation rather than review',
    });
  } else if (signals?.verify) {
    upsertCandidate(entries, 'verification', {
      reasons: ['request asks for verification'],
      use_when: 'need validation evidence or explicit not-run status',
      avoid_when: 'no verification evidence is needed',
    });
  }

  if (signals?.verify && (hasItems(teamContinuity?.handoff_candidates) || hasItems(teamContinuity?.current_agent_blocked_tasks))) {
    upsertCandidate(entries, 'blocked_verification', {
      reasons: ['verification requested while blocker continuity exists'],
      use_when: 'verification cannot cleanly finish until a blocker or handoff path is addressed',
      avoid_when: 'verification can proceed normally',
      recommended_shape: recommendedShapeForCandidate('blocked_verification'),
    });
  }

  if (signals?.codeResearch || signals?.research) {
    upsertCandidate(entries, 'research', {
      reasons: [signals?.promptEnvelope?.broadArtifactQuestion ? 'broad artifact question suggests repo investigation' : 'request needs investigation or repo research'],
      use_when: 'need targeted paths, symbols, or unknowns before conclusions',
      avoid_when: 'the task is already a clear execution slice',
    });
  }

  if (signals?.explain || (signals?.claudeGuide && selected === 'explanation')) {
    upsertCandidate(entries, 'explanation', {
      reasons: [signals?.promptEnvelope?.targetedArtifactQuestion
        ? 'targeted artifact question suggests direct explanation'
        : signals?.claudeGuide
          ? 'request is about Claude Code guide behavior or surfaces'
          : 'request asks for explanation'],
      use_when: 'a direct answer with references is needed',
      avoid_when: 'tracked continuity or protocol work should take precedence',
    });
  }

  upsertCandidate(entries, selected, {
    selected: true,
    selection_basis: selection.selection_basis,
    selection_strength: selection.selection_strength,
  });
  return finalizeCandidates(entries, selected);
}
