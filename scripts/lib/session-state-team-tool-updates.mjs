import {
  normalizeNames,
  readAgentTeamName,
  readAgentWorkerName,
  readSendMessageTarget,
  readStructuredMessageApproval,
  readStructuredMessagePlanFilePath,
  readStructuredMessageRequestId,
  readStructuredMessageType,
  readTaskDescription,
  readTaskId,
  readTaskListEntries,
  resolvedAgentName,
  isReservedSharedOwner,
  isTeamLeadTarget,
} from './session-state-task-readers.mjs';
import {
  assignedTaskRecordsForTeammate,
  removeRejectedTargets,
  resolvedTaskBlockedBy,
  resolvedTaskBlocks,
  resolvedTaskOwner,
  resolvedTaskStatus,
  resolvedTaskSubject,
  terminationNotificationMessage,
  withPendingTaskAssignment,
  withPendingTerminationNotification,
  withTaskAssignment,
  withoutIdleNotification,
  withoutIdleNotificationsByTargets,
  withoutPendingTaskAssignment,
  withoutTaskAssignment,
} from './session-state-team-helpers.mjs';
import { trimmed } from './session-state-basic-helpers.mjs';

export function handleAgentTeamUpdate(payload = {}, state = {}, finalizeTeamState) {
  const teammateName = readAgentWorkerName(payload);
  const agentTeamName = readAgentTeamName(payload);
  if (teammateName && agentTeamName && trimmed(agentTeamName).toLowerCase() === trimmed(state.teamName).toLowerCase()) {
    return finalizeTeamState({
      knownTeammates: normalizeNames([teammateName, ...state.knownTeammates]),
    });
  }

  return finalizeTeamState();
}

export function handleTaskListTeamUpdate(payload = {}, state = {}, finalizeTeamState) {
  const entries = readTaskListEntries(payload);
  let nextKnownTeammates = state.knownTeammates;
  for (const entry of entries) {
    const taskId = trimmed(entry?.id);
    const owner = trimmed(entry?.owner);
    const status = trimmed(entry?.status);

    if (!taskId) continue;
    if (!isReservedSharedOwner(owner) && status && !['completed', 'deleted'].includes(status.toLowerCase())) {
      state.taskAssignments = withTaskAssignment(state.taskAssignments, {
        taskId,
        owner,
        subject: trimmed(entry?.subject),
        status,
        blocks: entry?.blocks,
        blockedBy: entry?.blockedBy,
        assignedBy: trimmed(state.taskAssignments[taskId]?.assignedBy),
        recordedAt: state.now,
      });
      nextKnownTeammates = normalizeNames([owner, ...nextKnownTeammates]);
    } else {
      state.taskAssignments = withoutTaskAssignment(state.taskAssignments, taskId);
    }
  }

  return finalizeTeamState({
    knownTeammates: nextKnownTeammates,
    taskAssignments: state.taskAssignments,
  });
}

export function handleTaskGetTeamUpdate(payload = {}, previous = {}, next = {}, state = {}, finalizeTeamState) {
  const taskId = readTaskId(payload);
  const owner = resolvedTaskOwner(payload, previous, next, taskId);
  const status = resolvedTaskStatus(payload, previous, next, taskId);

  if (!taskId) {
    return finalizeTeamState();
  }

  if (!isReservedSharedOwner(owner) && status && !['completed', 'deleted'].includes(status.toLowerCase())) {
    return finalizeTeamState({
      knownTeammates: normalizeNames([owner, ...state.knownTeammates]),
      taskAssignments: withTaskAssignment(state.taskAssignments, {
        taskId,
        owner,
        subject: resolvedTaskSubject(payload, previous, next, taskId),
        status,
        blocks: resolvedTaskBlocks(payload, previous, next, taskId),
        blockedBy: resolvedTaskBlockedBy(payload, previous, next, taskId),
        assignedBy: trimmed(state.taskAssignments[taskId]?.assignedBy),
        recordedAt: state.now,
      }),
    });
  }

  return finalizeTeamState({
    taskAssignments: withoutTaskAssignment(state.taskAssignments, taskId),
  });
}

export function handleTaskUpdateTeamUpdate(payload = {}, previous = {}, next = {}, state = {}, finalizeTeamState) {
  const taskId = readTaskId(payload);
  const owner = resolvedTaskOwner(payload, previous, next, taskId);
  const status = resolvedTaskStatus(payload, previous, next, taskId);
  const assignedBy = resolvedAgentName(payload, previous, next) || 'team-lead';
  const previousOwner = trimmed(state.taskAssignments[taskId]?.owner);
  if (taskId && !isReservedSharedOwner(owner) && status && !['completed', 'deleted'].includes(status.toLowerCase())) {
    let nextPendingTaskAssignments = state.pendingTaskAssignments;
    if (owner && owner !== previousOwner) {
      nextPendingTaskAssignments = withPendingTaskAssignment(state.pendingTaskAssignments, {
        taskId,
        owner,
        subject: resolvedTaskSubject(payload, previous, next, taskId),
        description: readTaskDescription(payload),
        assignedBy,
        recordedAt: state.now,
      });
    }

    return finalizeTeamState({
      knownTeammates: normalizeNames([owner, ...state.knownTeammates]),
      taskAssignments: withTaskAssignment(state.taskAssignments, {
        taskId,
        owner,
        subject: resolvedTaskSubject(payload, previous, next, taskId),
        status,
        blocks: resolvedTaskBlocks(payload, previous, next, taskId),
        blockedBy: resolvedTaskBlockedBy(payload, previous, next, taskId),
        assignedBy,
        recordedAt: state.now,
      }),
      pendingIdleNotifications: withoutIdleNotificationsByTargets(state.pendingIdleNotifications, [previousOwner, owner]),
      pendingTaskAssignments: nextPendingTaskAssignments,
    });
  }

  return finalizeTeamState({
    taskAssignments: withoutTaskAssignment(state.taskAssignments, taskId),
    pendingIdleNotifications: withoutIdleNotificationsByTargets(state.pendingIdleNotifications, [previousOwner]),
    pendingTaskAssignments: withoutPendingTaskAssignment(state.pendingTaskAssignments, taskId),
  });
}

export function handleSendMessageTeamUpdate(payload = {}, previous = {}, next = {}, state = {}, finalizeTeamState) {
  const target = readSendMessageTarget(payload);
  const structuredType = readStructuredMessageType(payload);
  const approval = readStructuredMessageApproval(payload);
  const requestId = readStructuredMessageRequestId(payload);
  const responder = resolvedAgentName(payload, previous, next);

  if (target === '*') {
    state.pendingIdleNotifications = {};
  } else if (target && !isTeamLeadTarget(target)) {
    state.pendingIdleNotifications = withoutIdleNotification(state.pendingIdleNotifications, target);
  }

  if (structuredType === 'plan_approval_request' && responder && requestId) {
    return finalizeTeamState({
      knownTeammates: normalizeNames([responder, ...state.knownTeammates]),
      pendingPlanApprovals: {
        ...state.pendingPlanApprovals,
        [responder]: {
          name: responder,
          requestId,
          planFilePath: readStructuredMessagePlanFilePath(payload),
          recordedAt: state.now,
        },
      },
    });
  }

  if (structuredType === 'plan_approval_response' && target) {
    delete state.pendingPlanApprovals[target];

    return finalizeTeamState({
      knownTeammates: normalizeNames([target, ...state.knownTeammates]),
      pendingPlanApprovals: state.pendingPlanApprovals,
    });
  }

  if (structuredType === 'shutdown_request') {
    const requestTargets = target === '*'
      ? normalizeNames(state.currentTeam.knownTeammates || [])
      : normalizeNames([target]);

    return finalizeTeamState({
      shutdownRequestedTargets: normalizeNames([
        ...state.shutdownRequestedTargets,
        ...requestTargets,
      ]),
      shutdownApprovedTargets: state.shutdownApprovedTargets.filter((name) => !requestTargets.includes(name)),
      shutdownRejectedTargets: removeRejectedTargets(state.shutdownRejectedTargets, requestTargets),
    });
  }

  if (structuredType === 'shutdown_response' && responder) {
    const nextKnownTeammates = normalizeNames([responder, ...state.knownTeammates]);
    if (approval === true) {
      const affectedTasks = assignedTaskRecordsForTeammate(state.taskAssignments, responder)
        .map((task) => ({
          taskId: trimmed(task?.taskId),
          subject: trimmed(task?.subject),
        }))
        .filter((task) => task.taskId);
      let nextAssignments = { ...state.taskAssignments };
      let nextPendingTaskAssignments = state.pendingTaskAssignments;
      for (const task of affectedTasks) {
        nextAssignments = withoutTaskAssignment(nextAssignments, task.taskId);
        nextPendingTaskAssignments = withoutPendingTaskAssignment(nextPendingTaskAssignments, task.taskId);
      }

      const nextTerminationNotifications = withPendingTerminationNotification(state.pendingTerminationNotifications, {
        teammateName: responder,
        message: terminationNotificationMessage(responder, affectedTasks),
        affectedTasks,
        recordedAt: state.now,
      });

      return finalizeTeamState({
        knownTeammates: nextKnownTeammates,
        shutdownApprovedTargets: normalizeNames([responder, ...state.shutdownApprovedTargets]),
        shutdownRejectedTargets: removeRejectedTargets(state.shutdownRejectedTargets, [responder]),
        taskAssignments: nextAssignments,
        pendingTaskAssignments: nextPendingTaskAssignments,
        pendingTerminationNotifications: nextTerminationNotifications,
      });
    }

    if (approval === false) {
      state.shutdownRejectedTargets[responder] = {
        name: responder,
        reason: trimmed(payload?.tool_input?.message?.reason),
        recordedAt: state.now,
      };

      return finalizeTeamState({
        knownTeammates: nextKnownTeammates,
        shutdownApprovedTargets: state.shutdownApprovedTargets.filter((name) => name !== responder),
        shutdownRejectedTargets: state.shutdownRejectedTargets,
      });
    }
  }

  return finalizeTeamState();
}
