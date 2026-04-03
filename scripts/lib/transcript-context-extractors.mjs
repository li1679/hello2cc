import {
  deriveAgentCapabilities,
  deriveToolCapabilities,
  normalizeAgentTypes,
  normalizeToolNames,
} from './session-capabilities.mjs';
import {
  collectObjects,
  collectStrings,
  normalizeCommandArgs,
  normalizeDescription,
  normalizeName,
  uniq,
  uniqBy,
} from './transcript-context-utils.mjs';

const COMMAND_NAME_PATTERN = /<command-name>(.*?)<\/command-name>/gi;
const COMMAND_MESSAGE_PATTERN = /<command-message>(.*?)<\/command-message>/gi;
const COMMAND_ARGS_PATTERN = /<command-args>([\s\S]*?)<\/command-args>/i;
const SKILL_FORMAT_PATTERN = /<skill-format>(.*?)<\/skill-format>/i;
const SKILL_DISCOVERY_HEADER = 'Skills relevant to your task:';
const MCP_RESOURCE_UPDATE_PATTERN = /<mcp-resource-update\s+server="([^"]+)"\s+uri="([^"]+)"[^>]*>(?:[\s\S]*?<reason>([^<]*)<\/reason>)?/gi;

function extractCommandEntries(text) {
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

function extractSkillEntriesFromText(text) {
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

function extractAttachments(record) {
  const directAttachments = Array.isArray(record?.attachments) ? record.attachments : [];
  const messageAttachments = Array.isArray(record?.message?.attachments) ? record.message.attachments : [];
  const contentAttachments = Array.isArray(record?.message?.content)
    ? record.message.content.filter((item) => item && typeof item === 'object' && 'type' in item)
    : [];

  return [...directAttachments, ...messageAttachments, ...contentAttachments];
}

function extractToolReferenceNames(record) {
  return uniq(
    collectObjects(
      record,
      (value) => value?.type === 'tool_reference' && typeof value?.tool_name === 'string',
    ).map((value) => value.tool_name),
  );
}

function extractDeferredToolDelta(record) {
  const attachments = extractAttachments(record)
    .filter((attachment) => attachment?.type === 'deferred_tools_delta');

  return {
    addedNames: uniq(attachments.flatMap((attachment) => Array.isArray(attachment.addedNames) ? attachment.addedNames : [])),
    removedNames: uniq(attachments.flatMap((attachment) => Array.isArray(attachment.removedNames) ? attachment.removedNames : [])),
  };
}

function normalizeMcpResourceEntry(entry) {
  const server = String(entry?.server || '').trim();
  const uri = String(entry?.uri || '').trim();

  if (!server || !uri) return null;

  return {
    server,
    uri,
    name: String(entry?.name || uri).trim(),
    ...(normalizeDescription(entry?.description) ? { description: normalizeDescription(entry?.description) } : {}),
  };
}

function extractMcpResources(record, textBlocks = []) {
  const attachmentResources = extractAttachments(record)
    .filter((attachment) => attachment?.type === 'mcp_resource')
    .map(normalizeMcpResourceEntry)
    .filter(Boolean);

  const objectResources = collectObjects(
    record,
    (value) => (
      value &&
      typeof value === 'object' &&
      typeof value.server === 'string' &&
      typeof value.uri === 'string' &&
      (value.type === 'mcp_resource' || 'name' in value || 'mimeType' in value)
    ),
  )
    .map(normalizeMcpResourceEntry)
    .filter(Boolean);

  const textResources = textBlocks.flatMap((text) => [...String(text || '').matchAll(MCP_RESOURCE_UPDATE_PATTERN)]
    .map((match) => normalizeMcpResourceEntry({
      server: match[1],
      uri: match[2],
      name: match[2],
      description: match[3],
    }))
    .filter(Boolean));

  return uniqBy(
    [
      ...attachmentResources,
      ...objectResources,
      ...textResources,
    ],
    (entry) => `${entry.server.toLowerCase()}::${entry.uri.toLowerCase()}`,
  );
}

function extractWorkflowEntries(record) {
  if (
    record?.type !== 'system' ||
    String(record?.subtype || '').trim() !== 'task_started' ||
    String(record?.task_type || '').trim() !== 'local_workflow'
  ) {
    return [];
  }

  const name = normalizeName(record?.workflow_name);
  if (!name) return [];

  return [{
    name,
    ...(normalizeDescription(record?.description) ? { description: normalizeDescription(record.description) } : {}),
    ...(normalizeDescription(record?.prompt) ? { prompt: normalizeDescription(record.prompt) } : {}),
  }];
}

export function interactionSnapshotFromRecord(record) {
  if (!record || typeof record !== 'object') return {};

  const textBlocks = collectStrings(record);
  const attachments = extractAttachments(record);
  const surfacedSkillEntries = uniqBy([
    ...attachments
      .filter((attachment) => attachment?.type === 'skill_discovery')
      .flatMap((attachment) => Array.isArray(attachment.skills)
        ? attachment.skills.map((skill) => ({
          name: normalizeName(skill?.name),
          description: normalizeDescription(skill?.description),
        }))
        : []),
    ...textBlocks.flatMap((text) => extractSkillEntriesFromText(text).skills),
  ], (entry) => entry.name.toLowerCase());
  const loadedCommands = uniqBy(
    textBlocks.flatMap(extractCommandEntries),
    (entry) => `${entry.name.toLowerCase()}|${entry.args}|${entry.isSkillFormat ? 'skill' : 'slash'}`,
  );
  const workflowEntries = uniqBy(
    extractWorkflowEntries(record),
    (entry) => entry.name.toLowerCase(),
  );
  const deferredToolDelta = extractDeferredToolDelta(record);
  const loadedDeferredToolNames = extractToolReferenceNames(record);
  const mcpResources = extractMcpResources(record, textBlocks);

  return {
    ...(surfacedSkillEntries.length ? {
      surfacedSkills: surfacedSkillEntries,
      surfacedSkillNames: surfacedSkillEntries.map((entry) => entry.name),
    } : {}),
    ...(loadedCommands.length ? {
      loadedCommands,
      loadedCommandNames: uniq(loadedCommands.map((entry) => entry.name)),
    } : {}),
    ...(workflowEntries.length ? {
      workflowEntries,
      workflowNames: uniq(workflowEntries.map((entry) => entry.name)),
    } : {}),
    ...(deferredToolDelta.addedNames.length ? { availableDeferredToolNames: deferredToolDelta.addedNames } : {}),
    ...(deferredToolDelta.removedNames.length ? { removedDeferredToolNames: deferredToolDelta.removedNames } : {}),
    ...(loadedDeferredToolNames.length ? { loadedDeferredToolNames } : {}),
    ...(mcpResources.length ? { mcpResources } : {}),
  };
}

export function sessionSnapshotFromRecord(record) {
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

export function teamSnapshotFromRecord(record) {
  if (!record || typeof record !== 'object') return {};

  const teamName = String(record.teamName || record.team_name || '').trim();
  const agentName = String(record.agentName || record.agent_name || '').trim();

  return {
    ...(teamName ? { teamName } : {}),
    ...(agentName ? { agentName } : {}),
  };
}
