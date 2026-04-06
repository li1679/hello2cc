import {
  lastIntentProfile,
  lastPromptEnvelope,
  normalizeWorkflowState,
  recentZeroResultToolSearchQueries,
  taskIdFromInput,
  workflowState,
} from './tool-policy-state-shared.mjs';
import {
  blockedTaskIds,
  blockedTaskRecords,
  hasPendingPlanApprovalFrom,
  knownTeammateNames,
  pendingPlanApprovalRequestId,
  shutdownApprovedKnownTeammates,
  shutdownApprovedTargets,
  shutdownCoversKnownTeammates,
  shutdownRejectedTargets,
  shutdownRequestedTargets,
  teamHasOpenTasks,
} from './team-continuity-queries.mjs';
import { workflowContinuitySnapshot } from './team-continuity-snapshots.mjs';

export {
  blockedTaskIds,
  blockedTaskRecords,
  hasPendingPlanApprovalFrom,
  knownTeammateNames,
  lastIntentProfile,
  lastPromptEnvelope,
  normalizeWorkflowState,
  pendingPlanApprovalRequestId,
  recentZeroResultToolSearchQueries,
  shutdownApprovedKnownTeammates,
  shutdownApprovedTargets,
  shutdownCoversKnownTeammates,
  shutdownRejectedTargets,
  shutdownRequestedTargets,
  taskIdFromInput,
  teamHasOpenTasks,
  workflowContinuitySnapshot,
  workflowState,
};

export function hasKnownTask(sessionContext = {}, taskId) {
  const normalizedTaskId = String(taskId || '').trim();
  if (!normalizedTaskId) return false;
  return workflowState(sessionContext).lastKnownTaskIds.includes(normalizedTaskId);
}

export function isTaskReadVerified(sessionContext = {}, taskId) {
  const normalizedTaskId = String(taskId || '').trim();
  if (!normalizedTaskId) return false;
  return Boolean(workflowState(sessionContext).taskReadGuards[normalizedTaskId]);
}

export function hasActiveTaskBoard(sessionContext = {}) {
  const state = workflowState(sessionContext);
  return Boolean(
    state.activeTaskBoard ||
    state.lastKnownTaskIds.length ||
    state.lastTaskCreatedId ||
    state.lastTaskReadId ||
    state.lastTaskUpdatedId ||
    Object.keys(state.taskSummaries).length,
  );
}

export function isPlanModeActive(sessionContext = {}) {
  return Boolean(workflowState(sessionContext).planModeEntered);
}

export function hasSpecificHostSurface(sessionContext = {}) {
  return Boolean(
    Array.isArray(sessionContext?.surfacedSkillNames) && sessionContext.surfacedSkillNames.length ||
    Array.isArray(sessionContext?.loadedCommandNames) && sessionContext.loadedCommandNames.length ||
    Array.isArray(sessionContext?.workflowNames) && sessionContext.workflowNames.length ||
    Array.isArray(sessionContext?.availableDeferredToolNames) && sessionContext.availableDeferredToolNames.length ||
    Array.isArray(sessionContext?.loadedDeferredToolNames) && sessionContext.loadedDeferredToolNames.length ||
    Array.isArray(sessionContext?.mcpResources) && sessionContext.mcpResources.length
  );
}
