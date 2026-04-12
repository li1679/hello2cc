import {
  activeWorktreeFailure,
  hasIntentTeamSemantics,
  isImplicitAssistantTeamName,
  isOmittedTeamPlaceholder,
  provenActiveTeamContext,
  readTrimmed,
  stripAgentTeamFields,
  stripAgentWorktreeIsolation,
  wantsIntentWorktree,
} from './agent-input-shared.mjs';
import { participantNameOrEmpty } from './participant-name.mjs';

function joinReasons(...items) {
  return items.filter(Boolean).join('; ');
}

export function normalizeAgentTeamSemantics(input = {}, sessionContext = {}) {
  const rawWorkerName = readTrimmed(input?.name);
  const workerName = participantNameOrEmpty(rawWorkerName);
  const explicitTeamName = readTrimmed(input?.team_name);
  const activeTeamName = readTrimmed(sessionContext?.teamName);
  const teamSemantics = hasIntentTeamSemantics(sessionContext);
  const activeTeamIsImplicit = isImplicitAssistantTeamName(activeTeamName);
  const explicitTeamIsImplicit = isImplicitAssistantTeamName(explicitTeamName);
  let updatedInput = input;
  let placeholderReason = '';

  if (rawWorkerName && !workerName) {
    updatedInput = { ...updatedInput };
    delete updatedInput.name;
    placeholderReason = `hello2cc stripped placeholder Agent.name=${JSON.stringify(rawWorkerName)}; omitted teammate names must stay empty instead of becoming synthetic teammate ids`;
  }

  const hasTeamSemantics = Boolean(workerName || explicitTeamName);

  if (!hasTeamSemantics) {
    return {
      input: updatedInput,
      changed: updatedInput !== input,
      reason: placeholderReason,
      blocked: false,
    };
  }

  if (!teamSemantics) {
    return {
      input: stripAgentTeamFields(updatedInput),
      changed: true,
      reason: joinReasons(
        placeholderReason,
        'hello2cc normalized Agent to plain subagent semantics outside explicit team-oriented workflows',
      ),
      blocked: false,
    };
  }

  if (explicitTeamName && !explicitTeamIsImplicit) {
    return {
      input: updatedInput,
      changed: updatedInput !== input,
      reason: placeholderReason,
      blocked: false,
    };
  }

  if (workerName && provenActiveTeamContext(sessionContext) && !activeTeamIsImplicit) {
    return {
      input: {
        ...updatedInput,
        team_name: activeTeamName,
      },
      changed: true,
      reason: joinReasons(
        placeholderReason,
        `hello2cc made Agent.team_name explicit from verified active team context (${activeTeamName})`,
      ),
      blocked: false,
    };
  }

  return {
    input: stripAgentTeamFields(updatedInput),
    changed: true,
    reason: joinReasons(
      placeholderReason,
      !workerName && rawWorkerName
        ? 'hello2cc kept omitted Agent.name empty so active-team autofill cannot manufacture a synthetic teammate'
        : isOmittedTeamPlaceholder(explicitTeamName)
          ? `hello2cc stripped placeholder Agent.team_name=${JSON.stringify(explicitTeamName)}; plain workers should omit team_name entirely, and real teammates should pass a real team_name or establish the team first`
          : explicitTeamIsImplicit
            ? 'hello2cc blocked implicit assistant team semantics until TeamCreate or a real explicit team_name is available'
            : 'hello2cc stripped implicit teammate fields until host state proves a real active team context; plain workers should omit name/team_name, and real teammates should pass an explicit team_name or establish the team first',
    ),
    blocked: false,
  };
}

export function normalizeAgentIsolation(input = {}, sessionContext = {}) {
  const explicitIsolation = readTrimmed(input?.isolation).toLowerCase();
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
  return { input, changed: false, reason: '', blocked: false };
}

export function normalizeEnterWorktreeInput(input = {}, sessionContext = {}) {
  if (!wantsIntentWorktree(sessionContext)) {
    return { input, changed: false, reason: '', blocked: false };
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
