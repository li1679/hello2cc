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

  return {
    ...extractSessionContextFromTranscript(payload?.transcript_path, sessionId),
    ...(String(payload?.model || '').trim() ? { mainModel: String(payload.model).trim() } : {}),
    ...(String(payload?.output_style || '').trim() ? { outputStyle: String(payload.output_style).trim() } : {}),
  };
}

export function rememberSessionContext(payload) {
  const key = normalizeSessionId(payload?.session_id);
  const context = sessionContextFromPayload(payload);
  const mainModel = String(context.mainModel || '').trim();
  const outputStyle = String(context.outputStyle || '').trim();

  if (!key || (!mainModel && !outputStyle)) {
    return {};
  }

  const sessions = readPluginDataJson(SESSION_STATE_PATH, {});
  const nextState = compactEntries({
    ...sessions,
    [key]: {
      ...sessions[key],
      ...(mainModel ? { mainModel } : {}),
      ...(outputStyle ? { outputStyle } : {}),
      updatedAt: new Date().toISOString(),
    },
  });

  writePluginDataJson(SESSION_STATE_PATH, nextState);
  return nextState[key] || {};
}
