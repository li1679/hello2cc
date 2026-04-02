import { existsSync, readFileSync } from 'node:fs';
import {
  deriveAgentCapabilities,
  deriveToolCapabilities,
  normalizeAgentTypes,
  normalizeToolNames,
} from './session-capabilities.mjs';

const COMMAND_NAME_PATTERN = /<command-name>(.*?)<\/command-name>/gi;
const SKILL_DISCOVERY_HEADER = 'Skills relevant to your task:';

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

function recordSessionId(record) {
  return String(record?.session_id || record?.sessionId || '').trim();
}

function isSessionSystemRecord(record, sessionId) {
  if (!record || record.type !== 'system') return false;
  if (sessionId && recordSessionId(record) && recordSessionId(record) !== sessionId) {
    return false;
  }

  return true;
}

function isSessionRecord(record, sessionId) {
  if (!record || typeof record !== 'object') return false;
  if (sessionId && recordSessionId(record) && recordSessionId(record) !== sessionId) {
    return false;
  }

  return true;
}

function normalizeName(value) {
  return String(value || '').trim().replace(/^\/+/, '');
}

function uniq(values) {
  return [...new Set(values.map(normalizeName).filter(Boolean))];
}

function collectStrings(value, seen = new WeakSet()) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  if (seen.has(value)) return [];

  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStrings(item, seen));
  }

  return Object.values(value).flatMap((item) => collectStrings(item, seen));
}

function extractCommandNames(text) {
  return [...String(text || '').matchAll(COMMAND_NAME_PATTERN)]
    .map((match) => normalizeName(match[1]))
    .filter(Boolean);
}

function extractSkillNamesFromText(text) {
  const normalized = String(text || '');
  const markerIndex = normalized.indexOf(SKILL_DISCOVERY_HEADER);
  if (markerIndex === -1) return [];

  return normalized
    .slice(markerIndex + SKILL_DISCOVERY_HEADER.length)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replace(/^- /, '').split(':')[0])
    .map(normalizeName)
    .filter(Boolean);
}

function extractAttachments(record) {
  const directAttachments = Array.isArray(record?.attachments) ? record.attachments : [];
  const messageAttachments = Array.isArray(record?.message?.attachments) ? record.message.attachments : [];
  const contentAttachments = Array.isArray(record?.message?.content)
    ? record.message.content.filter((item) => item && typeof item === 'object' && 'type' in item)
    : [];

  return [...directAttachments, ...messageAttachments, ...contentAttachments];
}

function interactionSnapshotFromRecord(record) {
  if (!record || typeof record !== 'object') return {};

  const textBlocks = collectStrings(record);
  const attachments = extractAttachments(record);
  const surfacedSkillNames = uniq([
    ...attachments
      .filter((attachment) => attachment?.type === 'skill_discovery')
      .flatMap((attachment) => Array.isArray(attachment.skills) ? attachment.skills.map((skill) => skill?.name) : []),
    ...textBlocks.flatMap(extractSkillNamesFromText),
  ]);
  const loadedCommandNames = uniq(textBlocks.flatMap(extractCommandNames));

  return {
    ...(surfacedSkillNames.length ? { surfacedSkillNames } : {}),
    ...(loadedCommandNames.length ? { loadedCommandNames } : {}),
  };
}

function sessionSnapshotFromRecord(record) {
  if (!record || typeof record !== 'object') return {};

  const mainModel = String(record.model || '').trim();
  const outputStyle = String(record.output_style || '').trim();
  const toolNames = normalizeToolNames(record.tools);
  const agentTypes = normalizeAgentTypes(record.agents);

  return {
    ...(mainModel ? { mainModel } : {}),
    ...(outputStyle ? { outputStyle } : {}),
    ...(toolNames.length ? { toolNames } : {}),
    ...(agentTypes.length ? { agentTypes } : {}),
    ...(toolNames.length ? deriveToolCapabilities(toolNames) : {}),
    ...(agentTypes.length ? deriveAgentCapabilities(agentTypes) : {}),
    ...interactionSnapshotFromRecord(record),
  };
}

function teamSnapshotFromRecord(record) {
  if (!record || typeof record !== 'object') return {};

  const teamName = String(record.teamName || record.team_name || '').trim();
  const agentName = String(record.agentName || record.agent_name || '').trim();

  return {
    ...(teamName ? { teamName } : {}),
    ...(agentName ? { agentName } : {}),
  };
}

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
      if (!isSessionRecord(record, String(sessionId || '').trim())) continue;

      const teamSnapshot = teamSnapshotFromRecord(record);
      if (Object.keys(teamSnapshot).length > 0) {
        best = {
          ...best,
          ...teamSnapshot,
        };
      }

      const interactionSnapshot = interactionSnapshotFromRecord(record);
      if (Object.keys(interactionSnapshot).length > 0) {
        best = {
          ...best,
          ...interactionSnapshot,
        };
      }

      if (!isSessionSystemRecord(record, String(sessionId || '').trim())) continue;

      const snapshot = sessionSnapshotFromRecord(record);
      if (Object.keys(snapshot).length === 0) continue;
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
