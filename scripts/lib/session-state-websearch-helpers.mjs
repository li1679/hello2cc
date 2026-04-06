import { envValue } from './config.mjs';

const ZERO_SEARCH_DEGRADE_THRESHOLD = 2;
const ZERO_SEARCH_COOLDOWN_MS = 10 * 60 * 1000;
const ERROR_COOLDOWN_MS = 15 * 60 * 1000;

function normalizeWebSearchHealth(health = {}) {
  return {
    consecutiveZeroSearches: Number(health?.consecutiveZeroSearches || 0),
    consecutiveErrors: Number(health?.consecutiveErrors || 0),
    lastAttemptAt: String(health?.lastAttemptAt || '').trim(),
    lastSuccessAt: String(health?.lastSuccessAt || '').trim(),
    lastFailureAt: String(health?.lastFailureAt || '').trim(),
    cooldownUntil: String(health?.cooldownUntil || '').trim(),
    lastBaseUrl: String(health?.lastBaseUrl || '').trim(),
    lastModel: String(health?.lastModel || '').trim(),
    lastOutcome: String(health?.lastOutcome || '').trim(),
  };
}

function nextIsoOffset(now, offsetMs) {
  return new Date(now.getTime() + offsetMs).toISOString();
}

function currentModelName(payload = {}, current = {}) {
  return String(
    payload?.model ||
    current?.mainModel ||
    current?.model ||
    '',
  ).trim();
}

function webSearchSnapshot(payload = {}, current = {}) {
  return {
    lastBaseUrl: envValue('ANTHROPIC_BASE_URL'),
    lastModel: currentModelName(payload, current),
  };
}

function extractSearchCount(response = {}) {
  const numericCandidates = [
    response?.searchCount,
    response?.search_count,
    response?.searches,
  ];

  for (const candidate of numericCandidates) {
    if (typeof candidate === 'number' && candidate >= 0) {
      return candidate;
    }
  }

  const results = Array.isArray(response?.results) ? response.results : [];
  if (Array.isArray(response?.results) && results.length === 0) {
    return 0;
  }

  let searchCount = 0;
  for (const result of results) {
    if (result && typeof result === 'object' && !Array.isArray(result) && Array.isArray(result.content)) {
      searchCount += 1;
    }
  }

  return searchCount;
}

function recordWebSearchSuccess(current = {}, payload = {}) {
  const response = payload?.tool_response || payload?.tool_result || payload?.result || {};
  const searchCount = extractSearchCount(response);
  if (searchCount === null) {
    return current.webSearchHealth;
  }

  const previous = normalizeWebSearchHealth(current.webSearchHealth);
  const now = new Date();
  const snapshot = webSearchSnapshot(payload, current);

  if (searchCount > 0) {
    return {
      ...previous,
      ...snapshot,
      consecutiveZeroSearches: 0,
      consecutiveErrors: 0,
      lastAttemptAt: now.toISOString(),
      lastSuccessAt: now.toISOString(),
      cooldownUntil: '',
      lastOutcome: 'success',
    };
  }

  const consecutiveZeroSearches = previous.consecutiveZeroSearches + 1;
  return {
    ...previous,
    ...snapshot,
    consecutiveZeroSearches,
    consecutiveErrors: 0,
    lastAttemptAt: now.toISOString(),
    cooldownUntil:
      consecutiveZeroSearches >= ZERO_SEARCH_DEGRADE_THRESHOLD
        ? nextIsoOffset(now, ZERO_SEARCH_COOLDOWN_MS)
        : '',
    lastOutcome: 'zero-search',
  };
}

function recordWebSearchFailure(current = {}, payload = {}) {
  const previous = normalizeWebSearchHealth(current.webSearchHealth);
  const now = new Date();
  const snapshot = webSearchSnapshot(payload, current);

  return {
    ...previous,
    ...snapshot,
    consecutiveZeroSearches: 0,
    consecutiveErrors: previous.consecutiveErrors + 1,
    lastAttemptAt: now.toISOString(),
    lastFailureAt: now.toISOString(),
    cooldownUntil: nextIsoOffset(now, ERROR_COOLDOWN_MS),
    lastOutcome: 'error',
  };
}

export {
  recordWebSearchFailure,
  recordWebSearchSuccess,
};
