import { activeTeamName } from './capability-policy-helpers.mjs';
import {
  hasKnownTask,
  knownTeammateNames,
  taskIdFromInput,
} from './tool-policy-state.mjs';

function trimmed(value) {
  return String(value || '').trim();
}

function isReservedTeamOwner(name) {
  const normalized = trimmed(name).toLowerCase();
  return ['team-lead', 'main', 'default'].includes(normalized);
}

function taskLinkIds(value) {
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map((entry) => trimmed(entry))
      .filter(Boolean),
  )];
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
  const owner = trimmed(input?.owner);
  const linkedTasks = taskLinkIds([...(Array.isArray(input?.addBlocks) ? input.addBlocks : []), ...(Array.isArray(input?.addBlockedBy) ? input.addBlockedBy : [])]);

  if (!taskId) {
    return { input, changed: false, reason: '', blocked: false };
  }

  const activeTeam = activeTeamName(sessionContext);
  if (activeTeam && owner && !isReservedTeamOwner(owner) && !knownTeammateNames(sessionContext).includes(owner)) {
    return {
      input,
      changed: false,
      blocked: true,
      reason: `hello2cc blocked TaskUpdate owner assignment for "${owner}" because active team "${activeTeam}" does not have that teammate in current continuity yet; create or surface the real teammate first, then assign via TaskUpdate(owner)`,
    };
  }

  if (linkedTasks.includes(taskId)) {
    return {
      input,
      changed: false,
      blocked: true,
      reason: `hello2cc blocked TaskUpdate for task "${taskId}" because a task cannot block itself; use another real taskId in addBlocks/addBlockedBy`,
    };
  }

  const unknownLinkedTasks = linkedTasks.filter((linkedTaskId) => !hasKnownTask(sessionContext, linkedTaskId));
  if (unknownLinkedTasks.length > 0) {
    return {
      input,
      changed: false,
      blocked: true,
      reason: `hello2cc blocked TaskUpdate for task "${taskId}" because blocker references ${unknownLinkedTasks.map((id) => `"${id}"`).join(', ')} are not known in current task-board continuity; refresh with TaskList/TaskGet before mutating blocker state`,
    };
  }

  return { input, changed: false, reason: '', blocked: false };
}

/**
 * Normalizes team teardown so shutdown, open work, and acknowledgements remain fail-closed.
 */
export function normalizeTeamDeleteInput(input = {}, sessionContext = {}) {
  return { input, changed: false, reason: '', blocked: false };
}
