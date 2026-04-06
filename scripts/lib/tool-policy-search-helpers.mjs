function trimmed(value) {
  return String(value || '').trim();
}

/**
 * ToolSearch supports an explicit `select:name1,name2` compatibility form so
 * the host can verify that the requested deferred tools were already surfaced.
 */
export function directToolSearchSelectionTargets(query) {
  const normalized = trimmed(query);
  const match = normalized.match(/^select:(.+)$/i);
  if (!match) return [];

  return match[1]
    .split(',')
    .map((value) => trimmed(value))
    .filter(Boolean);
}

/**
 * Loaded tools count as already available and should not be rediscovered.
 */
export function isAlreadyLoadedTool(sessionContext = {}, toolName) {
  const normalizedToolName = trimmed(toolName).toLowerCase();
  if (!normalizedToolName) return false;

  const buckets = [
    sessionContext?.toolNames,
    sessionContext?.loadedDeferredToolNames,
  ];

  return buckets.some((values) => (Array.isArray(values) ? values : [])
    .some((value) => trimmed(value).toLowerCase() === normalizedToolName));
}

/**
 * Surfaced deferred tools are the only safe ToolSearch select targets.
 */
export function isSurfacedDeferredTool(sessionContext = {}, toolName) {
  const normalizedToolName = trimmed(toolName).toLowerCase();
  if (!normalizedToolName) return false;

  return (Array.isArray(sessionContext?.availableDeferredToolNames) ? sessionContext.availableDeferredToolNames : [])
    .some((value) => trimmed(value).toLowerCase() === normalizedToolName);
}
