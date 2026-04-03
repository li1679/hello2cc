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

  if (!next.surfacedSkills?.length) delete next.surfacedSkills;
  if (!next.surfacedSkillNames?.length) delete next.surfacedSkillNames;
  if (!next.loadedCommands?.length) delete next.loadedCommands;
  if (!next.loadedCommandNames?.length) delete next.loadedCommandNames;
  if (!next.workflowEntries?.length) delete next.workflowEntries;
  if (!next.workflowNames?.length) delete next.workflowNames;
  if (!next.loadedDeferredToolNames?.length) delete next.loadedDeferredToolNames;
  if (!next.mcpResources?.length) delete next.mcpResources;
  delete next.removedDeferredToolNames;

  return next;
}
