import { worktreePreconditionsAppearSatisfied } from './worktree-preconditions.mjs';

function trimmed(value) {
  return String(value || '').trim();
}

const IMPLICIT_ASSISTANT_TEAM_NAMES = new Set(['main', 'default']);

function normalizedFailureKey(value, caseInsensitive = false) {
  const normalized = trimmed(value);
  if (!normalized) return '';
  return caseInsensitive ? normalized.toLowerCase() : normalized;
}

function pathKeysAreCaseInsensitive() {
  return process.platform === 'win32';
}

function preconditionFailures(sessionContext = {}) {
  return sessionContext?.preconditionFailures && typeof sessionContext.preconditionFailures === 'object'
    ? sessionContext.preconditionFailures
    : {};
}

function knownWorktreeFailure(sessionContext = {}) {
  const cwd = trimmed(sessionContext?.currentCwd);
  if (!cwd) return null;

  const key = normalizedFailureKey(cwd, pathKeysAreCaseInsensitive());
  const failures = preconditionFailures(sessionContext);
  const worktreeByCwd = failures?.worktreeByCwd && typeof failures.worktreeByCwd === 'object'
    ? failures.worktreeByCwd
    : {};

  return worktreeByCwd[key] || null;
}

function activeWorktreeFailure(sessionContext = {}) {
  const failure = knownWorktreeFailure(sessionContext);
  if (!failure) return null;

  const cwd = trimmed(sessionContext?.currentCwd);
  if (!cwd) return failure;

  return worktreePreconditionsAppearSatisfied(cwd) ? null : failure;
}

function knownMissingTeamFailure(sessionContext = {}, teamName) {
  const normalizedTeamName = normalizedFailureKey(teamName, true);
  if (!normalizedTeamName) return null;

  const failures = preconditionFailures(sessionContext);
  const missingTeams = failures?.missingTeams && typeof failures.missingTeams === 'object'
    ? failures.missingTeams
    : {};

  return missingTeams[normalizedTeamName] || null;
}

function isImplicitAssistantTeamName(value) {
  return IMPLICIT_ASSISTANT_TEAM_NAMES.has(trimmed(value).toLowerCase());
}

function stripAgentTeamFields(input) {
  const updatedInput = { ...input };
  delete updatedInput.name;
  delete updatedInput.team_name;
  return updatedInput;
}

function stripAgentWorktreeIsolation(input) {
  const updatedInput = { ...input };
  delete updatedInput.isolation;
  return updatedInput;
}

function lastIntentProfile(sessionContext = {}) {
  if (sessionContext?.lastIntentProfile && typeof sessionContext.lastIntentProfile === 'object') {
    return sessionContext.lastIntentProfile;
  }

  return sessionContext?.lastPromptSignals && typeof sessionContext.lastPromptSignals === 'object'
    ? sessionContext.lastPromptSignals
    : {};
}

function intentCollaborationState(sessionContext = {}) {
  const profile = lastIntentProfile(sessionContext);
  return profile?.collaboration && typeof profile.collaboration === 'object'
    ? profile.collaboration
    : {};
}

function intentRoutingState(sessionContext = {}) {
  const profile = lastIntentProfile(sessionContext);
  return profile?.routing && typeof profile.routing === 'object'
    ? profile.routing
    : {};
}

function hasIntentTeamSemantics(sessionContext = {}) {
  const collaboration = intentCollaborationState(sessionContext);
  return Boolean(
    collaboration.team_semantics ||
    collaboration.team_workflow ||
    collaboration.proactive_team ||
    sessionContext?.lastPromptSignals?.teamSemantics ||
    sessionContext?.lastPromptSignals?.teamWorkflow ||
    sessionContext?.lastPromptSignals?.proactiveTeamWorkflow,
  );
}

function wantsIntentWorktree(sessionContext = {}) {
  const collaboration = intentCollaborationState(sessionContext);
  return Boolean(
    collaboration.wants_worktree ||
    sessionContext?.lastPromptSignals?.wantsWorktree,
  );
}

function hasIntentParallelOrTeamState(sessionContext = {}) {
  const collaboration = intentCollaborationState(sessionContext);
  const routing = intentRoutingState(sessionContext);

  return Boolean(
    collaboration.team_semantics ||
    collaboration.team_workflow ||
    collaboration.proactive_team ||
    collaboration.task_board ||
    collaboration.swarm ||
    collaboration.parallel_requested ||
    routing.complex,
  );
}

function provenActiveTeamContext(sessionContext = {}) {
  const activeTeamName = trimmed(sessionContext?.teamName);
  if (!activeTeamName || isImplicitAssistantTeamName(activeTeamName)) {
    return false;
  }

  if (knownMissingTeamFailure(sessionContext, activeTeamName)) {
    return false;
  }

  const collaboration = intentCollaborationState(sessionContext);
  return Boolean(
    trimmed(sessionContext?.agentName) ||
    collaboration.team_workflow ||
    collaboration.task_board ||
    collaboration.swarm,
  );
}

export function normalizeAgentTeamSemantics(input = {}, sessionContext = {}) {
  const workerName = trimmed(input?.name);
  const explicitTeamName = trimmed(input?.team_name);
  const activeTeamName = trimmed(sessionContext?.teamName);
  const teamSemantics = hasIntentTeamSemantics(sessionContext);
  const hasTeamSemantics = Boolean(workerName || explicitTeamName);
  const activeTeamIsImplicit = isImplicitAssistantTeamName(activeTeamName);
  const explicitTeamIsImplicit = isImplicitAssistantTeamName(explicitTeamName);
  const candidateTeamName = explicitTeamName || activeTeamName;
  const missingTeamFailure = candidateTeamName && !isImplicitAssistantTeamName(candidateTeamName)
    ? knownMissingTeamFailure(sessionContext, candidateTeamName)
    : null;

  if (!hasTeamSemantics) {
    return { input, changed: false, reason: '', blocked: false };
  }

  if (!teamSemantics) {
    return {
      input: stripAgentTeamFields(input),
      changed: true,
      reason: 'hello2cc normalized Agent to plain subagent semantics outside explicit team-oriented workflows',
      blocked: false,
    };
  }

  if (missingTeamFailure) {
    return {
      input,
      changed: false,
      blocked: true,
      reason: `hello2cc blocked Agent retry because team "${candidateTeamName}" is known missing in this session; create the team again with TeamCreate or fall back to a plain non-team subagent path before retrying`,
    };
  }

  if (explicitTeamName && !explicitTeamIsImplicit) {
    return { input, changed: false, reason: '', blocked: false };
  }

  if (provenActiveTeamContext(sessionContext) && !activeTeamIsImplicit) {
    return {
      input: {
        ...input,
        team_name: activeTeamName,
      },
      changed: true,
      reason: `hello2cc made Agent.team_name explicit from verified active team context (${activeTeamName})`,
      blocked: false,
    };
  }

  return {
    input: stripAgentTeamFields(input),
    changed: true,
    reason: explicitTeamIsImplicit
      ? 'hello2cc blocked implicit assistant team semantics until TeamCreate or a real explicit team_name is available'
      : 'hello2cc stripped implicit teammate fields until host state proves a real active team context; plain workers should omit name/team_name, and real teammates should pass an explicit team_name or establish the team first',
    blocked: false,
  };
}

export function normalizeAgentIsolation(input = {}, sessionContext = {}) {
  const explicitIsolation = trimmed(input?.isolation).toLowerCase();
  const wantsWorktree = wantsIntentWorktree(sessionContext);
  const worktreeFailure = explicitIsolation === 'worktree'
    ? activeWorktreeFailure(sessionContext)
    : null;

  if (worktreeFailure) {
    return {
      input,
      changed: false,
      blocked: true,
      reason: `hello2cc blocked repeated worktree isolation in this cwd because Claude Code already failed here with a non-git/no-hook precondition; switch to a git repository, configure WorktreeCreate hooks, or retry without worktree isolation`,
    };
  }

  if (explicitIsolation !== 'worktree' || wantsWorktree) {
    return { input, changed: false, reason: '', blocked: false };
  }

  return {
    input: stripAgentWorktreeIsolation(input),
    changed: true,
    reason: 'hello2cc removed Agent.isolation=worktree because the user did not explicitly request worktree isolation',
    blocked: false,
  };
}

export function normalizeTeamCreateInput(input = {}, sessionContext = {}) {
  if (hasIntentParallelOrTeamState(sessionContext)) {
    return { input, changed: false, reason: '', blocked: false };
  }

  return {
    input,
    changed: false,
    blocked: true,
    reason: 'hello2cc blocked TeamCreate because the current request does not indicate sustained team semantics, shared task-board ownership, or multi-track collaboration; prefer direct execution or plain Agent workers unless the user explicitly asks for a team or the task truly needs persistent teammate coordination',
  };
}

export function normalizeEnterWorktreeInput(input = {}, sessionContext = {}) {
  if (!wantsIntentWorktree(sessionContext)) {
    return {
      input,
      changed: false,
      blocked: true,
      reason: 'hello2cc blocked EnterWorktree because the user did not explicitly request worktree isolation in this task; stay on the normal Claude Code path unless the user clearly asks for an isolated worktree',
    };
  }

  const worktreeFailure = activeWorktreeFailure(sessionContext);
  if (!worktreeFailure) {
    return { input, changed: false, reason: '', blocked: false };
  }

  return {
    input,
    changed: false,
    blocked: true,
    reason: 'hello2cc blocked repeated EnterWorktree retry in this cwd because Claude Code already proved the worktree preconditions were not met here; switch into a git repository or configure WorktreeCreate/WorktreeRemove hooks first',
  };
}
