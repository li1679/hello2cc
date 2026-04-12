import {
  normalizeSessionId,
  readSessionEntry,
} from './session-state-store.mjs';
import { mutateTeamEntry } from './team-state-store.mjs';
import { normalizeWorkflowState } from './tool-policy-state.mjs';
import {
  normalizeNames,
  normalizeTaskIds,
  shouldTrackSharedTeam,
} from './session-state-task-readers.mjs';
import {
  assignedTaskRecordsForTeammate,
  idleNotificationSummary,
} from './session-state-team-helpers.mjs';
import { participantNameOrEmpty } from './participant-name.mjs';
import { trimmed } from './session-state-basic-helpers.mjs';

/**
 * Records teammate idle notifications inside the shared team state store.
 */
export function rememberTeammateIdle(payload = {}) {
  const sessionId = normalizeSessionId(payload?.session_id);
  const teamName = trimmed(payload?.team_name);
  const teammateName = participantNameOrEmpty(payload?.teammate_name || payload?.agent_name);
  if (!shouldTrackSharedTeam(teamName) || !teammateName) {
    return {};
  }

  const sessionEntry = sessionId ? readSessionEntry(sessionId) : {};
  const workflow = normalizeWorkflowState(sessionEntry.workflowState);

  return mutateTeamEntry(teamName, (currentTeam = {}) => {
    const taskAssignments = currentTeam.taskAssignments && typeof currentTeam.taskAssignments === 'object'
      ? { ...currentTeam.taskAssignments }
      : {};
    const pendingIdleNotifications = currentTeam.pendingIdleNotifications && typeof currentTeam.pendingIdleNotifications === 'object'
      ? { ...currentTeam.pendingIdleNotifications }
      : {};
    const assignedTasks = assignedTaskRecordsForTeammate(taskAssignments, teammateName);
    const fallbackTask = assignedTasks[0] || {};
    const lastTaskUpdatedId = trimmed(workflow.lastTaskUpdatedId) || trimmed(fallbackTask.taskId);
    const lastTaskUpdatedStatus = trimmed(workflow.lastTaskUpdatedStatus) || trimmed(fallbackTask.status);
    const lastTaskSubject = trimmed(workflow.taskSummaries?.[lastTaskUpdatedId]?.subject) || trimmed(fallbackTask.subject);

    pendingIdleNotifications[teammateName] = {
      teammateName,
      idleReason: trimmed(payload?.idle_reason || payload?.idleReason) || 'available',
      summary: idleNotificationSummary(workflow, teammateName),
      lastMessageTarget: participantNameOrEmpty(workflow.lastMessageTarget),
      lastMessageKind: trimmed(workflow.lastMessageKind),
      lastMessageSummary: trimmed(workflow.lastMessageSummary),
      lastTaskUpdatedId,
      lastTaskUpdatedStatus,
      lastTaskSubject,
      assignedTaskIds: normalizeTaskIds(assignedTasks.map((task) => task.taskId)),
      blockedTaskIds: normalizeTaskIds(
        assignedTasks
          .filter((task) => task.blockedBy.length > 0)
          .map((task) => task.taskId),
      ),
      recordedAt: new Date().toISOString(),
    };

    return {
      ...currentTeam,
      teamName,
      knownTeammates: normalizeNames([teammateName, ...(currentTeam.knownTeammates || [])]),
      pendingIdleNotifications,
    };
  });
}
