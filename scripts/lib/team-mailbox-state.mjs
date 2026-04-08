const MAX_MAILBOX_EVENTS = 12;
const MAX_MAILBOX_SUMMARY_LINES = 6;
const MAX_TASK_IDS = 12;
const MAX_TEAMMATES = 16;

function trimmed(value) {
  return String(value || '').trim();
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values, maxItems = values?.length || 0) {
  return [...new Set(
    arrayValue(values)
      .map((value) => trimmed(value))
      .filter(Boolean),
  )].slice(0, maxItems || undefined);
}

function stringField(record = {}, ...keys) {
  for (const key of keys) {
    const value = trimmed(record?.[key]);
    if (value) {
      return value;
    }
  }

  return '';
}

function stringArrayField(record = {}, keys = [], maxItems = MAX_TASK_IDS) {
  for (const key of keys) {
    if (Array.isArray(record?.[key])) {
      return uniqueStrings(record[key], maxItems);
    }
  }

  return [];
}

function namedTeammate(value) {
  const normalized = trimmed(value);
  if (!normalized) return '';

  return ['team-lead', 'main', 'default'].includes(normalized.toLowerCase())
    ? ''
    : normalized;
}

function byRecordedAtDescending(left = {}, right = {}) {
  return String(right?.recorded_at || '').localeCompare(String(left?.recorded_at || ''));
}

function idleEventSummary(record = {}) {
  const parts = ['Agent idle'];
  const taskId = stringField(record, 'last_task_updated_id', 'lastTaskUpdatedId');
  if (taskId) {
    const status = stringField(record, 'last_task_updated_status', 'lastTaskUpdatedStatus') || 'available';
    parts.push(`Task ${taskId} ${status}`);
  }

  const lastDm = stringField(record, 'last_message_summary', 'lastMessageSummary', 'summary');
  if (lastDm) {
    parts.push(`Last DM: ${lastDm}`);
  }

  return parts.join(' · ');
}

function taskAssignmentSummary(record = {}) {
  const taskId = stringField(record, 'task_id', 'taskId');
  const subject = stringField(record, 'subject') || 'Task assigned';
  return taskId
    ? `[Task Assigned] #${taskId} - ${subject}`
    : `[Task Assigned] ${subject}`;
}

function terminationSummary(record = {}) {
  const message = stringField(record, 'message');
  if (message) {
    return message;
  }

  const teammateName = stringField(record, 'teammate_name', 'teammateName') || 'Teammate';
  const taskIds = uniqueStrings(
    arrayValue(record?.affected_tasks || record?.affectedTasks).map((task) => stringField(task, 'task_id', 'taskId')),
    MAX_TASK_IDS,
  );

  return taskIds.length > 0
    ? `${teammateName} has shut down; tasks ${taskIds.map((taskId) => `#${taskId}`).join(', ')} need reassignment.`
    : `${teammateName} has shut down.`;
}

function idleEvent(record = {}) {
  const teammateName = stringField(record, 'teammate_name', 'teammateName');
  const taskIds = uniqueStrings([
    stringField(record, 'last_task_updated_id', 'lastTaskUpdatedId'),
    ...stringArrayField(record, ['assigned_task_ids', 'assignedTaskIds'], MAX_TASK_IDS),
    ...stringArrayField(record, ['blocked_task_ids', 'blockedTaskIds'], MAX_TASK_IDS),
  ], MAX_TASK_IDS);

  return {
    type: 'idle_notification',
    teammate_name: teammateName,
    summary: idleEventSummary(record),
    idle_reason: stringField(record, 'idle_reason', 'idleReason'),
    task_ids: taskIds,
    assigned_task_ids: stringArrayField(record, ['assigned_task_ids', 'assignedTaskIds'], MAX_TASK_IDS),
    blocked_task_ids: stringArrayField(record, ['blocked_task_ids', 'blockedTaskIds'], MAX_TASK_IDS),
    last_message_target: stringField(record, 'last_message_target', 'lastMessageTarget'),
    last_message_kind: stringField(record, 'last_message_kind', 'lastMessageKind'),
    last_message_summary: stringField(record, 'last_message_summary', 'lastMessageSummary'),
    last_task_updated_id: stringField(record, 'last_task_updated_id', 'lastTaskUpdatedId'),
    last_task_updated_status: stringField(record, 'last_task_updated_status', 'lastTaskUpdatedStatus'),
    last_task_subject: stringField(record, 'last_task_subject', 'lastTaskSubject'),
    recorded_at: stringField(record, 'recorded_at', 'recordedAt'),
    follow_up: taskIds.length > 0 ? 'task_follow_up' : 'teammate_follow_up',
  };
}

function taskAssignmentEvent(record = {}) {
  const taskId = stringField(record, 'task_id', 'taskId');
  return {
    type: 'task_assignment',
    teammate_name: stringField(record, 'owner'),
    summary: taskAssignmentSummary(record),
    task_id: taskId,
    task_ids: taskId ? [taskId] : [],
    subject: stringField(record, 'subject'),
    description: stringField(record, 'description'),
    assigned_by: stringField(record, 'assigned_by', 'assignedBy'),
    recorded_at: stringField(record, 'recorded_at', 'recordedAt'),
    follow_up: 'task_pickup',
  };
}

function terminationEvent(record = {}) {
  const affectedTasks = arrayValue(record?.affected_tasks || record?.affectedTasks)
    .map((task) => ({
      task_id: stringField(task, 'task_id', 'taskId'),
      subject: stringField(task, 'subject'),
    }))
    .filter((task) => task.task_id)
    .slice(0, MAX_TASK_IDS);

  return {
    type: 'teammate_terminated',
    teammate_name: stringField(record, 'teammate_name', 'teammateName'),
    summary: terminationSummary(record),
    affected_tasks: affectedTasks,
    affected_task_ids: affectedTasks.map((task) => task.task_id),
    recorded_at: stringField(record, 'recorded_at', 'recordedAt'),
    follow_up: affectedTasks.length > 0 ? 'reassignment' : 'teammate_removed',
  };
}

function countByType(events = []) {
  const counts = {};
  for (const event of events) {
    const type = trimmed(event?.type);
    if (!type) continue;
    counts[type] = (counts[type] || 0) + 1;
  }

  return counts;
}

/**
 * Build the mailbox events visible to the current session.
 */
export function buildVisibleMailboxEvents({
  agentName = '',
  pendingIdleNotifications = [],
  pendingTaskAssignments = [],
  pendingTerminationNotifications = [],
} = {}) {
  const teammateName = namedTeammate(agentName);
  const events = [
    ...(teammateName
      ? arrayValue(pendingTaskAssignments)
          .filter((record) => trimmed(record?.owner) === teammateName)
          .map((record) => taskAssignmentEvent(record))
      : []),
    ...(!teammateName
      ? arrayValue(pendingIdleNotifications).map((record) => idleEvent(record))
      : []),
    ...(!teammateName
      ? arrayValue(pendingTerminationNotifications).map((record) => terminationEvent(record))
      : []),
  ]
    .filter((event) => trimmed(event?.summary) && trimmed(event?.recorded_at))
    .sort(byRecordedAtDescending)
    .slice(0, MAX_MAILBOX_EVENTS);

  return events;
}

/**
 * Build a compact mailbox summary from visible mailbox events.
 */
export function buildMailboxSummary(events = []) {
  if (!Array.isArray(events) || events.length === 0) {
    return undefined;
  }

  const counts = countByType(events);
  const taskIds = uniqueStrings(
    events.flatMap((event) => [
      trimmed(event?.task_id),
      ...arrayValue(event?.task_ids),
      ...arrayValue(event?.affected_task_ids),
    ]),
    MAX_TASK_IDS,
  );
  const reassignmentNeededTaskIds = uniqueStrings(
    events
      .filter((event) => event?.type === 'teammate_terminated')
      .flatMap((event) => arrayValue(event?.affected_task_ids)),
    MAX_TASK_IDS,
  );

  return {
    total_events: events.length,
    latest_event_type: trimmed(events[0]?.type),
    latest_summary: trimmed(events[0]?.summary),
    event_count_by_type: counts,
    event_types: uniqueStrings(events.map((event) => event?.type), 8),
    teammate_names: uniqueStrings(events.map((event) => event?.teammate_name), MAX_TEAMMATES),
    task_ids: taskIds,
    reassignment_needed_task_ids: reassignmentNeededTaskIds,
    requires_task_pickup: counts.task_assignment ? true : undefined,
    has_idle_notifications: counts.idle_notification ? true : undefined,
    requires_reassignment: reassignmentNeededTaskIds.length > 0 ? true : undefined,
    summary_lines: uniqueStrings(
      events.map((event) => event?.summary),
      MAX_MAILBOX_SUMMARY_LINES,
    ),
  };
}

/**
 * Build visible mailbox events plus a compact summary in one pass.
 */
export function buildVisibleMailboxState(payload = {}) {
  const mailboxEvents = buildVisibleMailboxEvents(payload);
  const mailboxSummary = buildMailboxSummary(mailboxEvents);

  return {
    mailboxEvents,
    mailboxSummary,
  };
}
