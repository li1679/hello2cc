import { summarizePlainTextMessage } from './send-message-helpers.mjs';
import {
  messageTarget,
  structuredMessageType,
  trimmed,
} from './send-message-session-helpers.mjs';
import { participantNameOrEmpty } from './participant-name.mjs';

function joinReasons(...items) {
  return items.filter(Boolean).join('; ');
}

export function normalizeSendMessageInput(input = {}, sessionContext = {}) {
  const rawTarget = trimmed(input?.to);
  const target = participantNameOrEmpty(rawTarget);
  const summary = trimmed(input?.summary);
  const message = input?.message;
  const normalizedInput = rawTarget && !target
    ? (() => {
        const next = { ...input };
        delete next.to;
        return next;
      })()
    : input;
  const structuredType = structuredMessageType(input);
  const placeholderReason = rawTarget && !target
    ? `hello2cc stripped placeholder SendMessage.to=${JSON.stringify(rawTarget)}; omitted targets must stay empty instead of polluting teammate continuity`
    : '';

  if (!target || summary || typeof message !== 'string' || structuredType) {
    return {
      input: normalizedInput,
      changed: normalizedInput !== input,
      blocked: false,
      reason: placeholderReason,
    };
  }

  const generatedSummary = summarizePlainTextMessage(message);
  return {
    input: {
      ...normalizedInput,
      summary: generatedSummary,
    },
    changed: true,
    blocked: false,
    reason: joinReasons(
      placeholderReason,
      `hello2cc injected SendMessage.summary="${generatedSummary}" for plain-text compatibility`,
    ),
  };
}
