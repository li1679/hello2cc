import {
  normalizeNames,
  normalizeTaskIds,
  openSharedTaskStatus,
} from './session-state-task-readers.mjs';
import {
  trimmed,
  truncateText,
} from './session-state-basic-helpers.mjs';
import { taskStateForResolution } from './session-state-team-task-resolution.mjs';

export function withTaskAssignment(taskAssignments = {}, record = {}) {
  const taskId = trimmed(record?.taskId);
  const owner = trimmed(record?.owner);
  if (!taskId || !owner) {
    return taskAssignments;
  }

  return {
    ...taskAssignments,
    [taskId]: {
      ...(taskAssignments[taskId] || {}),
      taskId,
      owner,
      subject: trimmed(record?.subject),
      status: trimmed(record?.status),
      blocks: normalizeTaskIds(record?.blocks),
      blockedBy: normalizeTaskIds(record?.blockedBy || record?.blocked_by),
      assignedBy: trimmed(record?.assignedBy),
      recordedAt: trimmed(record?.recordedAt) || new Date().toISOString(),
    },
  };
}

export function withoutTaskAssignment(taskAssignments = {}, taskId = '') {
  const normalizedTaskId = trimmed(taskId);
  if (!normalizedTaskId) {
    return taskAssignments;
  }

  const next = { ...taskAssignments };
  delete next[normalizedTaskId];
  return next;
}

export function withPendingTaskAssignment(notifications = {}, record = {}) {
  const taskId = trimmed(record?.taskId);
  const owner = trimmed(record?.owner);
  if (!taskId || !owner) {
    return notifications;
  }

  return {
    ...notifications,
    [taskId]: {
      ...(notifications[taskId] || {}),
      taskId,
      owner,
      subject: trimmed(record?.subject),
      description: trimmed(record?.description),
      assignedBy: trimmed(record?.assignedBy),
      recordedAt: trimmed(record?.recordedAt) || new Date().toISOString(),
    },
  };
}

export function withoutPendingTaskAssignment(notifications = {}, taskId = '') {
  const normalizedTaskId = trimmed(taskId);
  if (!normalizedTaskId) {
    return notifications;
  }

  const next = { ...notifications };
  delete next[normalizedTaskId];
  return next;
}

export function withoutPendingTaskAssignmentsByOwner(notifications = {}, owner = '') {
  const normalizedOwner = trimmed(owner);
  if (!normalizedOwner) {
    return notifications;
  }

  return Object.fromEntries(
    Object.entries(notifications).filter(([, record]) => trimmed(record?.owner) !== normalizedOwner),
  );
}

export function withPendingTerminationNotification(notifications = {}, record = {}) {
  const teammateName = trimmed(record?.teammateName);
  const recordedAt = trimmed(record?.recordedAt) || new Date().toISOString();
  if (!teammateName || !recordedAt) {
    return notifications;
  }

  return {
    ...notifications,
    [teammateName]: {
      teammateName,
      message: trimmed(record?.message),
      affectedTasks: (Array.isArray(record?.affectedTasks) ? record.affectedTasks : [])
        .map((task) => ({
          taskId: trimmed(task?.taskId),
          subject: trimmed(task?.subject),
        }))
        .filter((task) => task.taskId),
      recordedAt,
    },
  };
}

export function withoutPendingTerminationNotification(notifications = {}, name = '') {
  const normalizedName = trimmed(name);
  if (!normalizedName) {
    return notifications;
  }

  const next = { ...notifications };
  delete next[normalizedName];
  return next;
}

export function withoutIdleNotification(notifications = {}, name = '') {
  const normalizedName = trimmed(name);
  if (!normalizedName) {
    return notifications;
  }

  const next = { ...notifications };
  delete next[normalizedName];
  return next;
}

export function withoutIdleNotificationsByTargets(notifications = {}, targets = []) {
  return normalizeNames(targets).reduce(
    (current, target) => withoutIdleNotification(current, target),
    { ...notifications },
  );
}

export function assignedTaskRecordsForTeammate(taskAssignments = {}, teammateName = '') {
  const normalizedName = trimmed(teammateName);
  if (!normalizedName) return [];

  return Object.values(taskAssignments)
    .filter((record) => trimmed(record?.owner) === normalizedName && openSharedTaskStatus(record?.status))
    .map((record) => ({
      taskId: trimmed(record?.taskId),
      subject: trimmed(record?.subject),
      status: trimmed(record?.status),
      blockedBy: normalizeTaskIds(record?.blockedBy || record?.blocked_by),
    }))
    .filter((record) => record.taskId);
}

export function assignmentNotificationSummary(record = {}) {
  const taskId = trimmed(record?.taskId);
  const subject = trimmed(record?.subject);
  const assignedBy = trimmed(record?.assignedBy) || 'team-lead';
  if (!taskId) {
    return '';
  }

  const taskLabel = subject ? `#${taskId} ${subject}` : `#${taskId}`;
  return `${taskLabel} assigned by ${assignedBy}`;
}

export function idleNotificationSummary(workflow = {}, teammateName = '') {
  const lastTarget = trimmed(workflow?.lastMessageTarget);
  const lastMessageSummary = trimmed(workflow?.lastMessageSummary);
  const lastTaskId = trimmed(workflow?.lastTaskUpdatedId);
  const lastTaskStatus = trimmed(workflow?.lastTaskUpdatedStatus);
  const lastTaskSubject = trimmed(workflow?.taskSummaries?.[lastTaskId]?.subject);

  if (lastTarget && lastMessageSummary) {
    return truncateText(`${teammateName || 'teammate'} -> ${lastTarget}: ${lastMessageSummary}`, 120);
  }

  if (lastTaskId && lastTaskStatus) {
    const taskLabel = lastTaskSubject ? `#${lastTaskId} ${lastTaskSubject}` : `#${lastTaskId}`;
    return truncateText(`${teammateName || 'teammate'} updated ${taskLabel} -> ${lastTaskStatus}`, 120);
  }

  return '';
}

export function terminationNotificationMessage(teammateName = '', affectedTasks = []) {
  const normalizedName = trimmed(teammateName) || 'teammate';
  const taskList = (Array.isArray(affectedTasks) ? affectedTasks : [])
    .map((task) => {
      const taskId = trimmed(task?.taskId);
      if (!taskId) return '';
      const subject = trimmed(task?.subject);
      return subject ? `#${taskId} "${subject}"` : `#${taskId}`;
    })
    .filter(Boolean);

  if (taskList.length === 0) {
    return `${normalizedName} has shut down.`;
  }

  return `${normalizedName} has shut down. ${taskList.length} task(s) need reassignment: ${taskList.join(', ')}. Use TaskList / TaskUpdate(owner) to reassign them.`;
}

export function prunePendingTaskAssignments(notifications = {}, taskAssignments = {}, actorName = '', toolName = '', previous = {}, next = {}) {
  const normalizedActor = trimmed(actorName);
  const nextNotifications = {};

  for (const [taskId, record] of Object.entries(notifications)) {
    const owner = trimmed(record?.owner);
    const { owner: effectiveOwner, status } = taskStateForResolution(taskId, taskAssignments, previous, next);
    const resolved = effectiveOwner !== owner || ['completed', 'deleted'].includes(status.toLowerCase());
    const consumedByOwner = normalizedActor
      && owner === normalizedActor
      && ['TaskList', 'TaskGet', 'TaskUpdate', 'SendMessage'].includes(toolName);

    if (!resolved && !consumedByOwner) {
      nextNotifications[taskId] = record;
    }
  }

  return nextNotifications;
}

export function prunePendingTerminationNotifications(notifications = {}, taskAssignments = {}, previous = {}, next = {}) {
  const nextNotifications = {};

  for (const [name, record] of Object.entries(notifications)) {
    const teammateName = trimmed(record?.teammateName || name);
    const affectedTasks = Array.isArray(record?.affectedTasks) ? record.affectedTasks : [];
    const unresolvedTasks = affectedTasks.filter((task) => {
      const { owner, status } = taskStateForResolution(task?.taskId, taskAssignments, previous, next);
      const normalizedStatus = status.toLowerCase();
      if (['completed', 'deleted'].includes(normalizedStatus)) {
        return false;
      }

      return !owner || owner === teammateName;
    });

    if (unresolvedTasks.length > 0) {
      nextNotifications[name] = {
        ...record,
        affectedTasks: unresolvedTasks.map((task) => ({
          taskId: trimmed(task?.taskId),
          subject: trimmed(task?.subject),
        })),
        message: terminationNotificationMessage(teammateName, unresolvedTasks),
      };
    }
  }

  return nextNotifications;
}

export function removeRejectedTargets(records = {}, targets = []) {
  const next = { ...records };
  for (const target of targets) {
    delete next[target];
  }
  return next;
}
