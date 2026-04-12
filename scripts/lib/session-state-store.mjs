import { readPluginDataJson, writePluginDataJson } from './plugin-data.mjs';
import { participantNameOrEmpty } from './participant-name.mjs';
import { realTeamNameOrEmpty } from './team-name.mjs';

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

function trimmed(value) {
  return String(value || '').trim();
}

function normalizeMissingTeams(entries = {}) {
  return Object.fromEntries(
    Object.entries(entries)
      .map(([fallbackName, record]) => {
        const teamName = realTeamNameOrEmpty(record?.teamName || fallbackName);
        const recordedAt = trimmed(record?.recordedAt);
        if (!teamName || !recordedAt) {
          return null;
        }

        return [teamName.toLowerCase(), {
          ...(trimmed(record?.cwd) ? { cwd: trimmed(record?.cwd) } : {}),
          teamName,
          ...(trimmed(record?.error) ? { error: trimmed(record?.error) } : {}),
          ...(trimmed(record?.toolName) ? { toolName: trimmed(record?.toolName) } : {}),
          ...(trimmed(record?.source) ? { source: trimmed(record?.source) } : {}),
          recordedAt,
        }];
      })
      .filter(Boolean)
      .sort(([, left], [, right]) => String(right.recordedAt).localeCompare(String(left.recordedAt)))
      .slice(0, MAX_PRECONDITION_FAILURES),
  );
}

function normalizeAttachedTeamContext(context) {
  if (!context || typeof context !== 'object') {
    return undefined;
  }

  const teamName = realTeamNameOrEmpty(context?.teamName);
  const agentName = participantNameOrEmpty(context?.agentName);
  const teamConfigPath = trimmed(context?.teamConfigPath);
  const taskListPath = trimmed(context?.taskListPath);

  if (!teamName && !agentName && !teamConfigPath && !taskListPath) {
    return undefined;
  }

  return {
    ...(teamName ? { teamName } : {}),
    ...(agentName ? { agentName } : {}),
    ...(teamConfigPath ? { teamConfigPath } : {}),
    ...(taskListPath ? { taskListPath } : {}),
  };
}

function normalizeSessionEntry(entry = {}) {
  const normalized = {
    ...entry,
    teamName: realTeamNameOrEmpty(entry?.teamName),
    agentName: participantNameOrEmpty(entry?.agentName),
  };

  if (entry?.preconditionFailures) {
    normalized.preconditionFailures = normalizePreconditionFailures(entry.preconditionFailures);
  }

  const attachedTeamContext = normalizeAttachedTeamContext(entry?.attachedTeamContext);
  if (attachedTeamContext) {
    normalized.attachedTeamContext = attachedTeamContext;
  } else {
    delete normalized.attachedTeamContext;
  }

  if (!normalized.teamName) {
    delete normalized.teamName;
  }

  if (!normalized.agentName) {
    delete normalized.agentName;
  }

  if (normalized.preconditionFailures && Object.keys(normalized.preconditionFailures).length === 0) {
    delete normalized.preconditionFailures;
  }

  return normalized;
}

export function normalizePreconditionFailures(failures = {}) {
  const worktreeByCwd = failures?.worktreeByCwd && typeof failures.worktreeByCwd === 'object'
    ? trimFailureMap(failures.worktreeByCwd)
    : {};
  const missingTeams = failures?.missingTeams && typeof failures.missingTeams === 'object'
    ? normalizeMissingTeams(failures.missingTeams)
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
  return normalizeSessionEntry(sessions[key] || {});
}

/**
 * Updates one session entry while keeping compaction and failure normalization centralized.
 */
export function mutateSessionEntry(sessionId, updater) {
  const key = normalizeSessionId(sessionId);
  if (!key) return {};

  const sessions = readSessions();
  const current = normalizeSessionEntry(sessions[key] || {});
  const updated = updater({ ...current }) || {};
  const nextEntry = normalizeSessionEntry(updated);

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
