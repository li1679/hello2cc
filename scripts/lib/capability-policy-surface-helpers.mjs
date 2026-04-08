import {
  availableDeferredToolNames,
  mcpInstructionEntries,
  mcpResources,
  surfacedSkills,
  workflowNames,
} from './session-context-accessors.mjs';

export function hasDeferredSurface(sessionContext = {}) {
  return availableDeferredToolNames(sessionContext).length > 0;
}

export function hasSkillSurface(sessionContext = {}) {
  return surfacedSkills(sessionContext).length > 0 || workflowNames(sessionContext).length > 0;
}

export function hasMcpSurface(sessionContext = {}) {
  return mcpResources(sessionContext).length > 0 || mcpInstructionEntries(sessionContext).length > 0;
}
