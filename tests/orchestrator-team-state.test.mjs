import {
  test,
  assert,
  existsSync,
  readFileSync,
  join,
  run,
  isolatedEnv,
  writeTranscript,
} from './helpers/orchestrator-test-helpers.mjs';

test('post-tool-failure records missing teams and pre-agent-model fail-closes repeated teammate retries', () => {
  const env = isolatedEnv();

  run('route', {
    session_id: 'missing-team-precondition',
    prompt: 'Use TeamCreate and teammates to coordinate research and implementation in parallel.',
  }, env);

  const failure = run('post-tool-failure', {
    session_id: 'missing-team-precondition',
    cwd: 'D:\\GitHub\\dev\\hello2cc',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      team_name: 'delivery-squad',
      name: 'frontend-owner',
    },
    error: 'Team "delivery-squad" does not exist. Call spawnTeam first to create the team.',
  }, env);
  assert.deepEqual(failure, { suppressOutput: true });

  const blocked = run('pre-agent-model', {
    session_id: 'missing-team-precondition',
    cwd: 'D:\\GitHub\\dev\\hello2cc',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      team_name: 'delivery-squad',
      name: 'frontend-owner',
    },
  }, env);

  assert.equal(blocked.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(blocked.hookSpecificOutput.permissionDecisionReason, /known missing in this session/i);
  assert.match(blocked.hookSpecificOutput.permissionDecisionReason, /TeamCreate|plain non-team subagent/i);
});

test('post-tool-use clears known-missing team failures after TeamCreate succeeds', () => {
  const env = isolatedEnv({
    CLAUDE_PLUGIN_OPTION_TEAM_MODEL: 'sonnet',
  });

  run('route', {
    session_id: 'missing-team-cleared',
    prompt: 'Use TeamCreate with teammates and shared task handoffs to coordinate frontend and backend ownership.',
  }, env);

  run('post-tool-failure', {
    session_id: 'missing-team-cleared',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      team_name: 'delivery-squad',
      name: 'frontend-owner',
    },
    error: 'Team "delivery-squad" does not exist. Call spawnTeam first to create the team.',
  }, env);

  run('post-tool-use', {
    session_id: 'missing-team-cleared',
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: 'missing-team-cleared',
    tool_name: 'TaskCreate',
    tool_input: {
      subject: 'Implement frontend slice',
      description: 'Real task board for the team',
    },
    tool_response: {
      task: {
        id: '1',
        subject: 'Implement frontend slice',
      },
    },
  }, env);

  const output = run('pre-agent-model', {
    session_id: 'missing-team-cleared',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      team_name: 'delivery-squad',
      name: 'frontend-owner',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.updatedInput.model, 'sonnet');
  assert.equal(output.hookSpecificOutput.permissionDecision, 'allow');
});

test('pre-team-delete no longer pre-denies cleanup and leaves TeamDelete lifecycle checks to the native tool', () => {
  const env = isolatedEnv();
  const sessionId = 'team-delete-guarded';
  const teammateSessionId = 'team-delete-guarded-worker';
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
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'frontend-owner',
      team_name: 'delivery-squad',
    },
  }, env);

  const blockedForTasks = run('pre-team-delete', {
    session_id: sessionId,
    tool_name: 'TeamDelete',
    tool_input: {},
  }, env);
  assert.deepEqual(blockedForTasks, { suppressOutput: true });

  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: '7',
      status: 'completed',
      owner: 'frontend-owner',
    },
    tool_response: {
      success: true,
      taskId: '7',
      updatedFields: ['status', 'owner'],
      statusChange: {
        from: 'in_progress',
        to: 'completed',
      },
    },
  }, env);

  const blockedForShutdown = run('pre-team-delete', {
    session_id: sessionId,
    tool_name: 'TeamDelete',
    tool_input: {},
  }, env);
  assert.deepEqual(blockedForShutdown, { suppressOutput: true });

  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'frontend-owner',
      message: {
        type: 'shutdown_request',
      },
    },
  }, env);

  const blockedForApproval = run('pre-team-delete', {
    session_id: sessionId,
    tool_name: 'TeamDelete',
    tool_input: {},
  }, env);
  assert.deepEqual(blockedForApproval, { suppressOutput: true });

  run('post-tool-use', {
    session_id: teammateSessionId,
    transcript_path: teammateTranscriptPath,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'team-lead',
      message: {
        type: 'shutdown_response',
        request_id: 'shutdown-1',
        approve: true,
      },
    },
    tool_response: {
      success: true,
    },
  }, env);

  const allowed = run('pre-team-delete', {
    session_id: sessionId,
    tool_name: 'TeamDelete',
    tool_input: {},
  }, env);
  assert.deepEqual(allowed, { suppressOutput: true });
});

test('pre-team-delete no longer pre-denies cleanup after teammate shutdown rejection state is recorded', () => {
  const env = isolatedEnv();
  const sessionId = 'team-delete-rejected';
  const teammateSessionId = 'team-delete-rejected-worker';
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
    tool_name: 'SendMessage',
    tool_input: {
      to: 'frontend-owner',
      message: {
        type: 'shutdown_request',
      },
    },
  }, env);
  run('post-tool-use', {
    session_id: teammateSessionId,
    transcript_path: teammateTranscriptPath,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'team-lead',
      message: {
        type: 'shutdown_response',
        request_id: 'shutdown-2',
        approve: false,
        reason: 'Still finishing verification',
      },
    },
    tool_response: {
      success: true,
    },
  }, env);

  const blocked = run('pre-team-delete', {
    session_id: sessionId,
    tool_name: 'TeamDelete',
    tool_input: {},
  }, env);

  assert.deepEqual(blocked, { suppressOutput: true });
});

test('post-tool-use records deleted teams as unavailable until recreated', () => {
  const env = isolatedEnv();

  run('route', {
    session_id: 'deleted-team-precondition',
    prompt: 'Use TeamCreate and teammates to coordinate research and implementation in parallel.',
  }, env);

  run('post-tool-use', {
    session_id: 'deleted-team-precondition',
    tool_name: 'TeamDelete',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);

  const blocked = run('pre-agent-model', {
    session_id: 'deleted-team-precondition',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      team_name: 'delivery-squad',
      name: 'frontend-owner',
    },
  }, env);

  assert.equal(blocked.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(blocked.hookSpecificOutput.permissionDecisionReason, /known missing in this session/i);
});

test('config-change clears cached session context so stale models are not reused', () => {
  const env = isolatedEnv();
  run('session-start', {
    session_id: 'config-change',
    model: 'opus',
  }, env);

  const cachePath = join(env.CLAUDE_PLUGIN_DATA, 'runtime', 'session-context.json');
  assert.equal(existsSync(cachePath), true);

  const output = run('config-change', {
    session_id: 'config-change',
    source: 'project_settings',
    file_path: join(env.HOME, '.claude', 'settings.json'),
  }, env);

  assert.deepEqual(output, { suppressOutput: true });

  const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
  assert.equal(cached['config-change'], undefined);
});
