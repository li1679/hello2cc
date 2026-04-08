import {
  buildCandidateMap,
  buildTaskMap,
  byRecordedAtDescending,
  candidateSummary,
  recommendedAction,
  uniqueStrings,
} from './team-follow-up-builders.mjs';

const MAX_HANDOFF_CANDIDATES = 8;
const MAX_SUMMARY_LINES = 6;
const MAX_TASK_IDS = 12;
const MAX_TEAMMATES = 16;

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

export function buildTeamFollowUpState({
  taskSummaries = [],
  blockedTasks = [],
  mailboxEvents = [],
  idleTeammates = [],
} = {}) {
  const taskMap = buildTaskMap(taskSummaries);
  const candidateMap = buildCandidateMap(mailboxEvents, blockedTasks, taskMap, idleTeammates);
  const handoffCandidates = [...candidateMap.values()]
    .map((candidate) => ({
      ...candidate,
      recommended_action: recommendedAction(candidate.reasons, candidate),
      summary: candidateSummary(candidate),
    }))
    .filter((candidate) => candidate.summary)
    .sort((left, right) => {
      const reassignmentWeight = arrayValue(right?.reasons).includes('terminated_teammate')
        - arrayValue(left?.reasons).includes('terminated_teammate');
      if (reassignmentWeight !== 0) {
        return reassignmentWeight;
      }

      return byRecordedAtDescending(left, right);
    })
    .slice(0, MAX_HANDOFF_CANDIDATES);

  if (!handoffCandidates.length) {
    return {
      handoffCandidates: [],
      handoffSummary: undefined,
      handoffCandidateTaskIds: [],
      reassignmentNeededTaskIds: [],
    };
  }

  const reassignmentNeededTaskIds = uniqueStrings(
    handoffCandidates
      .filter((candidate) => arrayValue(candidate?.reasons).includes('terminated_teammate'))
      .map((candidate) => candidate.task_id),
    MAX_TASK_IDS,
  );
  const handoffCandidateTaskIds = uniqueStrings(
    handoffCandidates.map((candidate) => candidate.task_id),
    MAX_TASK_IDS,
  );
  const followUpTeammates = uniqueStrings(
    handoffCandidates.flatMap((candidate) => candidate.follow_up_targets),
    MAX_TEAMMATES,
  );
  const includesBlockedHandoffs = handoffCandidates.some((candidate) => arrayValue(candidate?.reasons).includes('blocked_by_teammate'));
  const includesPeerSignals = handoffCandidates.some((candidate) => arrayValue(candidate?.reasons).includes('idle_peer_signal'));
  const includesShutdownReassignments = handoffCandidates.some((candidate) => arrayValue(candidate?.reasons).includes('terminated_teammate'));

  return {
    handoffCandidates,
    handoffCandidateTaskIds,
    reassignmentNeededTaskIds,
    handoffSummary: {
      total_candidates: handoffCandidates.length,
      candidate_task_ids: handoffCandidateTaskIds,
      follow_up_teammates: followUpTeammates,
      reassignment_needed_task_ids: reassignmentNeededTaskIds,
      includes_blocker_handoffs: includesBlockedHandoffs || undefined,
      includes_peer_handoff_signals: includesPeerSignals || undefined,
      includes_shutdown_reassignments: includesShutdownReassignments || undefined,
      summary_lines: uniqueStrings(
        handoffCandidates.map((candidate) => candidate.summary),
        MAX_SUMMARY_LINES,
      ),
    },
  };
}
