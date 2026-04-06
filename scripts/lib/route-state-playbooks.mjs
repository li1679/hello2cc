import { compactState } from './host-state-context.mjs';
import { routeSpecialization } from './decision-specializations.mjs';
import {
  preferredRouteResponseShape,
  requiredSectionsForRouteShape,
  specializedRoutePlaybook,
} from './route-specializations.mjs';
import { describeRouteSpecialization } from './specialization-selection.mjs';

function trimmed(value) {
  return String(value || '').trim();
}

function uniqueStrings(values, maxItems = 12) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => trimmed(value))
      .filter(Boolean),
  )].slice(0, maxItems);
}

export function routeTeamContinuity(continuity = {}) {
  return continuity?.team && typeof continuity.team === 'object'
    ? continuity.team
    : {};
}

function isTeamOwnedRouteSpecialization(specialization = '') {
  return new Set(['team_approval', 'team_status', 'handoff']).has(trimmed(specialization).toLowerCase());
}

function routeRole(signals = {}, sessionContext = {}, continuity = {}, specialization = '') {
  const teamContinuity = routeTeamContinuity(continuity);
  const activeTeam = trimmed(teamContinuity.active_team || sessionContext?.teamName);
  const agentName = trimmed(sessionContext?.agentName);
  const normalizedAgent = agentName.toLowerCase();
  const resolvedSpecialization = trimmed(
    specialization || routeSpecialization(signals, continuity, sessionContext),
  ).toLowerCase();

  if (continuity.plan_mode_entered || resolvedSpecialization === 'planning') {
    return 'planner';
  }
  if (resolvedSpecialization === 'compare') return 'direct_decider';
  if (resolvedSpecialization === 'research') return 'researcher';

  if (activeTeam && isTeamOwnedRouteSpecialization(resolvedSpecialization)) {
    return !agentName || ['team-lead', 'main', 'default'].includes(normalizedAgent)
      ? 'team_lead'
      : 'teammate';
  }

  if (signals.compare || signals.decisionHeavy) return 'direct_decider';
  if (signals.codeResearch && !signals.implement) return 'researcher';
  if (signals.implement || signals.verify || signals.boundedImplementation) return 'direct_executor';
  return 'general_operator';
}

export function buildRouteResponseContract(signals = {}, sessionContext = {}, continuity = {}) {
  const selection = describeRouteSpecialization(signals, sessionContext, continuity);
  const specialization = selection.specialization || routeSpecialization(signals, continuity, sessionContext);
  const role = routeRole(signals, sessionContext, continuity, specialization);
  const actionSummary = routeTeamContinuity(continuity).team_action_summary || {};
  const preferredShape = preferredRouteResponseShape(signals, role, specialization, continuity, actionSummary);

  return compactState({
    role,
    specialization: specialization || undefined,
    selection_basis: selection.selection_basis,
    selection_strength: selection.selection_strength,
    opening_style: 'direct_no_internal_deliberation',
    visible_text_language: 'follow_user_language',
    preferred_shape: preferredShape,
    required_sections: requiredSectionsForRouteShape(preferredShape),
    preferred_table_columns: actionSummary.preferred_table_columns
      || (signals.compare ? ['option', 'fit', 'tradeoffs', 'recommended_when'] : undefined),
    prioritize_summary_first: true,
  });
}

function actionItemToolHints(items = []) {
  return uniqueStrings(
    items.flatMap((item) => String(item?.next_tool || '')
      .split('/')
      .map((value) => trimmed(value))),
    8,
  );
}

function capabilityDiscoveryTools(sessionContext = {}) {
  return uniqueStrings([
    sessionContext?.discoverSkillsAvailable ? 'DiscoverSkills' : '',
    sessionContext?.readMcpResourceAvailable ? 'ReadMcpResource' : '',
    sessionContext?.listMcpResourcesAvailable ? 'ListMcpResources' : '',
    sessionContext?.toolSearchAvailable ? 'ToolSearch' : '',
  ], 6);
}

export function buildRouteExecutionPlaybook(signals = {}, sessionContext = {}, continuity = {}) {
  const teamContinuity = routeTeamContinuity(continuity);
  const actionItems = Array.isArray(teamContinuity.team_action_items) ? teamContinuity.team_action_items : [];
  const selection = describeRouteSpecialization(signals, sessionContext, continuity);
  const specialization = selection.specialization || routeSpecialization(signals, continuity, sessionContext);
  const role = routeRole(signals, sessionContext, continuity, specialization);
  const currentAgentAssignments = Array.isArray(teamContinuity.current_agent_assigned_tasks)
    ? teamContinuity.current_agent_assigned_tasks
    : [];
  const pendingAssignments = Array.isArray(teamContinuity.current_agent_pending_assignments)
    ? teamContinuity.current_agent_pending_assignments
    : [];
  const blockedTasks = Array.isArray(teamContinuity.current_agent_blocked_tasks)
    ? teamContinuity.current_agent_blocked_tasks
    : [];
  const specializedPlaybook = specializedRoutePlaybook(role, specialization, continuity);

  if (specialization === 'capability') {
    return compactState({
      ...(specializedPlaybook || {}),
      role,
      specialization,
      primary_tools: capabilityDiscoveryTools(sessionContext),
    });
  }

  if (role === 'planner') {
    return compactState({
      role,
      specialization: specialization || 'planning',
      ordered_steps: ['gather_constraints', 'ask_only_real_blocking_questions', 'emit_executable_plan', 'submit_via_ExitPlanMode'],
      primary_tools: ['AskUserQuestion', 'ExitPlanMode'],
      avoid_shortcuts: ['plain_text_plan_approval', 'implementation_before_plan_is_submitted'],
    });
  }

  if (specializedPlaybook && !isTeamOwnedRouteSpecialization(specialization)) {
    return specializedPlaybook;
  }

  if (role === 'team_lead') {
    return compactState({
      role,
      specialization: specialization || undefined,
      ordered_steps: specialization === 'team_approval'
        ? ['inspect_pending_plan_approvals', 'review_top_request_and_context', 'respond_via_structured_SendMessage', 'summarize_remaining_approvals']
        : specialization === 'handoff'
          ? ['inspect_handoff_candidates', 'choose_follow_up_or_reassignment', 'change_task_board_state_or_SendMessage', 'summarize_next_owner_or_blocker']
          : specialization === 'team_status'
            ? ['inspect_host_team_continuity', 'rank_actions_and_open_tasks', 'state_next_action_first', 'summarize_remaining_context']
            : actionItems.length > 0
              ? ['review_host_action_items', 'handle_highest_priority_action_first', 'stay_on_task_board_or_structured_SendMessage', 'summarize_remaining_actions']
              : ['inspect_task_board_continuity', 'advance_or_reassign_tasks', 'use_SendMessage_for_real_team_coordination'],
      primary_tools: actionItems.length > 0
        ? actionItemToolHints(actionItems)
        : ['TaskList', 'TaskGet', 'TaskUpdate', 'SendMessage'],
      continuation_rule: continuity.plan_mode_exited ? 'continue_from_last_approved_plan' : undefined,
      avoid_shortcuts: ['plain_text_team_broadcast', 'ignore_higher_priority_action_items', 'reopen_plan_without_boundary_change'],
    });
  }

  if (role === 'teammate') {
    return compactState({
      role,
      specialization: specialization || undefined,
      ordered_steps: specialization === 'handoff'
        ? ['read_current_task_state', 'resolve_blocker_or_prepare_handoff', 'update_task_board_state', 'send_follow_up_if_needed']
        : specialization === 'team_status'
          ? ['read_task_board_state', 'state_current_status_with_next_action', 'report_via_task_board_or_SendMessage']
          : pendingAssignments.length > 0
            ? ['pick_up_assignment_via_TaskGet', 'mark_in_progress_via_TaskUpdate', 'complete_or_unblock_slice', 'report_blockers_or_finish_cleanly']
            : currentAgentAssignments.length > 0
              ? ['read_current_task_state', 'continue_assigned_slice', 'validate_local_changes', 'update_task_or_send_handoff']
              : ['read_task_board_state', 'claim_or_continue_real_work', 'report_status_via_task_board_or_SendMessage'],
      primary_tools: blockedTasks.length > 0
        ? ['TaskGet', 'TaskUpdate', 'SendMessage']
        : ['TaskList', 'TaskGet', 'TaskUpdate', 'SendMessage'],
      avoid_shortcuts: ['ask_for_work_when_task_exists', 'fake_done_or_idle_protocol_messages'],
    });
  }

  if (role === 'researcher') {
    return compactState({
      role,
      specialization: specialization || 'research',
      ordered_steps: ['search_specific_surfaces', 'read_targeted_context', 'summarize_paths_and_unknowns'],
      avoid_shortcuts: ['broad_repo_drift', 'tool_discovery_without_real_uncertainty'],
    });
  }

  return specializedPlaybook || compactState({
    role,
    specialization: specialization || undefined,
    ordered_steps: ['inspect_relevant_context', 'apply_surgical_changes', 'run_narrow_validation', 'report_status_and_risks'],
    continuation_rule: continuity.plan_mode_exited ? 'continue_from_last_approved_plan' : undefined,
    avoid_shortcuts: ['open_plan_for_clear_single_slice', 'claim_done_without_validation'],
  });
}

export { buildRouteRecoveryPlaybook } from './route-recovery-playbook.mjs';
