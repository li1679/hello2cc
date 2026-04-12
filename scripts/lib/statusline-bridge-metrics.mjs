import { readFile } from 'node:fs/promises';
import path from 'node:path';

function trimmed(value) {
  return String(value || '').trim();
}

function finiteNumberOrNull(value) {
  const numberValue = typeof value === 'string' && value.trim()
    ? Number(value)
    : value;

  return Number.isFinite(numberValue) ? Number(numberValue) : null;
}

function numericOrZero(value) {
  return finiteNumberOrNull(value) ?? 0;
}

function positiveNumberOrNull(value) {
  const numberValue = finiteNumberOrNull(value);
  return numberValue && numberValue > 0 ? numberValue : null;
}

function parseJsonLine(line) {
  const raw = trimmed(line);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseTimestampMs(value) {
  const stamp = trimmed(value);
  if (!stamp) return null;

  const time = new Date(stamp).getTime();
  return Number.isFinite(time) ? time : null;
}

const SUBAGENT_ID_KEYS = new Set([
  'agentId',
  'agent_id',
]);

const SUBAGENT_TRANSCRIPT_PATH_KEYS = new Set([
  'agentTranscriptPath',
  'agent_transcript_path',
]);

function addTrimmedString(targetSet, value) {
  const nextValue = trimmed(value);
  if (nextValue) {
    targetSet.add(nextValue);
  }
}

function collectSubagentReferences(value, references) {
  if (!value || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    for (const item of value) {
      collectSubagentReferences(item, references);
    }
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (SUBAGENT_ID_KEYS.has(key)) {
      addTrimmedString(references.agentIds, nestedValue);
    }

    if (SUBAGENT_TRANSCRIPT_PATH_KEYS.has(key)) {
      addTrimmedString(references.transcriptPaths, nestedValue);
    }

    if (key === 'agent' && nestedValue && typeof nestedValue === 'object' && !Array.isArray(nestedValue)) {
      addTrimmedString(references.agentIds, nestedValue.id);
      addTrimmedString(references.transcriptPaths, nestedValue.transcriptPath);
      addTrimmedString(references.transcriptPaths, nestedValue.transcript_path);
    }

    collectSubagentReferences(nestedValue, references);
  }
}

function collectReferencedSubagentReferences(entries = []) {
  const references = {
    agentIds: new Set(),
    transcriptPaths: new Set(),
  };

  for (const entry of Array.isArray(entries) ? entries : []) {
    collectSubagentReferences(entry, references);
  }

  return references;
}

export function collectReferencedSubagentIds(entries = []) {
  return collectReferencedSubagentReferences(entries).agentIds;
}

export function collectReferencedSubagentTranscriptPaths(entries = []) {
  return collectReferencedSubagentReferences(entries).transcriptPaths;
}

function getUsage(entry) {
  return entry?.message?.usage && typeof entry.message.usage === 'object'
    ? entry.message.usage
    : null;
}

function selectStreamingEntries(entries = []) {
  const usageEntries = [];
  let hasStopReasonField = false;

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!getUsage(entry)) continue;
    usageEntries.push(entry);
    if (entry?.message && Object.hasOwn(entry.message, 'stop_reason')) {
      hasStopReasonField = true;
    }
  }

  if (!hasStopReasonField) {
    return usageEntries;
  }

  return usageEntries.filter((entry, index) => {
    const stopReason = entry?.message?.stop_reason;
    return Boolean(stopReason) || (stopReason === null && index === usageEntries.length - 1);
  });
}

function emptyMetrics() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    latestMainUsageEntry: null,
    latestMainUsageTimestampMs: null,
    latestAnyUsageEntry: null,
    latestAnyUsageTimestampMs: null,
  };
}

function collectMetricsFromEntries(entries = []) {
  const metrics = emptyMetrics();

  for (const entry of selectStreamingEntries(entries)) {
    const usage = getUsage(entry);
    if (!usage) continue;

    metrics.inputTokens += numericOrZero(usage.input_tokens);
    metrics.outputTokens += numericOrZero(usage.output_tokens);
    metrics.cachedTokens += numericOrZero(usage.cache_read_input_tokens);
    metrics.cachedTokens += numericOrZero(usage.cache_creation_input_tokens);

    if (entry?.isApiErrorMessage) continue;

    const timestampMs = parseTimestampMs(entry?.timestamp);
    if (timestampMs === null) continue;

    if (metrics.latestAnyUsageTimestampMs === null || timestampMs > metrics.latestAnyUsageTimestampMs) {
      metrics.latestAnyUsageTimestampMs = timestampMs;
      metrics.latestAnyUsageEntry = entry;
    }

    if (entry?.isSidechain !== true && (metrics.latestMainUsageTimestampMs === null || timestampMs > metrics.latestMainUsageTimestampMs)) {
      metrics.latestMainUsageTimestampMs = timestampMs;
      metrics.latestMainUsageEntry = entry;
    }
  }

  return metrics;
}

function mergeMetrics(parts = []) {
  const merged = emptyMetrics();

  for (const part of Array.isArray(parts) ? parts : []) {
    if (!part || typeof part !== 'object') continue;

    merged.inputTokens += numericOrZero(part.inputTokens);
    merged.outputTokens += numericOrZero(part.outputTokens);
    merged.cachedTokens += numericOrZero(part.cachedTokens);

    if (
      Number.isFinite(part.latestAnyUsageTimestampMs)
      && (merged.latestAnyUsageTimestampMs === null || part.latestAnyUsageTimestampMs > merged.latestAnyUsageTimestampMs)
    ) {
      merged.latestAnyUsageTimestampMs = part.latestAnyUsageTimestampMs;
      merged.latestAnyUsageEntry = part.latestAnyUsageEntry || null;
    }

    if (
      Number.isFinite(part.latestMainUsageTimestampMs)
      && (merged.latestMainUsageTimestampMs === null || part.latestMainUsageTimestampMs > merged.latestMainUsageTimestampMs)
    ) {
      merged.latestMainUsageTimestampMs = part.latestMainUsageTimestampMs;
      merged.latestMainUsageEntry = part.latestMainUsageEntry || null;
    }
  }

  return merged;
}

async function readTranscriptEntries(transcriptPath) {
  const fileContent = await readFile(transcriptPath, 'utf8');
  return fileContent
    .split(/\r?\n/u)
    .map(parseJsonLine)
    .filter(Boolean);
}

function resolveReferencedTranscriptPath(transcriptPath, referencedPath) {
  const nextPath = trimmed(referencedPath);
  if (!nextPath) return null;

  if (!trimmed(transcriptPath)) {
    return path.normalize(nextPath);
  }

  return path.isAbsolute(nextPath)
    ? path.normalize(nextPath)
    : path.resolve(path.dirname(transcriptPath), nextPath);
}

function getSubagentTranscriptPaths(
  transcriptPath,
  referencedAgentIds,
  referencedTranscriptPaths = new Set(),
) {
  const candidatePaths = new Set();

  if (trimmed(transcriptPath) && referencedAgentIds instanceof Set && referencedAgentIds.size > 0) {
    const transcriptDir = path.dirname(transcriptPath);
    const transcriptStem = path.parse(transcriptPath).name;
    const candidateDirs = [
      path.join(transcriptDir, 'subagents'),
      path.join(transcriptDir, transcriptStem, 'subagents'),
    ];

    for (const agentId of referencedAgentIds) {
      for (const dirPath of candidateDirs) {
        candidatePaths.add(path.join(dirPath, `agent-${agentId}.jsonl`));
      }
    }
  }

  if (referencedTranscriptPaths instanceof Set) {
    for (const referencedPath of referencedTranscriptPaths) {
      const resolvedPath = resolveReferencedTranscriptPath(transcriptPath, referencedPath);
      if (resolvedPath) {
        candidatePaths.add(resolvedPath);
      }
    }
  }

  return [...candidatePaths];
}

function pickBackfillUsageEntry(metrics = {}, { preferLatestAny = false } = {}) {
  if (preferLatestAny) {
    return metrics.latestAnyUsageEntry || metrics.latestMainUsageEntry || null;
  }

  return metrics.latestMainUsageEntry || metrics.latestAnyUsageEntry || null;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function usageToComparableTotal(usage) {
  if (typeof usage === 'number') return Math.max(0, usage);
  if (!usage || typeof usage !== 'object') return 0;

  return numericOrZero(usage.input_tokens)
    + numericOrZero(usage.output_tokens)
    + numericOrZero(usage.cache_read_input_tokens)
    + numericOrZero(usage.cache_creation_input_tokens);
}

function buildUsageObject(entry) {
  const usage = getUsage(entry);
  if (!usage) return null;

  return {
    input_tokens: numericOrZero(usage.input_tokens),
    output_tokens: numericOrZero(usage.output_tokens),
    cache_creation_input_tokens: numericOrZero(usage.cache_creation_input_tokens),
    cache_read_input_tokens: numericOrZero(usage.cache_read_input_tokens),
  };
}

function getContextLengthFromUsage(usage) {
  if (!usage || typeof usage !== 'object') return 0;

  return numericOrZero(usage.input_tokens)
    + numericOrZero(usage.cache_creation_input_tokens)
    + numericOrZero(usage.cache_read_input_tokens);
}

function getContextWindowOverrideFromEnv() {
  const overrideValue = trimmed(process.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS).replace(/[_\s,]/gu, '');
  return positiveNumberOrNull(overrideValue);
}

function collectModelNames(statusPayload = {}) {
  const modelNames = new Set();

  const pushModelName = (value) => {
    addTrimmedString(modelNames, value);
  };

  if (typeof statusPayload?.model === 'string') {
    pushModelName(statusPayload.model);
  } else if (statusPayload?.model && typeof statusPayload.model === 'object') {
    pushModelName(statusPayload.model.id);
    pushModelName(statusPayload.model.display_name);
    pushModelName(statusPayload.model.displayName);
    pushModelName(statusPayload.model.name);
  }

  pushModelName(statusPayload?.model_id);
  pushModelName(statusPayload?.modelId);
  pushModelName(statusPayload?.model_name);
  pushModelName(statusPayload?.modelName);

  return [...modelNames];
}

function canonicalizeModelName(value) {
  return trimmed(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

export function inferContextWindowSize(statusPayload = {}) {
  const envOverride = getContextWindowOverrideFromEnv();
  if (envOverride) return envOverride;

  const explicitWindow = positiveNumberOrNull(statusPayload?.context_window?.context_window_size);
  if (explicitWindow) return explicitWindow;

  const modelWindow = positiveNumberOrNull(statusPayload?.model?.max_input_tokens)
    ?? positiveNumberOrNull(statusPayload?.model?.maxInputTokens);
  if (modelWindow) return modelWindow;

  const modelNames = collectModelNames(statusPayload);
  if (modelNames.some((value) => /\[1m\]/iu.test(value) || /\b1m\b/iu.test(value))) {
    return 1_000_000;
  }

  const canonicalModelNames = modelNames
    .map(canonicalizeModelName)
    .filter(Boolean);

  if (canonicalModelNames.some((value) => (
    value.includes('opus-4-6')
    || value.includes('sonnet-4-6')
    || value.includes('claude-sonnet-4')
  ))) {
    return 1_000_000;
  }

  return 200_000;
}

export async function readStatuslineTranscriptMetrics(
  transcriptPath,
  { includeSubagents = true } = {},
) {
  if (!trimmed(transcriptPath)) {
    return {
      ...emptyMetrics(),
      totalTokens: 0,
      backfillUsageEntry: null,
    };
  }

  const mainEntries = await readTranscriptEntries(transcriptPath);
  const collected = [collectMetricsFromEntries(mainEntries)];

  if (includeSubagents) {
    const subagentReferences = collectReferencedSubagentReferences(mainEntries);
    const candidatePaths = getSubagentTranscriptPaths(
      transcriptPath,
      subagentReferences.agentIds,
      subagentReferences.transcriptPaths,
    );
    for (const candidatePath of candidatePaths) {
      try {
        const entries = await readTranscriptEntries(candidatePath);
        collected.push(collectMetricsFromEntries(entries));
      } catch {
        // Ignore missing/unreadable subagent transcripts.
      }
    }
  }

  const merged = mergeMetrics(collected);
  return {
    ...merged,
    totalTokens: merged.inputTokens + merged.outputTokens + merged.cachedTokens,
    backfillUsageEntry: pickBackfillUsageEntry(merged, { preferLatestAny: includeSubagents }),
  };
}

export function enrichStatuslinePayload(statusPayload = {}, transcriptMetrics = {}) {
  const nextPayload = cloneJson(statusPayload);
  const contextWindow = nextPayload.context_window && typeof nextPayload.context_window === 'object'
    ? { ...nextPayload.context_window }
    : {};
  const backfillUsage = buildUsageObject(transcriptMetrics.backfillUsageEntry);

  const existingUsageTotal = usageToComparableTotal(contextWindow.current_usage);
  let backfilledCurrentUsage = false;
  if (backfillUsage && existingUsageTotal <= 0) {
    contextWindow.current_usage = backfillUsage;
    backfilledCurrentUsage = true;
  }

  if (numericOrZero(contextWindow.total_input_tokens) <= 0 && numericOrZero(transcriptMetrics.inputTokens) > 0) {
    contextWindow.total_input_tokens = numericOrZero(transcriptMetrics.inputTokens);
  }

  if (numericOrZero(contextWindow.total_output_tokens) <= 0 && numericOrZero(transcriptMetrics.outputTokens) > 0) {
    contextWindow.total_output_tokens = numericOrZero(transcriptMetrics.outputTokens);
  }

  if (!positiveNumberOrNull(contextWindow.context_window_size)) {
    contextWindow.context_window_size = inferContextWindowSize(nextPayload);
  }

  const usageForPercentages = typeof contextWindow.current_usage === 'object' && contextWindow.current_usage
    ? contextWindow.current_usage
    : backfillUsage;
  const contextLength = getContextLengthFromUsage(usageForPercentages);
  const contextWindowSize = positiveNumberOrNull(contextWindow.context_window_size);
  if (contextWindowSize && contextLength > 0) {
    const usedPercentage = Math.min(100, Math.max(0, (contextLength / contextWindowSize) * 100));
    const roundedUsedPercentage = Math.round(usedPercentage * 10) / 10;
    const roundedRemainingPercentage = Math.round((100 - roundedUsedPercentage) * 10) / 10;
    const usedPercentageMissingOrZero = positiveNumberOrNull(contextWindow.used_percentage) === null
      || numericOrZero(contextWindow.used_percentage) <= 0;
    const remainingPercentageMissingOrZero = positiveNumberOrNull(contextWindow.remaining_percentage) === null
      || numericOrZero(contextWindow.remaining_percentage) <= 0;
    const percentagesAreInconsistent = Math.abs(
      numericOrZero(contextWindow.used_percentage) + numericOrZero(contextWindow.remaining_percentage) - 100,
    ) > 0.5;

    if (usedPercentageMissingOrZero) {
      contextWindow.used_percentage = roundedUsedPercentage;
    }
    if (
      remainingPercentageMissingOrZero
      || backfilledCurrentUsage
      || usedPercentageMissingOrZero
      || percentagesAreInconsistent
    ) {
      contextWindow.remaining_percentage = roundedRemainingPercentage;
    }
  }

  if (Object.keys(contextWindow).length > 0) {
    nextPayload.context_window = contextWindow;
  }

  return nextPayload;
}
