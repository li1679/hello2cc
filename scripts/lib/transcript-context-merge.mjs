import { uniq, uniqBy } from './transcript-context-utils.mjs';

function mergeNames(existing, next) {
  return uniq([
    ...(Array.isArray(existing) ? existing : []),
    ...(Array.isArray(next) ? next : []),
  ]);
}

function mergeEntries(existing, next, keyFn) {
  return uniqBy(
    [
      ...(Array.isArray(existing) ? existing : []),
      ...(Array.isArray(next) ? next : []),
    ],
    keyFn,
  );
}

function mergeNamedEntries(existing, next, removedNames = []) {
  const entries = new Map();

  for (const entry of Array.isArray(existing) ? existing : []) {
    const name = String(entry?.name || '').trim().toLowerCase();
    if (!name) continue;
    entries.set(name, entry);
  }

  for (const entry of Array.isArray(next) ? next : []) {
    const name = String(entry?.name || '').trim().toLowerCase();
    if (!name) continue;
    entries.set(name, entry);
  }

  for (const name of Array.isArray(removedNames) ? removedNames : []) {
    const normalized = String(name || '').trim().toLowerCase();
    if (!normalized) continue;
    entries.delete(normalized);
  }

  return [...entries.values()];
}

/**
 * Merges one transcript-derived snapshot into the running session context snapshot.
 */
export function mergeSnapshot(current, snapshot) {
  const next = {
    ...current,
    ...snapshot,
  };

  next.surfacedSkills = mergeEntries(
    current?.surfacedSkills,
    snapshot?.surfacedSkills,
    (entry) => entry?.name?.toLowerCase?.() || '',
  );
  next.surfacedSkillNames = mergeNames(current?.surfacedSkillNames, snapshot?.surfacedSkillNames);

  next.loadedCommands = mergeEntries(
    current?.loadedCommands,
    snapshot?.loadedCommands,
    (entry) => `${entry?.name?.toLowerCase?.() || ''}|${entry?.args || ''}|${entry?.isSkillFormat ? 'skill' : 'slash'}`,
  );
  next.loadedCommandNames = mergeNames(current?.loadedCommandNames, snapshot?.loadedCommandNames);

  next.workflowEntries = mergeEntries(
    current?.workflowEntries,
    snapshot?.workflowEntries,
    (entry) => entry?.name?.toLowerCase?.() || '',
  );
  next.workflowNames = mergeNames(current?.workflowNames, snapshot?.workflowNames);

  const surfacedAgentTypes = new Set(Array.isArray(current?.surfacedAgentTypes)
    ? current.surfacedAgentTypes
    : []);
  for (const type of Array.isArray(snapshot?.surfacedAgentTypes) ? snapshot.surfacedAgentTypes : []) {
    surfacedAgentTypes.add(type);
  }
  for (const type of Array.isArray(snapshot?.removedSurfacedAgentTypes) ? snapshot.removedSurfacedAgentTypes : []) {
    surfacedAgentTypes.delete(type);
  }
  if (surfacedAgentTypes.size > 0) {
    next.surfacedAgentTypes = [...surfacedAgentTypes];
  } else {
    delete next.surfacedAgentTypes;
  }

  const availableDeferredToolNames = new Set(Array.isArray(current?.availableDeferredToolNames)
    ? current.availableDeferredToolNames
    : []);
  for (const name of Array.isArray(snapshot?.availableDeferredToolNames) ? snapshot.availableDeferredToolNames : []) {
    availableDeferredToolNames.add(name);
  }
  for (const name of Array.isArray(snapshot?.removedDeferredToolNames) ? snapshot.removedDeferredToolNames : []) {
    availableDeferredToolNames.delete(name);
  }

  if (availableDeferredToolNames.size > 0) {
    next.availableDeferredToolNames = [...availableDeferredToolNames];
  } else {
    delete next.availableDeferredToolNames;
  }

  next.loadedDeferredToolNames = mergeNames(current?.loadedDeferredToolNames, snapshot?.loadedDeferredToolNames);
  next.mcpResources = mergeEntries(
    current?.mcpResources,
    snapshot?.mcpResources,
    (entry) => `${String(entry?.server || '').toLowerCase()}::${String(entry?.uri || '').toLowerCase()}`,
  );
  next.mcpInstructionEntries = mergeNamedEntries(
    current?.mcpInstructionEntries,
    snapshot?.mcpInstructionEntries,
    snapshot?.removedMcpInstructionNames,
  );

  if (snapshot?.attachedTeamContext && typeof snapshot.attachedTeamContext === 'object') {
    next.attachedTeamContext = {
      ...(current?.attachedTeamContext || {}),
      ...snapshot.attachedTeamContext,
    };
  }
  if (snapshot?.attachedPlanMode && typeof snapshot.attachedPlanMode === 'object') {
    next.attachedPlanMode = {
      ...(current?.attachedPlanMode || {}),
      ...snapshot.attachedPlanMode,
    };
  }
  if (snapshot?.attachedAutoMode && typeof snapshot.attachedAutoMode === 'object') {
    next.attachedAutoMode = {
      ...(current?.attachedAutoMode || {}),
      ...snapshot.attachedAutoMode,
    };
  }
  if (snapshot?.attachedSkillListing && typeof snapshot.attachedSkillListing === 'object') {
    next.attachedSkillListing = {
      ...(current?.attachedSkillListing || {}),
      ...snapshot.attachedSkillListing,
    };
  }
  if (Array.isArray(snapshot?.attachedRelevantMemories)) {
    next.attachedRelevantMemories = snapshot.attachedRelevantMemories;
  }
  if (snapshot?.attachedTeammateMailbox && typeof snapshot.attachedTeammateMailbox === 'object') {
    next.attachedTeammateMailbox = {
      ...(current?.attachedTeammateMailbox || {}),
      ...snapshot.attachedTeammateMailbox,
    };
  }

  if (!next.surfacedSkills?.length) delete next.surfacedSkills;
  if (!next.surfacedSkillNames?.length) delete next.surfacedSkillNames;
  if (!next.loadedCommands?.length) delete next.loadedCommands;
  if (!next.loadedCommandNames?.length) delete next.loadedCommandNames;
  if (!next.workflowEntries?.length) delete next.workflowEntries;
  if (!next.workflowNames?.length) delete next.workflowNames;
  if (!next.surfacedAgentTypes?.length) delete next.surfacedAgentTypes;
  if (!next.loadedDeferredToolNames?.length) delete next.loadedDeferredToolNames;
  if (!next.mcpResources?.length) delete next.mcpResources;
  if (!next.mcpInstructionEntries?.length) delete next.mcpInstructionEntries;
  if (!next.attachedRelevantMemories?.length) delete next.attachedRelevantMemories;
  if (!next.attachedSkillListing || !Object.keys(next.attachedSkillListing).length) delete next.attachedSkillListing;
  if (!next.attachedTeammateMailbox?.messages?.length) delete next.attachedTeammateMailbox;
  delete next.removedDeferredToolNames;
  delete next.removedSurfacedAgentTypes;
  delete next.removedMcpInstructionNames;

  return next;
}
