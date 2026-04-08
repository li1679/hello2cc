import {
  requestNeedsParallelWorkers,
  requestNeedsTaskTracking,
  requestNeedsTeamWorkflow,
} from './capability-policy-helpers.mjs';

function trimmed(value) {
  return String(value || '').trim();
}

function uniqueStrings(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => trimmed(value))
      .filter(Boolean),
  )];
}

function attachedSkillListingNames(sessionContext = {}) {
  return uniqueStrings(sessionContext?.attachedSkillListing?.names);
}

export function visibleHostSkillWorkflowNames(sessionContext = {}) {
  return uniqueStrings([
    ...(Array.isArray(sessionContext?.surfacedSkillNames) ? sessionContext.surfacedSkillNames : []),
    ...attachedSkillListingNames(sessionContext),
  ]);
}

function requestPrefersHello2ccNativeRouting(requestProfile = {}) {
  return Boolean(
    requestProfile?.compare
    || requestProfile?.currentInfo
    || requestProfile?.capabilityQuery
    || requestProfile?.capabilityProbeShape
    || requestProfile?.claudeGuide
    || requestProfile?.explain
  );
}

function requestNeedsOpenWorkflowOwner(requestProfile = {}) {
  return Boolean(
    requestProfile?.workflowContinuation
    || requestProfile?.release
    || requestProfile?.plan
    || requestProfile?.implement
    || requestProfile?.boundedImplementation
    || requestProfile?.research
    || requestProfile?.codeResearch
    || requestProfile?.review
    || requestProfile?.verify
    || requestNeedsParallelWorkers(requestProfile)
    || requestNeedsTeamWorkflow(requestProfile)
    || requestNeedsTaskTracking(requestProfile)
  );
}

function hasActiveNativeContinuity(sessionContext = {}) {
  const workflowState = sessionContext?.workflowState && typeof sessionContext.workflowState === 'object'
    ? sessionContext.workflowState
    : {};

  return Boolean(
    trimmed(sessionContext?.teamName)
    || trimmed(sessionContext?.agentName)
    || (Array.isArray(sessionContext?.workflowNames) && sessionContext.workflowNames.length > 0)
    || (Array.isArray(sessionContext?.loadedCommandNames) && sessionContext.loadedCommandNames.length > 0)
    || workflowState?.activeTaskBoard
    || workflowState?.planModeEntered
    || workflowState?.planModeExited
  );
}

export function selectWorkflowOwner(requestProfile = {}, sessionContext = {}) {
  const hostSkillWorkflows = visibleHostSkillWorkflowNames(sessionContext);

  if (!hostSkillWorkflows.length) {
    return {
      owner: 'hello2cc',
      mode: 'native_routing',
      reason: 'no_visible_host_skill_workflow',
      host_skill_workflows: [],
    };
  }

  if (requestPrefersHello2ccNativeRouting(requestProfile)) {
    return {
      owner: 'hello2cc',
      mode: 'native_routing',
      reason: 'request_prefers_native_capability_or_output_specialization',
      host_skill_workflows: hostSkillWorkflows,
    };
  }

  if (requestNeedsOpenWorkflowOwner(requestProfile)) {
    return {
      owner: 'host_skill_workflow',
      mode: 'host_skill_workflow',
      reason: requestProfile?.workflowContinuation
        ? 'visible_host_skill_continuity'
        : 'visible_host_skill_surface_for_open_workflow',
      host_skill_workflows: hostSkillWorkflows,
      invoke_tool: sessionContext?.skillToolAvailable ? 'Skill' : undefined,
      discovery_tool: sessionContext?.discoverSkillsAvailable ? 'DiscoverSkills' : undefined,
      hello2cc_role: [
        'output_style_shell',
        'tool_semantics',
        'protocol_adapter',
        'failure_debounce',
      ],
      defer: [
        'workflow_specialization',
        'execution_playbook',
        'parallel_private_workflow',
      ],
    };
  }

  if (!hasActiveNativeContinuity(sessionContext)) {
    return {
      owner: 'host_skill_workflow',
      mode: 'host_skill_workflow',
      reason: 'visible_host_skill_surface_without_native_continuity',
      host_skill_workflows: hostSkillWorkflows,
      invoke_tool: sessionContext?.skillToolAvailable ? 'Skill' : undefined,
      discovery_tool: sessionContext?.discoverSkillsAvailable ? 'DiscoverSkills' : undefined,
      hello2cc_role: [
        'output_style_shell',
        'tool_semantics',
        'protocol_adapter',
        'failure_debounce',
      ],
      defer: [
        'workflow_specialization',
        'execution_playbook',
        'parallel_private_workflow',
      ],
    };
  }

  return {
    owner: 'hello2cc',
    mode: 'native_routing',
    reason: 'visible_host_skill_surface_but_no_open_workflow_request',
    host_skill_workflows: hostSkillWorkflows,
  };
}

export function shouldDeferWorkflowRouting(requestProfile = {}, sessionContext = {}) {
  return selectWorkflowOwner(requestProfile, sessionContext).owner === 'host_skill_workflow';
}
