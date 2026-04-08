export function normalizeTaskIds(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )].slice(0, 12);
}

export function mergedTaskIds(existing = [], added = []) {
  return normalizeTaskIds([
    ...added,
    ...existing,
  ]);
}

export function normalizeNames(values, maxItems = 16) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )].slice(0, maxItems);
}

export function withTaskSummary(taskSummaries = {}, taskId, fields = {}) {
  const normalizedTaskId = String(taskId || '').trim();
  if (!normalizedTaskId) return taskSummaries;

  return {
    ...taskSummaries,
    [normalizedTaskId]: {
      ...(taskSummaries[normalizedTaskId] || {}),
      ...fields,
      recordedAt: new Date().toISOString(),
    },
  };
}

export function withoutTaskSummary(taskSummaries = {}, taskId) {
  const normalizedTaskId = String(taskId || '').trim();
  if (!normalizedTaskId) return taskSummaries;

  const next = { ...taskSummaries };
  delete next[normalizedTaskId];
  return next;
}

export function taskSummariesFromList(entries = []) {
  return Object.fromEntries(
    entries.map((task) => [task.id, {
      subject: task.subject,
      status: task.status,
      owner: task.owner,
      blocks: task.blocks,
      blockedBy: task.blockedBy,
      recordedAt: new Date().toISOString(),
    }]),
  );
}

export function withTaskReadGuard(readGuards = {}, taskId, source) {
  const normalizedTaskId = String(taskId || '').trim();
  if (!normalizedTaskId) return readGuards;

  return {
    ...readGuards,
    [normalizedTaskId]: {
      recordedAt: new Date().toISOString(),
      source: String(source || '').trim(),
    },
  };
}

export function withoutTaskReadGuard(readGuards = {}, taskId) {
  const normalizedTaskId = String(taskId || '').trim();
  if (!normalizedTaskId) return readGuards;

  const next = { ...readGuards };
  delete next[normalizedTaskId];
  return next;
}
