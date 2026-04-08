import { routeSpecialization, subagentSpecialization } from './decision-tie-breakers.mjs';

function trimmed(value) {
  return String(value || '').trim();
}

function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
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

function hasVisibleCapabilitySurface(sessionContext = {}) {
  return Boolean(
    sessionContext?.toolSearchAvailable ||
    sessionContext?.discoverSkillsAvailable ||
    sessionContext?.skillToolAvailable ||
    sessionContext?.listMcpResourcesAvailable ||
    sessionContext?.readMcpResourceAvailable ||
    sessionContext?.agentToolAvailable ||
    sessionContext?.claudeCodeGuideAvailable ||
    (Array.isArray(sessionContext?.workflowNames) && sessionContext.workflowNames.length > 0) ||
    (Array.isArray(sessionContext?.loadedCommandNames) && sessionContext.loadedCommandNames.length > 0) ||
    (Array.isArray(sessionContext?.surfacedSkillNames) && sessionContext.surfacedSkillNames.length > 0) ||
    (Array.isArray(sessionContext?.availableDeferredToolNames) && sessionContext.availableDeferredToolNames.length > 0) ||
    (Array.isArray(sessionContext?.loadedDeferredToolNames) && sessionContext.loadedDeferredToolNames.length > 0),
  );
}

function describeSelection(specialization, basis = '', strength = '') {
  return {
    specialization: specialization || undefined,
    selection_basis: basis || undefined,
    selection_strength: strength || undefined,
  };
}

export function describeRouteSpecialization(signals = {}, sessionContext = {}, continuity = {}) {
  const specialization = routeSpecialization(signals, continuity, sessionContext);
  const teamContinuity = routeTeamContinuity(continuity);

  if (!specialization) {
    return describeSelection('', '', '');
  }

  if (specialization === 'team_approval') {
    return describeSelection(specialization, 'team_protocol_continuity', 'strong');
  }

  if (specialization === 'release_follow_up') {
    return describeSelection(specialization, 'workflow_continuity', 'strong');
  }

  if (specialization === 'blocked_verification') {
    return describeSelection(specialization, 'blocker_continuity', 'strong');
  }

  if (specialization === 'handoff') {
    return describeSelection(specialization, 'task_board_handoff_continuity', 'strong');
  }

  if (specialization === 'team_status') {
    return describeSelection(specialization, 'team_continuity', 'strong');
  }

  if (specialization === 'planning' && (continuity?.plan_mode_entered || continuity?.plan_mode_exited)) {
    return describeSelection(specialization, 'plan_mode_continuity', 'strong');
  }

  if (specialization === 'current_info') {
    if (signals?.hostBoundaryGuided) {
      return describeSelection(
        specialization,
        hasItems(teamContinuity?.pending_plan_approval_requests) ? 'host_guarded_current_info_boundary' : 'current_info_boundary',
        'strong',
      );
    }

    if (sessionContext?.webSearchAvailable) {
      return describeSelection(specialization, 'visible_websearch_surface', 'medium');
    }

    return describeSelection(
      specialization,
      'current_info_request_shape',
      'weak',
    );
  }

  if (specialization === 'capability') {
    if (signals?.capabilityProbeShape) {
      return describeSelection(specialization, 'capability_probe_shape', 'medium');
    }

    if (hasVisibleCapabilitySurface(sessionContext)) {
      return describeSelection(specialization, 'visible_capability_surface', 'medium');
    }

    return describeSelection(specialization, 'capability_query_shape', 'weak');
  }

  if (specialization === 'planning' && signals?.planningProbeShape) {
    return describeSelection(specialization, 'planning_probe_shape', 'medium');
  }

  if (specialization === 'review' && signals?.promptEnvelope?.reviewArtifact) {
    return describeSelection(specialization, 'review_artifact_shape', 'medium');
  }

  if (specialization === 'explanation' && signals?.promptEnvelope?.targetedArtifactQuestion) {
    return describeSelection(specialization, 'artifact_question_shape', 'medium');
  }

  if (specialization === 'research' && signals?.promptEnvelope?.broadArtifactQuestion) {
    return describeSelection(specialization, 'artifact_probe_shape', 'medium');
  }

  if (specialization === 'release' && hasLoadedReleaseWorkflow(sessionContext)) {
    return describeSelection(specialization, 'visible_release_surface', 'medium');
  }

  return describeSelection(specialization, 'weak_request_shape', 'weak');
}

export function describeSubagentSpecialization(mode, taskProfile = {}, details = {}) {
  const specialization = subagentSpecialization(mode, taskProfile, details);

  if (!specialization) {
    return describeSelection('', '', '');
  }

  if (specialization === 'handoff' && hasItems(details?.blockedTaskRecords)) {
    return describeSelection(specialization, 'blocked_task_continuity', 'strong');
  }

  if (specialization === 'team_status' && (details?.hasTeamIdentity || hasItems(details?.teamActionState?.teamActionItems))) {
    return describeSelection(specialization, 'team_continuity', 'strong');
  }

  if (specialization === 'planning' && mode === 'plan') {
    return describeSelection(specialization, 'mode_boundary', 'strong');
  }

  if (specialization === 'planning' && taskProfile?.planningProbeShape) {
    return describeSelection(specialization, 'planning_probe_shape', 'medium');
  }

  if (specialization === 'capability') {
    if (taskProfile?.capabilityProbeShape) {
      return describeSelection(specialization, 'capability_probe_shape', 'medium');
    }

    if (taskProfile?.capabilityQuery) {
      return describeSelection(specialization, 'capability_query_shape', 'weak');
    }
  }

  if (specialization === 'review' && taskProfile?.promptEnvelope?.reviewArtifact) {
    return describeSelection(specialization, 'review_artifact_shape', 'medium');
  }

  if (specialization === 'explanation' && taskProfile?.promptEnvelope?.targetedArtifactQuestion) {
    return describeSelection(specialization, 'artifact_question_shape', 'medium');
  }

  if (specialization === 'research' && taskProfile?.promptEnvelope?.broadArtifactQuestion) {
    return describeSelection(specialization, 'artifact_probe_shape', 'medium');
  }

  if (specialization === 'release' && details?.hasTeamIdentity) {
    return describeSelection(specialization, 'assigned_release_slice', 'medium');
  }

  return describeSelection(specialization, 'weak_parent_task_shape', 'weak');
}
