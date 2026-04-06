import {
  collectObjects,
  normalizeDescription,
  normalizeName,
  uniq,
  uniqBy,
} from './transcript-context-utils.mjs';
import { extractSkillEntriesFromListing } from './transcript-record-command-extractors.mjs';
import {
  extractAttachments,
  latestAttachmentOfType,
  normalizeAttachmentTeamContext,
  truncatePreview,
} from './transcript-record-shared.mjs';

const MCP_RESOURCE_UPDATE_PATTERN = /<mcp-resource-update\s+server="([^"]+)"\s+uri="([^"]+)"[^>]*>(?:[\s\S]*?<reason>([^<]*)<\/reason>)?/gi;

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

function normalizeRelevantMemoryEntry(entry) {
  const path = normalizeDescription(entry?.path);
  if (!path) return null;

  return {
    path,
    header: normalizeDescription(entry?.header),
    preview: truncatePreview(entry?.content, 220),
  };
}

function normalizeMailboxMessage(entry) {
  const from = normalizeName(entry?.from);
  const timestamp = normalizeDescription(entry?.timestamp);
  if (!from && !timestamp) return null;

  return {
    from,
    timestamp,
    summary: normalizeDescription(entry?.summary),
    preview: truncatePreview(entry?.text, 220),
  };
}

function normalizeMcpInstructionEntry(name, block) {
  const normalizedName = normalizeName(name);
  const normalizedBlock = normalizeDescription(block);
  if (!normalizedName || !normalizedBlock) {
    return null;
  }

  return {
    name: normalizedName,
    block: normalizedBlock,
  };
}

export function extractSkillListingAttachment(record) {
  const attachment = latestAttachmentOfType(record, 'skill_listing');
  if (!attachment) {
    return { skills: [], metadata: null };
  }

  const content = normalizeDescription(attachment?.content);
  const skills = extractSkillEntriesFromListing(content);
  const names = uniq(skills.map((entry) => entry.name));
  const skillCount = Number(attachment?.skillCount || 0) || skills.length;

  return {
    skills,
    metadata: {
      skillCount,
      isInitial: attachment?.isInitial || undefined,
      names,
      preview: truncatePreview(content, 240),
    },
  };
}

export function extractMcpResources(record, textBlocks = []) {
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

export function extractRelevantMemories(record) {
  const attachment = latestAttachmentOfType(record, 'relevant_memories');
  if (!attachment || !Array.isArray(attachment?.memories)) {
    return [];
  }

  return attachment.memories
    .map(normalizeRelevantMemoryEntry)
    .filter(Boolean);
}

export function extractTeammateMailbox(record) {
  const attachment = latestAttachmentOfType(record, 'teammate_mailbox');
  if (!attachment || !Array.isArray(attachment?.messages)) {
    return [];
  }

  return attachment.messages
    .map(normalizeMailboxMessage)
    .filter(Boolean);
}

export function extractMcpInstructionDelta(record) {
  const attachments = extractAttachments(record)
    .filter((attachment) => attachment?.type === 'mcp_instructions_delta');

  const entries = [];
  const removedNames = [];

  for (const attachment of attachments) {
    const names = Array.isArray(attachment?.addedNames) ? attachment.addedNames : [];
    const blocks = Array.isArray(attachment?.addedBlocks) ? attachment.addedBlocks : [];

    for (let index = 0; index < Math.max(names.length, blocks.length); index += 1) {
      const entry = normalizeMcpInstructionEntry(names[index], blocks[index]);
      if (entry) entries.push(entry);
    }

    for (const name of Array.isArray(attachment?.removedNames) ? attachment.removedNames : []) {
      const normalizedName = normalizeName(name);
      if (normalizedName) removedNames.push(normalizedName);
    }
  }

  return {
    entries: uniqBy(entries, (entry) => entry.name.toLowerCase()),
    removedNames: uniq(removedNames),
  };
}

export function extractAttachmentSignals(record) {
  const outputStyleAttachment = latestAttachmentOfType(record, 'output_style');
  const criticalReminderAttachment = latestAttachmentOfType(record, 'critical_system_reminder');
  const teamContextAttachment = latestAttachmentOfType(record, 'team_context');
  const skillListingAttachment = extractSkillListingAttachment(record);
  const relevantMemories = extractRelevantMemories(record);
  const teammateMailbox = extractTeammateMailbox(record);
  const reversedAttachments = [...extractAttachments(record)].reverse();
  const planModeAttachment = reversedAttachments
    .find((attachment) => ['plan_mode', 'plan_mode_reentry', 'plan_mode_exit'].includes(String(attachment?.type || '')));
  const autoModeAttachment = reversedAttachments
    .find((attachment) => ['auto_mode', 'auto_mode_exit'].includes(String(attachment?.type || '')));
  const normalizedTeamContext = normalizeAttachmentTeamContext(teamContextAttachment);

  return {
    ...(normalizeDescription(outputStyleAttachment?.style) ? {
      attachedOutputStyle: normalizeDescription(outputStyleAttachment.style),
    } : {}),
    ...(normalizeDescription(criticalReminderAttachment?.content) ? {
      criticalSystemReminder: normalizeDescription(criticalReminderAttachment.content),
    } : {}),
    ...(skillListingAttachment.metadata ? {
      attachedSkillListing: skillListingAttachment.metadata,
    } : {}),
    ...(relevantMemories.length ? {
      attachedRelevantMemories: relevantMemories,
    } : {}),
    ...(teammateMailbox.length ? {
      attachedTeammateMailbox: {
        messages: teammateMailbox,
      },
    } : {}),
    ...(normalizedTeamContext ? {
      attachedTeamContext: normalizedTeamContext,
    } : {}),
    ...(planModeAttachment ? {
      attachedPlanMode: {
        active: planModeAttachment.type !== 'plan_mode_exit',
        ...(normalizeDescription(planModeAttachment?.planFilePath) ? { planFilePath: normalizeDescription(planModeAttachment.planFilePath) } : {}),
        ...(planModeAttachment.type === 'plan_mode_reentry' ? { reentry: true } : {}),
        ...(planModeAttachment.type === 'plan_mode_exit' ? { exited: true } : {}),
        ...(typeof planModeAttachment?.planExists === 'boolean' ? { planExists: planModeAttachment.planExists } : {}),
      },
    } : {}),
    ...(autoModeAttachment ? {
      attachedAutoMode: {
        active: autoModeAttachment.type !== 'auto_mode_exit',
        ...(normalizeDescription(autoModeAttachment?.reminderType) ? { reminderType: normalizeDescription(autoModeAttachment.reminderType) } : {}),
        ...(autoModeAttachment.type === 'auto_mode_exit' ? { exited: true } : {}),
      },
    } : {}),
  };
}
