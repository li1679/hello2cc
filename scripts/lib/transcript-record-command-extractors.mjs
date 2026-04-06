import {
  collectObjects,
  normalizeCommandArgs,
  normalizeDescription,
  normalizeName,
  uniq,
  uniqBy,
} from './transcript-context-utils.mjs';
import { extractAttachments } from './transcript-record-shared.mjs';

const COMMAND_NAME_PATTERN = /<command-name>(.*?)<\/command-name>/gi;
const COMMAND_MESSAGE_PATTERN = /<command-message>(.*?)<\/command-message>/gi;
const COMMAND_ARGS_PATTERN = /<command-args>([\s\S]*?)<\/command-args>/i;
const SKILL_FORMAT_PATTERN = /<skill-format>(.*?)<\/skill-format>/i;
const SKILL_DISCOVERY_HEADER = 'Skills relevant to your task:';

export function extractCommandEntries(text) {
  const source = String(text || '');
  const args = normalizeCommandArgs(source.match(COMMAND_ARGS_PATTERN)?.[1]);
  const isSkillFormat = String(source.match(SKILL_FORMAT_PATTERN)?.[1] || '').trim().toLowerCase() === 'true';

  const fromPattern = (pattern, sourceTag) => [...source.matchAll(pattern)]
    .map((match) => ({
      name: normalizeName(match[1]),
      args,
      isSkillFormat,
      source: sourceTag,
    }))
    .filter((entry) => entry.name);

  return uniqBy(
    [
      ...fromPattern(COMMAND_NAME_PATTERN, 'command-name'),
      ...fromPattern(COMMAND_MESSAGE_PATTERN, 'command-message'),
    ],
    (entry) => `${entry.name.toLowerCase()}|${entry.args}|${entry.isSkillFormat ? 'skill' : 'slash'}`,
  );
}

export function extractSkillEntriesFromText(text) {
  const normalized = String(text || '');
  const markerIndex = normalized.indexOf(SKILL_DISCOVERY_HEADER);
  if (markerIndex === -1) return { names: [], skills: [] };

  const skills = normalized
    .slice(markerIndex + SKILL_DISCOVERY_HEADER.length)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replace(/^- /, ''))
    .map((line) => {
      const [name, ...rest] = line.split(':');
      return {
        name: normalizeName(name),
        description: normalizeDescription(rest.join(':')),
      };
    })
    .filter((entry) => entry.name);

  return {
    names: skills.map((skill) => skill.name),
    skills,
  };
}

export function extractSkillEntriesFromListing(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''))
    .map((line) => {
      const delimiter = line.includes(':') ? ':' : (line.includes(' - ') ? ' - ' : '');
      const [name, ...rest] = delimiter ? line.split(delimiter) : [line];
      return {
        name: normalizeName(name),
        description: normalizeDescription(rest.join(delimiter || '')),
      };
    })
    .filter((entry) => entry.name);
}

export function extractToolReferenceNames(record) {
  return uniq(
    collectObjects(
      record,
      (value) => value?.type === 'tool_reference' && typeof value?.tool_name === 'string',
    ).map((value) => value.tool_name),
  );
}

export function extractDeferredToolDelta(record) {
  const attachments = extractAttachments(record)
    .filter((attachment) => attachment?.type === 'deferred_tools_delta');

  return {
    addedNames: uniq(attachments.flatMap((attachment) => Array.isArray(attachment.addedNames) ? attachment.addedNames : [])),
    removedNames: uniq(attachments.flatMap((attachment) => Array.isArray(attachment.removedNames) ? attachment.removedNames : [])),
  };
}

export function extractAgentListingDelta(record) {
  const attachments = extractAttachments(record)
    .filter((attachment) => attachment?.type === 'agent_listing_delta');

  return {
    addedTypes: uniq(attachments.flatMap((attachment) => Array.isArray(attachment.addedTypes) ? attachment.addedTypes : [])),
    removedTypes: uniq(attachments.flatMap((attachment) => Array.isArray(attachment.removedTypes) ? attachment.removedTypes : [])),
  };
}
