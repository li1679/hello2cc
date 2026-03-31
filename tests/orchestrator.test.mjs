import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const scriptPath = resolve('scripts/orchestrator.mjs');

function run(cmd, payload, env = {}) {
  const result = spawnSync(process.execPath, [scriptPath, cmd], {
    cwd: resolve('.'),
    env: {
      ...process.env,
      ...env,
    },
    input: payload ? JSON.stringify(payload) : '',
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout) : {};
}

function isolatedEnv(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'hello2cc-test-'));

  return {
    HOME: root,
    USERPROFILE: root,
    CLAUDE_PLUGIN_DATA: join(root, 'plugin-data'),
    CLAUDE_PLUGIN_ROOT: resolve('.'),
    ...overrides,
  };
}

function writeTranscript(root, sessionId, payload) {
  const transcriptPath = join(root, 'session.jsonl');
  writeFileSync(transcriptPath, `${JSON.stringify({
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    ...payload,
  })}\n`, 'utf8');
  return transcriptPath;
}

test('session-start stays native-first and skill-free', () => {
  const env = isolatedEnv();
  const output = run('session-start', {
    session_id: 'session-1',
    model: 'opus',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /ToolSearch/);
  assert.match(context, /force-for-plugin/);
  assert.match(context, /mirror_session_model/);
  assert.doesNotMatch(context, /Skill\(/);
  assert.doesNotMatch(context, /skills?/i);
});

test('route promotes native guide flow without skill references', () => {
  const env = isolatedEnv();
  run('session-start', {
    session_id: 'route-guide',
    model: 'opus',
  }, env);
  const output = run('route', {
    session_id: 'route-guide',
    prompt: 'How do Claude Code hooks and MCP permissions work?',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /Claude Code Guide/);
  assert.match(context, /ToolSearch/);
  assert.doesNotMatch(context, /Skill\(/);
  assert.doesNotMatch(context, /skills?/i);
});

test('route extracts prompt text from structured payloads', () => {
  const env = isolatedEnv();
  run('session-start', {
    session_id: 'route-structured',
    model: 'opus',
  }, env);
  const output = run('route', {
    session_id: 'route-structured',
    prompt: {
      role: 'user',
      content: [
        { type: 'text', text: 'Research this repo, implement the change, and verify the result.' },
      ],
    },
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /TeamCreate/);
  assert.match(context, /TaskCreate/);
});

test('route promotes TeamCreate plus Task tracking for multi-track work', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-team',
    prompt: 'Research this repo, implement the change, and verify the result without making edits yet.',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /TeamCreate/);
  assert.match(context, /TaskCreate/);
  assert.match(context, /research/);
  assert.match(context, /verification/);
});

test('route promotes General-Purpose for bounded implementation slices', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-general',
    prompt: 'Implement a focused one-file fix and validate it.',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /General-Purpose/);
});

test('route promotes ToolSearch for MCP-backed work', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-mcp',
    prompt: 'Use MCP or connected tools to inspect external systems if available.',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /ToolSearch/);
  assert.match(context, /MCP/);
});

test('route skips explicit slash commands', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-slash',
    prompt: '/config',
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('pre-agent-model injects guide model using official permission fields', () => {
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
      CLAUDE_PLUGIN_OPTION_GUIDE_MODEL: 'cc-gpt-5.4',
    },
  );

  assert.equal(output.hookSpecificOutput.permissionDecision, 'allow');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /cc-gpt-5\.4/);
  assert.equal(output.hookSpecificOutput.updatedInput.model, 'cc-gpt-5.4');
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

test('pre-agent-model only injects team model when explicitly configured', () => {
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

  assert.deepEqual(nativeOutput, { suppressOutput: true });

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
      CLAUDE_PLUGIN_OPTION_TEAM_MODEL: 'cc-gpt-5.4',
    },
  );

  assert.equal(output.hookSpecificOutput.updatedInput.model, 'cc-gpt-5.4');
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
    CLAUDE_PLUGIN_OPTION_PLAN_MODEL: 'cc-gpt-5.4',
  });

  assert.equal(overriddenOutput.hookSpecificOutput.updatedInput.model, 'cc-gpt-5.4');
});

test('pre-agent-model can discover the current session model from transcript_path for Explore', () => {
  const env = isolatedEnv();
  const sessionId = 'transcript-model';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
    output_style: 'hello2cc:hello2cc Native',
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
