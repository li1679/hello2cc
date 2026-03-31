import { existsSync, readFileSync } from 'node:fs';

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function normalizePath(path) {
  return String(path || '').trim();
}

function isSessionSystemRecord(record, sessionId) {
  if (!record || record.type !== 'system') return false;
  if (sessionId && String(record.session_id || '').trim() && String(record.session_id || '').trim() !== sessionId) {
    return false;
  }

  return true;
}

function sessionSnapshotFromRecord(record) {
  if (!record || typeof record !== 'object') return {};

  const mainModel = String(record.model || '').trim();
  const outputStyle = String(record.output_style || '').trim();
  const toolNames = Array.isArray(record.tools)
    ? record.tools.map((tool) => String(tool || '').trim()).filter(Boolean)
    : [];
  const agentTypes = Array.isArray(record.agents)
    ? record.agents.map((agent) => String(agent || '').trim()).filter(Boolean)
    : [];

  const toolSearchAvailable = toolNames.includes('ToolSearch');
  const teamCreateAvailable = toolNames.includes('TeamCreate');
  const taskToolAvailable = toolNames.includes('Task') || toolNames.includes('TaskCreate');
  const claudeCodeGuideAvailable = agentTypes.includes('claude-code-guide');

  return {
    ...(mainModel ? { mainModel } : {}),
    ...(outputStyle ? { outputStyle } : {}),
    ...(toolNames.length ? { toolNames } : {}),
    ...(agentTypes.length ? { agentTypes } : {}),
    ...(toolNames.length ? { toolSearchAvailable, teamCreateAvailable, taskToolAvailable } : {}),
    ...(agentTypes.length ? { claudeCodeGuideAvailable } : {}),
  };
}

/**
 * Extract the latest observable session context from a Claude Code transcript.
 */
export function extractSessionContextFromTranscript(transcriptPath, sessionId = '') {
  const path = normalizePath(transcriptPath);
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
      if (!isSessionSystemRecord(record, String(sessionId || '').trim())) continue;

      const snapshot = sessionSnapshotFromRecord(record);
      if (!snapshot.mainModel && !snapshot.outputStyle) continue;
      best = {
        ...best,
        ...snapshot,
      };
    }

    return best;
  } catch {
    return {};
  }
}
