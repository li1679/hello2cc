#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

import {
  enrichStatuslinePayload,
  readStatuslineTranscriptMetrics,
} from './lib/statusline-bridge-metrics.mjs';

function readStdinRaw() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

async function enrichRawPayload(rawInput) {
  if (!rawInput.trim()) {
    return rawInput;
  }

  let payload;
  try {
    payload = JSON.parse(rawInput);
  } catch {
    return rawInput;
  }

  try {
    const transcriptMetrics = await readStatuslineTranscriptMetrics(payload?.transcript_path, {
      includeSubagents: true,
    });
    return JSON.stringify(enrichStatuslinePayload(payload, transcriptMetrics));
  } catch {
    return rawInput;
  }
}

function downstreamCommand() {
  const argvCommand = process.argv.slice(2).join(' ').trim();
  if (argvCommand) return argvCommand;

  const envCommand = String(process.env.HELLO2CC_CCSTATUSLINE_COMMAND || '').trim();
  if (envCommand) return envCommand;

  return 'npx -y ccstatusline@latest';
}

function runDownstream(command, stdinText) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: ['pipe', 'pipe', 'inherit'],
      windowsHide: true,
    });

    child.on('error', reject);
    child.on('close', (code) => resolve(code));
    child.stdin.on('error', () => {});
    child.stdout.pipe(process.stdout);
    child.stdin.end(stdinText);
  });
}

async function main() {
  const enrichedInput = await enrichRawPayload(readStdinRaw());
  const exitCode = await runDownstream(downstreamCommand(), enrichedInput);
  process.exit(typeof exitCode === 'number' ? exitCode : 1);
}

await main();
