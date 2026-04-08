import { normalizeWorkflowState } from './tool-policy-state.mjs';
import {
  normalizeTaskIds,
  readTaskBlockedBy,
  readTaskBlocks,
  readTaskOwner,
  readTaskStatus,
  readTaskSubject,
} from './session-state-task-readers.mjs';
import { trimmed } from './session-state-basic-helpers.mjs';

export function rememberedTaskSummary(entry = {}, taskId = '') {
  const normalizedTaskId = trimmed(taskId);
  if (!normalizedTaskId) return {};
  return normalizeWorkflowState(entry?.workflowState).taskSummaries[normalizedTaskId] || {};
}

export function resolvedTaskOwner(payload = {}, previous = {}, next = {}, taskId = '') {
  return readTaskOwner(payload)
    || trimmed(rememberedTaskSummary(next, taskId)?.owner)
    || trimmed(rememberedTaskSummary(previous, taskId)?.owner);
}

export function resolvedTaskSubject(payload = {}, previous = {}, next = {}, taskId = '') {
  return readTaskSubject(payload)
    || trimmed(rememberedTaskSummary(next, taskId)?.subject)
    || trimmed(rememberedTaskSummary(previous, taskId)?.subject);
}

export function resolvedTaskStatus(payload = {}, previous = {}, next = {}, taskId = '') {
  return readTaskStatus(payload)
    || trimmed(rememberedTaskSummary(next, taskId)?.status)
    || trimmed(rememberedTaskSummary(previous, taskId)?.status);
}

export function resolvedTaskBlocks(payload = {}, previous = {}, next = {}, taskId = '') {
  const direct = readTaskBlocks(payload);
  if (direct.length > 0 || payload?.tool_input?.addBlocks !== undefined) {
    const current = normalizeTaskIds(rememberedTaskSummary(next, taskId)?.blocks || rememberedTaskSummary(previous, taskId)?.blocks);
    return normalizeTaskIds([
      ...current,
      ...direct,
    ]);
  }

  return normalizeTaskIds(
    rememberedTaskSummary(next, taskId)?.blocks
    || rememberedTaskSummary(previous, taskId)?.blocks,
  );
}

export function resolvedTaskBlockedBy(payload = {}, previous = {}, next = {}, taskId = '') {
  const direct = readTaskBlockedBy(payload);
  if (direct.length > 0 || payload?.tool_input?.addBlockedBy !== undefined) {
    const current = normalizeTaskIds(rememberedTaskSummary(next, taskId)?.blockedBy || rememberedTaskSummary(previous, taskId)?.blockedBy);
    return normalizeTaskIds([
      ...current,
      ...direct,
    ]);
  }

  return normalizeTaskIds(
    rememberedTaskSummary(next, taskId)?.blockedBy
    || rememberedTaskSummary(previous, taskId)?.blockedBy,
  );
}

export function taskStateForResolution(taskId = '', taskAssignments = {}, previous = {}, next = {}) {
  const normalizedTaskId = trimmed(taskId);
  const sharedRecord = taskAssignments[normalizedTaskId] || {};
  const nextSummary = rememberedTaskSummary(next, normalizedTaskId);
  const previousSummary = rememberedTaskSummary(previous, normalizedTaskId);

  return {
    owner: trimmed(sharedRecord?.owner) || trimmed(nextSummary?.owner) || trimmed(previousSummary?.owner),
    status: trimmed(sharedRecord?.status) || trimmed(nextSummary?.status) || trimmed(previousSummary?.status),
  };
}
