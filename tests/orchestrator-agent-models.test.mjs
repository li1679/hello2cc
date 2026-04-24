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

test('pre-agent-model injects host-safe guide model slots using official permission fields', () => {
  const env = isolatedEnv();
  const output = run(
    'pre-agent-model',
    {
      session_id: 'guide-model',
      tool_name: 'Agent',
      tool_input: {
        subagent_type: 'Claude Code Guide',
      },
    },
    {
      ...env,
      CLAUDE_PLUGIN_OPTION_GUIDE_MODEL: 'opus',
    },
  );

  assert.equal(output.hookSpecificOutput.permissionDecision, 'allow');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /Agent\.model=opus/);
  assert.equal(output.hookSpecificOutput.updatedInput.model, 'opus');
});

test('pre-agent-model mirrors the current session model for Explore by default', () => {
  const env = isolatedEnv();
  run('session-start', {
    session_id: 'explore-model',
    model: 'opus',
  }, env);

  const output = run(
    'pre-agent-model',
    {
      session_id: 'explore-model',
      tool_name: 'Agent',
      tool_input: {
        subagent_type: 'Explore',
      },
    },
    env,
  );

  assert.equal(output.hookSpecificOutput.updatedInput.model, 'opus');
});

test('pre-agent-model respects explicit model input', () => {
  const env = isolatedEnv();
  const output = run('pre-agent-model', {
    session_id: 'explicit-model',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'Plan',
      model: 'custom-model',
    },
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('pre-agent-model falls back to the current session slot when an explicit override is not host-safe', () => {
  const env = isolatedEnv();

  run('session-start', {
    session_id: 'guide-fallback',
    model: 'claude-opus-4-1-20250805',
  }, env);

  const output = run('pre-agent-model', {
    session_id: 'guide-fallback',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'claude-code-guide',
    },
  }, {
    ...env,
    CLAUDE_PLUGIN_OPTION_GUIDE_MODEL: 'cc-gpt-5.4',
  });

  assert.equal(output.hookSpecificOutput.updatedInput.model, 'opus');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /host-safe slot=opus/);
});

test('pre-agent-model mirrors the current session model alias for Claude Code Guide by default', () => {
  const env = isolatedEnv();

  run('session-start', {
    session_id: 'mirror-session',
    model: 'opus',
  }, env);

  const output = run('pre-agent-model', {
    session_id: 'mirror-session',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'claude-code-guide',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.updatedInput.model, 'opus');
});

test('pre-agent-model preserves native Plan inherit behavior unless explicitly overridden', () => {
  const env = isolatedEnv();
  run('session-start', {
    session_id: 'plan-inherit',
    model: 'opus',
  }, env);

  const nativeOutput = run('pre-agent-model', {
    session_id: 'plan-inherit',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'Plan',
    },
  }, env);

  assert.deepEqual(nativeOutput, { suppressOutput: true });

  const overriddenOutput = run('pre-agent-model', {
    session_id: 'plan-inherit',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'Plan',
    },
  }, {
    ...env,
    CLAUDE_PLUGIN_OPTION_PLAN_MODEL: 'claude-sonnet-4-5',
  });

  assert.equal(overriddenOutput.hookSpecificOutput.updatedInput.model, 'sonnet');
});

test('pre-agent-model suppresses unsupported overrides when no host-safe slot can be derived', () => {
  const env = isolatedEnv({
    CLAUDE_PLUGIN_OPTION_GUIDE_MODEL: 'cc-gpt-5.4',
  });

  const output = run('pre-agent-model', {
    session_id: 'guide-no-slot',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'claude-code-guide',
    },
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('pre-agent-model can discover the current session model from transcript_path for Explore', () => {
  const env = isolatedEnv();
  const sessionId = 'transcript-model';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
    output_style: '2cc:2cc Native',
  });

  const output = run('pre-agent-model', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'Explore',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.updatedInput.model, 'opus');
});

