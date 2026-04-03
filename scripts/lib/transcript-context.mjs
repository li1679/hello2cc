import { existsSync, readFileSync } from 'node:fs';
import {
  interactionSnapshotFromRecord,
  sessionSnapshotFromRecord,
  teamSnapshotFromRecord,
} from './transcript-context-extractors.mjs';
import { mergeSnapshot } from './transcript-context-merge.mjs';
import {
  isSessionRecord,
  isSessionSystemRecord,
  normalizePath,
  parseJsonLine,
} from './transcript-context-utils.mjs';

/**
 * Extracts the best-effort session context snapshot from a Claude transcript file.
 */
export function extractSessionContextFromTranscript(transcriptPath, sessionId = '') {
  const path = normalizePath(transcriptPath);
  const normalizedSessionId = String(sessionId || '').trim();
  if (!path || !existsSync(path)) return {};

  try {
    const raw = readFileSync(path, 'utf8');
    const records = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(parseJsonLine)
      .filter(Boolean);

    let best = {};
    for (const record of records) {
      if (!isSessionRecord(record, normalizedSessionId)) continue;

      const teamSnapshot = teamSnapshotFromRecord(record);
      if (Object.keys(teamSnapshot).length > 0) {
        best = mergeSnapshot(best, teamSnapshot);
      }

      const interactionSnapshot = interactionSnapshotFromRecord(record);
      if (Object.keys(interactionSnapshot).length > 0) {
        best = mergeSnapshot(best, interactionSnapshot);
      }

      if (!isSessionSystemRecord(record, normalizedSessionId)) continue;

      const snapshot = sessionSnapshotFromRecord(record);
      if (Object.keys(snapshot).length === 0) continue;
      best = mergeSnapshot(best, snapshot);
    }

    return best;
  } catch {
    return {};
  }
}
