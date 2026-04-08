import { compactState } from './host-state-context.mjs';

export function trimmed(value) {
  return String(value || '').trim();
}

export function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

export function upsertCandidate(entries, id, details = {}) {
  if (!id) return;
  const existing = entries.get(id) || { id, reasons: [] };
  const reasons = [...new Set([...(Array.isArray(existing.reasons) ? existing.reasons : []), ...(Array.isArray(details.reasons) ? details.reasons : [])].filter(Boolean))];
  entries.set(id, {
    ...existing,
    ...details,
    id,
    selected: details.selected || existing.selected || undefined,
    reasons: reasons.length ? reasons : undefined,
  });
}

export function finalizeCandidates(entries, selectedId = '') {
  const items = [...entries.values()]
    .sort((left, right) => {
      if (Boolean(left.selected) !== Boolean(right.selected)) {
        return left.selected ? -1 : 1;
      }
      return String(left.id).localeCompare(String(right.id));
    })
    .map((item) => compactState(item))
    .filter(Boolean);

  return compactState({
    active: selectedId || undefined,
    items,
  });
}
