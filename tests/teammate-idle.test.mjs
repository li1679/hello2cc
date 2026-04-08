import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  isolatedEnv,
  parseAdditionalContextJson,
  run,
  writeTranscript,
} from './helpers/orchestrator-test-helpers.mjs';

const scriptPath = resolve('scripts/teammate-idle.mjs');

function runTeammateIdle(payload, env = {}) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: resolve('.'),
    env: {
      ...process.env,
      ...env,
    },
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout) : {};
}

test('teammate-idle records shared idle notifications with task and message continuity', () => {
  const env = isolatedEnv();
  const leaderSessionId = 'teammate-idle-leader';
  const teammateSessionId = 'teammate-idle-worker';
  const teammateTranscriptPath = writeTranscript(env.HOME, teammateSessionId, {
    model: 'opus',
    tools: ['SendMessage', 'TaskUpdate'],
  }, [
    {
      type: 'assistant',
      session_id: teammateSessionId,
      team_name: 'delivery-squad',
      agent_name: 'frontend-owner',
    },
  ]);

  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'frontend-owner',
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TaskCreate',
    tool_response: {
      task: {
        id: '7',
        subject: 'Implement API',
      },
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: '7',
      owner: 'frontend-owner',
      status: 'in_progress',
      subject: 'Implement API',
    },
    tool_response: {
      success: true,
      taskId: '7',
      updatedFields: ['owner', 'status'],
      statusChange: {
        from: 'pending',
        to: 'in_progress',
      },
    },
  }, env);
  run('post-tool-use', {
    session_id: teammateSessionId,
    transcript_path: teammateTranscriptPath,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'team-lead',
      summary: 'Need backend contract before landing API',
      message: 'Need backend contract before landing API.',
    },
    tool_response: {
      success: true,
    },
  }, env);

  const hookOutput = runTeammateIdle({
    session_id: teammateSessionId,
    transcript_path: teammateTranscriptPath,
    hook_event_name: 'TeammateIdle',
    teammate_name: 'frontend-owner',
    team_name: 'delivery-squad',
  }, env);
  assert.deepEqual(hookOutput, { suppressOutput: true });

  const teamState = JSON.parse(readFileSync(join(env.CLAUDE_PLUGIN_DATA, 'runtime', 'team-context.json'), 'utf8'));
  const notification = teamState['delivery-squad'].pendingIdleNotifications['frontend-owner'];

  assert.equal(notification.teammateName, 'frontend-owner');
  assert.deepEqual(notification.assignedTaskIds, ['7']);
  assert.deepEqual(notification.blockedTaskIds, []);
  assert.equal(notification.lastMessageTarget, 'team-lead');
  assert.match(notification.lastMessageSummary, /Need backend contract/i);
});

test('leader route surfaces pending idle notifications and follow-up clears them', () => {
  const env = isolatedEnv();
  const leaderSessionId = 'teammate-idle-route-leader';
  const teammateSessionId = 'teammate-idle-route-worker';
  const teammateTranscriptPath = writeTranscript(env.HOME, teammateSessionId, {
    model: 'opus',
    tools: ['SendMessage', 'TaskUpdate'],
  }, [
    {
      type: 'assistant',
      session_id: teammateSessionId,
      team_name: 'delivery-squad',
      agent_name: 'frontend-owner',
    },
  ]);

  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'frontend-owner',
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TaskCreate',
    tool_response: {
      task: {
        id: '7',
        subject: 'Implement API',
      },
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: '7',
      owner: 'frontend-owner',
      status: 'in_progress',
      subject: 'Implement API',
    },
    tool_response: {
      success: true,
      taskId: '7',
      updatedFields: ['owner', 'status'],
      statusChange: {
        from: 'pending',
        to: 'in_progress',
      },
    },
  }, env);
  run('post-tool-use', {
    session_id: teammateSessionId,
    transcript_path: teammateTranscriptPath,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'backend-owner',
      summary: 'Need backend contract before landing API',
      message: 'Need backend contract before landing API.',
    },
    tool_response: {
      success: true,
    },
  }, env);
  runTeammateIdle({
    session_id: teammateSessionId,
    transcript_path: teammateTranscriptPath,
    hook_event_name: 'TeammateIdle',
    teammate_name: 'frontend-owner',
    team_name: 'delivery-squad',
  }, env);

  const initialOutput = run('route', {
    session_id: leaderSessionId,
    tools: ['TaskGet', 'TaskUpdate', 'SendMessage'],
    prompt: 'Continue coordinating the team inbox and task board.',
  }, env);
  const initialState = parseAdditionalContextJson(initialOutput.hookSpecificOutput.additionalContext);
  const [notification] = initialState.host.continuity.team.pending_idle_notifications;
  const [mailboxEvent] = initialState.host.continuity.team.mailbox_events;
  const [handoffCandidate] = initialState.host.continuity.team.handoff_candidates;

  assert.equal(notification.teammate_name, 'frontend-owner');
  assert.equal(notification.idle_reason, 'available');
  assert.equal(notification.last_message_target, 'backend-owner');
  assert.equal(notification.last_message_kind, 'peer');
  assert.match(notification.summary, /backend-owner/i);
  assert.match(notification.last_message_summary, /Need backend contract/i);
  assert.equal(notification.last_task_updated_id, '7');
  assert.equal(notification.last_task_updated_status, 'in_progress');
  assert.equal(notification.last_task_subject, 'Implement API');
  assert.deepEqual(notification.assigned_task_ids, ['7']);
  assert.equal(mailboxEvent.type, 'idle_notification');
  assert.equal(mailboxEvent.teammate_name, 'frontend-owner');
  assert.equal(mailboxEvent.last_message_target, 'backend-owner');
  assert.deepEqual(mailboxEvent.task_ids, ['7']);
  assert.match(mailboxEvent.summary, /Agent idle/);
  assert.match(mailboxEvent.summary, /Need backend contract/i);
  assert.deepEqual(initialState.host.continuity.team.handoff_candidate_task_ids, ['7']);
  assert.deepEqual(initialState.host.continuity.team.handoff_candidates, [
    {
      task_id: '7',
      subject: 'Implement API',
      current_owner: 'frontend-owner',
      follow_up_targets: ['backend-owner'],
      reasons: ['idle_peer_signal'],
      recorded_at: handoffCandidate.recorded_at,
      recommended_action: 'follow_up_or_handoff',
      summary: 'frontend-owner last pinged backend-owner before idling on #7 Implement API',
    },
  ]);
  assert.deepEqual(initialState.host.continuity.team.mailbox_summary, {
    total_events: 1,
    latest_event_type: 'idle_notification',
    latest_summary: mailboxEvent.summary,
    event_count_by_type: {
      idle_notification: 1,
    },
    event_types: ['idle_notification'],
    teammate_names: ['frontend-owner'],
    task_ids: ['7'],
    has_idle_notifications: true,
    summary_lines: [mailboxEvent.summary],
  });
  assert.deepEqual(initialState.host.continuity.team.handoff_summary, {
    total_candidates: 1,
    candidate_task_ids: ['7'],
    follow_up_teammates: ['backend-owner'],
    includes_peer_handoff_signals: true,
    summary_lines: ['frontend-owner last pinged backend-owner before idling on #7 Implement API'],
  });
  assert.match(initialOutput.hookSpecificOutput.additionalContext, /mailbox.*折叠|Agent idle/i);
  assert.match(initialOutput.hookSpecificOutput.additionalContext, /follow-up 折叠|handoff|backend-owner/i);
  assert.match(initialOutput.hookSpecificOutput.additionalContext, /idle_notification/i);
  assert.match(initialOutput.hookSpecificOutput.additionalContext, /而不是任务完成|assigned task/i);

  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'frontend-owner',
      summary: 'Take the backend contract handoff and keep going',
      message: 'Take the backend contract handoff and keep going.',
    },
    tool_response: {
      success: true,
    },
  }, env);

  const clearedOutput = run('route', {
    session_id: leaderSessionId,
    tools: ['TaskGet', 'TaskUpdate', 'SendMessage'],
    prompt: 'Continue coordinating the team inbox and task board.',
  }, env);
  const clearedState = parseAdditionalContextJson(clearedOutput.hookSpecificOutput.additionalContext);

  assert.equal(clearedState.host.continuity.team.pending_idle_notifications, undefined);
  assert.equal(clearedState.host.continuity.team.mailbox_events, undefined);
  assert.equal(clearedState.host.continuity.team.mailbox_summary, undefined);
  assert.equal(clearedState.host.continuity.team.handoff_candidates, undefined);
  assert.equal(clearedState.host.continuity.team.handoff_summary, undefined);
});
