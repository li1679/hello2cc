#!/usr/bin/env node
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

async function main() {
  const rawInput = readStdinRaw();
  if (!rawInput.trim()) {
    process.stdout.write(rawInput);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawInput);
  } catch {
    process.stdout.write(rawInput);
    return;
  }

  try {
    const transcriptMetrics = await readStatuslineTranscriptMetrics(payload?.transcript_path, {
      includeSubagents: true,
    });
    const enrichedPayload = enrichStatuslinePayload(payload, transcriptMetrics);
    process.stdout.write(JSON.stringify(enrichedPayload));
  } catch {
    process.stdout.write(rawInput);
  }
}

await main();
