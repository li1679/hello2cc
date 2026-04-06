import { compactState } from './host-state-context.mjs';
import { buildRouteDecisionTieBreakers } from './route-decision-tie-breakers.mjs';
import { subagentSpecialization } from './decision-specializations.mjs';

function compactTieBreakers(items = []) {
  return items
    .map((item) => compactState(item))
    .filter(Boolean);
}

function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

export { buildRouteDecisionTieBreakers };

/**
 * Builds subagent tie-break rules from the already constrained specialization and mode.
 */
export function buildSubagentDecisionTieBreakers(mode, taskProfile = {}, details = {}) {
  const specialization = subagentSpecialization(mode, taskProfile, details);
  const items = [
    {
      id: 'visible_capability_boundary_before_improvisation',
      when: 'there are multiple possible ways to proceed',
      prefer: 'the current mode and surfaced host boundary',
      avoid: 'inventing a private workflow',
    },
  ];

  if (details?.hasTeamIdentity) {
    items.push({
      id: 'task_board_and_SendMessage_before_plain_text',
      when: 'teammate coordination is required',
      prefer: 'TaskGet / TaskUpdate / SendMessage',
      avoid: 'plain-text coordination that never reaches the team',
    });
  }

  if (hasItems(details?.pendingAssignments)) {
    items.push({
      id: 'assignment_pickup_before_status_chat',
      when: 'the mailbox already delivered a task assignment',
      prefer: 'TaskGet and TaskUpdate(in_progress) first',
      avoid: 'asking for work again',
    });
  }

  if (hasItems(details?.blockedTaskRecords)) {
    items.push({
      id: 'blocker_resolution_before_done_claim',
      when: 'assigned work is blocked',
      prefer: 'blocker resolution or handoff',
      avoid: 'claiming completion for blocked work',
    });
  }

  if (mode !== 'general') {
    items.push({
      id: 'mode_boundary_before_write_actions',
      when: 'the current mode is read-only',
      prefer: 'read/search/plan only, then ask for reassignment if writes are needed',
      avoid: 'editing anyway',
    });
  }

  if (specialization === 'compare') {
    items.push({
      id: 'judgment_and_table_before_long_prose',
      when: 'the parent task is a comparison or choice',
      prefer: 'a direct judgment and compact table first',
      avoid: 'long explanation before the answer',
    });
  }

  if (specialization === 'research') {
    items.push({
      id: 'paths_and_unknowns_before_conclusion',
      when: 'the parent task is research or investigation',
      prefer: 'concrete paths, symbols, and unknowns first',
      avoid: 'detached conclusions',
    });
  }

  if (specialization === 'planning') {
    items.push({
      id: 'constraints_before_plan',
      when: 'the parent task is planning',
      prefer: 'constraints and blockers before the final plan text',
      avoid: 'weak confirmation loops',
    });
  }

  if (specialization === 'review' || specialization === 'review_verification') {
    items.push({
      id: 'findings_before_summary',
      when: 'the parent task is a review',
      prefer: 'findings with exact paths first',
      avoid: 'summary-first review output',
    });
  }

  if (specialization === 'verification' || specialization === 'review_verification') {
    items.push({
      id: 'evidence_before_claims',
      when: 'the parent task asks for verification',
      prefer: 'validation evidence or an explicit not-run statement',
      avoid: 'unsubstantiated verification claims',
    });
  }

  if (specialization === 'explanation') {
    items.push({
      id: 'direct_answer_before_background',
      when: 'the parent task asks for explanation',
      prefer: 'the answer first, then detail',
      avoid: 'background before the answer',
    });
  }

  if (specialization === 'capability') {
    items.push({
      id: 'visible_surface_answer_before_discovery_fallback',
      when: 'the parent task asks what capabilities or host surfaces are available',
      prefer: 'the visible host surface and explicit host gaps first',
      avoid: 'inventing capabilities or jumping to broad discovery first',
    });
  }

  if (specialization === 'team_status') {
    items.push({
      id: 'task_board_status_before_freeform_summary',
      when: 'the parent task asks for team or task status',
      prefer: 'task-board continuity and next action first',
      avoid: 'free-form status retelling',
    });
  }

  if (specialization === 'handoff') {
    items.push({
      id: 'blocked_task_or_handoff_before_done_claim',
      when: 'the assigned slice is blocked or needs a handoff',
      prefer: 'blocker resolution or handoff continuity first',
      avoid: 'claiming completion or drifting into general status chat',
    });
  }

  if (specialization === 'release') {
    items.push({
      id: 'release_status_before_notes',
      when: 'the parent task is a release flow',
      prefer: 'status and checklist first, then notes',
      avoid: 'scattered release commentary',
    });
  }

  return compactState({
    specialization: specialization || undefined,
    items: compactTieBreakers(items),
  });
}
