import { participantNameOrEmpty } from './participant-name.mjs';
import { taskIdFromInput } from './tool-policy-state.mjs';

function trimmed(value) {
  return String(value || '').trim();
}

/**
 * Normalizes task-board creation so only sustained tracked work can enter task mode.
 */
export function normalizeTaskCreateInput(input = {}, sessionContext = {}) {
  return { input, changed: false, reason: '', blocked: false };
}

/**
 * Normalizes task-board listing so it only appears once tracked work continuity is real.
 */
export function normalizeTaskListInput(input = {}, sessionContext = {}) {
  return { input, changed: false, reason: '', blocked: false };
}

/**
 * Normalizes task reads so TaskGet only runs once a concrete task target exists.
 */
export function normalizeTaskGetInput(input = {}, sessionContext = {}) {
  return { input, changed: false, reason: '', blocked: false };
}

/**
 * Normalizes task mutations so task-board state stays consistent and read-first.
 */
export function normalizeTaskUpdateInput(input = {}, sessionContext = {}) {
  const taskId = taskIdFromInput(input);
  const rawOwner = trimmed(input?.owner);
  const owner = participantNameOrEmpty(rawOwner);
  const normalizedInput = rawOwner && !owner
    ? (() => {
        const next = { ...input };
        delete next.owner;
        return next;
      })()
    : input;
  const placeholderReason = rawOwner && !owner
    ? `hello2cc stripped placeholder TaskUpdate.owner=${JSON.stringify(rawOwner)}; omitted owner values must stay empty instead of being treated as unknown teammates`
    : '';

  if (!taskId) {
    return {
      input: normalizedInput,
      changed: normalizedInput !== input,
      reason: placeholderReason,
      blocked: false,
    };
  }

  return {
    input: normalizedInput,
    changed: normalizedInput !== input,
    reason: placeholderReason,
    blocked: false,
  };
}

/**
 * Normalizes team teardown so shutdown, open work, and acknowledgements remain fail-closed.
 */
export function normalizeTeamDeleteInput(input = {}, sessionContext = {}) {
  return { input, changed: false, reason: '', blocked: false };
}
