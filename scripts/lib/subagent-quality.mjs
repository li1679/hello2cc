function normalizeText(value) {
  return String(value || '').trim();
}

function visibleCharCount(text) {
  return Array.from(String(text || '').replace(/\s+/g, '')).length;
}

function lineItems(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => String(line || '').trim())
    .filter(Boolean);
}

function lineCount(text) {
  return lineItems(text).length;
}

function clauseCount(text) {
  return String(text || '')
    .split(/[.!?;:。！？；：,，、\n]+/u)
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .length;
}

function hasPathEvidence(text) {
  return /```[\s\S]*?```|`[^`]+`|[A-Za-z]:\\[^ \n]+|(?:^|[\s(])[./~]?[\w./-]+\.[A-Za-z0-9]+|[#@][\w.-]+/u.test(text);
}

function hasStructuredList(text) {
  return /(^|\n)(\d+\. |- |\* )/.test(text);
}

function structuredListItemCount(text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter((line) => /^(\d+\. |- |\* )/.test(String(line || '').trim()))
    .length;
}

function labeledSectionCount(text) {
  const matches = String(text || '').match(/(^|\n)[\p{L}\p{N}_./# -]{2,24}[：:]\s*\S/gu);
  return Array.isArray(matches) ? matches.length : 0;
}

function hasLabeledSections(text) {
  return labeledSectionCount(text) > 0;
}

function hasCommandEvidence(text) {
  return /(?:^|[\s(])(?:npm|pnpm|yarn|bun|node|python|pytest|vitest|jest|cargo|go|gradle|mvn)\b/iu.test(String(text || ''));
}

function hasValidationEvidence(text) {
  return (
    hasPathEvidence(text) ||
    hasCommandEvidence(text) ||
    structuredListItemCount(text) >= 2 ||
    labeledSectionCount(text) >= 2 ||
    clauseCount(text) >= 3
  );
}

function hasPlanStructure(text) {
  return (
    structuredListItemCount(text) >= 2 ||
    labeledSectionCount(text) >= 2 ||
    lineCount(text) >= 3 ||
    clauseCount(text) >= 3
  );
}

function looksStructuredBlockerReport(text) {
  return (
    hasLabeledSections(text) ||
    structuredListItemCount(text) >= 2 ||
    lineCount(text) >= 3
  );
}

export function validateSubagentStop(agentType, lastMessage) {
  const text = normalizeText(lastMessage);
  if (!text || visibleCharCount(text) < 20) {
    return 'Subagent summary is too thin. Summarize concrete findings, deliverables, or blockers before stopping.';
  }

  if (looksStructuredBlockerReport(text)) {
    return '';
  }

  if (agentType === 'Explore') {
    return hasPathEvidence(text)
      ? ''
      : 'Explore should return exact file paths, symbols, or concrete entry points before stopping.';
  }

  if (agentType === 'Plan') {
    return hasPlanStructure(text) && hasValidationEvidence(text)
      ? ''
      : 'Plan should include ordered steps plus validation or acceptance checks before stopping.';
  }

  if (agentType === 'general-purpose') {
    return hasPathEvidence(text) || hasValidationEvidence(text)
      ? ''
      : 'General-Purpose should report exact file paths, commands, tests, or other completion evidence before stopping.';
  }

  return '';
}
