import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const scriptPath = resolve('scripts/notify.mjs');

function isolatedEnv() {
  const root = mkdtempSync(join(tmpdir(), 'hello2cc-notify-test-'));

  return {
    ...process.env,
    HOME: root,
    USERPROFILE: root,
    CLAUDE_PLUGIN_DATA: join(root, 'plugin-data'),
    CLAUDE_PLUGIN_ROOT: resolve('.'),
  };
}

function runNotify(args, payload = '', env = isolatedEnv()) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: resolve('.'),
    env,
    input: payload,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  return result;
}

test('notify inject stays compatible with the new session-start orchestration', () => {
  const result = runNotify(
    ['inject'],
    JSON.stringify({
      session_id: 'compat-inject',
      model: 'opus',
    }),
  );

  const payload = JSON.parse(result.stdout);
  assert.match(payload.hookSpecificOutput.additionalContext, /ToolSearch/);
  assert.equal(payload.suppressOutput, true);
});

test('notify stop is a safe no-op for stale stop-hook references', () => {
  const result = runNotify(
    ['stop'],
    JSON.stringify({
      hook_event_name: 'Stop',
    }),
  );

  assert.deepEqual(JSON.parse(result.stdout), { suppressOutput: true });
});

test('notify codex-notify exits cleanly for stale notification-program references', () => {
  const result = runNotify(['codex-notify']);

  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
