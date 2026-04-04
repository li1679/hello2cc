import {
  test,
  assert,
  run,
  isolatedEnv,
} from './helpers/orchestrator-test-helpers.mjs';

test('pre-agent-model strips implicit teammate fields for plain workers', () => {
  const env = isolatedEnv();
  const output = run('pre-agent-model', {
    session_id: 'plain-subagent',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'Explore',
      name: 'module-reader',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.updatedInput.name, undefined);
  assert.equal(output.hookSpecificOutput.updatedInput.team_name, undefined);
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /plain subagent semantics outside explicit team-oriented workflows/i);
});

test('pre-agent-model preserves explicit real team_name and can inject team model', () => {
  const env = isolatedEnv({
    CLAUDE_PLUGIN_OPTION_TEAM_MODEL: 'sonnet',
  });

  run('route', {
    session_id: 'explicit-team',
    prompt: 'Use TeamCreate with teammates and a shared task board for this work.',
  }, env);

  const output = run('pre-agent-model', {
    session_id: 'explicit-team',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'frontend-owner',
      team_name: 'delivery-squad',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.updatedInput.name, 'frontend-owner');
  assert.equal(output.hookSpecificOutput.updatedInput.team_name, 'delivery-squad');
  assert.equal(output.hookSpecificOutput.updatedInput.model, 'sonnet');
});

test('pre-agent-model only auto-fills team_name after host state proves an active real team', () => {
  const env = isolatedEnv();

  run('post-tool-use', {
    session_id: 'active-team-autofill',
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);

  run('route', {
    session_id: 'active-team-autofill',
    prompt: 'Continue coordinating teammates on the shared task board for this implementation.',
  }, env);

  const output = run('pre-agent-model', {
    session_id: 'active-team-autofill',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'frontend-owner',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.updatedInput.name, 'frontend-owner');
  assert.equal(output.hookSpecificOutput.updatedInput.team_name, 'delivery-squad');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /verified active team context/i);
});

test('pre-agent-model strips reserved assistant team placeholders', () => {
  const env = isolatedEnv();

  run('route', {
    session_id: 'reserved-team-name',
    prompt: 'Coordinate teammates inside a real team workflow.',
  }, env);

  const output = run('pre-agent-model', {
    session_id: 'reserved-team-name',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'explore-export-page',
      team_name: 'main',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.updatedInput.name, undefined);
  assert.equal(output.hookSpecificOutput.updatedInput.team_name, undefined);
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /implicit assistant team semantics/i);
});

test('pre-team-create blocks team creation when the request does not imply sustained team semantics', () => {
  const env = isolatedEnv();

  run('route', {
    session_id: 'teamcreate-block',
    prompt: 'Implement a focused one-file fix.',
  }, env);

  const output = run('pre-team-create', {
    session_id: 'teamcreate-block',
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
      description: 'Unnecessary team',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /does not indicate sustained team semantics/i);
});

test('pre-team-create allows native team creation for sustained collaboration requests', () => {
  const env = isolatedEnv();

  run('route', {
    session_id: 'teamcreate-allow',
    prompt: 'Coordinate research and implementation with teammates on a shared task board.',
  }, env);

  const output = run('pre-team-create', {
    session_id: 'teamcreate-allow',
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
      description: 'Native team flow',
    },
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('pre-enter-worktree blocks worktree creation unless the user explicitly requested it', () => {
  const env = isolatedEnv();

  run('route', {
    session_id: 'worktree-explicit-only',
    prompt: 'Fix the bug on the normal path.',
  }, env);

  const output = run('pre-enter-worktree', {
    session_id: 'worktree-explicit-only',
    tool_name: 'EnterWorktree',
    tool_input: {},
  }, env);

  assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /did not explicitly request worktree isolation/i);
});
