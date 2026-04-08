function nonEmptyArray(values) {
  return Array.isArray(values) ? values.filter(Boolean) : [];
}

export function detectedTools(sessionContext = {}) {
  return nonEmptyArray(sessionContext?.toolNames);
}

export function detectedAgents(sessionContext = {}) {
  const surfaced = nonEmptyArray(sessionContext?.surfacedAgentTypes);
  return surfaced.length ? surfaced : nonEmptyArray(sessionContext?.agentTypes);
}

export function surfacedSkills(sessionContext = {}) {
  return nonEmptyArray(sessionContext?.surfacedSkillNames);
}

export function surfacedSkillEntries(sessionContext = {}) {
  return nonEmptyArray(sessionContext?.surfacedSkills);
}

export function loadedCommandEntries(sessionContext = {}) {
  return nonEmptyArray(sessionContext?.loadedCommands);
}

export function workflowNames(sessionContext = {}) {
  return nonEmptyArray(sessionContext?.workflowNames);
}

export function workflowEntries(sessionContext = {}) {
  return nonEmptyArray(sessionContext?.workflowEntries);
}

export function availableDeferredToolNames(sessionContext = {}) {
  return nonEmptyArray(sessionContext?.availableDeferredToolNames);
}

export function loadedDeferredToolNames(sessionContext = {}) {
  return nonEmptyArray(sessionContext?.loadedDeferredToolNames);
}

export function mcpResources(sessionContext = {}) {
  return nonEmptyArray(sessionContext?.mcpResources);
}

export function mcpInstructionEntries(sessionContext = {}) {
  return nonEmptyArray(sessionContext?.mcpInstructionEntries);
}
