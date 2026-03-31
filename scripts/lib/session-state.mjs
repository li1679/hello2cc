import { readPluginDataJson, writePluginDataJson } from './plugin-data.mjs';
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
  const tools = Array.isArray(payload?.tools)
    ? payload.tools.map((tool) => String(tool || '').trim()).filter(Boolean)
    : [];
  const agents = Array.isArray(payload?.agents)
    ? payload.agents.map((agent) => String(agent || '').trim()).filter(Boolean)
    : [];

  return {
    ...extractSessionContextFromTranscript(payload?.transcript_path, sessionId),
    ...(String(payload?.model || '').trim() ? { mainModel: String(payload.model).trim() } : {}),
    ...(String(payload?.output_style || '').trim() ? { outputStyle: String(payload.output_style).trim() } : {}),
    ...(tools.length ? {
      toolNames: tools,
      toolSearchAvailable: tools.includes('ToolSearch'),
      teamCreateAvailable: tools.includes('TeamCreate'),
      taskToolAvailable: tools.includes('Task') || tools.includes('TaskCreate'),
    } : {}),
    ...(agents.length ? {
      agentTypes: agents,
      claudeCodeGuideAvailable: agents.includes('claude-code-guide'),
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

  if (!key || (!mainModel && !outputStyle && toolNames.length === 0 && agentTypes.length === 0)) {
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
        toolSearchAvailable: Boolean(context.toolSearchAvailable),
        teamCreateAvailable: Boolean(context.teamCreateAvailable),
        taskToolAvailable: Boolean(context.taskToolAvailable),
      } : {}),
      ...(agentTypes.length ? {
        agentTypes,
        claudeCodeGuideAvailable: Boolean(context.claudeCodeGuideAvailable),
      } : {}),
      updatedAt: new Date().toISOString(),
    },
  });

  writePluginDataJson(SESSION_STATE_PATH, nextState);
  return nextState[key] || {};
}
