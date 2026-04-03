import {
  test,
  assert,
  existsSync,
  readFileSync,
  join,
  run,
  isolatedEnv,
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
    prompt: 'Coordinate frontend and backend ownership across agents with shared task handoffs.',
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
