function trimmed(value) {
  return String(value || '').trim();
}

function collapseWhitespace(value) {
  return trimmed(value).replace(/\s+/g, ' ');
}

function visibleCharCount(value) {
  return Array.from(collapseWhitespace(value)).length;
}

function questionOptions(question = {}) {
  return Array.isArray(question?.options) ? question.options : [];
}

function questionPromptText(question = {}) {
  return collapseWhitespace([
    question?.header,
    question?.question,
  ].filter(Boolean).join(' '));
}

function optionText(option = {}) {
  return collapseWhitespace([
    option?.label,
    option?.description,
  ].filter(Boolean).join(' '));
}

function cjkBigrams(text) {
  const matches = String(text || '').match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]{2,}/gu) || [];
  return matches.flatMap((run) => {
    const chars = Array.from(run);
    if (chars.length < 2) return [];

    const values = [];
    for (let index = 0; index < chars.length - 1; index += 1) {
      values.push(`${chars[index]}${chars[index + 1]}`);
    }
    return values;
  });
}

function semanticFragments(value) {
  const normalized = collapseWhitespace(value).toLowerCase();
  if (!normalized) return [];

  const wordFragments = normalized.match(/[\p{Letter}\p{Number}_/-]{4,}/gu) || [];
  return [...new Set([
    ...wordFragments,
    ...cjkBigrams(normalized),
  ])];
}

function hasStructuredArtifact(value) {
  return /`[^`]+`|[A-Za-z]:\\|[#@][\w.-]+|(?:^|[\s(])[./~]?[\w./-]+\.[A-Za-z0-9]+|\b\d+(?:\.\d+){0,2}\b/u.test(String(value || ''));
}

function questionRichness(question = {}) {
  const prompt = questionPromptText(question);
  const chars = visibleCharCount(prompt);
  let score = 0;

  if (chars >= 24) score += 1;
  if (chars >= 48) score += 1;
  if (hasStructuredArtifact(prompt)) score += 2;
  if (chars >= 24 && semanticFragments(prompt).length >= 3) score += 1;

  return score;
}

function optionInsight(option = {}) {
  const label = collapseWhitespace(option?.label);
  const description = collapseWhitespace(option?.description);
  const combined = optionText(option);
  const fragments = semanticFragments(combined);
  let score = 0;

  if (visibleCharCount(label) >= 6) score += 1;
  if (visibleCharCount(description) >= 12) score += 1;
  if (visibleCharCount(description) >= 24) score += 1;
  if (visibleCharCount(description) >= 12 && fragments.length >= 3) score += 1;
  if (hasStructuredArtifact(combined)) score += 2;

  return {
    label,
    labelChars: visibleCharCount(label),
    combined,
    score,
    fragments,
    structured: hasStructuredArtifact(combined),
  };
}

function sharedFragments(texts = []) {
  const counts = new Map();

  for (const text of texts) {
    for (const fragment of semanticFragments(text)) {
      counts.set(fragment, (counts.get(fragment) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([fragment]) => fragment);
}

function hasDomainAnchor(question = {}) {
  const options = questionOptions(question);
  if (options.length < 2) return false;

  const optionTexts = options.map((option) => optionText(option)).filter(Boolean);
  if (optionTexts.length < 2) return false;

  if (sharedFragments(optionTexts).length > 0) {
    return true;
  }

  const questionParts = new Set(semanticFragments(questionPromptText(question)));
  if (!questionParts.size) return false;

  let anchoredOptions = 0;
  for (const text of optionTexts) {
    const fragments = semanticFragments(text);
    if (fragments.some((fragment) => questionParts.has(fragment))) {
      anchoredOptions += 1;
    }
  }

  return anchoredOptions >= 2;
}

/**
 * AskUserQuestion should only survive host guards when the options encode a
 * real constrained choice, not a thin continue/stop confirmation loop.
 */
export function hasConcreteChoiceOptions(question = {}) {
  const options = questionOptions(question);
  if (options.length < 2) return false;
  if (looksLikeWeakConfirmationQuestion(question)) return false;

  const insights = options.map((option) => optionInsight(option));
  const richOptionCount = insights.filter((option) => option.score >= 2).length;
  return Boolean(
    hasDomainAnchor(question)
    || insights.some((option) => option.structured)
    || richOptionCount >= 2,
  );
}

/**
 * This is intentionally language-agnostic: it looks for a binary,
 * low-information control prompt rather than matching yes/no keywords.
 */
export function looksLikeWeakConfirmationQuestion(question = {}) {
  const options = questionOptions(question);
  if (options.length !== 2) return false;

  const insights = options.map((option) => optionInsight(option));
  const simpleLabels = insights.every((option) => option.labelChars > 0 && option.labelChars <= 8 && !option.structured);
  const richOptionCount = insights.filter((option) => option.score >= 2).length;

  return Boolean(
    simpleLabels
    && !hasDomainAnchor(question)
    && questionRichness(question) <= 1
    && richOptionCount <= 1,
  );
}

/**
 * Open clarification questions are allowed when the prompt itself carries
 * enough concrete detail that the user response would unblock execution.
 */
export function looksLikeSpecificClarificationQuestion(question = {}) {
  const options = questionOptions(question);
  if (options.length > 1) return false;

  const prompt = questionPromptText(question);
  return Boolean(
    prompt
    && (
      hasStructuredArtifact(prompt)
      || questionRichness(question) >= 2
      || semanticFragments(prompt).length >= 3
    )
  );
}
