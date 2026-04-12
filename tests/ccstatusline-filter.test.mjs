import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  enrichStatuslinePayload,
  readStatuslineTranscriptMetrics,
} from '../scripts/lib/statusline-bridge-metrics.mjs';

const bridgeScriptPath = path.resolve('scripts/ccstatusline-bridge.mjs');

function quoteShellArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function makeUsageLine({
  timestamp,
  input,
  output,
  cacheRead = 0,
  cacheCreate = 0,
  isSidechain = false,
  isApiErrorMessage = false,
  stopReason = 'end_turn',
}) {
  return JSON.stringify({
    timestamp,
    isSidechain,
    isApiErrorMessage,
    message: {
      stop_reason: stopReason,
      usage: {
        input_tokens: input,
        output_tokens: output,
        cache_read_input_tokens: cacheRead,
        cache_creation_input_tokens: cacheCreate,
      },
    },
  });
}

test('statusline bridge backfills zero current usage from referenced subagent transcripts', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hello2cc-ccstatusline-'));
  try {
    const transcriptPath = path.join(root, 'session.jsonl');
    const subagentsDir = path.join(root, 'subagents');
    mkdirSync(subagentsDir, { recursive: true });

    writeFileSync(transcriptPath, [
      makeUsageLine({
        timestamp: '2026-04-12T10:00:00.000Z',
        input: 20,
        output: 5,
        cacheRead: 10,
        cacheCreate: 5,
      }),
      JSON.stringify({
        type: 'progress',
        data: { agentId: 'worker-a' },
      }),
    ].join('\n'));

    writeFileSync(path.join(subagentsDir, 'agent-worker-a.jsonl'), [
      makeUsageLine({
        timestamp: '2026-04-12T10:00:05.000Z',
        input: 2400,
        output: 100,
        cacheRead: 900,
        cacheCreate: 200,
        isSidechain: true,
      }),
    ].join('\n'));

    const metrics = await readStatuslineTranscriptMetrics(transcriptPath, { includeSubagents: true });
    const payload = enrichStatuslinePayload({
      transcript_path: transcriptPath,
      model: 'opus[1m]',
      context_window: {
        context_window_size: 1_000_000,
        current_usage: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        used_percentage: 0,
        remaining_percentage: 0,
      },
    }, metrics);

    assert.deepEqual(payload.context_window.current_usage, {
      input_tokens: 2400,
      output_tokens: 100,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 900,
    });
    assert.equal(payload.context_window.total_input_tokens, 2420);
    assert.equal(payload.context_window.total_output_tokens, 105);
    assert.equal(payload.context_window.used_percentage, 0.4);
    assert.equal(payload.context_window.remaining_percentage, 99.6);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('statusline bridge preserves non-zero current usage from Claude status payload', async () => {
  const payload = enrichStatuslinePayload({
    model: 'opus[1m]',
    context_window: {
      context_window_size: 1_000_000,
      current_usage: {
        input_tokens: 1000,
        output_tokens: 50,
        cache_creation_input_tokens: 25,
        cache_read_input_tokens: 75,
      },
      used_percentage: 0.1,
      remaining_percentage: 99.9,
    },
  }, {
    inputTokens: 8000,
    outputTokens: 500,
    cachedTokens: 1200,
    totalTokens: 9700,
    backfillUsageEntry: {
      message: {
        usage: {
          input_tokens: 9999,
          output_tokens: 1,
          cache_creation_input_tokens: 1,
          cache_read_input_tokens: 1,
        },
      },
    },
  });

  assert.deepEqual(payload.context_window.current_usage, {
    input_tokens: 1000,
    output_tokens: 50,
    cache_creation_input_tokens: 25,
    cache_read_input_tokens: 75,
  });
  assert.equal(payload.context_window.used_percentage, 0.1);
  assert.equal(payload.context_window.remaining_percentage, 99.9);
});

test('ccstatusline bridge proxies enriched payload to downstream command', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hello2cc-ccstatusline-bridge-'));
  try {
    const transcriptPath = path.join(root, 'session.jsonl');
    const downstreamPath = path.join(root, 'downstream.mjs');

    writeFileSync(transcriptPath, makeUsageLine({
      timestamp: '2026-04-12T10:00:00.000Z',
      input: 1000,
      output: 50,
    }));

    writeFileSync(downstreamPath, [
      'import { readFileSync } from "node:fs";',
      'const payload = JSON.parse(readFileSync(0, "utf8"));',
      'process.stdout.write(JSON.stringify(payload.context_window));',
    ].join('\n'));

    const result = spawnSync(process.execPath, [bridgeScriptPath], {
      input: JSON.stringify({
        transcript_path: transcriptPath,
        context_window: {
          context_window_size: 200_000,
          current_usage: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          used_percentage: 0,
          remaining_percentage: 100,
        },
      }),
      encoding: 'utf8',
      env: {
        ...process.env,
        HELLO2CC_CCSTATUSLINE_COMMAND: `${quoteShellArg(process.execPath)} ${quoteShellArg(downstreamPath)}`,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      context_window_size: 200_000,
      current_usage: {
        input_tokens: 1000,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      total_input_tokens: 1000,
      total_output_tokens: 50,
      used_percentage: 0.5,
      remaining_percentage: 99.5,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
