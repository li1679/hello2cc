/**
 * Throws a consistent error for real-session regression failures.
 */
export function fail(message) {
  throw new Error(String(message || 'unknown failure'));
}

/**
 * Prints a standardized success line for real-session regression checkpoints.
 */
export function ok(message) {
  console.log(`OK ${message}`);
}

/**
 * Parses Claude stream-json output into JSON objects, skipping non-JSON lines.
 */
export function parseJsonLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Extracts hook additionalContext text from a hook response event.
 */
export function parseHookContext(line) {
  try {
    const payload = JSON.parse(line.output || '{}');
    return payload?.hookSpecificOutput?.additionalContext || '';
  } catch {
    return '';
  }
}
