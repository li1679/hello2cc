function trimmed(value) {
  return String(value || '').trim();
}

function routeTeamContinuity(continuity = {}) {
  return continuity?.team && typeof continuity.team === 'object'
    ? continuity.team
    : {};
}

function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

function hasLoadedReleaseWorkflow(sessionContext = {}) {
  return [
    ...(Array.isArray(sessionContext?.workflowNames) ? sessionContext.workflowNames : []),
    ...(Array.isArray(sessionContext?.loadedCommandNames) ? sessionContext.loadedCommandNames : []),
  ].some((name) => trimmed(name).toLowerCase() === 'release');
}

function hasPendingPlanApproval(teamContinuity = {}) {
  return hasItems(teamContinuity?.pending_plan_approval_requests)
    || (Array.isArray(teamContinuity?.team_action_items) ? teamContinuity.team_action_items : [])
      .some((item) => item?.action_type === 'review_plan_approval');
}

function isThinNeutralPrompt(promptEnvelope = {}) {
  const charCount = Number(promptEnvelope?.charCount || 0);
  const lineCount = Number(promptEnvelope?.lineCount || 0);
  const clauseCount = Number(promptEnvelope?.clauseCount || 0);

  return Boolean(
    charCount > 0 &&
    charCount <= 24 &&
    lineCount <= 1 &&
    clauseCount <= 1 &&
    !promptEnvelope?.questionLike &&
    !promptEnvelope?.structuredArtifact &&
    !promptEnvelope?.listLike,
  );
}

export function intentSpecialization(intent = {}) {
  if (intent?.compare) return 'compare';
  if (intent?.release) return 'release';
  if (intent?.handoff) return 'handoff';
  if (intent?.teamStatus) return 'team_status';
  if (intent?.plan) return 'planning';
  if (intent?.capabilityQuery || intent?.capabilityProbeShape) return 'capability';
  if (intent?.review && intent?.verify) return 'review_verification';
  if (intent?.review) return 'review';
  if (intent?.verify) return 'verification';
  if (intent?.claudeGuide) return 'explanation';
  if (intent?.explain) return 'explanation';
  if (intent?.codeResearch || intent?.research) return 'research';
  return '';
}

export function routeSpecialization(signals = {}, continuity = {}, sessionContext = {}) {
  const teamContinuity = routeTeamContinuity(continuity);
  const loadedReleaseWorkflow = hasLoadedReleaseWorkflow(sessionContext);
  const pendingPlanApproval = hasPendingPlanApproval(teamContinuity);
  const thinNeutralPrompt = isThinNeutralPrompt(signals?.promptEnvelope);
  const approvedPlanFollowThrough = Boolean(
    continuity?.plan_mode_exited && (signals?.implement || signals?.boundedImplementation),
  );
  const continuityDrivenTeamStatus = Boolean(
    !signals?.compare
    && !signals?.currentInfo
    && !signals?.release
    && !signals?.plan
    && !signals?.review
    && !signals?.verify
    && !signals?.claudeGuide
    && !signals?.capabilityQuery
    && !signals?.capabilityProbeShape
    && (
      signals?.workflowContinuation ||
      signals?.teamSemantics ||
      signals?.handoff ||
      thinNeutralPrompt
    )
    && (
      trimmed(teamContinuity?.active_team)
      || hasItems(teamContinuity?.team_action_items)
      || hasItems(teamContinuity?.handoff_candidates)
    ),
  );

  if (signals?.compare) return 'compare';
  if (signals?.currentInfo) return 'current_info';
  if (
    pendingPlanApproval &&
    !signals?.currentInfo &&
    !signals?.release &&
    !signals?.plan &&
    !signals?.review &&
    !signals?.verify &&
    (
      signals?.workflowContinuation ||
      signals?.teamSemantics ||
      signals?.teamStatus ||
      signals?.explain ||
      signals?.questionIntent ||
      thinNeutralPrompt
    )
  ) {
    return 'team_approval';
  }
  if (
    loadedReleaseWorkflow &&
    !signals?.currentInfo &&
    !signals?.plan &&
    !signals?.review &&
    !signals?.verify &&
    !signals?.teamSemantics &&
    !signals?.teamStatus &&
    thinNeutralPrompt
  ) {
    return 'release_follow_up';
  }
  if (signals?.release && (signals?.workflowContinuation || loadedReleaseWorkflow)) return 'release_follow_up';
  if (signals?.release) return 'release';
  if ((signals?.plan || continuity?.plan_mode_entered) && !approvedPlanFollowThrough) return 'planning';
  if (
    signals?.verify
    && (hasItems(teamContinuity?.current_agent_blocked_tasks) || hasItems(teamContinuity?.handoff_candidates))
  ) {
    return 'blocked_verification';
  }
  if (
    hasItems(teamContinuity?.handoff_candidates)
    && (signals?.handoff || signals?.workflowContinuation || signals?.teamSemantics || signals?.teamStatus)
  ) {
    return 'handoff';
  }
  if (signals?.teamStatus || continuityDrivenTeamStatus) {
    return 'team_status';
  }

  if (approvedPlanFollowThrough) {
    return intentSpecialization({
      ...signals,
      plan: false,
    });
  }

  return intentSpecialization(signals);
}

export function subagentSpecialization(mode, taskProfile = {}, details = {}) {
  if (taskProfile?.compare) return 'compare';
  if (taskProfile?.release) return 'release';
  if (mode === 'plan' || taskProfile?.plan) return 'planning';
  if (
    (taskProfile?.handoff || (details?.hasTeamIdentity && hasItems(details?.blockedTaskRecords)))
  ) {
    return 'handoff';
  }
  if (
    taskProfile?.teamStatus
    && (
      details?.hasTeamIdentity
      || hasItems(details?.teamActionState?.teamActionItems)
    )
  ) {
    return 'team_status';
  }

  const specialization = intentSpecialization(taskProfile);
  if (specialization) return specialization;

  if (mode === 'explore') return 'research';
  return '';
}
