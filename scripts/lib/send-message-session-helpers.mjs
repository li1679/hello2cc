import { knownTeammateNames } from './tool-policy-state.mjs';
import { participantNameOrEmpty } from './participant-name.mjs';
import { realTeamNameOrEmpty } from './team-name.mjs';

export function trimmed(value) {
  return String(value || '').trim();
}

export function activeTeamName(sessionContext = {}) {
  return realTeamNameOrEmpty(sessionContext?.teamName);
}

export function activeAgentName(sessionContext = {}) {
  return participantNameOrEmpty(sessionContext?.agentName);
}

export function messageTarget(input = {}) {
  return participantNameOrEmpty(input?.to);
}

export function structuredMessageType(input = {}) {
  const message = input?.message;
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return '';
  }

  return trimmed(message?.type);
}

export function isProbableAgentId(value) {
  const normalized = trimmed(value);
  return /^agent[-_][a-z0-9]/i.test(normalized);
}

export function isTeamLeadTarget(value) {
  return trimmed(value).toLowerCase() === 'team-lead';
}

export function isTeammateSession(sessionContext = {}) {
  const agentName = activeAgentName(sessionContext).toLowerCase();
  return Boolean(agentName) && !['team-lead', 'main', 'default'].includes(agentName);
}

export function isTeamLeadSession(sessionContext = {}) {
  return Boolean(activeTeamName(sessionContext)) && !isTeammateSession(sessionContext);
}

export function structuredRequestId(input = {}) {
  const message = input?.message;
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return '';
  }

  return trimmed(message.requestId || message.request_id);
}

export function structuredFeedbackValue(input = {}) {
  const message = input?.message;
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return '';
  }

  return trimmed(message.feedback || message.reason);
}

export function isTeamScopedTarget(target, sessionContext = {}) {
  if (target === '*') return true;
  if (!target) return false;

  const teammates = knownTeammateNames(sessionContext);
  return teammates.includes(target) || (!isProbableAgentId(target) && Boolean(activeTeamName(sessionContext)));
}
