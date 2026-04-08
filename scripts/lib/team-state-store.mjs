import { readPluginDataJson, writePluginDataJson } from './plugin-data.mjs';

const TEAM_STATE_PATH = 'runtime/team-context.json';
const MAX_TEAM_ENTRIES = 20;
const MAX_TEAMMATES = 24;
const MAX_TASK_ASSIGNMENTS = 40;
const MAX_IDLE_NOTIFICATIONS = 24;
const MAX_TERMINATION_NOTIFICATIONS = 24;

function trimmed(value) {
  return String(value || '').trim();
}

function uniqueStrings(values, maxItems = MAX_TEAMMATES) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => trimmed(value))
      .filter(Boolean),
  )].slice(0, maxItems);
}

function normalizeRejectedTargets(entries = {}) {
  return Object.fromEntries(
    Object.entries(entries)
      .map(([name, record]) => {
        const normalizedName = trimmed(record?.name || name);
        const recordedAt = trimmed(record?.recordedAt);
        if (!normalizedName || !recordedAt) {
          return null;
        }

        return [normalizedName, {
          name: normalizedName,
          reason: trimmed(record?.reason),
          recordedAt,
        }];
      })
      .filter(Boolean)
      .sort(([, left], [, right]) => String(right.recordedAt).localeCompare(String(left.recordedAt)))
      .slice(0, MAX_TEAMMATES),
  );
}

function normalizePendingPlanApprovals(entries = {}) {
  return Object.fromEntries(
    Object.entries(entries)
      .map(([name, record]) => {
        const normalizedName = trimmed(record?.name || name);
        const requestId = trimmed(record?.requestId || record?.request_id);
        const recordedAt = trimmed(record?.recordedAt);
        if (!normalizedName || !requestId || !recordedAt) {
          return null;
        }

        return [normalizedName, {
          name: normalizedName,
          requestId,
          planFilePath: trimmed(record?.planFilePath || record?.plan_file_path),
          recordedAt,
        }];
      })
      .filter(Boolean)
      .sort(([, left], [, right]) => String(right.recordedAt).localeCompare(String(left.recordedAt)))
      .slice(0, MAX_TEAMMATES),
  );
}

function normalizeTaskAssignments(entries = {}) {
  return Object.fromEntries(
    Object.entries(entries)
      .map(([taskId, record]) => {
        const normalizedTaskId = trimmed(record?.taskId || taskId);
        const owner = trimmed(record?.owner);
        const recordedAt = trimmed(record?.recordedAt);
        if (!normalizedTaskId || !owner || !recordedAt) {
          return null;
        }

        return [normalizedTaskId, {
          taskId: normalizedTaskId,
          owner,
          subject: trimmed(record?.subject),
          status: trimmed(record?.status),
          blocks: uniqueStrings(record?.blocks, MAX_TASK_ASSIGNMENTS),
          blockedBy: uniqueStrings(record?.blockedBy || record?.blocked_by, MAX_TASK_ASSIGNMENTS),
          assignedBy: trimmed(record?.assignedBy || record?.assigned_by),
          recordedAt,
        }];
      })
      .filter(Boolean)
      .sort(([, left], [, right]) => String(right.recordedAt).localeCompare(String(left.recordedAt)))
      .slice(0, MAX_TASK_ASSIGNMENTS),
  );
}

function normalizePendingIdleNotifications(entries = {}) {
  return Object.fromEntries(
    Object.entries(entries)
      .map(([name, record]) => {
        const teammateName = trimmed(record?.teammateName || record?.teammate_name || record?.name || name);
        const recordedAt = trimmed(record?.recordedAt);
        if (!teammateName || !recordedAt) {
          return null;
        }

        return [teammateName, {
          teammateName,
          idleReason: trimmed(record?.idleReason || record?.idle_reason),
          summary: trimmed(record?.summary),
          lastMessageTarget: trimmed(record?.lastMessageTarget || record?.last_message_target),
          lastMessageKind: trimmed(record?.lastMessageKind || record?.last_message_kind),
          lastMessageSummary: trimmed(record?.lastMessageSummary || record?.last_message_summary),
          lastTaskUpdatedId: trimmed(record?.lastTaskUpdatedId || record?.last_task_updated_id),
          lastTaskUpdatedStatus: trimmed(record?.lastTaskUpdatedStatus || record?.last_task_updated_status),
          lastTaskSubject: trimmed(record?.lastTaskSubject || record?.last_task_subject),
          assignedTaskIds: uniqueStrings(record?.assignedTaskIds || record?.assigned_task_ids, MAX_TASK_ASSIGNMENTS),
          blockedTaskIds: uniqueStrings(record?.blockedTaskIds || record?.blocked_task_ids, MAX_TASK_ASSIGNMENTS),
          recordedAt,
        }];
      })
      .filter(Boolean)
      .sort(([, left], [, right]) => String(right.recordedAt).localeCompare(String(left.recordedAt)))
      .slice(0, MAX_IDLE_NOTIFICATIONS),
  );
}

function normalizePendingTaskAssignments(entries = {}) {
  return Object.fromEntries(
    Object.entries(entries)
      .map(([taskId, record]) => {
        const normalizedTaskId = trimmed(record?.taskId || taskId);
        const owner = trimmed(record?.owner);
        const recordedAt = trimmed(record?.recordedAt);
        if (!normalizedTaskId || !owner || !recordedAt) {
          return null;
        }

        return [normalizedTaskId, {
          taskId: normalizedTaskId,
          owner,
          subject: trimmed(record?.subject),
          description: trimmed(record?.description),
          assignedBy: trimmed(record?.assignedBy || record?.assigned_by),
          recordedAt,
        }];
      })
      .filter(Boolean)
      .sort(([, left], [, right]) => String(right.recordedAt).localeCompare(String(left.recordedAt)))
      .slice(0, MAX_TASK_ASSIGNMENTS),
  );
}

function normalizeAffectedTasks(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .map((record) => ({
      taskId: trimmed(record?.taskId || record?.task_id),
      subject: trimmed(record?.subject),
    }))
    .filter((record) => record.taskId)
    .slice(0, MAX_TASK_ASSIGNMENTS);
}

function normalizePendingTerminationNotifications(entries = {}) {
  return Object.fromEntries(
    Object.entries(entries)
      .map(([name, record]) => {
        const teammateName = trimmed(record?.teammateName || record?.teammate_name || record?.name || name);
        const recordedAt = trimmed(record?.recordedAt);
        if (!teammateName || !recordedAt) {
          return null;
        }

        return [teammateName, {
          teammateName,
          message: trimmed(record?.message),
          affectedTasks: normalizeAffectedTasks(record?.affectedTasks || record?.affected_tasks),
          recordedAt,
        }];
      })
      .filter(Boolean)
      .sort(([, left], [, right]) => String(right.recordedAt).localeCompare(String(left.recordedAt)))
      .slice(0, MAX_TERMINATION_NOTIFICATIONS),
  );
}

function normalizeTeamEntry(value = {}) {
  return {
    teamName: trimmed(value?.teamName),
    knownTeammates: uniqueStrings(value?.knownTeammates),
    shutdownRequestedTargets: uniqueStrings(value?.shutdownRequestedTargets),
    shutdownApprovedTargets: uniqueStrings(value?.shutdownApprovedTargets),
    shutdownRejectedTargets: normalizeRejectedTargets(value?.shutdownRejectedTargets),
    pendingPlanApprovals: normalizePendingPlanApprovals(value?.pendingPlanApprovals),
    taskAssignments: normalizeTaskAssignments(value?.taskAssignments),
    pendingIdleNotifications: normalizePendingIdleNotifications(value?.pendingIdleNotifications),
    pendingTaskAssignments: normalizePendingTaskAssignments(value?.pendingTaskAssignments),
    pendingTerminationNotifications: normalizePendingTerminationNotifications(value?.pendingTerminationNotifications),
  };
}

function normalizeTeamKey(teamName) {
  return trimmed(teamName).toLowerCase();
}

function compactEntries(entries = {}) {
  return Object.fromEntries(
    Object.entries(entries)
      .sort(([, left], [, right]) => String(right?.updatedAt || '').localeCompare(String(left?.updatedAt || '')))
      .slice(0, MAX_TEAM_ENTRIES),
  );
}

function readTeams() {
  return readPluginDataJson(TEAM_STATE_PATH, {});
}

function writeTeams(entries = {}) {
  writePluginDataJson(TEAM_STATE_PATH, compactEntries(entries));
}

export function readTeamEntry(teamName) {
  const key = normalizeTeamKey(teamName);
  if (!key) return {};

  const teams = readTeams();
  return normalizeTeamEntry(teams[key] || {});
}

export function mutateTeamEntry(teamName, updater) {
  const normalizedTeamName = trimmed(teamName);
  const key = normalizeTeamKey(normalizedTeamName);
  if (!key) return {};

  const teams = readTeams();
  const current = normalizeTeamEntry(teams[key] || {});
  const updated = normalizeTeamEntry(updater({ ...current }) || {});

  const next = { ...teams };
  if (
    !updated.teamName &&
    updated.knownTeammates.length === 0 &&
    updated.shutdownRequestedTargets.length === 0 &&
    updated.shutdownApprovedTargets.length === 0 &&
    Object.keys(updated.shutdownRejectedTargets).length === 0 &&
    Object.keys(updated.pendingPlanApprovals).length === 0 &&
    Object.keys(updated.taskAssignments).length === 0 &&
    Object.keys(updated.pendingIdleNotifications).length === 0 &&
    Object.keys(updated.pendingTaskAssignments).length === 0 &&
    Object.keys(updated.pendingTerminationNotifications).length === 0
  ) {
    delete next[key];
    writeTeams(next);
    return {};
  }

  next[key] = {
    ...updated,
    teamName: updated.teamName || normalizedTeamName,
    updatedAt: new Date().toISOString(),
  };
  writeTeams(next);
  return normalizeTeamEntry(next[key]);
}

export function clearTeamEntry(teamName) {
  const key = normalizeTeamKey(teamName);
  if (!key) return false;

  const teams = readTeams();
  if (!(key in teams)) return false;

  const next = { ...teams };
  delete next[key];
  writeTeams(next);
  return true;
}
