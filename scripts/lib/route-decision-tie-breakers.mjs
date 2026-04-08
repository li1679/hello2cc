import { compactState } from './host-state-context.mjs';
import { routeSpecialization } from './decision-specializations.mjs';

function compactTieBreakers(items = []) {
  return items
    .map((item) => compactState(item))
    .filter(Boolean);
}

function trimmed(value) {
  return String(value || '').trim();
}

function routeTeamContinuity(continuity = {}) {
  return continuity?.team && typeof continuity.team === 'object'
    ? continuity.team
    : {};
}

function hasLoadedReleaseWorkflow(sessionContext = {}) {
  return [
    ...(Array.isArray(sessionContext?.workflowNames) ? sessionContext.workflowNames : []),
    ...(Array.isArray(sessionContext?.loadedCommandNames) ? sessionContext.loadedCommandNames : []),
  ].some((name) => trimmed(name).toLowerCase() === 'release');
}

/**
 * Builds route-level tie-break rules after specialization is already known.
 */
export function buildRouteDecisionTieBreakers(signals = {}, sessionContext = {}, continuity = {}) {
  const teamContinuity = routeTeamContinuity(continuity);
  const specialization = routeSpecialization(signals, continuity, sessionContext);
  const loadedReleaseWorkflow = hasLoadedReleaseWorkflow(sessionContext);
  const items = [
    {
      id: 'specific_surface_before_broader_path',
      when: 'more than one surfaced capability could work',
      prefer: 'the most specific visible surface or continuity first',
      avoid: 'jumping straight to a broader Agent, team, or discovery path',
    },
    {
      id: 'state_change_before_retry',
      when: 'a host guard or fail-closed path fired',
      prefer: 'the recovery_playbook path that changes state',
      avoid: 'repeating the same blocked attempt',
    },
  ];

  if (teamContinuity.active_team) {
    items.push({
      id: 'task_board_or_protocol_before_prose',
      when: 'team coordination is active',
      prefer: 'TaskUpdate / TaskGet / structured SendMessage',
      avoid: 're-stating coordination only in plain prose',
    });
  }

  if (Array.isArray(teamContinuity.team_action_items) && teamContinuity.team_action_items.length > 0) {
    items.push({
      id: 'higher_priority_action_before_follow_up',
      when: 'action items and ordinary follow-up coexist',
      prefer: 'the highest-priority host action item first',
      avoid: 'handling low-priority follow-up before required protocol work',
    });
  }

  if (continuity.plan_mode_exited) {
    items.push({
      id: 'approved_plan_before_replanning',
      when: 'the session already exited plan mode',
      prefer: 'continue the approved plan',
      avoid: 're-opening plan mode without a boundary change',
    });
  }

  if (specialization === 'compare') {
    items.push({
      id: 'judgment_and_table_before_long_prose',
      when: 'the request is a comparison or choice',
      prefer: 'one-line judgment and compact Markdown table first',
      avoid: 'long prose before the answer',
    });
  }

  if (specialization === 'current_info') {
    items.push({
      id: 'real_sources_before_memory',
      when: 'the request asks for current or latest information',
      prefer: 'real WebSearch results and source-backed status first',
      avoid: 'answering from stale memory as if it were current',
    });
    if (Array.isArray(continuity?.recent_zero_result_toolsearch_queries) && continuity.recent_zero_result_toolsearch_queries.length > 0) {
      items.push({
        id: 'cooldown_or_probe_before_repeat_retry',
        when: 'recent search attempts already degraded',
        prefer: 'the host cooldown/probe path before repeating the same retry loop',
        avoid: 'mechanical repeated search retries',
      });
    }
  }

  if (specialization === 'capability') {
    items.push({
      id: 'visible_surface_answer_before_discovery_fallback',
      when: 'the request is asking what the host can do or what surfaces are available',
      prefer: 'answer from visible capabilities, surfaced workflows, MCP resources, or explicit host gaps first',
      avoid: 'generic ToolSearch or invented capabilities before checking the visible surface',
    });
    items.push({
      id: 'discovery_by_gap_before_broad_probe',
      when: 'a visible capability answer still has a real gap',
      prefer: 'the narrowest matching discovery path such as DiscoverSkills, ReadMcpResource/ListMcpResources, or ToolSearch',
      avoid: 'jumping straight to the broadest discovery path',
    });
  }

  if (specialization === 'research') {
    items.push({
      id: 'targeted_paths_before_conclusion',
      when: 'the request is research or investigation',
      prefer: 'targeted file paths, symbols, and concrete unknowns first',
      avoid: 'broad conclusions with no code anchors',
    });
  }

  if (specialization === 'planning') {
    items.push({
      id: 'constraints_before_plan_shape',
      when: signals?.planningProbeShape
        ? 'the request shape already asks for sequencing, validation, or rollout structure'
        : 'the request is planning or plan-mode continuity',
      prefer: 'real constraints, blockers, and validation needs before the final plan shape',
      avoid: 'polishing the plan before scoping the work',
    });
    items.push({
      id: 'blocking_question_before_plan_freeze',
      when: 'a detail is truly blocking the plan',
      prefer: 'AskUserQuestion for the blocking choice, then exit or continue cleanly',
      avoid: 'weak confirmation loops or implementation before plan approval',
    });
  }

  if (specialization === 'team_approval') {
    items.push({
      id: 'pending_plan_approval_before_general_status',
      when: 'the team has pending plan approvals',
      prefer: 'review and respond to the pending approval before general coordination updates',
      avoid: 'burying approval work inside a broader status summary',
    });
    items.push({
      id: 'structured_plan_response_before_prose',
      when: 'a teammate plan needs approval or rejection',
      prefer: 'structured SendMessage.plan_approval_response',
      avoid: 'plain-text approval or rejection',
    });
  }

  if (specialization === 'blocked_verification') {
    items.push({
      id: 'blocker_or_not_run_before_verified_claim',
      when: 'verification is requested but the work is blocked',
      prefer: 'state the blocker or not-run boundary before any verification claim',
      avoid: 'claiming a clean verification result while blocked',
    });
  }

  if (specialization === 'review' || specialization === 'review_verification') {
    items.push({
      id: 'findings_before_summary',
      when: 'the request is a review',
      prefer: 'findings with severity, behavior, and file references first',
      avoid: 'overview-first review output',
    });
  }

  if (specialization === 'verification' || specialization === 'review_verification') {
    items.push({
      id: 'evidence_before_claims',
      when: 'the request asks for verification',
      prefer: 'the narrowest relevant validation evidence first',
      avoid: 'claiming verification without proof or explicitly stating not run',
    });
  }

  if (specialization === 'explanation') {
    items.push({
      id: 'direct_answer_before_background',
      when: 'the request asks for explanation',
      prefer: 'the direct answer first, then mechanics and references',
      avoid: 'meta preamble or delayed answer',
    });
  }

  if (specialization === 'team_status') {
    items.push({
      id: 'host_team_continuity_before_freeform_status',
      when: 'the user asks for team status or next actions',
      prefer: 'host task-board, mailbox, and action-summary continuity first',
      avoid: 'free-form status retelling detached from task state',
    });
    items.push({
      id: 'highest_priority_action_before_general_update',
      when: 'status reporting and pending actions coexist',
      prefer: 'the next required action before background context',
      avoid: 'burying the next action under a long summary',
    });
  }

  if (specialization === 'handoff') {
    items.push({
      id: 'existing_handoff_candidate_before_new_branch',
      when: 'handoff or blocker continuity already exists',
      prefer: 'the surfaced handoff candidate or blocker path first',
      avoid: 'starting a fresh coordination branch from scratch',
    });
    items.push({
      id: 'task_board_reassignment_before_plain_text_handoff',
      when: 'work needs reassignment or blocker follow-up',
      prefer: 'TaskGet / TaskUpdate / structured SendMessage',
      avoid: 'plain-text handoff with no task-board state change',
    });
  }

  if (specialization === 'release_follow_up') {
    items.push({
      id: 'loaded_release_follow_up_before_fresh_release_flow',
      when: 'the release path is already active',
      prefer: 'resume the loaded release continuity and remaining follow-up items',
      avoid: 'starting a fresh manual release path',
    });
  }

  if (specialization === 'release') {
    items.push({
      id: 'loaded_release_workflow_before_manual_reinvention',
      when: loadedReleaseWorkflow
        ? 'a release workflow is already surfaced or loaded'
        : 'the request is a release / publish flow',
      prefer: loadedReleaseWorkflow
        ? 'continue the loaded release workflow and surfaced MCP/tool path'
        : 'the most specific surfaced release-capable path',
      avoid: 're-inventing a manual release flow or rediscovering the same path',
    });
  }

  return compactState({
    specialization: specialization || undefined,
    items: compactTieBreakers(items),
  });
}
