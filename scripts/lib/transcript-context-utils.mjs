export function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export function normalizePath(path) {
  return String(path || '').trim();
}

export function recordSessionId(record) {
  return String(record?.session_id || record?.sessionId || '').trim();
}

export function isSessionSystemRecord(record, sessionId) {
  if (!record || record.type !== 'system') return false;
  if (sessionId && recordSessionId(record) && recordSessionId(record) !== sessionId) {
    return false;
  }

  return true;
}

export function isSessionRecord(record, sessionId) {
  if (!record || typeof record !== 'object') return false;
  if (sessionId && recordSessionId(record) && recordSessionId(record) !== sessionId) {
    return false;
  }

  return true;
}

export function normalizeName(value) {
  return String(value || '').trim().replace(/^\/+/, '');
}

export function normalizeDescription(value) {
  return String(value || '').trim();
}

export function normalizeCommandArgs(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function uniq(values) {
  return [...new Set(values.map(normalizeName).filter(Boolean))];
}

export function uniqBy(values, keyFn) {
  const entries = new Map();

  for (const value of values) {
    const key = keyFn(value);
    if (!key) continue;

    entries.set(key, {
      ...(entries.get(key) || {}),
      ...value,
    });
  }

  return [...entries.values()];
}

export function collectStrings(value, seen = new WeakSet()) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  if (seen.has(value)) return [];

  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStrings(item, seen));
  }

  return Object.values(value).flatMap((item) => collectStrings(item, seen));
}

export function collectObjects(value, predicate, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return [];
  if (seen.has(value)) return [];

  seen.add(value);

  const matches = predicate(value) ? [value] : [];
  const children = Array.isArray(value)
    ? value.flatMap((item) => collectObjects(item, predicate, seen))
    : Object.values(value).flatMap((item) => collectObjects(item, predicate, seen));

  return [...matches, ...children];
}
