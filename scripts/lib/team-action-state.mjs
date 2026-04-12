import {
  participantNameOrEmpty,
  uniqueParticipantNames,
} from './participant-name.mjs';

const MAX_ACTION_ITEMS = 10;
const MAX_SUMMARY_LINES = 6;
const MAX_TASK_IDS = 12;
const MAX_TEAMMATES = 16;

function trimmed(value) {
  return String(value || '').trim();
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values, maxItems = values?.length || 0) {
  return [...new Set(
    arrayValue(values)
      .map((value) => trimmed(value))
      .filter(Boolean),
  )].slice(0, maxItems || undefined);
}

function byPriorityAndTime(left = {}, right = {}) {
  const priorityDelta = Number(right?.priority || 0) - Number(left?.priority || 0);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return String(right?.recorded_at || '').localeCompare(String(left?.recorded_at || ''));
}

function planApprovalAction(record = {}) {
  const teammateName = participantNameOrEmpty(record?.teammate_name);
  return {
    action_type: 'review_plan_approval',
    priority: 100,
    teammate_name: teammateName,
    request_id: trimmed(record?.request_id),
    plan_file_path: trimmed(record?.plan_file_path),
    recorded_at: trimmed(record?.recorded_at),
    next_tool: 'SendMessage.plan_approval_response',
    summary: `[Plan Approval Request from ${teammateName}] review and answer with structured plan_approval_response`,
  };
}

function shutdownRejectionAction(record = {}) {
  const teammateName = participantNameOrEmpty(record?.teammate_name);
  const reason = trimmed(record?.reason);
  return {
    action_type: 'resolve_shutdown_rejection',
    priority: 95,
    teammate_name: teammateName,
    reason,
    recorded_at: trimmed(record?.recorded_at),
    next_tool: 'TaskGet/SendMessage',
    summary: reason
      ? `[Shutdown Rejected] ${teammateName}: ${reason}`
      : `[Shutdown Rejected] ${teammateName} declined shutdown and needs follow-up`,
  };
}

function reassignmentAction(candidate = {}) {
  return {
    action_type: 'reassign_task',
    priority: 90,
    task_id: trimmed(candidate?.task_id),
    teammate_name: participantNameOrEmpty(candidate?.previous_owner),
    follow_up_targets: uniqueParticipantNames(candidate?.follow_up_targets, MAX_TEAMMATES),
    recorded_at: trimmed(candidate?.recorded_at),
    next_tool: 'TaskGet/TaskUpdate(owner)',
    summary: trimmed(candidate?.summary),
  };
}

function handoffAction(candidate = {}) {
  return {
    action_type: 'follow_up_handoff',
    priority: 80,
    task_id: trimmed(candidate?.task_id),
    teammate_name: participantNameOrEmpty(candidate?.current_owner),
    follow_up_targets: uniqueParticipantNames(candidate?.follow_up_targets, MAX_TEAMMATES),
    recorded_at: trimmed(candidate?.recorded_at),
    next_tool: 'TaskGet/SendMessage',
    summary: trimmed(candidate?.summary),
  };
}

function pickUpAssignmentAction(record = {}) {
  return {
    action_type: 'pick_up_assignment',
    priority: 95,
    task_id: trimmed(record?.task_id),
    teammate_name: participantNameOrEmpty(record?.owner),
    assigned_by: trimmed(record?.assigned_by),
    recorded_at: trimmed(record?.recorded_at),
    next_tool: 'TaskGet/TaskUpdate(status:"in_progress")',
    summary: `[Task Assigned] #${trimmed(record?.task_id)} - ${trimmed(record?.subject) || 'Assigned task'}`
  };
}

function blockedTaskAction(record = {}) {
  const taskId = trimmed(record?.task_id);
  const blockerIds = uniqueStrings(record?.blocked_by, MAX_TASK_IDS);
  return {
    action_type: 'resolve_blocker',
    priority: 85,
    task_id: taskId,
    teammate_name: participantNameOrEmpty(record?.owner),
    blocker_task_ids: blockerIds,
    recorded_at: trimmed(record?.recorded_at),
    next_tool: 'TaskGet/TaskUpdate/SendMessage',
    summary: `Task #${taskId}${trimmed(record?.subject) ? ` ${trimmed(record.subject)}` : ''} is blocked by ${blockerIds.map((id) => `#${id}`).join(', ')}`,
  };
}

function buildLeaderActionItems({
  pendingPlanApprovals = [],
  shutdownRejections = [],
  handoffCandidates = [],
} = {}) {
  const items = [
    ...arrayValue(pendingPlanApprovals).map((record) => planApprovalAction(record)),
    ...arrayValue(shutdownRejections).map((record) => shutdownRejectionAction(record)),
    ...arrayValue(handoffCandidates)
      .map((candidate) => {
        const reasons = new Set(arrayValue(candidate?.reasons).map((reason) => trimmed(reason)).filter(Boolean));
        if (reasons.has('terminated_teammate')) {
          return reassignmentAction(candidate);
        }

        return handoffAction(candidate);
      }),
  ]
    .filter((item) => trimmed(item?.summary))
    .sort(byPriorityAndTime)
    .slice(0, MAX_ACTION_ITEMS);

  return items;
}

function buildTeammateActionItems({
  pendingAssignments = [],
  blockedTasks = [],
} = {}) {
  const items = [
    ...arrayValue(pendingAssignments).map((record) => pickUpAssignmentAction(record)),
    ...arrayValue(blockedTasks).map((record) => blockedTaskAction(record)),
  ]
    .filter((item) => trimmed(item?.summary))
    .sort(byPriorityAndTime)
    .slice(0, MAX_ACTION_ITEMS);

  return items;
}

function actionSummary(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return undefined;
  }

  const actionTypes = uniqueStrings(items.map((item) => item?.action_type), 8);
  const priority = Number(items[0]?.priority || 0);

  return {
    total_actions: items.length,
    top_action_type: trimmed(items[0]?.action_type),
    top_priority: priority || undefined,
    action_types: actionTypes,
    teammate_names: uniqueParticipantNames(items.map((item) => item?.teammate_name), MAX_TEAMMATES),
    task_ids: uniqueStrings(items.map((item) => item?.task_id), MAX_TASK_IDS),
    requires_immediate_response: priority >= 95 ? true : undefined,
    requires_compact_table: items.length > 1 || actionTypes.length > 1 ? true : undefined,
    recommended_response_shape: (items.length > 1 || actionTypes.length > 1)
      ? 'one_line_plus_compact_markdown_table'
      : undefined,
    preferred_table_columns: (items.length > 1 || actionTypes.length > 1)
      ? ['priority', 'action', 'task', 'teammate', 'next_tool']
      : undefined,
    summary_lines: uniqueStrings(items.map((item) => item?.summary), MAX_SUMMARY_LINES),
  };
}

export function buildTeamActionState({
  agentName = '',
  pendingPlanApprovals = [],
  shutdownRejections = [],
  handoffCandidates = [],
  pendingAssignments = [],
  blockedTasks = [],
} = {}) {
  const normalizedAgentName = participantNameOrEmpty(agentName);
  const isTeammate = Boolean(normalizedAgentName) && !['team-lead', 'main', 'default'].includes(normalizedAgentName.toLowerCase());
  const teamActionItems = isTeammate
    ? buildTeammateActionItems({
        pendingAssignments,
        blockedTasks,
      })
    : buildLeaderActionItems({
        pendingPlanApprovals,
        shutdownRejections,
        handoffCandidates,
      });

  return {
    teamActionItems,
    teamActionSummary: actionSummary(teamActionItems),
  };
}
