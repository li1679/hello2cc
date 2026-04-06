import {
  normalizeTaskCreateInput,
  normalizeTaskGetInput,
  normalizeTaskListInput,
  normalizeTaskUpdateInput,
  normalizeTeamDeleteInput,
} from './tool-policy-task-inputs.mjs';

export function normalizeToolSearchInput(input = {}, sessionContext = {}) {
  // Native Claude Code does not hard-deny ToolSearch for strategy mistakes.
  // The host should front-load capability boundaries and let ToolSearch return
  // its own no-match / select-no-op signals instead of emitting a red deny.
  return {
    input,
    changed: false,
    blocked: false,
    reason: '',
  };
}

export function normalizeEnterPlanModeInput(input = {}, sessionContext = {}) {
  return { input, changed: false, reason: '', blocked: false };
}

export function normalizeExitPlanModeInput(input = {}, sessionContext = {}) {
  return { input, changed: false, reason: '', blocked: false };
}

export function normalizeAskUserQuestionInput(input = {}, sessionContext = {}) {
  return { input, changed: false, reason: '', blocked: false };
}

export {
  normalizeTaskCreateInput,
  normalizeTaskGetInput,
  normalizeTaskListInput,
  normalizeTaskUpdateInput,
  normalizeTeamDeleteInput,
};
