import { summarizePlainTextMessage } from './send-message-helpers.mjs';
import {
  activeTeamName,
  messageTarget,
  structuredMessageType,
  trimmed,
} from './send-message-session-helpers.mjs';

export function normalizeSendMessageInput(input = {}, sessionContext = {}) {
  const summary = trimmed(input?.summary);
  const message = input?.message;
  const target = messageTarget(input);
  const structuredType = structuredMessageType(input);

  if (!target || summary || typeof message !== 'string' || structuredType) {
    return { input, changed: false, blocked: false, reason: '' };
  }

  const generatedSummary = summarizePlainTextMessage(message);
  return {
    input: {
      ...input,
      summary: generatedSummary,
    },
    changed: true,
    blocked: false,
    reason: `hello2cc injected SendMessage.summary="${generatedSummary}" for plain-text compatibility`,
  };
}
