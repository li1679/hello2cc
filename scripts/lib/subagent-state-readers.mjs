import { analyzeIntentProfile, summarizeIntentForState } from './intent-profile.mjs';
import { buildTeamActionState } from './team-action-state.mjs';
import { buildVisibleMailboxState } from './team-mailbox-state.mjs';

function trimmed(value) {
  return String(value || '').trim();
}

function flattenValue(value, seen = new WeakSet()) {
  if (typeof value === 'string') return value;
  if (!value) return '';
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '';

  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => flattenValue(item, seen)).filter(Boolean).join(' ');
  }

  const preferredKeys = ['text', 'prompt', 'message', 'content', 'input', 'description', 'task_description', 'task_subject'];
  const parts = [];
  for (const key of preferredKeys) {
    if (key in value) {
      parts.push(flattenValue(value[key], seen));
    }
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (preferredKeys.includes(key)) continue;
    parts.push(flattenValue(nestedValue, seen));
  }

  return parts.filter(Boolean).join(' ');
}

export function subagentTaskPrompt(payload = {}) {
  return [
    payload?.task_description,
    payload?.description,
    payload?.task_subject,
    payload?.parent_task,
    payload?.prompt,
    payload?.message,
    payload?.input,
  ]
    .map((value) => flattenValue(value))
    .find((value) => trimmed(value)) || '';
}

export function subagentTaskIntentProfile(payload = {}) {
  const prompt = subagentTaskPrompt(payload);
  return prompt ? analyzeIntentProfile(prompt, {}) : {};
}

export function subagentTaskIntentState(payload = {}) {
  const profile = subagentTaskIntentProfile(payload);
  return Object.keys(profile).length > 0 ? summarizeIntentForState(profile) : undefined;
}

export function parseTeammateIdentity(payload = {}) {
  const candidates = [
    trimmed(payload?.agent_id),
    trimmed(process.env.CLAUDE_CODE_AGENT_ID),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const separator = candidate.indexOf('@');
    if (separator <= 0 || separator >= candidate.length - 1) continue;
    return {
      agentId: candidate,
      agentName: candidate.slice(0, separator),
      teamName: candidate.slice(separator + 1),
    };
  }

  return null;
}

export function currentAssignedTasks(identity, teamState = {}) {
  if (!identity || !teamState || typeof teamState !== 'object') {
    return [];
  }

  const assignments = teamState.taskAssignments && typeof teamState.taskAssignments === 'object'
    ? Object.values(teamState.taskAssignments)
    : [];

  return assignments
    .filter((record) => trimmed(record?.owner) === identity.agentName)
    .map((record) => ({
      task_id: trimmed(record?.taskId),
      subject: trimmed(record?.subject),
      status: trimmed(record?.status),
      blocks: Array.isArray(record?.blocks) ? record.blocks.map((entry) => trimmed(entry)).filter(Boolean) : [],
      blocked_by: Array.isArray(record?.blockedBy || record?.blocked_by) ? (record?.blockedBy || record?.blocked_by).map((entry) => trimmed(entry)).filter(Boolean) : [],
      assigned_by: trimmed(record?.assignedBy || record?.assigned_by),
    }))
    .filter((record) => record.task_id);
}

export function currentPendingAssignmentRecords(identity, teamState = {}) {
  if (!identity || !teamState || typeof teamState !== 'object') {
    return [];
  }

  const pendingAssignments = teamState.pendingTaskAssignments && typeof teamState.pendingTaskAssignments === 'object'
    ? Object.values(teamState.pendingTaskAssignments)
    : [];

  return pendingAssignments
    .filter((record) => trimmed(record?.owner) === identity.agentName)
    .map((record) => ({
      task_id: trimmed(record?.taskId),
      owner: trimmed(record?.owner),
      subject: trimmed(record?.subject),
      description: trimmed(record?.description),
      assigned_by: trimmed(record?.assignedBy || record?.assigned_by),
      recorded_at: trimmed(record?.recordedAt || record?.recorded_at),
    }))
    .filter((record) => record.task_id);
}

export function currentPendingAssignments(identity, teamState = {}) {
  return currentPendingAssignmentRecords(identity, teamState)
    .map((record) => ({
      task_id: record.task_id,
      subject: record.subject,
      description: record.description,
      assigned_by: record.assigned_by,
    }))
    .filter((record) => record.task_id);
}

export function currentBlockedTaskRecords(identity, teamState = {}) {
  if (!identity || !teamState || typeof teamState !== 'object') {
    return [];
  }

  return currentAssignedTasks(identity, teamState)
    .filter((record) => Array.isArray(record?.blocked_by) && record.blocked_by.length > 0)
    .map((record) => ({
      task_id: trimmed(record?.task_id),
      subject: trimmed(record?.subject),
      owner: identity.agentName,
      blocked_by: Array.isArray(record?.blocked_by) ? record.blocked_by.map((entry) => trimmed(entry)).filter(Boolean) : [],
      recorded_at: '',
    }))
    .filter((record) => record.task_id);
}

export function currentMailboxState(identity, teamState = {}) {
  if (!identity || !teamState || typeof teamState !== 'object') {
    return {
      mailboxEvents: [],
      mailboxSummary: undefined,
    };
  }

  const pendingAssignments = teamState.pendingTaskAssignments && typeof teamState.pendingTaskAssignments === 'object'
    ? Object.values(teamState.pendingTaskAssignments)
    : [];
  const pendingIdleNotifications = teamState.pendingIdleNotifications && typeof teamState.pendingIdleNotifications === 'object'
    ? Object.values(teamState.pendingIdleNotifications)
    : [];
  const pendingTerminationNotifications = teamState.pendingTerminationNotifications && typeof teamState.pendingTerminationNotifications === 'object'
    ? Object.values(teamState.pendingTerminationNotifications)
    : [];

  return buildVisibleMailboxState({
    agentName: identity.agentName,
    pendingTaskAssignments: pendingAssignments,
    pendingIdleNotifications,
    pendingTerminationNotifications,
  });
}

export function currentTeamActionState(identity, details = {}) {
  return buildTeamActionState({
    agentName: identity?.agentName,
    pendingAssignments: details.pendingAssignmentRecords,
    blockedTasks: details.blockedTaskRecords,
  });
}

export function readTrimmed(value) {
  return trimmed(value);
}
