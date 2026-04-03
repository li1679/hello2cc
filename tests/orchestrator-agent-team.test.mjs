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

test('pre-agent-model only injects team model for team-oriented workflows', () => {
  const env = isolatedEnv();
  const nativeOutput = run(
    'pre-agent-model',
    {
      session_id: 'team-model-native',
      tool_name: 'Agent',
      tool_input: {
        team_name: 'delivery-squad',
      },
    },
    env,
  );

  assert.equal(nativeOutput.hookSpecificOutput.updatedInput.team_name, undefined);
  assert.match(nativeOutput.hookSpecificOutput.permissionDecisionReason, /plain subagent semantics/);

  run('route', {
    session_id: 'team-model',
    prompt: 'Coordinate frontend and backend ownership across agents with shared task handoffs.',
  }, env);

  const output = run(
    'pre-agent-model',
    {
      session_id: 'team-model',
      tool_name: 'Agent',
      tool_input: {
        team_name: 'delivery-squad',
      },
    },
    {
      ...env,
      CLAUDE_PLUGIN_OPTION_TEAM_MODEL: 'sonnet',
    },
  );

  assert.equal(output.hookSpecificOutput.updatedInput.model, 'sonnet');
});

test('pre-agent-model keeps plain worker semantics even with active team context when the prompt is not team-oriented', () => {
  const env = isolatedEnv();
  const sessionId = 'plain-subagent-team-context';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
  }, [
    {
      type: 'assistant',
      session_id: sessionId,
      teamName: 'design-squad',
      agentName: 'team-lead',
    },
  ]);

  run('route', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    prompt: 'Use subagent workers in parallel to inspect three modules and report back.',
  }, env);

  const output = run('pre-agent-model', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'Explore',
      name: 'module-reader',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.updatedInput.name, undefined);
  assert.equal(output.hookSpecificOutput.updatedInput.team_name, undefined);
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /plain subagent semantics/);
});

test('pre-agent-model makes team_name explicit for proactive team workflows', () => {
  const env = isolatedEnv();
  const sessionId = 'proactive-team-workflow';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
  }, [
    {
      type: 'assistant',
      session_id: sessionId,
      teamName: 'delivery-squad',
      agentName: 'team-lead',
    },
  ]);

  run('route', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    prompt: 'Coordinate frontend and backend ownership across agents with shared task handoffs.',
  }, env);

  const output = run('pre-agent-model', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'frontend-owner',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.updatedInput.name, 'frontend-owner');
  assert.equal(output.hookSpecificOutput.updatedInput.team_name, 'delivery-squad');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /made Agent\.team_name explicit/);
});

test('pre-agent-model only injects team model for explicit team_name in team-oriented workflows', () => {
  const env = isolatedEnv();

  run('route', {
    session_id: 'team-model-explicit',
    prompt: 'Use TeamCreate and teammates to coordinate research and implementation in parallel.',
  }, env);

  const output = run(
    'pre-agent-model',
    {
      session_id: 'team-model-explicit',
      tool_name: 'Agent',
      tool_input: {
        team_name: 'delivery-squad',
      },
    },
    {
      ...env,
      CLAUDE_PLUGIN_OPTION_TEAM_MODEL: 'sonnet',
    },
  );

  assert.equal(output.hookSpecificOutput.updatedInput.model, 'sonnet');
});

test('pre-agent-model strips reserved assistant team names for ordinary prompts', () => {
  const env = isolatedEnv();
  const sessionId = 'plain-subagent-main-team';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
  }, [
    {
      type: 'assistant',
      session_id: sessionId,
      teamName: 'main',
      agentName: 'team-lead',
    },
  ]);

  run('route', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    prompt: '请去探索这几个模块并回来汇报。',
  }, env);

  const output = run('pre-agent-model', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'Explore',
      name: 'explore-export-page',
      team_name: 'main',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.updatedInput.name, undefined);
  assert.equal(output.hookSpecificOutput.updatedInput.team_name, undefined);
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /plain subagent semantics/);
});

test('pre-agent-model makes team_name explicit for explicit team workflows', () => {
  const env = isolatedEnv();
  const sessionId = 'explicit-team-workflow';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
  }, [
    {
      type: 'assistant',
      session_id: sessionId,
      teamName: 'research-squad',
      agentName: 'team-lead',
    },
  ]);

  run('route', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    prompt: 'Use TeamCreate and teammates to coordinate research and implementation in parallel.',
  }, env);

  const output = run('pre-agent-model', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'researcher',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.updatedInput.name, 'researcher');
  assert.equal(output.hookSpecificOutput.updatedInput.team_name, 'research-squad');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /made Agent\.team_name explicit/);
});

test('pre-agent-model blocks implicit assistant team names even for team workflows until a real team exists', () => {
  const env = isolatedEnv();
  const sessionId = 'explicit-team-workflow-main';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
  }, [
    {
      type: 'assistant',
      session_id: sessionId,
      teamName: 'main',
      agentName: 'team-lead',
    },
  ]);

  run('route', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    prompt: 'Use TeamCreate and teammates to coordinate research and implementation in parallel.',
  }, env);

  const output = run('pre-agent-model', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'researcher',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.updatedInput.name, undefined);
  assert.equal(output.hookSpecificOutput.updatedInput.team_name, undefined);
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /implicit assistant team semantics/);
});
