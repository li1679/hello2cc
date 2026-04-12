import {
  test,
  assert,
  isolatedEnv,
  parseAdditionalContextJson,
  run,
  writeTranscript,
} from './helpers/orchestrator-test-helpers.mjs';

test('pre-agent-model strips placeholder Agent.name and skips active-team autofill', () => {
  const env = isolatedEnv();
  const sessionId = 'placeholder-agent-name';

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
      subject: 'Implement frontend slice',
      description: 'Real team continuity exists now',
    },
    tool_response: {
      task: {
        id: '1',
        subject: 'Implement frontend slice',
      },
    },
  }, env);
  run('route', {
    session_id: sessionId,
    prompt: 'Continue coordinating teammates on the shared task board for this implementation.',
  }, env);

  const output = run('pre-agent-model', {
    session_id: sessionId,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: '__omit__',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.updatedInput.name, undefined);
  assert.equal(output.hookSpecificOutput.updatedInput.team_name, undefined);
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /placeholder Agent\.name/i);
});

test('route ignores placeholder transcript agent_name when deriving team role', () => {
  const env = isolatedEnv();
  const sessionId = 'route-placeholder-agent-name';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
    tools: ['TaskList', 'TaskGet', 'TaskUpdate', 'SendMessage'],
  }, [
    {
      type: 'assistant',
      session_id: sessionId,
      team_name: 'delivery-squad',
      agent_name: '__omit__',
    },
  ]);

  const output = run('route', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tools: ['TaskList', 'TaskGet', 'TaskUpdate', 'SendMessage'],
    prompt: 'Summarize the team state and tell me what to do next.',
  }, env);
  const state = parseAdditionalContextJson(output.hookSpecificOutput.additionalContext);

  assert.equal(state.host.continuity.team.active_team, 'delivery-squad');
  assert.equal(state.response_contract.specialization, 'team_status');
  assert.equal(state.response_contract.role, 'team_lead');
  assert.equal(state.execution_playbook.role, 'team_lead');
});

test('pre-task-update strips placeholder owner values instead of treating them as unknown teammates', () => {
  const env = isolatedEnv();
  const sessionId = 'task-update-placeholder-owner';

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
    tool_response: {
      task: {
        id: '7',
        subject: 'Implement API',
      },
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TaskGet',
    tool_input: {
      taskId: '7',
    },
    tool_response: {
      task: {
        id: '7',
        subject: 'Implement API',
        description: 'Do the work',
        status: 'pending',
        blocks: [],
        blockedBy: [],
      },
    },
  }, env);

  const output = run('pre-task-update', {
    session_id: sessionId,
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: '7',
      owner: '__omit__',
      status: 'in_progress',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.permissionDecision, 'allow');
  assert.equal(output.hookSpecificOutput.updatedInput.owner, undefined);
  assert.equal(output.hookSpecificOutput.updatedInput.status, 'in_progress');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /placeholder TaskUpdate\.owner/i);
});

test('placeholder TaskUpdate.owner does not poison task ownership continuity', () => {
  const env = isolatedEnv();
  const sessionId = 'task-update-placeholder-owner-continuity';

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
    tool_response: {
      task: {
        id: '7',
        subject: 'Implement API',
      },
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: '7',
      owner: '__omit__',
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

  const output = run('route', {
    session_id: sessionId,
    tools: ['TaskList', 'TaskGet', 'TaskUpdate', 'SendMessage'],
    prompt: 'Summarize the team state and tell me what to do next.',
  }, env);
  const state = parseAdditionalContextJson(output.hookSpecificOutput.additionalContext);

  assert.equal(state.host.continuity.last_task_owner, undefined);
  assert.equal(state.host.continuity.team.open_task_owners, undefined);
  assert.equal(state.host.continuity.team.known_teammates, undefined);
});

test('pre-send-message strips placeholder targets before native delivery', () => {
  const env = isolatedEnv();

  const output = run('pre-send-message', {
    session_id: 'send-message-placeholder-target',
    tool_name: 'SendMessage',
    tool_input: {
      to: '__omit__',
      message: 'Need backend contract.',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.permissionDecision, 'allow');
  assert.equal(output.hookSpecificOutput.updatedInput.to, undefined);
  assert.equal(output.hookSpecificOutput.updatedInput.summary, undefined);
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /placeholder SendMessage\.to/i);
});

test('placeholder SendMessage.to does not poison message-target continuity', () => {
  const env = isolatedEnv();
  const sessionId = 'send-message-placeholder-target-continuity';

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
    tool_name: 'SendMessage',
    tool_input: {
      to: '__omit__',
      message: 'Need backend contract.',
    },
    tool_response: {
      success: true,
    },
  }, env);

  const output = run('route', {
    session_id: sessionId,
    tools: ['TaskList', 'TaskGet', 'TaskUpdate', 'SendMessage'],
    prompt: 'Summarize the team state and tell me what to do next.',
  }, env);
  const state = parseAdditionalContextJson(output.hookSpecificOutput.additionalContext);

  assert.equal(state.host.continuity.last_message_target, undefined);
  assert.equal(state.host.continuity.team.known_teammates, undefined);
});
