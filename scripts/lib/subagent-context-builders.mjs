import { compactState } from './host-state-context.mjs';
import { buildRendererContract } from './renderer-contracts.mjs';
import { buildSubagentSpecializationCandidates } from './specialization-candidates.mjs';
import {
  buildSubagentExecutionPlaybook,
  buildSubagentRecoveryPlaybook,
  buildSubagentResponseContract,
  buildSubagentTieBreakers,
  currentAssignedTasks,
  currentBlockedTaskRecords,
  currentMailboxState,
  currentPendingAssignmentRecords,
  currentPendingAssignments,
  currentTeamActionState,
  subagentTaskIntentProfile,
  subagentTaskIntentState,
} from './subagent-state-helpers.mjs';
import {
  buildModeGuidance,
  buildTeammateOverlay,
  renderSubagentContext,
} from './subagent-context-render.mjs';
import { readTeamEntry } from './team-state-store.mjs';

function truncateText(value, maxLength = 160) {
  if (typeof value !== 'string') return value;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function compactPendingAssignments(assignments) {
  return assignments.map((task) => ({
    ...task,
    ...(task.description
      ? { description: truncateText(task.description) }
      : {}),
  }));
}

function compactMailboxSummary(summary) {
  if (!summary || typeof summary !== 'object') return undefined;

  return compactState({
    total_events: summary.total_events,
    latest_event_type: summary.latest_event_type,
    latest_summary: truncateText(summary.latest_summary),
    requires_task_pickup: summary.requires_task_pickup,
    summary_lines: Array.isArray(summary.summary_lines)
      ? summary.summary_lines.map((line) => truncateText(line, 120))
      : undefined,
  });
}

function compactTeamActionSummary(summary) {
  if (!summary || typeof summary !== 'object') return undefined;

  return compactState({
    total_actions: summary.total_actions,
    top_action_type: summary.top_action_type,
    top_priority: summary.top_priority,
    requires_immediate_response: summary.requires_immediate_response,
    recommended_response_shape: summary.recommended_response_shape,
    preferred_table_columns: summary.preferred_table_columns,
    summary_lines: Array.isArray(summary.summary_lines)
      ? summary.summary_lines.map((line) => truncateText(line, 120))
      : undefined,
  });
}

function modeState(mode, identity, payload = {}, teamState = {}) {
  const assignedTasks = currentAssignedTasks(identity, teamState);
  const pendingAssignments = currentPendingAssignments(identity, teamState);
  const pendingAssignmentRecords = currentPendingAssignmentRecords(identity, teamState);
  const blockedTaskRecords = currentBlockedTaskRecords(identity, teamState);
  const mailboxState = currentMailboxState(identity, teamState);
  const teamActionState = currentTeamActionState(identity, {
    pendingAssignmentRecords,
    blockedTaskRecords,
  });
  const taskProfile = subagentTaskIntentProfile(payload);
  const taskIntentState = subagentTaskIntentState(payload);
  const stateByMode = {
    explore: {
      mode: 'Explore',
      capability: 'read-only-search',
      can_write: false,
    },
    plan: {
      mode: 'Plan',
      capability: 'read-only-planning',
      can_write: false,
    },
    general: {
      mode: 'General-Purpose',
      capability: 'full-tool-surface',
      can_write: true,
    },
  };
  const responseContract = buildSubagentResponseContract(
    mode,
    identity,
    taskProfile,
    teamActionState,
    { blockedTaskRecords },
  );
  const rendererContract = buildRendererContract(responseContract);
  const executionPlaybook = buildSubagentExecutionPlaybook(
    mode,
    identity,
    taskProfile,
    {
      assignedTasks,
      pendingAssignments,
      blockedTaskRecords,
      teamActionState,
    },
  );
  const recoveryPlaybook = buildSubagentRecoveryPlaybook(mode, taskProfile, {
    canWrite: Boolean(stateByMode[mode]?.can_write),
    pendingAssignments,
    blockedTaskRecords,
    hasTeamIdentity: Boolean(identity),
  });
  const decisionTieBreakers = buildSubagentTieBreakers(mode, taskProfile, {
    hasTeamIdentity: Boolean(identity),
    pendingAssignments,
    blockedTaskRecords,
  });
  const specializationCandidates = buildSubagentSpecializationCandidates(
    mode,
    taskProfile,
    {
      hasTeamIdentity: Boolean(identity),
      pendingAssignments,
      blockedTaskRecords,
      teamActionState,
    },
  );

  return {
    hello2cc_role: 'host-state',
    operator_profile: 'opus-compatible-claude-code',
    execution_envelope: 'host_defined_capability_policies',
    semantic_routing: 'host_guarded_model_decides',
    tool_choice: 'follow_visible_capability_contracts',
    higher_priority_rules: [
      'parent_task',
      'claude_code_host',
      'CLAUDE.md',
      'AGENTS.md',
      'project_rules',
    ],
    ...(stateByMode[mode] || {}),
    task_intent: taskIntentState,
    response_contract: responseContract,
    renderer_contract: rendererContract,
    execution_playbook: executionPlaybook,
    recovery_playbook: recoveryPlaybook,
    decision_tie_breakers: decisionTieBreakers,
    specialization_candidates: specializationCandidates,
    ...(identity
      ? {
          teammate: {
            agent: identity.agentName,
            team: identity.teamName,
            coordination_channel: 'SendMessage',
          },
          coordination: {
            task_board: true,
            lifecycle: ['TaskList', 'TaskGet', 'TaskUpdate'],
            ...(assignedTasks.length
              ? {
                  current_assigned_tasks: assignedTasks,
                }
              : {}),
            ...(pendingAssignments.length
              ? {
                  pending_assignment_notifications: compactPendingAssignments(
                    pendingAssignments,
                  ),
                }
              : {}),
            ...(compactMailboxSummary(mailboxState.mailboxSummary)
              ? {
                  mailbox_summary: compactMailboxSummary(
                    mailboxState.mailboxSummary,
                  ),
                }
              : {}),
            ...(compactTeamActionSummary(teamActionState.teamActionSummary)
              ? {
                  team_action_summary: compactTeamActionSummary(
                    teamActionState.teamActionSummary,
                  ),
                }
              : {}),
          },
        }
      : {}),
  };
}

export function buildContext(mode, identity, payload = {}) {
  const teamState = identity ? readTeamEntry(identity.teamName) : {};
  const state = compactState(modeState(mode, identity, payload, teamState));

  return renderSubagentContext({
    modeLines: buildModeGuidance(mode),
    teammateOverlay: buildTeammateOverlay(state),
    state,
  });
}
