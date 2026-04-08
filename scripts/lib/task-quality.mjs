function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function visibleCharCount(text) {
  return Array.from(String(text || '').replace(/\s+/g, '')).length;
}

function lines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => String(line || '').trim())
    .filter(Boolean);
}

function lineCount(text) {
  return lines(text).length;
}

function clauseCount(text) {
  return String(text || '')
    .split(/[.!?;:。！？；：,，、\n]+/u)
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .length;
}

function wordCount(text) {
  return normalizeText(text)
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function hasStructuredList(text) {
  return /(^|\n)(\d+\. |- |\* )/.test(String(text || ''));
}

function structuredListItemCount(text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter((line) => /^(\d+\. |- |\* )/.test(String(line || '').trim()))
    .length;
}

function hasLabeledSections(text) {
  return /(^|\n)[\p{L}\p{N}_./# -]{2,24}[：:]\s*\S/gu.test(String(text || ''));
}

function labeledSectionCount(text) {
  const matches = String(text || '').match(/(^|\n)[\p{L}\p{N}_./# -]{2,24}[：:]\s*\S/gu);
  return Array.isArray(matches) ? matches.length : 0;
}

function hasPathOrCommandEvidence(text) {
  return /```[\s\S]*?```|`[^`]+`|[A-Za-z]:\\[^ \n]+|(?:^|[\s(])[./~]?[\w./-]+\.[A-Za-z0-9]+|(?:^|[\s(])(?:npm|pnpm|yarn|bun|node|python|pytest|vitest|jest|cargo|go|gradle|mvn)\b/iu.test(String(text || ''));
}

function subjectHasStructuralSpecificity(text) {
  return /`[^`]+`|[#@][\w.-]+|\b[A-Z][A-Za-z0-9_-]{2,}\b|[A-Za-z]:\\|(?:^|[\s(])[./~]?[\w./-]+\.[A-Za-z0-9]+/u.test(String(text || ''));
}

export function taskSubjectTooVague(taskSubject) {
  const subject = normalizeText(taskSubject);
  const chars = visibleCharCount(subject);
  if (chars < 4) return true;
  if (subjectHasStructuralSpecificity(subject)) return false;

  const spaced = /\s/u.test(subject);
  if (spaced) {
    return wordCount(subject) <= 2 && chars < 18;
  }

  return chars < 6;
}

export function taskDescriptionTooThin(taskDescription) {
  const description = normalizeText(taskDescription);
  return visibleCharCount(description) < 28;
}

export function taskDescriptionHasDeliverable(taskDescription) {
  const text = String(taskDescription || '');
  return (
    hasPathOrCommandEvidence(text) ||
    hasStructuredList(text) ||
    hasLabeledSections(text) ||
    lineCount(text) >= 2 ||
    clauseCount(text) >= 2
  );
}

export function taskDescriptionHasEvidence(taskDescription) {
  const text = String(taskDescription || '');
  return (
    hasPathOrCommandEvidence(text) ||
    structuredListItemCount(text) >= 2 ||
    labeledSectionCount(text) >= 2 ||
    lineCount(text) >= 3 ||
    clauseCount(text) >= 3
  );
}

export function validateTaskDefinition({ task_subject: taskSubject, task_description: taskDescription }) {
  if (taskSubjectTooVague(taskSubject)) {
    return 'Task subject is too vague. Rename it to a concrete slice such as “inspect routing for MCP tools” or “verify TeamCreate task flow”.';
  }

  if (taskDescriptionTooThin(taskDescription)) {
    return 'Task description is too short. Include the intended deliverable, scope, and completion evidence.';
  }

  if (!taskDescriptionHasDeliverable(taskDescription)) {
    return 'Task description should name the deliverable or action, not just the topic.';
  }

  if (!taskDescriptionHasEvidence(taskDescription)) {
    return 'Task description should include completion evidence such as tests, validation, exact paths, or another acceptance check.';
  }

  return '';
}
