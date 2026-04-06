export function preferredSubagentShape(mode, specialization = '', teamActionState = {}) {
  return teamActionState.teamActionSummary?.recommended_response_shape
    || (specialization === 'compare'
      ? 'one_sentence_judgment_then_markdown_table_then_recommendation'
      : specialization === 'capability'
        ? 'direct_answer_then_visible_capabilities_then_gap_or_next_step'
      : specialization === 'handoff'
        ? 'handoff_status_then_compact_table_then_reassignment_or_follow_up'
        : specialization === 'team_status'
          ? 'team_status_then_compact_table_then_next_actions'
          : specialization === 'planning'
            ? 'ordered_plan_with_validation_and_risks'
            : specialization === 'research'
              ? 'direct_findings_with_paths_and_unknowns'
              : specialization === 'review_verification'
                ? 'findings_first_then_verification_evidence_then_risk_call'
                : specialization === 'review'
                  ? 'findings_first_then_open_questions_then_change_summary'
                  : specialization === 'verification'
                    ? 'verification_status_then_evidence_then_gaps'
                    : specialization === 'explanation'
                      ? 'direct_explanation_then_key_points_and_references'
                      : specialization === 'release'
                        ? 'release_status_then_checklist_then_notes'
                        : mode === 'plan'
                          ? 'ordered_plan_with_validation_and_risks'
                          : mode === 'explore'
                            ? 'direct_findings_with_paths_and_unknowns'
                            : 'brief_status_then_changes_validation_and_risks');
}

export function specializedSubagentPlaybook(identity, specialization = '') {
  if (specialization === 'compare') {
    return {
      role: identity ? 'teammate_executor' : 'general_executor',
      specialization,
      ordered_steps: ['state_judgment_first', 'compare_options_in_compact_table', 'give_recommendation_and_boundary'],
      avoid_shortcuts: ['long_preamble_before_answer'],
    };
  }

  if (specialization === 'research') {
    return {
      role: identity ? 'teammate_explorer' : 'general_executor',
      specialization,
      ordered_steps: ['search_targeted_surfaces', 'read_specific_context', 'return_paths_and_unknowns'],
      avoid_shortcuts: ['broad_conclusion_without_paths'],
    };
  }

  if (specialization === 'capability') {
    return {
      role: identity ? 'teammate_executor' : 'general_executor',
      specialization,
      ordered_steps: ['inspect_visible_capability_surfaces', 'answer_from_visible_surface_or_state_gap', 'name_only_the_narrowest_needed_discovery'],
      avoid_shortcuts: ['inventing_hidden_capabilities', 'broad_discovery_before_surface_check'],
    };
  }

  if (specialization === 'planning') {
    return {
      role: identity ? 'teammate_planner' : 'planner',
      specialization,
      ordered_steps: ['gather_constraints', 'ask_only_real_blocking_questions', 'produce_ordered_plan', 'handoff_or_exit_cleanly'],
      avoid_shortcuts: ['implementation_without_reassignment', 'weak_confirmation_loops'],
    };
  }

  if (specialization === 'review_verification') {
    return {
      role: identity ? 'teammate_executor' : 'general_executor',
      specialization,
      ordered_steps: ['collect_findings_with_paths', 'run_or_collect_validation_evidence', 'state_risks_and_remaining_gaps'],
      avoid_shortcuts: ['summary_first', 'verification_claims_without_evidence'],
    };
  }

  if (specialization === 'review') {
    return {
      role: identity ? 'teammate_executor' : 'general_executor',
      specialization,
      ordered_steps: ['collect_findings_with_paths', 'rank_by_severity_or_regression_risk', 'state_open_questions_after_findings'],
      avoid_shortcuts: ['summary_first_review'],
    };
  }

  if (specialization === 'verification') {
    return {
      role: identity ? 'teammate_executor' : 'general_executor',
      specialization,
      ordered_steps: ['choose_narrowest_relevant_validation', 'capture_evidence_or_not_run_status', 'state_remaining_gaps'],
      avoid_shortcuts: ['claiming_verified_without_evidence'],
    };
  }

  if (specialization === 'explanation') {
    return {
      role: identity ? 'teammate_executor' : 'general_executor',
      specialization,
      ordered_steps: ['answer_the_question_directly', 'anchor_to_concrete_paths_or_symbols', 'add_background_only_if_needed'],
      avoid_shortcuts: ['meta_preface_before_answer'],
    };
  }

  if (specialization === 'release') {
    return {
      role: identity ? 'teammate_executor' : 'general_executor',
      specialization,
      ordered_steps: ['report_release_status_first', 'walk_the_checklist', 'add_notes_and_remaining_risks'],
      avoid_shortcuts: ['notes_without_status'],
    };
  }

  if (specialization === 'team_status') {
    return {
      role: identity ? 'teammate_executor' : 'general_executor',
      specialization,
      ordered_steps: ['read_host_task_state', 'state_current_status_with_next_action', 'use_compact_table_when_multiple_items_exist'],
      avoid_shortcuts: ['free_form_status_retelling'],
    };
  }

  if (specialization === 'handoff') {
    return {
      role: identity ? 'teammate_executor' : 'general_executor',
      specialization,
      ordered_steps: ['read_current_task_state', 'resolve_blocker_or_prepare_handoff', 'update_task_board_or_SendMessage', 'state_next_owner_or_follow_up'],
      avoid_shortcuts: ['claiming_done_while_blocked'],
    };
  }

  return null;
}

export function specializedSubagentRecoveryRecipes(specialization = '') {
  if (specialization === 'compare') {
    return [{
      guard: 'decision_answer_first',
      recover_by: 'state the judgment before longer explanation',
      avoid: ['long preamble before the answer'],
    }];
  }

  if (specialization === 'research') {
    return [{
      guard: 'paths_and_unknowns_required',
      recover_by: 'anchor findings to file paths, symbols, or explicit unknowns',
      avoid: ['conclusion-only research output'],
    }];
  }

  if (specialization === 'capability') {
    return [{
      guard: 'visible_capability_surface_first',
      recover_by: 'answer from the visible host surface or explicit gap before naming discovery',
      avoid: ['inventing hidden capabilities', 'broad discovery before surface check'],
    }];
  }

  if (specialization === 'planning') {
    return [{
      guard: 'planning_protocol',
      recover_by: 'gather constraints first and ask only real blocking questions',
      avoid: ['weak confirmation loops', 'implementation before reassignment'],
    }];
  }

  if (specialization === 'team_status') {
    return [{
      guard: 'task_board_status_first',
      recover_by: 'summarize task-board state and next action before prose commentary',
      avoid: ['free-form status retelling'],
    }];
  }

  if (specialization === 'handoff') {
    return [{
      guard: 'handoff_or_blocker_continuity',
      recover_by: 'resolve the blocker or update the handoff path before claiming completion',
      avoid: ['plain-text handoff with no task update'],
    }];
  }

  return [];
}
