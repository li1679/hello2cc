function trimmed(value) {
  return String(value || '').trim();
}

function collapseWhitespace(value) {
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

function summarizeMessage(message) {
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

export function normalizeSendMessageInput(input = {}) {
  const summary = trimmed(input?.summary);
  const message = input?.message;

  if (summary || typeof message !== 'string') {
    return { input, changed: false, reason: '' };
  }

  const generatedSummary = summarizeMessage(message);
  return {
    input: {
      ...input,
      summary: generatedSummary,
    },
    changed: true,
    reason: `hello2cc injected SendMessage.summary="${generatedSummary}" for plain-text compatibility`,
  };
}
