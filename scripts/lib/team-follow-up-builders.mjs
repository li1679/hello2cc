const MAX_TASK_IDS = 12;
const MAX_TEAMMATES = 16;

function trimmed(value) {
  return String(value || '').trim();
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

export function uniqueStrings(values, maxItems = values?.length || 0) {
  return [...new Set(
    arrayValue(values)
      .map((value) => trimmed(value))
      .filter(Boolean),
  )].slice(0, maxItems || undefined);
}

export function byRecordedAtDescending(left = {}, right = {}) {
  return String(right?.recorded_at || '').localeCompare(String(left?.recorded_at || ''));
}

export function buildTaskMap(taskSummaries = []) {
  const entries = arrayValue(taskSummaries)
    .map((record) => {
      const taskId = trimmed(record?.task_id);
      if (!taskId) return null;

      return [taskId, {
        task_id: taskId,
        subject: trimmed(record?.subject),
        owner: trimmed(record?.owner),
        status: trimmed(record?.status),
        blocks: uniqueStrings(record?.blocks, MAX_TASK_IDS),
        blocked_by: uniqueStrings(record?.blocked_by, MAX_TASK_IDS),
        recorded_at: trimmed(record?.recorded_at),
      }];
    })
    .filter(Boolean);

  return Object.fromEntries(entries);
}

export function buildCandidateMap(mailboxEvents = [], blockedTasks = [], taskMap = {}, idleTeammates = []) {
  const candidates = new Map();
  const idleSet = new Set(uniqueStrings(idleTeammates, MAX_TEAMMATES));

  function ensureCandidate(taskId, seed = {}) {
    if (!taskId) return null;

    if (!candidates.has(taskId)) {
      const task = taskMap[taskId] || {};
      candidates.set(taskId, {
        task_id: taskId,
        subject: trimmed(seed?.subject) || trimmed(task?.subject),
        current_owner: trimmed(seed?.current_owner) || trimmed(task?.owner),
        previous_owner: trimmed(seed?.previous_owner),
        blocker_task_ids: uniqueStrings(seed?.blocker_task_ids, MAX_TASK_IDS),
        follow_up_targets: uniqueStrings(seed?.follow_up_targets, MAX_TEAMMATES),
        reasons: uniqueStrings(seed?.reasons, 6),
        recorded_at: trimmed(seed?.recorded_at) || trimmed(task?.recorded_at),
      });
    }

    return candidates.get(taskId);
  }

  function mergeCandidate(taskId, patch = {}) {
    const candidate = ensureCandidate(taskId, patch);
    if (!candidate) return;

    candidate.subject = trimmed(patch?.subject) || candidate.subject;
    candidate.current_owner = trimmed(patch?.current_owner) || candidate.current_owner;
    candidate.previous_owner = trimmed(patch?.previous_owner) || candidate.previous_owner;
    candidate.blocker_task_ids = uniqueStrings([
      ...candidate.blocker_task_ids,
      ...arrayValue(patch?.blocker_task_ids),
    ], MAX_TASK_IDS);
    candidate.follow_up_targets = uniqueStrings([
      ...candidate.follow_up_targets,
      ...arrayValue(patch?.follow_up_targets),
    ], MAX_TEAMMATES);
    candidate.reasons = uniqueStrings([
      ...candidate.reasons,
      ...arrayValue(patch?.reasons),
    ], 6);

    const nextRecordedAt = trimmed(patch?.recorded_at);
    if (nextRecordedAt && String(nextRecordedAt).localeCompare(String(candidate.recorded_at || '')) > 0) {
      candidate.recorded_at = nextRecordedAt;
    }
  }

  for (const record of arrayValue(blockedTasks)) {
    const taskId = trimmed(record?.task_id);
    if (!taskId) continue;

    const blockerTaskIds = uniqueStrings(record?.blocked_by, MAX_TASK_IDS);
    const blockerOwners = uniqueStrings(
      blockerTaskIds.map((blockerId) => taskMap[blockerId]?.owner).filter(Boolean),
      MAX_TEAMMATES,
    ).filter((owner) => owner !== trimmed(record?.owner));

    if (!blockerTaskIds.length) continue;

    mergeCandidate(taskId, {
      subject: trimmed(record?.subject),
      current_owner: trimmed(record?.owner),
      blocker_task_ids: blockerTaskIds,
      follow_up_targets: blockerOwners,
      reasons: ['blocked_by_teammate'],
      recorded_at: trimmed(taskMap[taskId]?.recorded_at),
    });
  }

  for (const event of arrayValue(mailboxEvents)) {
    if (trimmed(event?.type) === 'teammate_terminated') {
      const previousOwner = trimmed(event?.teammate_name);
      for (const task of arrayValue(event?.affected_tasks)) {
        const taskId = trimmed(task?.task_id);
        if (!taskId) continue;

        const taskRecord = taskMap[taskId] || {};
        const blockerOwners = uniqueStrings(
          uniqueStrings(taskRecord?.blocked_by, MAX_TASK_IDS)
            .map((blockerId) => taskMap[blockerId]?.owner)
            .filter(Boolean),
          MAX_TEAMMATES,
        ).filter((owner) => owner !== previousOwner);
        const suggestedTargets = blockerOwners.length > 0
          ? blockerOwners
          : [...idleSet].filter((name) => name !== previousOwner).slice(0, MAX_TEAMMATES);

        mergeCandidate(taskId, {
          subject: trimmed(task?.subject) || trimmed(taskRecord?.subject),
          previous_owner: previousOwner,
          blocker_task_ids: uniqueStrings(taskRecord?.blocked_by, MAX_TASK_IDS),
          follow_up_targets: suggestedTargets,
          reasons: ['terminated_teammate'],
          recorded_at: trimmed(event?.recorded_at),
        });
      }
    }

    if (
      trimmed(event?.type) === 'idle_notification' &&
      trimmed(event?.last_message_kind) === 'peer' &&
      trimmed(event?.last_message_target)
    ) {
      const sourceOwner = trimmed(event?.teammate_name);
      const target = trimmed(event?.last_message_target);
      const taskIds = uniqueStrings(
        [
          ...arrayValue(event?.assigned_task_ids),
          ...arrayValue(event?.task_ids),
          trimmed(event?.last_task_updated_id),
        ],
        MAX_TASK_IDS,
      );

      for (const taskId of taskIds) {
        const taskRecord = taskMap[taskId] || {};
        mergeCandidate(taskId, {
          subject: trimmed(taskRecord?.subject) || trimmed(event?.last_task_subject),
          current_owner: sourceOwner || trimmed(taskRecord?.owner),
          follow_up_targets: [target],
          reasons: ['idle_peer_signal'],
          recorded_at: trimmed(event?.recorded_at),
        });
      }
    }
  }

  return candidates;
}

export function recommendedAction(reasons = [], candidate = {}) {
  const reasonSet = new Set(arrayValue(reasons).map((reason) => trimmed(reason)).filter(Boolean));
  if (reasonSet.has('terminated_teammate')) {
    return arrayValue(candidate?.follow_up_targets).length > 0
      ? 'reassign_or_follow_up'
      : 'inspect_then_reassign';
  }

  if (reasonSet.has('blocked_by_teammate') && reasonSet.has('idle_peer_signal')) {
    return 'follow_up_or_handoff';
  }

  if (reasonSet.has('blocked_by_teammate')) {
    return 'follow_up_blocker_owner';
  }

  if (reasonSet.has('idle_peer_signal')) {
    return 'follow_up_or_handoff';
  }

  return 'inspect_task_state';
}

export function candidateSummary(candidate = {}) {
  const taskLabel = `#${trimmed(candidate?.task_id)}${trimmed(candidate?.subject) ? ` ${trimmed(candidate.subject)}` : ''}`;
  const reasons = new Set(arrayValue(candidate?.reasons).map((reason) => trimmed(reason)).filter(Boolean));
  const targets = uniqueStrings(candidate?.follow_up_targets, MAX_TEAMMATES);
  const targetLabel = targets.length > 0 ? targets.join(', ') : '';

  if (reasons.has('terminated_teammate')) {
    return targetLabel
      ? `${taskLabel} lost owner ${trimmed(candidate?.previous_owner) || 'unknown'}; follow up with ${targetLabel}`
      : `${taskLabel} lost owner ${trimmed(candidate?.previous_owner) || 'unknown'} and needs reassignment`;
  }

  if (reasons.has('blocked_by_teammate') && reasons.has('idle_peer_signal')) {
    return targetLabel
      ? `${taskLabel} is blocked and already signaling ${targetLabel} for handoff`
      : `${taskLabel} is blocked and already signaling a peer handoff`;
  }

  if (reasons.has('blocked_by_teammate')) {
    return targetLabel
      ? `${taskLabel} is blocked by ${targetLabel}`
      : `${taskLabel} is blocked and needs blocker follow-up`;
  }

  if (reasons.has('idle_peer_signal')) {
    return targetLabel
      ? `${trimmed(candidate?.current_owner) || 'Teammate'} last pinged ${targetLabel} before idling on ${taskLabel}`
      : `${taskLabel} has a peer handoff signal`;
  }

  return `${taskLabel} needs follow-up`;
}
