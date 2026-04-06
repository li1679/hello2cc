import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const scriptPath = resolve('scripts/subagent-stop.mjs');

function run(payload) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: resolve('.'),
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
}

test('explore stop blocks shallow summaries without paths', () => {
  const result = run({
    agent_type: 'Explore',
    last_assistant_message: 'Done. I inspected the repository and found some things.',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /block/);
  assert.match(result.stdout, /exact file paths/i);
});

test('general-purpose stop allows summaries with paths and tests', () => {
  const result = run({
    agent_type: 'general-purpose',
    last_assistant_message: 'Updated `scripts/orchestrator.mjs` and verified with `npm test`.',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});

test('plan stop blocks plans without structure or validation', () => {
  const result = run({
    agent_type: 'Plan',
    last_assistant_message: 'I have a plan in mind and it should work.',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /block/);
  assert.match(result.stdout, /validation/i);
});

test('plan stop allows structured non-lexicon plans with concrete artifacts', () => {
  const result = run({
    agent_type: 'Plan',
    last_assistant_message: '1. `src/router.mjs`\n2. `tests/router.test.mjs`\n3. `npm test -- router`',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});
