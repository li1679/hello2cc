import { readPluginDataJson, writePluginDataJson } from './plugin-data.mjs';
import {
  deriveAgentCapabilities,
  deriveToolCapabilities,
  normalizeAgentTypes,
  normalizeToolNames,
} from './session-capabilities.mjs';
import { extractSessionContextFromTranscript } from './transcript-context.mjs';

const SESSION_STATE_PATH = 'runtime/session-context.json';
const MAX_SESSION_ENTRIES = 50;

function normalizeSessionId(sessionId) {
  return String(sessionId || '').trim();
}

function compactEntries(entries) {
  return Object.fromEntries(
    Object.entries(entries)
      .sort(([, left], [, right]) => String(right?.updatedAt || '').localeCompare(String(left?.updatedAt || '')))
      .slice(0, MAX_SESSION_ENTRIES),
  );
}

export function readSessionContext(sessionId) {
  const key = normalizeSessionId(sessionId);
  if (!key) return {};

  const sessions = readPluginDataJson(SESSION_STATE_PATH, {});
  return sessions[key] || {};
}

export function clearSessionContext(sessionId) {
  const key = normalizeSessionId(sessionId);
  if (!key) return false;

  const sessions = readPluginDataJson(SESSION_STATE_PATH, {});
  if (!(key in sessions)) return false;

  const nextState = { ...sessions };
  delete nextState[key];
  writePluginDataJson(SESSION_STATE_PATH, compactEntries(nextState));
  return true;
}

export function clearAllSessionContexts() {
  writePluginDataJson(SESSION_STATE_PATH, {});
}

export function sessionContextFromPayload(payload = {}) {
  const sessionId = normalizeSessionId(payload?.session_id);
  const tools = normalizeToolNames(payload?.tools);
  const agents = normalizeAgentTypes(payload?.agents);

  return {
    ...extractSessionContextFromTranscript(payload?.transcript_path, sessionId),
    ...(String(payload?.model || '').trim() ? { mainModel: String(payload.model).trim() } : {}),
    ...(String(payload?.output_style || '').trim() ? { outputStyle: String(payload.output_style).trim() } : {}),
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

export function rememberSessionContext(payload) {
  const key = normalizeSessionId(payload?.session_id);
  const context = sessionContextFromPayload(payload);
  const mainModel = String(context.mainModel || '').trim();
  const outputStyle = String(context.outputStyle || '').trim();
  const toolNames = Array.isArray(context.toolNames) ? context.toolNames : [];
  const agentTypes = Array.isArray(context.agentTypes) ? context.agentTypes : [];
  const surfacedSkills = Array.isArray(context.surfacedSkills) ? context.surfacedSkills : [];
  const surfacedSkillNames = Array.isArray(context.surfacedSkillNames) ? context.surfacedSkillNames : [];
  const loadedCommands = Array.isArray(context.loadedCommands) ? context.loadedCommands : [];
  const loadedCommandNames = Array.isArray(context.loadedCommandNames) ? context.loadedCommandNames : [];
  const workflowEntries = Array.isArray(context.workflowEntries) ? context.workflowEntries : [];
  const workflowNames = Array.isArray(context.workflowNames) ? context.workflowNames : [];
  const availableDeferredToolNames = Array.isArray(context.availableDeferredToolNames) ? context.availableDeferredToolNames : [];
  const loadedDeferredToolNames = Array.isArray(context.loadedDeferredToolNames) ? context.loadedDeferredToolNames : [];
  const mcpResources = Array.isArray(context.mcpResources) ? context.mcpResources : [];
  const teamName = String(context.teamName || '').trim();
  const agentName = String(context.agentName || '').trim();

  if (!key || (
    !mainModel &&
    !outputStyle &&
    toolNames.length === 0 &&
    agentTypes.length === 0 &&
    surfacedSkills.length === 0 &&
    surfacedSkillNames.length === 0 &&
    loadedCommands.length === 0 &&
    loadedCommandNames.length === 0 &&
    workflowEntries.length === 0 &&
    workflowNames.length === 0 &&
    availableDeferredToolNames.length === 0 &&
    loadedDeferredToolNames.length === 0 &&
    mcpResources.length === 0 &&
    !teamName &&
    !agentName
  )) {
    return {};
  }

  const sessions = readPluginDataJson(SESSION_STATE_PATH, {});
  const nextState = compactEntries({
    ...sessions,
    [key]: {
      ...sessions[key],
      ...(mainModel ? { mainModel } : {}),
      ...(outputStyle ? { outputStyle } : {}),
      ...(toolNames.length ? {
        toolNames,
        ...deriveToolCapabilities(toolNames),
      } : {}),
      ...(agentTypes.length ? {
        agentTypes,
        ...deriveAgentCapabilities(agentTypes),
      } : {}),
      ...(surfacedSkills.length ? { surfacedSkills } : {}),
      ...(surfacedSkillNames.length ? { surfacedSkillNames } : {}),
      ...(loadedCommands.length ? { loadedCommands } : {}),
      ...(loadedCommandNames.length ? { loadedCommandNames } : {}),
      ...(workflowEntries.length ? { workflowEntries } : {}),
      ...(workflowNames.length ? { workflowNames } : {}),
      ...(availableDeferredToolNames.length ? { availableDeferredToolNames } : {}),
      ...(loadedDeferredToolNames.length ? { loadedDeferredToolNames } : {}),
      ...(mcpResources.length ? { mcpResources } : {}),
      ...(teamName ? { teamName } : {}),
      ...(agentName ? { agentName } : {}),
      updatedAt: new Date().toISOString(),
    },
  });

  writePluginDataJson(SESSION_STATE_PATH, nextState);
  return nextState[key] || {};
}

export function rememberPromptSignals(sessionId, signals = {}) {
  const key = normalizeSessionId(sessionId);
  if (!key) return {};

  const sessions = readPluginDataJson(SESSION_STATE_PATH, {});
  const nextState = compactEntries({
    ...sessions,
    [key]: {
      ...sessions[key],
      lastPromptSignals: {
        teamWorkflow: Boolean(signals?.teamWorkflow),
        proactiveTeamWorkflow: Boolean(signals?.proactiveTeamWorkflow),
        teamSemantics: Boolean(signals?.teamSemantics),
        swarm: Boolean(signals?.swarm),
        wantsWorktree: Boolean(signals?.wantsWorktree),
      },
      updatedAt: new Date().toISOString(),
    },
  });

  writePluginDataJson(SESSION_STATE_PATH, nextState);
  return nextState[key] || {};
}
