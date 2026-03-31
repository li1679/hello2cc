#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMPATIBLE_ORCHESTRATOR_COMMANDS = new Map([
  ['inject', 'session-start'],
  ['route', 'route'],
  ['pre-agent-model', 'pre-agent-model'],
  ['config-change', 'config-change'],
]);

const HOOK_NOOP_COMMANDS = new Set(['stop', 'pre-compact']);
const NOTIFY_NOOP_COMMANDS = new Set(['codex-notify', 'desktop', 'complete']);

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function writeSuppressOutput() {
  process.stdout.write(JSON.stringify({ suppressOutput: true }));
}

function runOrchestrator(mappedCommand) {
  const scriptPath = join(dirname(fileURLToPath(import.meta.url)), 'orchestrator.mjs');
  const result = spawnSync(process.execPath, [scriptPath, mappedCommand], {
    encoding: 'utf8',
    input: readStdin(),
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  process.exit(result.status ?? 0);
}

const cmd = String(process.argv[2] || '').trim();
const mappedCommand = COMPATIBLE_ORCHESTRATOR_COMMANDS.get(cmd);

if (mappedCommand) {
  runOrchestrator(mappedCommand);
}

if (HOOK_NOOP_COMMANDS.has(cmd)) {
  writeSuppressOutput();
  process.exit(0);
}

if (NOTIFY_NOOP_COMMANDS.has(cmd)) {
  process.exit(0);
}

if (!cmd) {
  writeSuppressOutput();
  process.exit(0);
}

process.exit(0);
