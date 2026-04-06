function trimmed(value) {
  return String(value || '').trim();
}

export function collapseWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sanitizePreviewText(value) {
  return collapseWhitespace(
    String(value || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[*_~>#-]+/g, ' ')
      .replace(/[|[\]{}()]+/g, ' ')
      .replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, ' '),
  );
}

function truncatePreview(value, limit) {
  const chars = Array.from(String(value || ''));
  if (chars.length <= limit) return value;
  return `${chars.slice(0, limit).join('')}…`;
}

/**
 * Plain-text team messages still need a compact summary field because the
 * native tool surface expects it for consistent mailbox previews.
 */
export function summarizePlainTextMessage(message) {
  const normalized = sanitizePreviewText(message);
  if (!normalized) {
    return 'follow-up message';
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length >= 3) {
    return truncatePreview(words.slice(0, 8).join(' '), 60);
  }

  return truncatePreview(normalized, 24);
}

/**
 * Structured approval fields should be treated as protocol booleans rather than
 * natural-language labels, so the guard stays language-independent.
 */
export function structuredApproveFieldValue(message = {}) {
  if (message.approve === true || message.approved === true) return true;
  if (message.approve === false || message.approved === false) return false;

  const rawValue = message.approve ?? message.approved;
  if (rawValue === 1) return true;
  if (rawValue === 0) return false;

  const normalized = trimmed(rawValue).toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;

  return null;
}
