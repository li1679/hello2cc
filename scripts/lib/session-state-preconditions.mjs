import {
  mutateSessionEntry,
  normalizePreconditionFailures,
  normalizeSessionId,
} from './session-state-store.mjs';

function normalizeFailureKey(value, caseInsensitive = false) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return caseInsensitive ? normalized.toLowerCase() : normalized;
}

function caseInsensitivePathKeys() {
  return process.platform === 'win32';
}

function worktreeFailureError(payload = {}) {
  const error = String(payload?.error || '').trim();
  if (!error.includes('Cannot create agent worktree: not in a git repository')) return '';
  return error;
}

function enterWorktreeFailureError(payload = {}) {
  const error = String(payload?.error || '').trim();
  if (!error.includes('Cannot create a worktree: not in a git repository')) return '';
  return error;
}

function missingTeamMatch(payload = {}) {
  const error = String(payload?.error || '').trim();
  const match = error.match(/Team "([^"]+)" does not exist\. Call spawnTeam first to create the team\./);
  if (!match) return null;

  return {
    teamName: String(match[1] || '').trim(),
    error,
  };
}

function readToolTeamName(payload = {}) {
  const candidates = [
    payload?.tool_input?.team_name,
    payload?.tool_response?.team_name,
    payload?.tool_response?.data?.team_name,
    payload?.tool_response?.result?.team_name,
  ];

  return candidates
    .map((value) => String(value || '').trim())
    .find(Boolean) || '';
}

function failureRecord({ cwd = '', teamName = '', error = '', toolName = '', source = '' } = {}) {
  return {
    ...(cwd ? { cwd } : {}),
    ...(teamName ? { teamName } : {}),
    ...(error ? { error } : {}),
    ...(toolName ? { toolName } : {}),
    ...(source ? { source } : {}),
    recordedAt: new Date().toISOString(),
  };
}

/**
 * Remembers deterministic tool precondition failures so repeated retries can fail closed.
 */
export function rememberToolFailure(payload = {}) {
  const sessionId = normalizeSessionId(payload?.session_id);
  if (!sessionId) return {};

  const toolName = String(payload?.tool_name || '').trim();
  const cwd = String(payload?.cwd || '').trim();

  return mutateSessionEntry(sessionId, (current) => {
    const preconditionFailures = normalizePreconditionFailures(current.preconditionFailures);
    const worktreeByCwd = { ...(preconditionFailures.worktreeByCwd || {}) };
    const missingTeams = { ...(preconditionFailures.missingTeams || {}) };

    const agentWorktreeError = toolName === 'Agent' ? worktreeFailureError(payload) : '';
    const enterWorktreeError = toolName === 'EnterWorktree' ? enterWorktreeFailureError(payload) : '';
    const worktreeError = agentWorktreeError || enterWorktreeError;
    if (worktreeError && cwd) {
      const key = normalizeFailureKey(cwd, caseInsensitivePathKeys());
      worktreeByCwd[key] = failureRecord({
        cwd,
        error: worktreeError,
        toolName,
        source: 'tool_failure',
      });
    }

    if (toolName === 'Agent') {
      const missingTeam = missingTeamMatch(payload);
      if (missingTeam?.teamName) {
        const key = normalizeFailureKey(missingTeam.teamName, true);
        missingTeams[key] = failureRecord({
          cwd,
          teamName: missingTeam.teamName,
          error: missingTeam.error,
          toolName,
          source: 'tool_failure',
        });
      }
    }

    const nextFailures = normalizePreconditionFailures({
      worktreeByCwd,
      missingTeams,
    });

    if (Object.keys(nextFailures).length === 0) {
      const next = { ...current };
      delete next.preconditionFailures;
      return next;
    }

    return {
      ...current,
      preconditionFailures: nextFailures,
    };
  });
}

/**
 * Clears or refreshes remembered precondition failures after successful tool calls.
 */
export function rememberToolSuccess(payload = {}) {
  const sessionId = normalizeSessionId(payload?.session_id);
  if (!sessionId) return {};

  const toolName = String(payload?.tool_name || '').trim();

  return mutateSessionEntry(sessionId, (current) => {
    const preconditionFailures = normalizePreconditionFailures(current.preconditionFailures);
    const worktreeByCwd = { ...(preconditionFailures.worktreeByCwd || {}) };
    const missingTeams = { ...(preconditionFailures.missingTeams || {}) };

    if (toolName === 'TeamCreate') {
      const requestedTeam = String(payload?.tool_input?.team_name || '').trim();
      const actualTeam = readToolTeamName(payload);
      for (const teamName of [requestedTeam, actualTeam]) {
        if (!teamName) continue;
        delete missingTeams[normalizeFailureKey(teamName, true)];
      }
    }

    if (toolName === 'TeamDelete') {
      const deletedTeam = readToolTeamName(payload) || String(current.teamName || '').trim();
      if (deletedTeam) {
        missingTeams[normalizeFailureKey(deletedTeam, true)] = failureRecord({
          teamName: deletedTeam,
          error: `Team "${deletedTeam}" was deleted in this session and must be recreated before teammate routing can resume.`,
          toolName,
          source: 'team_delete',
        });
      }
    }

    if (toolName === 'Agent') {
      const teamName = String(payload?.tool_input?.team_name || '').trim();
      if (teamName) {
        delete missingTeams[normalizeFailureKey(teamName, true)];
      }
    }

    const nextFailures = normalizePreconditionFailures({
      worktreeByCwd,
      missingTeams,
    });
    const next = {
      ...current,
      ...(toolName === 'TeamCreate' && readToolTeamName(payload) ? { teamName: readToolTeamName(payload) } : {}),
      ...(toolName === 'TeamDelete' ? { teamName: '' } : {}),
    };

    if (Object.keys(nextFailures).length > 0) {
      next.preconditionFailures = nextFailures;
    } else {
      delete next.preconditionFailures;
    }

    return next;
  });
}
