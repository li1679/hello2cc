function trimmed(value) {
  return String(value || '').trim();
}

const OMITTED_PARTICIPANT_PLACEHOLDERS = new Set([
  'none',
  'null',
  'undefined',
  'omit',
  'omitted',
  '__omit__',
  '__none__',
]);

function normalizedParticipantKey(value) {
  return trimmed(value).toLowerCase();
}

export function isOmittedParticipantPlaceholder(value) {
  return OMITTED_PARTICIPANT_PLACEHOLDERS.has(normalizedParticipantKey(value));
}

export function participantNameOrEmpty(value) {
  const name = trimmed(value);
  return isOmittedParticipantPlaceholder(name) ? '' : name;
}

export function uniqueParticipantNames(values, maxItems = values?.length || 0) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => participantNameOrEmpty(value))
      .filter(Boolean),
  )].slice(0, maxItems || undefined);
}
