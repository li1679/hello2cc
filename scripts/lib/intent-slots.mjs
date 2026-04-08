import {
  ACTION_LEXICON,
  COLLABORATION_LEXICON,
  STRUCTURE_LEXICON,
  TOPIC_LEXICON,
} from './intent-vocabulary.mjs';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeIntentText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function stripArtifactNoise(value) {
  return String(value || '')
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/`(?:[A-Za-z]:\\|[./~]?[\w./-]+\.[A-Za-z0-9]+(?::\d+(?::\d+)?)?|#L\d+(?:C\d+)?|diff --git[\s\S]*?)`/gu, ' ')
    .replace(/(?:[A-Za-z]:\\|(?:^|[\s(])[./~]?[\w./-]+\.[A-Za-z0-9]+(?::\d+(?::\d+)?)?)/gu, ' ')
    .replace(/\b#L\d+(?:C\d+)?\b/gu, ' ')
    .replace(/(^|\n)(diff --git|@@ |--- [^\n]+|\+\+\+ [^\n]+)/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function aliasPattern(alias) {
  if (alias instanceof RegExp) {
    return alias;
  }

  const normalized = normalizeIntentText(alias);
  if (!normalized) return null;

  if (/[a-z0-9]/i.test(normalized)) {
    const escaped = escapeRegExp(normalized).replace(/\\ /g, '\\s+');
    return new RegExp(`(?:^|[^a-z0-9_])${escaped}(?:$|[^a-z0-9_])`, 'i');
  }

  return null;
}

function matchesAlias(text, alias) {
  if (alias instanceof RegExp) {
    return alias.test(text);
  }

  const normalized = normalizeIntentText(alias);
  if (!normalized) return false;

  const pattern = aliasPattern(normalized);
  return pattern ? pattern.test(text) : text.includes(normalized);
}

function collectConcepts(text, lexicon) {
  return Object.entries(lexicon).reduce((result, [concept, aliases]) => {
    if (aliases.some((alias) => matchesAlias(text, alias))) {
      result.push(concept);
    }
    return result;
  }, []);
}

export function hasQuestionIntent(text) {
  return STRUCTURE_LEXICON.capability_query.some((alias) => matchesAlias(text, alias));
}

export function promptMentionsAny(normalizedText, names = []) {
  return names
    .map((name) => normalizeIntentText(name))
    .filter(Boolean)
    .some((name) => matchesAlias(normalizedText, name));
}

export function extractIntentSlots(prompt) {
  const raw = String(prompt || '');
  const text = normalizeIntentText(raw);
  const lexicalText = normalizeIntentText(stripArtifactNoise(raw));

  return {
    text,
    lexicalText,
    questionIntent: hasQuestionIntent(text),
    actions: collectConcepts(lexicalText, ACTION_LEXICON),
    topics: collectConcepts(lexicalText, TOPIC_LEXICON),
    collaboration: collectConcepts(lexicalText, COLLABORATION_LEXICON),
    structure: collectConcepts(lexicalText, STRUCTURE_LEXICON),
  };
}
