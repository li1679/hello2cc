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
const MAX_PRECONDITION_FAILURES = 20;

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

function normalizeFailureKey(value, caseInsensitive = false) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return caseInsensitive ? normalized.toLowerCase() : normalized;
}

function caseInsensitivePathKeys() {
  return process.platform === 'win32';
}

function trimFailureMap(entries = {}) {
  return Object.fromEntries(
    Object.entries(entries)
      .sort(([, left], [, right]) => String(right?.recordedAt || '').localeCompare(String(left?.recordedAt || '')))
      .slice(0, MAX_PRECONDITION_FAILURES),
  );
}

function normalizePreconditionFailures(failures = {}) {
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

function updateSessionEntry(sessionId, updater) {
  const key = normalizeSessionId(sessionId);
  if (!key) return {};

  const sessions = readPluginDataJson(SESSION_STATE_PATH, {});
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

export function rememberSessionContext(payload) {
  const key = normalizeSessionId(payload?.session_id);
  const context = sessionContextFromPayload(payload);
  const mainModel = String(context.mainModel || '').trim();
  const outputStyle = String(context.outputStyle || '').trim();
  const currentCwd = String(context.currentCwd || '').trim();
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
    !currentCwd &&
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
      ...(currentCwd ? { currentCwd } : {}),
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

export function rememberToolFailure(payload = {}) {
  const sessionId = normalizeSessionId(payload?.session_id);
  if (!sessionId) return {};

  const toolName = String(payload?.tool_name || '').trim();
  const cwd = String(payload?.cwd || '').trim();

  return updateSessionEntry(sessionId, (current) => {
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

export function rememberToolSuccess(payload = {}) {
  const sessionId = normalizeSessionId(payload?.session_id);
  if (!sessionId) return {};

  const toolName = String(payload?.tool_name || '').trim();

  return updateSessionEntry(sessionId, (current) => {
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
