import { compactState, trimmed, truncatePreview, uniqueStrings } from './host-state-shared.mjs';

function relevantMemoryAttachmentState(sessionContext = {}) {
  const memories = Array.isArray(sessionContext?.attachedRelevantMemories)
    ? sessionContext.attachedRelevantMemories
    : [];
  if (!memories.length) return undefined;

  return compactState({
    count: memories.length,
    items: memories.slice(0, 4).map((memory) => compactState({
      path: trimmed(memory?.path) || undefined,
      header: trimmed(memory?.header) || undefined,
      preview: truncatePreview(memory?.preview || ''),
    })),
  });
}

function teammateMailboxAttachmentState(sessionContext = {}) {
  const messages = Array.isArray(sessionContext?.attachedTeammateMailbox?.messages)
    ? sessionContext.attachedTeammateMailbox.messages
    : [];
  if (!messages.length) return undefined;

  return compactState({
    message_count: messages.length,
    messages: messages.slice(0, 4).map((message) => compactState({
      from: trimmed(message?.from) || undefined,
      timestamp: trimmed(message?.timestamp) || undefined,
      summary: trimmed(message?.summary) || undefined,
      preview: truncatePreview(message?.preview || ''),
    })),
  });
}

function skillListingAttachmentState(sessionContext = {}) {
  const listing = sessionContext?.attachedSkillListing;
  if (!listing || typeof listing !== 'object') return undefined;

  return compactState({
    skill_count: Number(listing?.skillCount || 0) || undefined,
    initial: listing?.isInitial || undefined,
    names: uniqueStrings(listing?.names),
    preview: truncatePreview(listing?.preview || '', 220),
  });
}

function mcpInstructionAttachmentState(sessionContext = {}) {
  const entries = Array.isArray(sessionContext?.mcpInstructionEntries)
    ? sessionContext.mcpInstructionEntries
    : [];
  if (!entries.length) return undefined;

  return compactState({
    server_names: uniqueStrings(entries.map((entry) => entry?.name)),
    blocks: entries.slice(0, 4).map((entry) => compactState({
      name: trimmed(entry?.name) || undefined,
      preview: truncatePreview(entry?.block || '', 220),
    })),
  });
}

export function attachmentState(sessionContext = {}) {
  return compactState({
    output_style: trimmed(sessionContext?.attachedOutputStyle) || undefined,
    critical_system_reminder: sessionContext?.criticalSystemReminder
      ? {
        active: true,
        preview: truncatePreview(sessionContext.criticalSystemReminder),
      }
      : undefined,
    skill_listing: skillListingAttachmentState(sessionContext),
    relevant_memories: relevantMemoryAttachmentState(sessionContext),
    teammate_mailbox: teammateMailboxAttachmentState(sessionContext),
    mcp_instructions: mcpInstructionAttachmentState(sessionContext),
    plan_mode: sessionContext?.attachedPlanMode && typeof sessionContext.attachedPlanMode === 'object'
      ? compactState({
        active: sessionContext.attachedPlanMode.active,
        plan_file_path: trimmed(sessionContext.attachedPlanMode.planFilePath) || undefined,
        reentry: sessionContext.attachedPlanMode.reentry || undefined,
        exited: sessionContext.attachedPlanMode.exited || undefined,
        plan_exists: typeof sessionContext.attachedPlanMode.planExists === 'boolean'
          ? sessionContext.attachedPlanMode.planExists
          : undefined,
      })
      : undefined,
    auto_mode: sessionContext?.attachedAutoMode && typeof sessionContext.attachedAutoMode === 'object'
      ? compactState({
        active: sessionContext.attachedAutoMode.active,
        reminder_type: trimmed(sessionContext.attachedAutoMode.reminderType) || undefined,
        exited: sessionContext.attachedAutoMode.exited || undefined,
      })
      : undefined,
    team_context: sessionContext?.attachedTeamContext && typeof sessionContext.attachedTeamContext === 'object'
      ? compactState({
        team: trimmed(sessionContext.attachedTeamContext.teamName) || undefined,
        agent: trimmed(sessionContext.attachedTeamContext.agentName) || undefined,
        team_config_path: trimmed(sessionContext.attachedTeamContext.teamConfigPath) || undefined,
        task_list_path: trimmed(sessionContext.attachedTeamContext.taskListPath) || undefined,
      })
      : undefined,
  });
}
