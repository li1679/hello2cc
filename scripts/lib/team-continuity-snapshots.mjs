import { buildVisibleMailboxState } from './team-mailbox-state.mjs';
import { buildTeamActionState } from './team-action-state.mjs';
import { buildTeamFollowUpState } from './team-follow-up-state.mjs';
import { participantNameOrEmpty } from './participant-name.mjs';
import {
  MAX_REMEMBERED_TASK_IDS,
  arrayValue,
  recentZeroResultToolSearchQueries,
  trimmed,
  uniqueStrings,
  workflowState,
} from './tool-policy-state-shared.mjs';
import {
  blockedTaskIds,
  blockedTaskRecords,
  currentAssignedTasksForTeammate,
  knownTeammateNames,
  shutdownApprovedTargets,
  shutdownRejectedTargets,
  shutdownRequestedTargets,
} from './team-continuity-queries.mjs';
import {
  mergedTaskAssignments,
  sharedTeamState,
  shutdownRejectedTargetRecords,
  taskSummaryRecords,
  taskSummaryEntries,
} from './team-continuity-state.mjs';

function openTaskIds(sessionContext = {}) {
  return taskSummaryEntries(sessionContext)
    .filter(([, record]) => {
      const status = trimmed(record?.status).toLowerCase();
      return Boolean(status) && !['completed', 'deleted'].includes(status);
    })
    .map(([taskId]) => taskId);
}

function ownedOpenTaskOwners(sessionContext = {}) {
  return uniqueStrings(
    taskSummaryEntries(sessionContext)
      .filter(([, record]) => {
        const status = trimmed(record?.status).toLowerCase();
        return Boolean(status) && !['completed', 'deleted'].includes(status);
      })
      .map(([, record]) => trimmed(record?.owner))
      .filter(Boolean),
  );
}

function pendingPlanApprovalNames(sessionContext = {}) {
  return Object.values(sharedTeamState(sessionContext).pendingPlanApprovals)
    .map((record) => trimmed(record?.name))
    .filter(Boolean);
}

function pendingPlanApprovalRecords(sessionContext = {}) {
  return Object.values(sharedTeamState(sessionContext).pendingPlanApprovals)
    .map((record) => ({
      teammate_name: participantNameOrEmpty(record?.name),
      request_id: trimmed(record?.requestId),
      plan_file_path: trimmed(record?.planFilePath),
      recorded_at: trimmed(record?.recordedAt),
    }))
    .filter((record) => record.teammate_name && record.request_id && record.recorded_at);
}

function assignedTaskIdsByTeammate(sessionContext = {}) {
  const grouped = {};

  for (const record of Object.values(mergedTaskAssignments(sessionContext))) {
    const owner = participantNameOrEmpty(record?.owner);
    const taskId = trimmed(record?.taskId);
    if (!owner || !taskId) continue;

    grouped[owner] = uniqueStrings([
      ...(Array.isArray(grouped[owner]) ? grouped[owner] : []),
      taskId,
    ], MAX_REMEMBERED_TASK_IDS);
  }

  return grouped;
}

function blockingTaskIds(sessionContext = {}) {
  return uniqueStrings(
    blockedTaskRecords(sessionContext)
      .flatMap((record) => record.blocked_by),
    MAX_REMEMBERED_TASK_IDS,
  );
}

function blockedTasksForTeammate(sessionContext = {}, name) {
  const normalizedName = participantNameOrEmpty(name);
  if (!normalizedName) return [];

  return blockedTaskRecords(sessionContext)
    .filter((record) => trimmed(record?.owner) === normalizedName);
}

function idleTeammateNames(sessionContext = {}) {
  const teammates = knownTeammateNames(sessionContext);
  const openOwners = new Set(ownedOpenTaskOwners(sessionContext));
  const assignedOwners = new Set(Object.keys(assignedTaskIdsByTeammate(sessionContext)));
  const pendingShutdown = new Set(shutdownRequestedTargets(sessionContext));
  const approvedShutdown = new Set(shutdownApprovedTargets(sessionContext));
  const pendingApprovals = new Set(pendingPlanApprovalNames(sessionContext));

  return teammates.filter((name) => (
    !openOwners.has(name) &&
    !assignedOwners.has(name) &&
    !pendingShutdown.has(name) &&
    !approvedShutdown.has(name) &&
    !pendingApprovals.has(name)
  ));
}

function pendingIdleNotificationRecords(sessionContext = {}) {
  return Object.values(sharedTeamState(sessionContext).pendingIdleNotifications)
    .map((record) => ({
      teammate_name: participantNameOrEmpty(record?.teammateName),
      idle_reason: trimmed(record?.idleReason),
      summary: trimmed(record?.summary),
      last_message_target: participantNameOrEmpty(record?.lastMessageTarget),
      last_message_kind: trimmed(record?.lastMessageKind),
      last_message_summary: trimmed(record?.lastMessageSummary),
      last_task_updated_id: trimmed(record?.lastTaskUpdatedId),
      last_task_updated_status: trimmed(record?.lastTaskUpdatedStatus),
      last_task_subject: trimmed(record?.lastTaskSubject),
      assigned_task_ids: uniqueStrings(record?.assignedTaskIds, MAX_REMEMBERED_TASK_IDS),
      blocked_task_ids: uniqueStrings(record?.blockedTaskIds, MAX_REMEMBERED_TASK_IDS),
      recorded_at: trimmed(record?.recordedAt),
    }))
    .filter((record) => record.teammate_name && record.recorded_at);
}

function pendingTaskAssignmentRecords(sessionContext = {}, name = '') {
  const normalizedName = participantNameOrEmpty(name);
  return Object.values(sharedTeamState(sessionContext).pendingTaskAssignments)
    .filter((record) => !normalizedName || participantNameOrEmpty(record?.owner) === normalizedName)
    .map((record) => ({
      task_id: trimmed(record?.taskId),
      owner: participantNameOrEmpty(record?.owner),
      subject: trimmed(record?.subject),
      description: trimmed(record?.description),
      assigned_by: trimmed(record?.assignedBy),
      recorded_at: trimmed(record?.recordedAt),
    }))
    .filter((record) => record.task_id && record.owner && record.recorded_at);
}

function pendingTerminationNotificationRecords(sessionContext = {}) {
  return Object.values(sharedTeamState(sessionContext).pendingTerminationNotifications)
    .map((record) => ({
      teammate_name: participantNameOrEmpty(record?.teammateName),
      message: trimmed(record?.message),
      affected_tasks: arrayValue(record?.affectedTasks)
        .map((task) => ({
          task_id: trimmed(task?.taskId),
          subject: trimmed(task?.subject),
        }))
        .filter((task) => task.task_id),
      recorded_at: trimmed(record?.recordedAt),
    }))
    .filter((record) => record.teammate_name && record.recorded_at);
}

/**
 * Returns the aggregated team continuity snapshot injected into route guidance.
 */
export function teamContinuitySnapshot(sessionContext = {}) {
  const state = workflowState(sessionContext);
  const teammates = knownTeammateNames(sessionContext);
  const blockedTasks = blockedTaskRecords(sessionContext);
  const idleTeammates = idleTeammateNames(sessionContext);
  const approvedShutdown = shutdownApprovedTargets(sessionContext);
  const rejectedShutdown = shutdownRejectedTargets(sessionContext);
  const rejectedShutdownRecords = shutdownRejectedTargetRecords(sessionContext);
  const pendingPlanApprovals = pendingPlanApprovalNames(sessionContext);
  const pendingPlanApprovalRequests = pendingPlanApprovalRecords(sessionContext);
  const allPendingAssignments = pendingTaskAssignmentRecords(sessionContext);
  const currentAgentName = participantNameOrEmpty(sessionContext?.agentName);
  const currentAgentAssignments = currentAssignedTasksForTeammate(sessionContext, currentAgentName);
  const currentAgentBlockedTasks = blockedTasksForTeammate(sessionContext, currentAgentName);
  const currentAgentPendingAssignments = pendingTaskAssignmentRecords(sessionContext, currentAgentName);
  const assignmentMap = assignedTaskIdsByTeammate(sessionContext);
  const pendingIdleNotifications = pendingIdleNotificationRecords(sessionContext);
  const pendingTerminationNotifications = pendingTerminationNotificationRecords(sessionContext);
  const mailboxState = buildVisibleMailboxState({
    agentName: currentAgentName,
    pendingIdleNotifications,
    pendingTaskAssignments: allPendingAssignments,
    pendingTerminationNotifications,
  });
  const followUpState = buildTeamFollowUpState({
    taskSummaries: taskSummaryRecords(sessionContext),
    blockedTasks,
    mailboxEvents: mailboxState.mailboxEvents,
    idleTeammates,
  });
  const teamActionState = buildTeamActionState({
    agentName: currentAgentName,
    pendingPlanApprovals: pendingPlanApprovalRequests,
    shutdownRejections: rejectedShutdownRecords,
    handoffCandidates: followUpState.handoffCandidates,
    pendingAssignments: currentAgentPendingAssignments,
    blockedTasks: currentAgentBlockedTasks,
  });

  return {
    active_team: trimmed(sessionContext?.teamName) || undefined,
    known_teammates: teammates.length ? teammates : undefined,
    open_task_ids: openTaskIds(sessionContext).length ? openTaskIds(sessionContext) : undefined,
    open_task_owners: ownedOpenTaskOwners(sessionContext).length ? ownedOpenTaskOwners(sessionContext) : undefined,
    blocked_task_ids: blockedTaskIds(sessionContext).length ? blockedTaskIds(sessionContext) : undefined,
    blocking_task_ids: blockingTaskIds(sessionContext).length ? blockingTaskIds(sessionContext) : undefined,
    assigned_task_ids_by_teammate: Object.keys(assignmentMap).length ? assignmentMap : undefined,
    current_agent_assigned_tasks: currentAgentAssignments.length ? currentAgentAssignments : undefined,
    current_agent_pending_assignments: currentAgentPendingAssignments.length ? currentAgentPendingAssignments : undefined,
    current_agent_blocked_tasks: currentAgentBlockedTasks.length ? currentAgentBlockedTasks : undefined,
    mailbox_events: mailboxState.mailboxEvents.length ? mailboxState.mailboxEvents : undefined,
    mailbox_summary: mailboxState.mailboxSummary,
    handoff_candidates: followUpState.handoffCandidates.length ? followUpState.handoffCandidates : undefined,
    handoff_candidate_task_ids: followUpState.handoffCandidateTaskIds.length ? followUpState.handoffCandidateTaskIds : undefined,
    reassignment_needed_task_ids: followUpState.reassignmentNeededTaskIds.length ? followUpState.reassignmentNeededTaskIds : undefined,
    handoff_summary: followUpState.handoffSummary,
    team_action_items: teamActionState.teamActionItems.length ? teamActionState.teamActionItems : undefined,
    team_action_summary: teamActionState.teamActionSummary,
    idle_teammates: idleTeammates.length ? idleTeammates : undefined,
    pending_idle_notifications: pendingIdleNotifications.length ? pendingIdleNotifications : undefined,
    pending_termination_notifications: pendingTerminationNotifications.length ? pendingTerminationNotifications : undefined,
    pending_plan_approval_from: pendingPlanApprovals.length ? pendingPlanApprovals : undefined,
    pending_plan_approval_requests: pendingPlanApprovalRequests.length ? pendingPlanApprovalRequests : undefined,
    shutdown_requested_targets: shutdownRequestedTargets(sessionContext).length ? shutdownRequestedTargets(sessionContext) : undefined,
    shutdown_approved_targets: approvedShutdown.length ? approvedShutdown : undefined,
    shutdown_rejected_targets: rejectedShutdown.length ? rejectedShutdown : undefined,
    shutdown_rejection_records: rejectedShutdownRecords.length ? rejectedShutdownRecords : undefined,
    shutdown_broadcast_requested: state.shutdownBroadcastRequested || undefined,
    last_message_target: state.lastMessageTarget || undefined,
    last_message_kind: state.lastMessageKind || undefined,
    last_message_summary: state.lastMessageSummary || undefined,
  };
}

/**
 * Returns the workflow continuity snapshot that combines task and team state.
 */
export function workflowContinuitySnapshot(sessionContext = {}) {
  const state = workflowState(sessionContext);
  const zeroResultQueries = recentZeroResultToolSearchQueries(sessionContext);

  return {
    active_task_board: state.activeTaskBoard || undefined,
    task_board_source: state.taskBoardSource || undefined,
    known_task_ids: state.lastKnownTaskIds.length ? state.lastKnownTaskIds : undefined,
    last_task_created_id: state.lastTaskCreatedId || undefined,
    last_task_read_id: state.lastTaskReadId || undefined,
    last_task_updated_id: state.lastTaskUpdatedId || undefined,
    last_task_updated_status: state.lastTaskUpdatedStatus || undefined,
    last_task_owner: state.lastTaskOwner || undefined,
    task_summaries: Object.keys(state.taskSummaries).length ? state.taskSummaries : undefined,
    plan_mode_entered: state.planModeEntered || undefined,
    plan_mode_exited: state.planModeExited || undefined,
    awaiting_plan_approval: state.awaitingPlanApproval || undefined,
    last_plan_approval_target: state.lastPlanApprovalTarget || undefined,
    ask_user_question_used: state.askUserQuestionUsed || undefined,
    recent_zero_result_toolsearch_queries: zeroResultQueries.length ? zeroResultQueries : undefined,
    team: teamContinuitySnapshot(sessionContext),
  };
}
