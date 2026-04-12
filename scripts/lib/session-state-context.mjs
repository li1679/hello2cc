import {
  deriveAgentCapabilities,
  deriveToolCapabilities,
  normalizeAgentTypes,
  normalizeToolNames,
} from './session-capabilities.mjs';
import { summarizeIntentForState } from './intent-profile.mjs';
import { extractSessionContextFromTranscript } from './transcript-context.mjs';
import {
  mutateSessionEntry,
  normalizeSessionId,
} from './session-state-store.mjs';
import { participantNameOrEmpty } from './participant-name.mjs';
import { realTeamNameOrEmpty } from './team-name.mjs';

function normalizeIntentProfile(profile = {}) {
  const normalized = summarizeIntentForState(profile);
  return normalized && typeof normalized === 'object' ? normalized : {};
}

/**
 * Builds the in-memory session snapshot from hook payload fields and transcript hints.
 */
export function sessionContextFromPayload(payload = {}) {
  const sessionId = normalizeSessionId(payload?.session_id);
  const tools = normalizeToolNames(payload?.tools);
  const agents = normalizeAgentTypes(payload?.agents);

  return {
    ...extractSessionContextFromTranscript(payload?.transcript_path, sessionId),
    ...(String(payload?.model || '').trim() ? { mainModel: String(payload.model).trim() } : {}),
    ...(String(payload?.output_style || '').trim() ? { outputStyle: String(payload.output_style).trim() } : {}),
    ...(String(payload?.cwd || '').trim() ? { currentCwd: String(payload.cwd).trim() } : {}),
    ...(tools.length ? {
      toolNames: tools,
      ...deriveToolCapabilities(tools),
    } : {}),
    ...(agents.length ? {
      agentTypes: agents,
      ...deriveAgentCapabilities(agents),
    } : {}),
  };
}

function rememberableContext(context = {}) {
  const attachedTeamContext = context.attachedTeamContext && typeof context.attachedTeamContext === 'object'
    ? context.attachedTeamContext
    : {};

  return {
    mainModel: String(context.mainModel || '').trim(),
    outputStyle: String(context.outputStyle || '').trim(),
    attachedOutputStyle: String(context.attachedOutputStyle || '').trim(),
    criticalSystemReminder: String(context.criticalSystemReminder || '').trim(),
    currentCwd: String(context.currentCwd || '').trim(),
    toolNames: Array.isArray(context.toolNames) ? context.toolNames : [],
    agentTypes: Array.isArray(context.agentTypes) ? context.agentTypes : [],
    surfacedAgentTypes: Array.isArray(context.surfacedAgentTypes) ? context.surfacedAgentTypes : [],
    surfacedSkills: Array.isArray(context.surfacedSkills) ? context.surfacedSkills : [],
    surfacedSkillNames: Array.isArray(context.surfacedSkillNames) ? context.surfacedSkillNames : [],
    loadedCommands: Array.isArray(context.loadedCommands) ? context.loadedCommands : [],
    loadedCommandNames: Array.isArray(context.loadedCommandNames) ? context.loadedCommandNames : [],
    workflowEntries: Array.isArray(context.workflowEntries) ? context.workflowEntries : [],
    workflowNames: Array.isArray(context.workflowNames) ? context.workflowNames : [],
    availableDeferredToolNames: Array.isArray(context.availableDeferredToolNames) ? context.availableDeferredToolNames : [],
    loadedDeferredToolNames: Array.isArray(context.loadedDeferredToolNames) ? context.loadedDeferredToolNames : [],
    mcpResources: Array.isArray(context.mcpResources) ? context.mcpResources : [],
    teamName: realTeamNameOrEmpty(context.teamName),
    agentName: participantNameOrEmpty(context.agentName),
    teamConfigPath: String(context.teamConfigPath || '').trim(),
    taskListPath: String(context.taskListPath || '').trim(),
    attachedTeamContext: {
      ...(realTeamNameOrEmpty(attachedTeamContext.teamName) ? { teamName: realTeamNameOrEmpty(attachedTeamContext.teamName) } : {}),
      ...(participantNameOrEmpty(attachedTeamContext.agentName) ? { agentName: participantNameOrEmpty(attachedTeamContext.agentName) } : {}),
      ...(String(attachedTeamContext.teamConfigPath || '').trim() ? { teamConfigPath: String(attachedTeamContext.teamConfigPath).trim() } : {}),
      ...(String(attachedTeamContext.taskListPath || '').trim() ? { taskListPath: String(attachedTeamContext.taskListPath).trim() } : {}),
    },
    attachedPlanMode: context.attachedPlanMode && typeof context.attachedPlanMode === 'object'
      ? context.attachedPlanMode
      : {},
    attachedAutoMode: context.attachedAutoMode && typeof context.attachedAutoMode === 'object'
      ? context.attachedAutoMode
      : {},
    attachedSkillListing: context.attachedSkillListing && typeof context.attachedSkillListing === 'object'
      ? context.attachedSkillListing
      : {},
    attachedRelevantMemories: Array.isArray(context.attachedRelevantMemories) ? context.attachedRelevantMemories : [],
    attachedTeammateMailbox: context.attachedTeammateMailbox && typeof context.attachedTeammateMailbox === 'object'
      ? context.attachedTeammateMailbox
      : {},
    mcpInstructionEntries: Array.isArray(context.mcpInstructionEntries) ? context.mcpInstructionEntries : [],
  };
}

function hasRememberableFields(context = {}) {
  return Boolean(
    context.mainModel ||
    context.outputStyle ||
    context.attachedOutputStyle ||
    context.criticalSystemReminder ||
    context.currentCwd ||
    context.toolNames.length ||
    context.agentTypes.length ||
    context.surfacedAgentTypes.length ||
    context.surfacedSkills.length ||
    context.surfacedSkillNames.length ||
    context.loadedCommands.length ||
    context.loadedCommandNames.length ||
    context.workflowEntries.length ||
    context.workflowNames.length ||
    context.availableDeferredToolNames.length ||
    context.loadedDeferredToolNames.length ||
    context.mcpResources.length ||
    context.teamName ||
    context.agentName ||
    context.teamConfigPath ||
    context.taskListPath ||
    Object.keys(context.attachedTeamContext).length ||
    Object.keys(context.attachedPlanMode).length ||
    Object.keys(context.attachedAutoMode).length ||
    Object.keys(context.attachedSkillListing).length ||
    context.attachedRelevantMemories.length ||
    Object.keys(context.attachedTeammateMailbox).length ||
    context.mcpInstructionEntries.length
  );
}

/**
 * Persists the latest session context snapshot for future hooks in the same session.
 */
export function rememberSessionContext(payload) {
  const key = normalizeSessionId(payload?.session_id);
  const context = rememberableContext(sessionContextFromPayload(payload));
  if (!key || !hasRememberableFields(context)) {
    return {};
  }

  return mutateSessionEntry(key, (current) => ({
    ...current,
    ...(context.mainModel ? { mainModel: context.mainModel } : {}),
    ...(context.outputStyle ? { outputStyle: context.outputStyle } : {}),
    ...(context.attachedOutputStyle ? { attachedOutputStyle: context.attachedOutputStyle } : {}),
    ...(context.criticalSystemReminder ? { criticalSystemReminder: context.criticalSystemReminder } : {}),
    ...(context.currentCwd ? { currentCwd: context.currentCwd } : {}),
    ...(context.toolNames.length ? {
      toolNames: context.toolNames,
      ...deriveToolCapabilities(context.toolNames),
    } : {}),
    ...(context.agentTypes.length ? {
      agentTypes: context.agentTypes,
      ...deriveAgentCapabilities(context.agentTypes),
    } : {}),
    ...(context.surfacedAgentTypes.length ? { surfacedAgentTypes: context.surfacedAgentTypes } : {}),
    ...(context.surfacedSkills.length ? { surfacedSkills: context.surfacedSkills } : {}),
    ...(context.surfacedSkillNames.length ? { surfacedSkillNames: context.surfacedSkillNames } : {}),
    ...(context.loadedCommands.length ? { loadedCommands: context.loadedCommands } : {}),
    ...(context.loadedCommandNames.length ? { loadedCommandNames: context.loadedCommandNames } : {}),
    ...(context.workflowEntries.length ? { workflowEntries: context.workflowEntries } : {}),
    ...(context.workflowNames.length ? { workflowNames: context.workflowNames } : {}),
    ...(context.availableDeferredToolNames.length ? { availableDeferredToolNames: context.availableDeferredToolNames } : {}),
    ...(context.loadedDeferredToolNames.length ? { loadedDeferredToolNames: context.loadedDeferredToolNames } : {}),
    ...(context.mcpResources.length ? { mcpResources: context.mcpResources } : {}),
    ...(context.teamName ? { teamName: context.teamName } : {}),
    ...(context.agentName ? { agentName: context.agentName } : {}),
    ...(context.teamConfigPath ? { teamConfigPath: context.teamConfigPath } : {}),
    ...(context.taskListPath ? { taskListPath: context.taskListPath } : {}),
    ...(Object.keys(context.attachedTeamContext).length ? {
      attachedTeamContext: {
        ...(current.attachedTeamContext || {}),
        ...context.attachedTeamContext,
      },
    } : {}),
    ...(Object.keys(context.attachedPlanMode).length ? {
      attachedPlanMode: {
        ...(current.attachedPlanMode || {}),
        ...context.attachedPlanMode,
      },
    } : {}),
    ...(Object.keys(context.attachedAutoMode).length ? {
      attachedAutoMode: {
        ...(current.attachedAutoMode || {}),
        ...context.attachedAutoMode,
      },
    } : {}),
    ...(Object.keys(context.attachedSkillListing).length ? {
      attachedSkillListing: {
        ...(current.attachedSkillListing || {}),
        ...context.attachedSkillListing,
      },
    } : {}),
    ...(context.attachedRelevantMemories.length ? {
      attachedRelevantMemories: context.attachedRelevantMemories,
    } : {}),
    ...(Object.keys(context.attachedTeammateMailbox).length ? {
      attachedTeammateMailbox: {
        ...(current.attachedTeammateMailbox || {}),
        ...context.attachedTeammateMailbox,
      },
    } : {}),
    ...(context.mcpInstructionEntries.length ? {
      mcpInstructionEntries: context.mcpInstructionEntries,
    } : {}),
  }));
}

/**
 * Stores the last emitted prompt-state signature so route hooks can avoid repeats.
 */
export function rememberRouteStateSignature(sessionId, signature = '') {
  const key = normalizeSessionId(sessionId);
  if (!key) return {};

  const nextSignature = String(signature || '').trim();
  return mutateSessionEntry(key, (current) => {
    if (!nextSignature) {
      const next = { ...current };
      delete next.lastRouteStateSignature;
      return next;
    }

    return {
      ...current,
      lastRouteStateSignature: nextSignature,
    };
  });
}

/**
 * Stores the last analyzed weak request-shape profile so later pre-tool hooks can harden native behavior.
 */
export function rememberIntentProfile(sessionId, profile = {}) {
  const key = normalizeSessionId(sessionId);
  if (!key) return {};

  const lastIntentProfile = normalizeIntentProfile(profile);

  return mutateSessionEntry(key, (current) => {
    const next = { ...current };
    delete next.lastPromptSignals;

    if (Object.keys(lastIntentProfile).length === 0) {
      delete next.lastIntentProfile;
      return next;
    }

    return {
      ...next,
      lastIntentProfile,
    };
  });
}

/**
 * Backward-compatible alias for older callers.
 */
export function rememberPromptSignals(sessionId, signals = {}) {
  return rememberIntentProfile(sessionId, signals);
}
