import { FORCED_OUTPUT_STYLE_NAME, configuredModels } from './config.mjs';
import { resolveWebSearchGuidanceState } from './api-topology.mjs';
import { observedAgentSurfaces } from './session-capabilities.mjs';
import { workflowContinuitySnapshot } from './tool-policy-state.mjs';
import { attachmentState } from './host-state-attachments.mjs';
import { compactState, trimmed, uniqueStrings, visibleTeamName } from './host-state-shared.mjs';

function mcpResourceRefs(sessionContext = {}) {
  const resources = Array.isArray(sessionContext?.mcpResources)
    ? sessionContext.mcpResources
    : [];

  return uniqueStrings(resources.map((resource) => {
    const server = trimmed(resource?.server);
    const uri = trimmed(resource?.uri);
    return server && uri ? `${server}:${uri}` : '';
  }));
}

function missingTeamNames(sessionContext = {}) {
  const missingTeams = sessionContext?.preconditionFailures?.missingTeams;
  if (!missingTeams || typeof missingTeams !== 'object') {
    return [];
  }

  return uniqueStrings(
    Object.entries(missingTeams).map(([fallbackName, record]) => record?.teamName || fallbackName),
  );
}

function blockedWorktreeCwds(sessionContext = {}) {
  const worktreeByCwd = sessionContext?.preconditionFailures?.worktreeByCwd;
  if (!worktreeByCwd || typeof worktreeByCwd !== 'object') {
    return [];
  }

  return uniqueStrings(
    Object.entries(worktreeByCwd).map(([fallbackCwd, record]) => record?.cwd || fallbackCwd),
  );
}

function hostAgentSurfaces(sessionContext = {}) {
  return observedAgentSurfaces(sessionContext?.agentTypes).map((surface) => compactState({
    name: surface.label,
    role: surface.role,
    tool_surface: surface.toolSurface,
  }));
}

function surfacedAgentSurfaces(sessionContext = {}) {
  return observedAgentSurfaces(sessionContext?.surfacedAgentTypes).map((surface) => compactState({
    name: surface.label,
    role: surface.role,
    tool_surface: surface.toolSurface,
  }));
}

function webSearchState(sessionContext = {}, options = {}) {
  const state = resolveWebSearchGuidanceState(sessionContext);
  const stableMode = ['generic', 'available', 'not-exposed'].includes(state.mode);

  if (stableMode && !options.includeStableModes) {
    return undefined;
  }

  if (!options.includeStableModes && !state.degraded && !state.shouldProbe) {
    return undefined;
  }

  return compactState({
    tool: sessionContext?.webSearchAvailable ? 'WebSearch' : undefined,
    mode: state.mode,
    degraded: state.degraded || undefined,
    probe_allowed: state.shouldProbe || undefined,
    transport_changed: state.transportChanged || undefined,
    model_changed: state.modelChanged || undefined,
    cooldown_expired: state.cooldownExpired || undefined,
  });
}

export function protocolAdapters(sessionContext = {}) {
  const config = configuredModels(sessionContext);

  return compactState({
    capability_policies: 'host_defined_then_model_selects_within_bounds',
    semantic_routing: 'host_guarded_model_decides',
    workflow_owner_arbitration: 'style_and_tool_semantics_always_on_defer_main_workflow_to_visible_host_skill_owner',
    explicit_tool_input_wins: true,
    agent_model: config.routingPolicy === 'prompt-only'
      ? 'preserve_input'
      : 'fill_safe_claude_slot_if_missing',
    plan_mode: 'enter_for_complex_design_exit_for_plan_approval_then_implement',
    send_message_summary: 'fill_if_missing',
    repeated_failure_policy: 'block_same_failed_precondition_until_state_changes',
    task_continuity: 'remember_task_board_state_assignments_and_blockers_then_block_stale_mutations',
    tool_discovery: 'prefer_specific_surface_then_guard_toolsearch_retries',
    team_coordination: 'named_teammates_via_sendmessage_task_state_via_taskupdate',
    team_mailbox_protocol: 'host-scoped_task_assignment_idle_notification_teammate_terminated_shutdown_and_plan_approval_messages',
  });
}

export function hostSnapshot(sessionContext = {}, options = {}) {
  return compactState({
    session: compactState({
      model: configuredModels(sessionContext).sessionModel || trimmed(sessionContext?.mainModel),
      output_style: trimmed(sessionContext?.outputStyle) || FORCED_OUTPUT_STYLE_NAME,
    }),
    host: compactState({
      tools: uniqueStrings(sessionContext?.toolNames),
      agents: hostAgentSurfaces(sessionContext),
      delta_surfaces: compactState({
        agents: surfacedAgentSurfaces(sessionContext),
      }),
      attachments: attachmentState(sessionContext),
      surfaced_skills: uniqueStrings(sessionContext?.surfacedSkillNames),
      loaded_commands: uniqueStrings(sessionContext?.loadedCommandNames),
      workflows: uniqueStrings(sessionContext?.workflowNames),
      deferred_tools: compactState({
        available: uniqueStrings(sessionContext?.availableDeferredToolNames),
        loaded: uniqueStrings(sessionContext?.loadedDeferredToolNames),
      }),
      mcp_resources: mcpResourceRefs(sessionContext),
      active_team: visibleTeamName(sessionContext),
      continuity: workflowContinuitySnapshot(sessionContext),
    }),
    websearch: webSearchState(sessionContext, {
      includeStableModes: options.includeStableWebSearchModes,
    }),
    guards: compactState({
      missing_teams: missingTeamNames(sessionContext),
      worktree_retry_blocked_cwds: blockedWorktreeCwds(sessionContext),
    }),
  });
}

export function promptHostStateSnapshot(sessionContext = {}) {
  return compactState({
    host: compactState({
      tools: uniqueStrings(sessionContext?.toolNames),
      delta_surfaces: compactState({
        agents: surfacedAgentSurfaces(sessionContext),
      }),
      attachments: attachmentState(sessionContext),
      surfaced_skills: uniqueStrings(sessionContext?.surfacedSkillNames),
      loaded_commands: uniqueStrings(sessionContext?.loadedCommandNames),
      workflows: uniqueStrings(sessionContext?.workflowNames),
      deferred_tools: compactState({
        available: uniqueStrings(sessionContext?.availableDeferredToolNames),
        loaded: uniqueStrings(sessionContext?.loadedDeferredToolNames),
      }),
      mcp_resources: mcpResourceRefs(sessionContext),
      active_team: visibleTeamName(sessionContext),
      continuity: workflowContinuitySnapshot(sessionContext),
    }),
    websearch: webSearchState(sessionContext, {
      includeStableModes: false,
    }),
    guards: compactState({
      missing_teams: missingTeamNames(sessionContext),
      worktree_retry_blocked_cwds: blockedWorktreeCwds(sessionContext),
    }),
  });
}
