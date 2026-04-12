import {
  MAX_REMEMBERED_TASK_IDS,
  MAX_REMEMBERED_TEAMMATES,
  arrayValue,
  localTaskSummaryEntries,
  openTaskEntry,
  trimmed,
  uniqueStrings,
} from './tool-policy-state-shared.mjs';
import {
  participantNameOrEmpty,
  uniqueParticipantNames,
} from './participant-name.mjs';

function normalizeObjectEntries(value, mapper) {
  return value && typeof value === 'object'
    ? Object.fromEntries(
        Object.entries(value)
          .map(mapper)
          .filter(Boolean),
      )
    : {};
}

function normalizeRejectedTargets(value) {
  return normalizeObjectEntries(value, ([name, record]) => {
    const normalizedName = participantNameOrEmpty(record?.name || name);
    const recordedAt = trimmed(record?.recordedAt);
    if (!normalizedName || !recordedAt) {
      return null;
    }

    return [normalizedName, {
      name: normalizedName,
      reason: trimmed(record?.reason),
      recordedAt,
    }];
  });
}

function normalizePlanApprovals(value) {
  return normalizeObjectEntries(value, ([name, record]) => {
    const normalizedName = participantNameOrEmpty(record?.name || name);
    const requestId = trimmed(record?.requestId || record?.request_id);
    const recordedAt = trimmed(record?.recordedAt);
    if (!normalizedName || !requestId || !recordedAt) {
      return null;
    }

    return [normalizedName, {
      name: normalizedName,
      requestId,
      planFilePath: trimmed(record?.planFilePath || record?.plan_file_path),
      recordedAt,
    }];
  });
}

function normalizeIdleNotifications(value) {
  return normalizeObjectEntries(value, ([name, record]) => {
    const teammateName = participantNameOrEmpty(record?.teammateName || record?.teammate_name || record?.name || name);
    const recordedAt = trimmed(record?.recordedAt);
    if (!teammateName || !recordedAt) {
      return null;
    }

    return [teammateName, {
      teammateName,
      idleReason: trimmed(record?.idleReason || record?.idle_reason),
      summary: trimmed(record?.summary),
      lastMessageTarget: participantNameOrEmpty(record?.lastMessageTarget || record?.last_message_target),
      lastMessageKind: trimmed(record?.lastMessageKind || record?.last_message_kind),
      lastMessageSummary: trimmed(record?.lastMessageSummary || record?.last_message_summary),
      lastTaskUpdatedId: trimmed(record?.lastTaskUpdatedId || record?.last_task_updated_id),
      lastTaskUpdatedStatus: trimmed(record?.lastTaskUpdatedStatus || record?.last_task_updated_status),
      lastTaskSubject: trimmed(record?.lastTaskSubject || record?.last_task_subject),
      assignedTaskIds: uniqueStrings(record?.assignedTaskIds || record?.assigned_task_ids, MAX_REMEMBERED_TASK_IDS),
      blockedTaskIds: uniqueStrings(record?.blockedTaskIds || record?.blocked_task_ids, MAX_REMEMBERED_TASK_IDS),
      recordedAt,
    }];
  });
}

function normalizeTaskAssignments(value, includeDescription) {
  return normalizeObjectEntries(value, ([taskId, record]) => {
    const normalizedTaskId = trimmed(record?.taskId || taskId);
    const owner = participantNameOrEmpty(record?.owner);
    const recordedAt = trimmed(record?.recordedAt);
    if (!normalizedTaskId || !owner || !recordedAt) {
      return null;
    }

    return [normalizedTaskId, {
      taskId: normalizedTaskId,
      owner,
      subject: trimmed(record?.subject),
      ...(includeDescription ? { description: trimmed(record?.description) } : {}),
      status: trimmed(record?.status),
      blocks: uniqueStrings(record?.blocks, MAX_REMEMBERED_TASK_IDS),
      blockedBy: uniqueStrings(record?.blockedBy || record?.blocked_by, MAX_REMEMBERED_TASK_IDS),
      assignedBy: trimmed(record?.assignedBy || record?.assigned_by),
      recordedAt,
    }];
  });
}

function normalizeTerminationNotifications(value) {
  return normalizeObjectEntries(value, ([name, record]) => {
    const teammateName = participantNameOrEmpty(record?.teammateName || record?.teammate_name || record?.name || name);
    const recordedAt = trimmed(record?.recordedAt);
    if (!teammateName || !recordedAt) {
      return null;
    }

    return [teammateName, {
      teammateName,
      message: trimmed(record?.message),
      affectedTasks: arrayValue(record?.affectedTasks || record?.affected_tasks)
        .map((task) => ({
          taskId: trimmed(task?.taskId || task?.task_id),
          subject: trimmed(task?.subject),
        }))
        .filter((task) => task.taskId)
        .slice(0, MAX_REMEMBERED_TASK_IDS),
      recordedAt,
    }];
  });
}

/**
 * Returns the normalized cross-agent team state stored in session memory.
 */
export function sharedTeamState(sessionContext = {}) {
  const value = sessionContext?.sharedTeamState;
  if (!value || typeof value !== 'object') {
    return {
      knownTeammates: [],
      shutdownRequestedTargets: [],
      shutdownApprovedTargets: [],
      shutdownRejectedTargets: {},
      pendingPlanApprovals: {},
      taskAssignments: {},
      pendingIdleNotifications: {},
      pendingTaskAssignments: {},
      pendingTerminationNotifications: {},
    };
  }

  return {
    knownTeammates: uniqueParticipantNames(value?.knownTeammates, MAX_REMEMBERED_TEAMMATES),
    shutdownRequestedTargets: uniqueParticipantNames(value?.shutdownRequestedTargets, MAX_REMEMBERED_TEAMMATES),
    shutdownApprovedTargets: uniqueParticipantNames(value?.shutdownApprovedTargets, MAX_REMEMBERED_TEAMMATES),
    shutdownRejectedTargets: normalizeRejectedTargets(value?.shutdownRejectedTargets),
    pendingPlanApprovals: normalizePlanApprovals(value?.pendingPlanApprovals),
    pendingIdleNotifications: normalizeIdleNotifications(value?.pendingIdleNotifications),
    pendingTaskAssignments: normalizeTaskAssignments(value?.pendingTaskAssignments, true),
    pendingTerminationNotifications: normalizeTerminationNotifications(value?.pendingTerminationNotifications),
    taskAssignments: normalizeTaskAssignments(value?.taskAssignments, false),
  };
}

function sharedTerminationTaskOverrides(sessionContext = {}) {
  const shared = sharedTeamState(sessionContext);
  const assignments = shared.taskAssignments || {};
  const overrides = {};

  for (const record of Object.values(shared.pendingTerminationNotifications || {})) {
    const teammateName = participantNameOrEmpty(record?.teammateName);
    for (const task of arrayValue(record?.affectedTasks)) {
      const taskId = trimmed(task?.taskId);
      if (!taskId || assignments[taskId]) continue;

      overrides[taskId] = {
        owner: '',
        status: 'pending',
        subject: trimmed(task?.subject),
        terminatedTeammate: teammateName,
      };
    }
  }

  return overrides;
}

/**
 * Merges task assignments remembered from the shared team state with local task snapshots.
 */
export function mergedTaskAssignments(sessionContext = {}) {
  const sharedAssignments = sharedTeamState(sessionContext).taskAssignments;
  const terminationOverrides = sharedTerminationTaskOverrides(sessionContext);
  const localAssignments = localTaskSummaryEntries(sessionContext)
    .filter(([taskId, record]) => openTaskEntry(record) && participantNameOrEmpty(record?.owner) && !terminationOverrides[taskId])
    .map(([taskId, record]) => [taskId, {
      taskId,
      owner: participantNameOrEmpty(record?.owner),
      subject: trimmed(record?.subject),
      status: trimmed(record?.status),
      blocks: uniqueStrings(record?.blocks, MAX_REMEMBERED_TASK_IDS),
      blockedBy: uniqueStrings(record?.blockedBy || record?.blocked_by, MAX_REMEMBERED_TASK_IDS),
      assignedBy: trimmed(sharedAssignments?.[taskId]?.assignedBy),
      recordedAt: trimmed(sharedAssignments?.[taskId]?.recordedAt) || new Date(0).toISOString(),
    }]);

  const next = { ...sharedAssignments };
  for (const [taskId, record] of localAssignments) {
    next[taskId] = {
      ...(next[taskId] || {}),
      ...record,
    };
  }

  for (const taskId of Object.keys(terminationOverrides)) {
    delete next[taskId];
  }

  return next;
}

/**
 * Returns merged task summaries combining local workflow state with shared team overlays.
 */
export function taskSummaryEntries(sessionContext = {}) {
  const merged = Object.fromEntries(localTaskSummaryEntries(sessionContext));
  for (const [taskId, record] of Object.entries(sharedTeamState(sessionContext).taskAssignments)) {
    merged[taskId] = {
      ...(merged[taskId] || {}),
      subject: trimmed(record?.subject) || trimmed(merged[taskId]?.subject),
      status: trimmed(record?.status) || trimmed(merged[taskId]?.status),
      owner: participantNameOrEmpty(record?.owner) || participantNameOrEmpty(merged[taskId]?.owner),
      blocks: uniqueStrings(record?.blocks, MAX_REMEMBERED_TASK_IDS),
      blockedBy: uniqueStrings(record?.blockedBy || record?.blocked_by, MAX_REMEMBERED_TASK_IDS),
      recordedAt: trimmed(record?.recordedAt) || trimmed(merged[taskId]?.recordedAt),
    };
  }

  for (const [taskId, override] of Object.entries(sharedTerminationTaskOverrides(sessionContext))) {
    merged[taskId] = {
      ...(merged[taskId] || {}),
      subject: trimmed(override?.subject) || trimmed(merged[taskId]?.subject),
      status: trimmed(override?.status) || trimmed(merged[taskId]?.status),
      owner: '',
      recordedAt: trimmed(merged[taskId]?.recordedAt),
    };
  }

  return Object.entries(merged);
}

/**
 * Returns merged task summaries in the normalized protocol shape used by follow-up helpers.
 */
export function taskSummaryRecords(sessionContext = {}) {
  return taskSummaryEntries(sessionContext)
    .map(([taskId, record]) => ({
      task_id: taskId,
      subject: trimmed(record?.subject),
      owner: participantNameOrEmpty(record?.owner),
      status: trimmed(record?.status),
      blocks: uniqueStrings(record?.blocks, MAX_REMEMBERED_TASK_IDS),
      blocked_by: uniqueStrings(record?.blockedBy || record?.blocked_by, MAX_REMEMBERED_TASK_IDS),
      recorded_at: trimmed(record?.recordedAt),
    }))
    .filter((record) => record.task_id);
}

/**
 * Returns the set of task ids that are still unresolved in the merged task view.
 */
export function unresolvedTaskIdSet(sessionContext = {}) {
  return new Set(
    taskSummaryEntries(sessionContext)
      .filter(([, record]) => openTaskEntry(record))
      .map(([taskId]) => taskId),
  );
}

/**
 * Returns normalized shutdown rejection records for continuity summaries.
 */
export function shutdownRejectedTargetRecords(sessionContext = {}) {
  return Object.values(sharedTeamState(sessionContext).shutdownRejectedTargets)
    .map((record) => ({
      teammate_name: participantNameOrEmpty(record?.name),
      reason: trimmed(record?.reason),
      recorded_at: trimmed(record?.recordedAt),
    }))
    .filter((record) => record.teammate_name && record.recorded_at);
}
