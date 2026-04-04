import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const scriptPath = resolve('scripts/subagent-context.mjs');

function isolatedEnv(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'hello2cc-subagent-test-'));

  return {
    HOME: root,
    USERPROFILE: root,
    CLAUDE_PLUGIN_DATA: join(root, 'plugin-data'),
    CLAUDE_PLUGIN_ROOT: resolve('.'),
    ...overrides,
  };
}

function parseAdditionalContextJson(text) {
  const match = String(text || '').match(/```json\r?\n([\s\S]*?)\r?\n```/);
  assert.ok(match, 'expected a json code block in additionalContext');
  return JSON.parse(match[1]);
}

function run(mode, payload, env = {}) {
  const result = spawnSync(process.execPath, [scriptPath, mode], {
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

test('subagent-context exposes plain worker capability as structured state', () => {
  const env = isolatedEnv();
  const output = run('general', {
    session_id: 'plain-worker',
    agent_id: 'agent-1234',
    agent_type: 'general-purpose',
  }, env);
  const state = parseAdditionalContextJson(output.hookSpecificOutput.additionalContext);
  const context = output.hookSpecificOutput.additionalContext;

  assert.equal(state.hello2cc_role, 'host-state');
  assert.equal(state.operator_profile, 'opus-compatible-claude-code');
  assert.equal(state.execution_envelope, 'host_defined_capability_policies');
  assert.equal(state.semantic_routing, 'host_guarded_model_decides');
  assert.equal(state.mode, 'General-Purpose');
  assert.equal(state.can_write, true);
  assert.equal(state.teammate, undefined);
  assert.match(context, /one-sentence judgment first/i);
});

test('subagent-context exposes teammate identity and includes team workflow guidance', () => {
  const env = isolatedEnv();
  const output = run('general', {
    session_id: 'team-worker',
    agent_id: 'frontend-dev@delivery-squad',
    agent_type: 'general-purpose',
  }, env);
  const state = parseAdditionalContextJson(output.hookSpecificOutput.additionalContext);
  const context = output.hookSpecificOutput.additionalContext;

  assert.equal(state.mode, 'General-Purpose');
  assert.equal(state.teammate.agent, 'frontend-dev');
  assert.equal(state.teammate.team, 'delivery-squad');
  assert.equal(state.teammate.coordination_channel, 'SendMessage');
  assert.equal(state.tool_choice, 'follow_visible_capability_contracts');
  assert.equal(state.coordination.task_board, true);
  assert.deepEqual(state.coordination.lifecycle, ['TaskList', 'TaskGet', 'TaskUpdate']);
  assert.match(context, /TaskList/);
  assert.match(context, /TaskUpdate/);
  assert.match(context, /SendMessage/);
});

test('subagent-context keeps Explore on explicit read-only capability', () => {
  const env = isolatedEnv();
  const output = run('explore', {
    session_id: 'team-explore',
    agent_id: 'researcher@delivery-squad',
    agent_type: 'Explore',
  }, env);
  const state = parseAdditionalContextJson(output.hookSpecificOutput.additionalContext);
  const context = output.hookSpecificOutput.additionalContext;

  assert.equal(state.mode, 'Explore');
  assert.equal(state.capability, 'read-only-search');
  assert.equal(state.can_write, false);
  assert.equal(state.execution_envelope, 'host_defined_capability_policies');
  assert.match(context, /compact Markdown table/i);
});
