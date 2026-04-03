import { readPluginDataJson, writePluginDataJson } from './plugin-data.mjs';

const SESSION_STATE_PATH = 'runtime/session-context.json';
const MAX_SESSION_ENTRIES = 50;
const MAX_PRECONDITION_FAILURES = 20;

export function normalizeSessionId(sessionId) {
  return String(sessionId || '').trim();
}

function compactEntries(entries) {
  return Object.fromEntries(
    Object.entries(entries)
      .sort(([, left], [, right]) => String(right?.updatedAt || '').localeCompare(String(left?.updatedAt || '')))
      .slice(0, MAX_SESSION_ENTRIES),
  );
}

function trimFailureMap(entries = {}) {
  return Object.fromEntries(
    Object.entries(entries)
      .sort(([, left], [, right]) => String(right?.recordedAt || '').localeCompare(String(left?.recordedAt || '')))
      .slice(0, MAX_PRECONDITION_FAILURES),
  );
}

export function normalizePreconditionFailures(failures = {}) {
  const worktreeByCwd = failures?.worktreeByCwd && typeof failures.worktreeByCwd === 'object'
    ? trimFailureMap(failures.worktreeByCwd)
    : {};
  const missingTeams = failures?.missingTeams && typeof failures.missingTeams === 'object'
    ? trimFailureMap(failures.missingTeams)
    : {};

  const next = {};
  if (Object.keys(worktreeByCwd).length > 0) next.worktreeByCwd = worktreeByCwd;
  if (Object.keys(missingTeams).length > 0) next.missingTeams = missingTeams;
  return next;
}

function readSessions() {
  return readPluginDataJson(SESSION_STATE_PATH, {});
}

function writeSessions(sessions) {
  writePluginDataJson(SESSION_STATE_PATH, compactEntries(sessions));
}

export function readSessionEntry(sessionId) {
  const key = normalizeSessionId(sessionId);
  if (!key) return {};

  const sessions = readSessions();
  return sessions[key] || {};
}

/**
 * Updates one session entry while keeping compaction and failure normalization centralized.
 */
export function mutateSessionEntry(sessionId, updater) {
  const key = normalizeSessionId(sessionId);
  if (!key) return {};

  const sessions = readSessions();
  const current = sessions[key] || {};
  const updated = updater({ ...current }) || {};
  const nextEntry = {
    ...updated,
    ...(updated.preconditionFailures ? { preconditionFailures: normalizePreconditionFailures(updated.preconditionFailures) } : {}),
  };

  if (nextEntry.preconditionFailures && Object.keys(nextEntry.preconditionFailures).length === 0) {
    delete nextEntry.preconditionFailures;
  }

  const nextState = { ...sessions };
  if (Object.keys(nextEntry).length === 0) {
    delete nextState[key];
  } else {
    nextState[key] = {
      ...nextEntry,
      updatedAt: new Date().toISOString(),
    };
  }

  const compacted = compactEntries(nextState);
  writePluginDataJson(SESSION_STATE_PATH, compacted);
  return compacted[key] || {};
}

export function clearSessionEntry(sessionId) {
  const key = normalizeSessionId(sessionId);
  if (!key) return false;

  const sessions = readSessions();
  if (!(key in sessions)) return false;

  const nextState = { ...sessions };
  delete nextState[key];
  writeSessions(nextState);
  return true;
}

export function clearAllSessionEntries() {
  writePluginDataJson(SESSION_STATE_PATH, {});
}
