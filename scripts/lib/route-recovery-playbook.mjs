import { resolveWebSearchGuidanceState } from './api-topology.mjs';
import { compactState } from './host-state-context.mjs';
import { routeSpecialization } from './decision-specializations.mjs';

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

function routeTeamContinuity(continuity = {}) {
  return continuity?.team && typeof continuity.team === 'object'
    ? continuity.team
    : {};
}

/**
 * Builds fail-closed recovery recipes for the active route specialization.
 */
export function buildRouteRecoveryPlaybook(sessionContext = {}, continuity = {}, signals = {}) {
  const teamContinuity = routeTeamContinuity(continuity);
  const recentZeroSearches = Array.isArray(continuity.recent_zero_result_toolsearch_queries)
    ? continuity.recent_zero_result_toolsearch_queries
    : [];
  const actionItems = Array.isArray(teamContinuity.team_action_items) ? teamContinuity.team_action_items : [];
  const specialization = routeSpecialization(signals, continuity, sessionContext);
  const recipes = [];

  const missingTeams = uniqueStrings(
    Object.values(sessionContext?.preconditionFailures?.missingTeams || {}).map((record) => record?.teamName),
    8,
  );
  if (missingTeams.length > 0) {
    recipes.push({
      guard: 'missing_team',
      targets: missingTeams,
      recover_by: 'TeamCreate -> TaskList/TaskCreate -> Agent(name, team_name)',
      avoid: ['retrying teammate Agent against the same missing team', 'assuming team continuity already exists'],
    });
  }

  const blockedWorktrees = uniqueStrings(
    Object.values(sessionContext?.preconditionFailures?.worktreeByCwd || {}).map((record) => record?.cwd),
    8,
  );
  if (blockedWorktrees.length > 0) {
    recipes.push({
      guard: 'worktree_retry_blocked',
      targets: blockedWorktrees,
      recover_by: 'wait for cwd or host state to change before retrying Agent/EnterWorktree',
      avoid: ['repeating the same worktree request loop'],
    });
  }

  if (recentZeroSearches.length > 0) {
    recipes.push({
      guard: 'toolsearch_zero_match_cooldown',
      targets: recentZeroSearches,
      recover_by: 'refine the query or switch to a more specific surfaced capability',
      avoid: ['repeating the same zero-match ToolSearch query'],
    });
  }

  if (specialization === 'current_info') {
    const websearchState = resolveWebSearchGuidanceState(sessionContext, {
      retryRequested: signals?.webSearchRetry,
    });
    recipes.push({
      guard: 'websearch_real_source_required',
      recover_by: 'use WebSearch results or explicitly state the current-info boundary',
      avoid: ['presenting stale memory as current fact'],
    });

    if (websearchState.mode === 'proxy-cooldown') {
      recipes.push({
        guard: 'websearch_retry_cooldown',
        recover_by: 'surface the cooldown boundary instead of repeating the same search conditions',
        avoid: ['mechanical repeated WebSearch retries'],
      });
    }

    if (websearchState.mode === 'proxy-probe') {
      recipes.push({
        guard: 'websearch_probe_once',
        recover_by: 'make a single probe search, then only continue if real results arrive',
        avoid: ['looping probe retries with no state change'],
      });
    }

    if (websearchState.mode === 'not-exposed') {
      recipes.push({
        guard: 'websearch_not_exposed',
        recover_by: 'state that no native current-info surface is visible in this session',
        avoid: ['pretending live search exists'],
      });
    }
  }

  if (specialization === 'capability') {
    recipes.push({
      guard: 'visible_capability_surface_first',
      recover_by: 'answer from surfaced skills, workflows, MCP resources, deferred tools, or explicit host gaps before discovery fallback',
      avoid: ['pretending hidden capabilities exist', 'starting with broad ToolSearch when the visible surface is already enough'],
    });
    recipes.push({
      guard: 'narrow_discovery_for_real_gap_only',
      recover_by: 'choose the narrowest discovery path only after naming the concrete gap',
      avoid: ['discovery with no concrete gap', 'jumping straight to the broadest probe'],
    });
  }

  if (specialization === 'compare') {
    recipes.push({
      guard: 'decision_answer_first',
      recover_by: 'state the judgment before long-form explanation',
      avoid: ['long preamble before the comparison answer'],
    });
  }

  if (specialization === 'research') {
    recipes.push({
      guard: 'paths_and_unknowns_required',
      recover_by: 'anchor findings to concrete paths, symbols, or explicit unknowns',
      avoid: ['conclusion-only research output'],
    });
  }

  if (specialization === 'planning') {
    recipes.push({
      guard: 'plan_mode_protocol',
      recover_by: signals?.planningProbeShape
        ? 'turn the request into goal, ordered phases, validation, and open questions or risks before asking any blocker question'
        : 'ask only real blocking questions and submit the plan through the plan-mode path',
      avoid: ['implementation before plan approval', 'weak confirmation loops'],
    });
  }

  if (specialization === 'team_approval') {
    recipes.push({
      guard: 'team_approval_protocol',
      recover_by: 'review the pending approval request and answer with structured SendMessage.plan_approval_response',
      avoid: ['plain-text plan approval'],
    });
  }

  if (specialization === 'blocked_verification') {
    recipes.push({
      guard: 'verification_blocker_continuity',
      recover_by: 'state the blocker or not-run boundary before any verification claim, then continue the unblock path',
      avoid: ['claiming verification while blocked'],
    });
  }

  if (actionItems.some((item) => item?.action_type === 'review_plan_approval')) {
    recipes.push({
      guard: 'pending_plan_approval_protocol',
      recover_by: 'SendMessage.plan_approval_response with requestId, approved boolean, and feedback when rejecting',
      avoid: ['plain_text approval or rejection'],
    });
  }

  if (actionItems.some((item) => item?.action_type === 'resolve_shutdown_rejection')) {
    recipes.push({
      guard: 'shutdown_rejection_follow_up',
      recover_by: 'TaskGet/TaskList the remaining work, then reassign, wait, or retry shutdown later',
      avoid: ['TeamDelete now', 'immediate repeat shutdown loop'],
    });
  }

  if (Array.isArray(teamContinuity.handoff_candidates) && teamContinuity.handoff_candidates.length > 0) {
    recipes.push({
      guard: 'task_handoff_or_blocker_continuity',
      recover_by: 'resolve the blocker or reassignment on the task board before treating the work as done',
      avoid: ['marking blocked work completed in plain text'],
    });
  }

  if (specialization === 'team_status') {
    recipes.push({
      guard: 'team_status_from_host_continuity',
      recover_by: 'summarize task-board, mailbox, and action-summary state before prose commentary',
      avoid: ['free-form team status detached from host continuity'],
    });
  }

  if (specialization === 'handoff') {
    recipes.push({
      guard: 'handoff_candidate_continuity',
      recover_by: 'follow the current blocker or handoff candidate before creating a new coordination branch',
      avoid: ['plain-text handoff with no task-board update'],
    });
  }

  if (specialization === 'review' || specialization === 'review_verification') {
    recipes.push({
      guard: 'review_findings_first',
      recover_by: 'list concrete findings with paths before any overview or change summary',
      avoid: ['summary-only review output'],
    });
  }

  if (specialization === 'verification' || specialization === 'review_verification') {
    recipes.push({
      guard: 'verification_evidence_required',
      recover_by: 'run the narrowest relevant validation or explicitly state that validation was not run',
      avoid: ['claiming verification with no evidence'],
    });
  }

  if (specialization === 'explanation') {
    recipes.push({
      guard: 'direct_answer_first',
      recover_by: 'answer the question directly before adding background or mechanics',
      avoid: ['meta preamble before the answer'],
    });
  }

  if (specialization === 'release') {
    recipes.push({
      guard: 'release_workflow_continuity',
      recover_by: 'prefer the loaded release workflow / surfaced release path before rediscovery or manual reinvention',
      avoid: ['rediscovering the same release path', 'release notes with no status or checklist'],
    });
  }

  if (specialization === 'release_follow_up') {
    recipes.push({
      guard: 'release_follow_up_continuity',
      recover_by: 'resume the loaded release path and remaining follow-up items before inventing a fresh release flow',
      avoid: ['discarding the loaded release continuity'],
    });
  }

  return compactState({
    specialization: specialization || undefined,
    fail_closed: true,
    retry_rule: 'do_not_repeat_the_same_blocked_path_until_host_state_changes',
    recipes,
  });
}
