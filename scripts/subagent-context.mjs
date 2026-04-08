#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { shouldEmitAdditionalContext } from './lib/config.mjs';
import { parseTeammateIdentity } from './lib/subagent-state-helpers.mjs';
import { buildContext } from './lib/subagent-context-builders.mjs';

const cmd = process.argv[2] || '';

function readStdinJson() {
  try {
    const raw = readFileSync(0, 'utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeJson(additionalContext) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
      additionalContext,
    },
    suppressOutput: true,
  }));
}

function writeSuppress() {
  process.stdout.write(JSON.stringify({ suppressOutput: true }));
}

const payload = readStdinJson();
const teammateIdentity = parseTeammateIdentity(payload);

switch (cmd) {
  case 'explore':
    if (!shouldEmitAdditionalContext()) {
      writeSuppress();
      break;
    }
    writeJson(buildContext('explore', teammateIdentity, payload));
    break;
  case 'plan':
    if (!shouldEmitAdditionalContext()) {
      writeSuppress();
      break;
    }
    writeJson(buildContext('plan', teammateIdentity, payload));
    break;
  case 'general':
    if (!shouldEmitAdditionalContext()) {
      writeSuppress();
      break;
    }
    writeJson(buildContext('general', teammateIdentity, payload));
    break;
  default:
    process.stderr.write(`subagent-context.mjs: unknown command "${cmd}"\n`);
    process.exit(1);
}
