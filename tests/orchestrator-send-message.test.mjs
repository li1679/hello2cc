import {
  test,
  assert,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  join,
  run,
  isolatedEnv,
  writeTranscript,
} from './helpers/orchestrator-test-helpers.mjs';

test('pre-send-message injects a summary for plain-text messages', () => {
  const env = isolatedEnv();
  const output = run('pre-send-message', {
    session_id: 'send-message-summary',
    tool_name: 'SendMessage',
    tool_input: {
      to: 'agent-a1b',
      message: 'Fix the null pointer in src/auth/validate.ts:42 and rerun the focused tests.',
    },
  }, env);

  assert.match(output.hookSpecificOutput.updatedInput.summary, /Fix the null pointer/i);
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /SendMessage\.summary/);
});

test('pre-send-message preserves existing summaries', () => {
  const env = isolatedEnv();

  const withSummary = run('pre-send-message', {
    session_id: 'send-message-summary-existing',
    tool_name: 'SendMessage',
    tool_input: {
      to: 'agent-a1b',
      summary: 'fix auth bug',
      message: 'Fix the null pointer in src/auth/validate.ts:42.',
    },
  }, env);
  assert.deepEqual(withSummary, { suppressOutput: true });
});

test('pre-send-message no longer pre-denies structured team protocol without active team', () => {
  const env = isolatedEnv();

  const structured = run('pre-send-message', {
    session_id: 'send-message-structured-no-team',
    tool_name: 'SendMessage',
    tool_input: {
      to: 'team-lead',
      message: {
        type: 'shutdown_request',
      },
    },
  }, env);

  assert.deepEqual(structured, { suppressOutput: true });
});

test('pre-send-message no longer pre-denies teammate plan approval requests outside active teammate plan mode', () => {
  const env = isolatedEnv();
  const sessionId = 'send-message-plan-approval-needs-plan-mode';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
    tools: ['SendMessage', 'EnterPlanMode', 'ExitPlanMode'],
  }, [
    {
      type: 'assistant',
      session_id: sessionId,
      team_name: 'delivery-squad',
      agent_name: 'frontend-owner',
    },
  ]);

  const output = run('pre-send-message', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'team-lead',
      message: {
        type: 'plan_approval_request',
        requestId: 'plan-1',
      },
    },
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('pre-send-message allows teammate plan approval requests during active plan mode', () => {
  const env = isolatedEnv();
  const sessionId = 'send-message-plan-approval-allowed';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
    tools: ['SendMessage', 'EnterPlanMode', 'ExitPlanMode'],
  }, [
    {
      type: 'assistant',
      session_id: sessionId,
      team_name: 'delivery-squad',
      agent_name: 'frontend-owner',
    },
  ]);

  run('post-tool-use', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tool_name: 'EnterPlanMode',
    tool_input: {},
    tool_response: {
      success: true,
    },
  }, env);

  const output = run('pre-send-message', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'team-lead',
      message: {
        type: 'plan_approval_request',
        requestId: 'plan-1',
        planFilePath: 'plans/frontend-owner.md',
      },
    },
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('pre-send-message allows team-lead plan approval responses to pending teammate requests', () => {
  const env = isolatedEnv();
  const sessionId = 'send-message-plan-approval-response-allowed';
  const teammateSessionId = 'send-message-plan-approval-response-worker';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
    tools: ['SendMessage'],
  }, [
    {
      type: 'assistant',
      session_id: sessionId,
      team_name: 'delivery-squad',
    },
  ]);
  const teammateTranscriptPath = writeTranscript(env.HOME, teammateSessionId, {
    model: 'opus',
    tools: ['SendMessage'],
  }, [
    {
      type: 'assistant',
      session_id: teammateSessionId,
      team_name: 'delivery-squad',
      agent_name: 'frontend-owner',
    },
  ]);

  run('post-tool-use', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);

  run('post-tool-use', {
    session_id: teammateSessionId,
    transcript_path: teammateTranscriptPath,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'team-lead',
      message: {
        type: 'plan_approval_request',
        requestId: 'plan-1',
        planFilePath: 'plans/frontend-owner.md',
      },
    },
    tool_response: {
      success: true,
    },
  }, env);

  const output = run('pre-send-message', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'frontend-owner',
      message: {
        type: 'plan_approval_response',
        requestId: 'plan-1',
        approved: true,
      },
    },
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('pre-send-message no longer pre-denies teammate plan approval responses and leaves leader checks to the native tool', () => {
  const env = isolatedEnv();
  const sessionId = 'send-message-plan-approval-response-blocked';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
    tools: ['SendMessage'],
  }, [
    {
      type: 'assistant',
      session_id: sessionId,
      team_name: 'delivery-squad',
      agent_name: 'frontend-owner',
    },
  ]);

  const output = run('pre-send-message', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'backend-owner',
      message: {
        type: 'plan_approval_response',
        requestId: 'plan-1',
        approved: true,
      },
    },
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('pre-send-message allows teammate shutdown responses and leaves rejection-field validation to the native tool', () => {
  const env = isolatedEnv();
  const sessionId = 'send-message-shutdown-response';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
    tools: ['SendMessage'],
  }, [
    {
      type: 'assistant',
      session_id: sessionId,
      team_name: 'delivery-squad',
      agent_name: 'frontend-owner',
    },
  ]);

  const allowed = run('pre-send-message', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'team-lead',
      message: {
        type: 'shutdown_response',
        request_id: 'shutdown-1',
        approve: true,
      },
    },
  }, env);
  assert.deepEqual(allowed, { suppressOutput: true });

  const noLongerPreBlocked = run('pre-send-message', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'team-lead',
      message: {
        type: 'shutdown_response',
        request_id: 'shutdown-2',
        approve: false,
      },
    },
  }, env);

  assert.deepEqual(noLongerPreBlocked, { suppressOutput: true });
});

test('pre-send-message no longer pre-denies broadcast without an active team', () => {
  const env = isolatedEnv();

  const output = run('pre-send-message', {
    session_id: 'send-message-broadcast-no-team',
    tool_name: 'SendMessage',
    tool_input: {
      to: '*',
      message: 'Everyone sync on this change.',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.permissionDecision, 'allow');
  assert.equal(output.hookSpecificOutput.updatedInput.to, '*');
  assert.equal(output.hookSpecificOutput.updatedInput.summary, 'Everyone sync on this change.');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /SendMessage\.summary/);
});

test('pre-send-message no longer pre-denies structured status-shaped payloads in team mode', () => {
  const env = isolatedEnv();
  const sessionId = 'send-message-status-json';

  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TaskCreate',
    tool_input: {
      subject: 'Implement API',
      description: 'Tracked team work',
    },
    tool_response: {
      task: {
        id: '7',
        subject: 'Implement API',
      },
    },
  }, env);

  const output = run('pre-send-message', {
    session_id: sessionId,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'team-lead',
      message: {
        type: 'task_completed',
        taskId: '7',
      },
    },
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('pre-send-message no longer pre-denies forged idle notifications', () => {
  const env = isolatedEnv();
  const sessionId = 'send-message-idle-notification-spoof';

  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);

  const output = run('pre-send-message', {
    session_id: sessionId,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'team-lead',
      message: {
        type: 'idle_notification',
        summary: 'Finished my turn',
      },
    },
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('pre-send-message injects summaries for pure done pings during active task-board coordination', () => {
  const env = isolatedEnv();
  const sessionId = 'send-message-done-ping';

  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TaskList',
    tool_response: {
      tasks: [
        { id: '7', subject: 'Implement API', status: 'in_progress', owner: 'frontend-owner', blockedBy: [] },
      ],
    },
  }, env);

  const output = run('pre-send-message', {
    session_id: sessionId,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'team-lead',
      message: 'Task 7 completed',
    },
  }, env);

  assert.match(output.hookSpecificOutput.updatedInput.summary, /Task 7 completed/i);
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /SendMessage\.summary/);
});

test('pre-send-message injects summaries for localized ultra-short status pings during active task-board coordination', () => {
  const env = isolatedEnv();
  const sessionId = 'send-message-short-localized-status';

  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TaskList',
    tool_response: {
      tasks: [
        { id: '7', subject: 'Implement API', status: 'in_progress', owner: 'frontend-owner', blockedBy: [] },
      ],
    },
  }, env);

  const output = run('pre-send-message', {
    session_id: sessionId,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'team-lead',
      message: '完成了',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.updatedInput.summary, '完成了');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /SendMessage\.summary/);
});

test('pre-send-message allows short acknowledgements from the leader to a teammate', () => {
  const env = isolatedEnv();
  const sessionId = 'send-message-short-ack-to-teammate';

  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'frontend-owner',
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TaskList',
    tool_response: {
      tasks: [
        { id: '7', subject: 'Implement API', status: 'in_progress', owner: 'frontend-owner', blockedBy: [] },
      ],
    },
  }, env);

  const output = run('pre-send-message', {
    session_id: sessionId,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'frontend-owner',
      summary: 'ack teammate',
      message: '收到',
    },
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('pre-send-message allows shutdown requests to known teammates in an active team', () => {
  const env = isolatedEnv();
  const sessionId = 'send-message-shutdown-request';

  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TaskCreate',
    tool_input: {
      subject: 'Implement API',
      description: 'Tracked team work',
    },
    tool_response: {
      task: {
        id: '7',
        subject: 'Implement API',
      },
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'frontend-owner',
      team_name: 'delivery-squad',
    },
  }, env);

  const output = run('pre-send-message', {
    session_id: sessionId,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'frontend-owner',
      message: {
        type: 'shutdown_request',
      },
    },
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});
