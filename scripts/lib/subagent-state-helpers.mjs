import { buildSubagentDecisionTieBreakers, subagentSpecialization } from './decision-tie-breakers.mjs';
import { requiredSectionsForResponseShape } from './route-specializations.mjs';
import {
  preferredSubagentShape,
  specializedSubagentPlaybook,
  specializedSubagentRecoveryRecipes,
} from './subagent-specializations.mjs';
import {
  currentAssignedTasks,
  currentBlockedTaskRecords,
  currentMailboxState,
  currentPendingAssignmentRecords,
  currentPendingAssignments,
  currentTeamActionState,
  parseTeammateIdentity,
  readTrimmed,
  subagentTaskIntentProfile,
  subagentTaskIntentState,
} from './subagent-state-readers.mjs';
import { describeSubagentSpecialization } from './specialization-selection.mjs';

export {
  currentAssignedTasks,
  currentBlockedTaskRecords,
  currentMailboxState,
  currentPendingAssignmentRecords,
  currentPendingAssignments,
  currentTeamActionState,
  parseTeammateIdentity,
  subagentTaskIntentProfile,
  subagentTaskIntentState,
} from './subagent-state-readers.mjs';

function uniqueStrings(values, maxItems = 8) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => readTrimmed(value))
      .filter(Boolean),
  )].slice(0, maxItems);
}

function subagentSelectionMode(selection = {}) {
  const strength = readTrimmed(selection?.selection_strength).toLowerCase();
  if (strength === 'strong') return 'host_locked_continuity';
  if (strength === 'medium') return 'host_guided_visible_surface';
  return 'semantic_choice_within_candidates';
}

export function buildSubagentResponseContract(mode, identity, taskProfile = {}, teamActionState = {}, details = {}) {
  const selection = describeSubagentSpecialization(mode, taskProfile, {
    hasTeamIdentity: Boolean(identity),
    teamActionState,
    ...details,
  });
  const specialization = selection.specialization || subagentSpecialization(mode, taskProfile, {
    hasTeamIdentity: Boolean(identity),
    teamActionState,
    ...details,
  });
  const preferredShape = preferredSubagentShape(mode, specialization, teamActionState);
  return {
    role: identity ? 'teammate' : 'plain_worker',
    specialization: specialization || undefined,
    selection_basis: selection.selection_basis,
    selection_strength: selection.selection_strength,
    selection_mode: subagentSelectionMode(selection),
    specialization_is_hint: selection.selection_strength === 'weak' || undefined,
    opening_style: 'direct_no_internal_deliberation',
    visible_text_language: 'follow_parent_and_user_language',
    preferred_shape: preferredShape,
    required_sections: requiredSectionsForResponseShape(preferredShape),
    preferred_table_columns: teamActionState.teamActionSummary?.preferred_table_columns,
    prioritize_summary_first: true,
  };
}

export function buildSubagentExecutionPlaybook(mode, identity, taskProfile = {}, details = {}) {
  const { assignedTasks = [], pendingAssignments = [], blockedTaskRecords = [] } = details;
  const specialization = subagentSpecialization(mode, taskProfile, {
    ...details,
    hasTeamIdentity: Boolean(identity),
  });
  if (mode === 'explore') {
    return {
      role: identity ? 'teammate_explorer' : 'explore_reader',
      specialization: specialization || 'research',
      ordered_steps: ['search_targeted_surfaces', 'read_specific_context', 'return_paths_and_unknowns'],
      avoid_shortcuts: ['writing_changes', 'broad_repo_drift'],
    };
  }

  if (mode === 'plan') {
    return {
      role: identity ? 'teammate_planner' : 'planner',
      specialization: specialization || 'planning',
      ordered_steps: ['gather_constraints', 'ask_only_real_blocking_questions', 'produce_ordered_plan', 'call_out_validation_and_risks'],
      avoid_shortcuts: ['implementation_without_reassignment', 'weak_confirmation_loops'],
    };
  }

  return specializedSubagentPlaybook(identity, specialization) || {
    role: identity ? 'teammate_executor' : 'general_executor',
    specialization: specialization || undefined,
    ordered_steps: pendingAssignments.length > 0
      ? ['pick_up_assignment_via_TaskGet', 'mark_in_progress_via_TaskUpdate', 'finish_slice_and_validate', 'close_task_or_record_blocker', 'only_then_report_or_idle']
      : assignedTasks.length > 0
        ? ['refresh_task_state', 'continue_slice_and_validate', 'close_task_or_record_blocker', 'only_then_report_or_idle']
        : ['inspect_assigned_scope', 'edit_surgically', 'run_narrow_validation', 'report_files_and_risks'],
    primary_tools: blockedTaskRecords.length > 0
      ? ['TaskGet', 'TaskUpdate', 'SendMessage']
      : identity ? ['TaskList', 'TaskGet', 'TaskUpdate', 'SendMessage'] : undefined,
    avoid_shortcuts: ['claim_done_without_validation', 'plain_text_team_coordination', 'idle_or_plain_text_summary_before_task_closure'],
  };
}

export function buildSubagentRecoveryPlaybook(mode, taskProfile = {}, details = {}) {
  const {
    canWrite = false,
    assignedTasks = [],
    pendingAssignments = [],
    blockedTaskRecords = [],
    hasTeamIdentity = false,
  } = details;
  const specialization = subagentSpecialization(mode, taskProfile, details);
  const recipes = specializedSubagentRecoveryRecipes(specialization);
  const hasTaskBoardContinuity = hasTeamIdentity
    && (assignedTasks.length > 0
      || pendingAssignments.length > 0
      || blockedTaskRecords.length > 0);

  if (hasTaskBoardContinuity) {
    recipes.push({
      guard: 'task_board_closure_required',
      recover_by: 'refresh TaskGet/TaskList and keep TaskUpdate status truthful before any done claim',
      avoid: ['plain_text_done_claim', 'TeammateIdle_as_closure'],
    });
    recipes.push({
      guard: 'completion_requires_TaskUpdate',
      recover_by: 'use TaskUpdate(status:"completed") for real completion; otherwise keep in_progress or record blocker first',
      avoid: ['idle_before_task_update', 'summary_text_as_done'],
    });
  }

  if (pendingAssignments.length > 0) {
    recipes.push({
      guard: 'pending_assignment_mailbox',
      recover_by: 'TaskGet -> TaskUpdate(status:"in_progress") before free-form status text',
      avoid: ['asking for work again', 'ignoring delivered assignment continuity'],
    });
  }

  if (blockedTaskRecords.length > 0) {
    recipes.push({
      guard: 'blocked_task_continuity',
      recover_by: 'TaskGet blocker context, then TaskUpdate / SendMessage for handoff or unblock',
      avoid: ['marking blocked work completed'],
    });
  }

  if (!canWrite && mode !== 'explore') {
    recipes.push({
      guard: 'read_only_capability_boundary',
      recover_by: 'SendMessage the team lead for reassignment if the slice now needs edits or verification',
      avoid: ['editing anyway', 'pretending completion from a read-only surface'],
    });
  }

  if (specialization === 'review' || specialization === 'review_verification') {
    recipes.push({
      guard: 'review_findings_first',
      recover_by: 'list findings with exact paths before summary',
      avoid: ['summary-only review output'],
    });
  }

  if (specialization === 'verification' || specialization === 'review_verification') {
    recipes.push({
      guard: 'verification_evidence_required',
      recover_by: 'run validation or explicitly say it was not run',
      avoid: ['unsubstantiated verification claims'],
    });
  }

  if (specialization === 'explanation') {
    recipes.push({
      guard: 'direct_answer_first',
      recover_by: 'answer directly before adding background',
      avoid: ['background before answer'],
    });
  }

  if (specialization === 'release') {
    recipes.push({
      guard: 'release_status_first',
      recover_by: 'report release status and checklist before notes',
      avoid: ['scattered release commentary'],
    });
  }

  return {
    specialization: specialization || undefined,
    fail_closed: true,
    retry_rule: 'do_not_invent_private_protocols_when_host_surface_is_read_only_or_blocked',
    recipes,
  };
}

export function buildSubagentTieBreakers(mode, taskProfile = {}, details = {}) {
  return buildSubagentDecisionTieBreakers(mode, taskProfile, details);
}

export function subagentRecoveryGuardLabels(recoveryPlaybook = {}) {
  return uniqueStrings((Array.isArray(recoveryPlaybook?.recipes) ? recoveryPlaybook.recipes : []).map((recipe) => recipe.guard));
}
