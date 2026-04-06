import { resolveWebSearchGuidanceState } from './api-topology.mjs';
import { describeRouteSpecialization } from './specialization-selection.mjs';
import {
  finalizeCandidates,
  hasItems,
  trimmed,
  upsertCandidate,
} from './specialization-candidate-shared.mjs';

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
      use_when: 'constraints, blockers, or ordering need to be made explicit before implementation',
      avoid_when: 'the slice is already narrow and clear enough to execute directly',
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
