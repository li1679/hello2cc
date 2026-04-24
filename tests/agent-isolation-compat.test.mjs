import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const orchestratorPath = resolve('scripts/orchestrator.mjs');
const subagentContextPath = resolve('scripts/subagent-context.mjs');

function run(cmd, payload, env = {}) {
  const result = spawnSync(process.execPath, [orchestratorPath, cmd], {
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

test('pre-agent-model strips explicit worktree isolation unless the user explicitly asked for it', () => {
  const env = isolatedEnv();

  const output = run('pre-agent-model', {
    session_id: 'strip-worktree',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      isolation: 'worktree',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.updatedInput.isolation, undefined);
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /did not explicitly request worktree isolation/i);
});

test('pre-agent-model preserves explicit worktree isolation after route intent marks wantsWorktree', () => {
  const env = isolatedEnv({
    CLAUDE_PLUGIN_OPTION_DEFAULT_AGENT_MODEL: 'opus',
  });

  run('route', {
    session_id: 'keep-worktree',
    prompt: 'Use an isolated worktree for this delegated implementation.',
  }, env);

  const output = run('pre-agent-model', {
    session_id: 'keep-worktree',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      isolation: 'worktree',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.updatedInput.isolation, 'worktree');
  assert.equal(output.hookSpecificOutput.updatedInput.model, 'opus');
});

test('stale compatibility_mode settings no longer suppress overlays or subagent context', () => {
  const env = isolatedEnv({
    CLAUDE_PLUGIN_OPTION_COMPATIBILITY_MODE: 'sanitize-only',
  });

  const sessionOutput = run('session-start', {
    session_id: 'sanitize-only-mode',
    model: 'opus',
  }, env);
  assert.ok(sessionOutput.hookSpecificOutput.additionalContext.includes('# 2cc'));

  const routeOutput = run('route', {
    session_id: 'sanitize-only-mode',
    prompt: 'Compare TeamCreate with plain Agent workers and present it as a table.',
  }, env);
  assert.ok(routeOutput.hookSpecificOutput.additionalContext.includes('# 2cc routing'));

  const pretoolOutput = run('pre-agent-model', {
    session_id: 'sanitize-only-mode',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      isolation: 'worktree',
    },
  }, env);
  assert.equal(pretoolOutput.hookSpecificOutput.updatedInput.isolation, undefined);
  assert.match(pretoolOutput.hookSpecificOutput.permissionDecisionReason, /did not explicitly request worktree isolation/i);

  const subagentOutput = spawnSync(process.execPath, [subagentContextPath, 'explore'], {
    cwd: resolve('.'),
    env: {
      ...process.env,
      ...env,
    },
    encoding: 'utf8',
  });

  assert.equal(subagentOutput.status, 0, subagentOutput.stderr);
  assert.ok(JSON.parse(subagentOutput.stdout).hookSpecificOutput.additionalContext.includes('# 2cc Explore mode'));
});
