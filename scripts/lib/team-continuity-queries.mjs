import {
  MAX_REMEMBERED_TASK_IDS,
  MAX_REMEMBERED_TEAMMATES,
  trimmed,
  uniqueStrings,
  workflowState,
} from './tool-policy-state-shared.mjs';
import {
  mergedTaskAssignments,
  sharedTeamState,
  taskSummaryEntries,
  unresolvedTaskIdSet,
} from './team-continuity-state.mjs';

/**
 * Returns all teammate names inferred from workflow ownership and shared team state.
 */
export function knownTeammateNames(sessionContext = {}) {
  const state = workflowState(sessionContext);
  const teamState = sharedTeamState(sessionContext);
  const ownerNames = taskSummaryEntries(sessionContext)
    .filter(([, record]) => {
      const status = trimmed(record?.status).toLowerCase();
      return Boolean(status) && !['completed', 'deleted'].includes(status);
    })
    .map(([, record]) => trimmed(record?.owner))
    .filter(Boolean);

  return uniqueStrings([
    ...state.knownTeammates,
    ...teamState.knownTeammates,
    ...ownerNames,
  ], MAX_REMEMBERED_TEAMMATES);
}

function openTaskIds(sessionContext = {}) {
  return taskSummaryEntries(sessionContext)
    .filter(([, record]) => {
      const status = trimmed(record?.status).toLowerCase();
      return Boolean(status) && !['completed', 'deleted'].includes(status);
    })
    .map(([taskId]) => taskId);
}

/**
 * Returns whether the current team context still has open tasks.
 */
export function teamHasOpenTasks(sessionContext = {}) {
  return openTaskIds(sessionContext).length > 0;
}

/**
 * Returns every teammate that has already received a shutdown request.
 */
export function shutdownRequestedTargets(sessionContext = {}) {
  const state = workflowState(sessionContext);
  const teamState = sharedTeamState(sessionContext);
  return uniqueStrings([
    ...state.shutdownRequestedTargets,
    ...teamState.shutdownRequestedTargets,
  ], MAX_REMEMBERED_TEAMMATES);
}

/**
 * Returns teammates that already approved shutdown.
 */
export function shutdownApprovedTargets(sessionContext = {}) {
  return sharedTeamState(sessionContext).shutdownApprovedTargets;
}

/**
 * Returns teammates that rejected shutdown.
 */
export function shutdownRejectedTargets(sessionContext = {}) {
  return Object.values(sharedTeamState(sessionContext).shutdownRejectedTargets)
    .map((record) => trimmed(record?.name))
    .filter(Boolean);
}

function pendingPlanApprovals(sessionContext = {}) {
  return sharedTeamState(sessionContext).pendingPlanApprovals;
}

/**
 * Returns whether the specified teammate still owes a plan approval response.
 */
export function hasPendingPlanApprovalFrom(sessionContext = {}, name) {
  const normalizedName = trimmed(name);
  if (!normalizedName) return false;
  return Boolean(pendingPlanApprovals(sessionContext)[normalizedName]);
}

/**
 * Returns the request id associated with a pending plan approval.
 */
export function pendingPlanApprovalRequestId(sessionContext = {}, name) {
  const normalizedName = trimmed(name);
  if (!normalizedName) return '';
  return trimmed(pendingPlanApprovals(sessionContext)[normalizedName]?.requestId);
}

/**
 * Returns blocked task records whose blockers are still unresolved.
 */
export function blockedTaskRecords(sessionContext = {}) {
  const unresolved = unresolvedTaskIdSet(sessionContext);

  return taskSummaryEntries(sessionContext)
    .filter(([, record]) => {
      const status = trimmed(record?.status).toLowerCase();
      return Boolean(status) && !['completed', 'deleted'].includes(status);
    })
    .map(([taskId, record]) => {
      const blockedBy = uniqueStrings(record?.blockedBy || record?.blocked_by, MAX_REMEMBERED_TASK_IDS)
        .filter((blockerId) => unresolved.has(blockerId));

      return {
        task_id: taskId,
        subject: trimmed(record?.subject),
        owner: trimmed(record?.owner),
        blocked_by: blockedBy,
      };
    })
    .filter((record) => record.blocked_by.length > 0);
}

/**
 * Returns task ids that are currently blocked by another unresolved task.
 */
export function blockedTaskIds(sessionContext = {}) {
  return blockedTaskRecords(sessionContext).map((record) => record.task_id);
}

/**
 * Returns whether shutdown requests cover every known teammate.
 */
export function shutdownCoversKnownTeammates(sessionContext = {}) {
  const state = workflowState(sessionContext);
  const teammates = knownTeammateNames(sessionContext);
  if (!teammates.length) {
    return true;
  }

  if (state.shutdownBroadcastRequested) {
    return true;
  }

  const requested = new Set(shutdownRequestedTargets(sessionContext));
  return teammates.every((name) => requested.has(name));
}

/**
 * Returns whether every known teammate has approved shutdown.
 */
export function shutdownApprovedKnownTeammates(sessionContext = {}) {
  const teammates = knownTeammateNames(sessionContext);
  if (!teammates.length) {
    return true;
  }

  const approved = new Set(shutdownApprovedTargets(sessionContext));
  return teammates.every((name) => approved.has(name));
}

function assignedTaskRecords(sessionContext = {}) {
  return Object.values(mergedTaskAssignments(sessionContext))
    .filter((record) => trimmed(record?.taskId) && trimmed(record?.owner));
}

/**
 * Returns merged assigned-task records for a specific teammate.
 */
export function currentAssignedTasksForTeammate(sessionContext = {}, name) {
  const normalizedName = trimmed(name);
  if (!normalizedName) return [];

  return assignedTaskRecords(sessionContext)
    .filter((record) => trimmed(record?.owner) === normalizedName)
    .map((record) => ({
      task_id: trimmed(record?.taskId),
      subject: trimmed(record?.subject),
      status: trimmed(record?.status),
      blocks: uniqueStrings(record?.blocks, MAX_REMEMBERED_TASK_IDS),
      blocked_by: uniqueStrings(record?.blockedBy || record?.blocked_by, MAX_REMEMBERED_TASK_IDS),
      assigned_by: trimmed(record?.assignedBy),
    }))
    .filter((record) => record.task_id);
}
