import { promptMentionsAny } from './intent-slots.mjs';
import { realTeamNameOrEmpty } from './team-name.mjs';

const TABLE_OUTPUT_MARKERS = [
  'table',
  'matrix',
];

const DIAGRAM_OUTPUT_MARKERS = [
  'chart',
  'diagram',
  'flow',
];

function appendTrack(tracks, value) {
  if (!tracks.includes(value)) {
    tracks.push(value);
  }
}

function trimmed(value) {
  return String(value || '').trim();
}

function lowerNames(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => trimmed(value).toLowerCase())
      .filter(Boolean),
  )];
}

function workflowState(sessionContext = {}) {
  return sessionContext?.workflowState && typeof sessionContext.workflowState === 'object'
    ? sessionContext.workflowState
    : {};
}

export function compact(value) {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => compact(item))
      .filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, nestedValue]) => [key, compact(nestedValue)])
      .filter(([, nestedValue]) => nestedValue !== undefined);

    if (!entries.length) return undefined;
    return Object.fromEntries(entries);
  }

  if (value === '' || value === null || value === undefined || value === false) {
    return undefined;
  }

  return value;
}

export function buildTracks({ frontend, backend, research, implement, review, verify, release }) {
  const tracks = [];

  if (frontend) appendTrack(tracks, 'frontend');
  if (backend) appendTrack(tracks, 'backend');
  if (research && (implement || review || verify) && !tracks.includes('research')) {
    tracks.unshift('research');
  }
  if (implement && (research || verify || review)) {
    appendTrack(tracks, 'implementation');
  }
  if (review && !verify) {
    appendTrack(tracks, 'review');
  }
  if (verify) {
    appendTrack(tracks, 'verification');
  }
  if (release) {
    appendTrack(tracks, 'release');
  }

  return tracks;
}

export function hasLoadedSurfaceNamed(sessionContext = {}, name = '') {
  const needle = trimmed(name).toLowerCase();
  if (!needle) return false;

  return lowerNames([
    ...(Array.isArray(sessionContext?.loadedCommandNames) ? sessionContext.loadedCommandNames : []),
    ...(Array.isArray(sessionContext?.workflowNames) ? sessionContext.workflowNames : []),
    ...(Array.isArray(sessionContext?.surfacedSkillNames) ? sessionContext.surfacedSkillNames : []),
  ]).includes(needle);
}

export function hasObservedWebSearchBoundary(sessionContext = {}) {
  const health = sessionContext?.webSearchHealth;
  if (!sessionContext?.webSearchAvailable || !health || typeof health !== 'object') {
    return false;
  }

  return Boolean(
    Number(health?.consecutiveZeroSearches || 0) > 0 ||
    Number(health?.consecutiveErrors || 0) > 0 ||
    trimmed(health?.cooldownUntil) ||
    trimmed(health?.lastOutcome) ||
    trimmed(health?.lastBaseUrl) ||
    trimmed(health?.lastModel),
  );
}

export function hasApprovedPlanExecutionBoundary(sessionContext = {}) {
  return Boolean(workflowState(sessionContext)?.planModeExited);
}

export function hasSoloTrackedExecutionBoundary(sessionContext = {}) {
  const state = workflowState(sessionContext);
  return Boolean(
    !realTeamNameOrEmpty(sessionContext?.teamName) &&
    (
      state?.activeTaskBoard ||
      trimmed(state?.lastTaskCreatedId) ||
      trimmed(state?.lastTaskReadId) ||
      trimmed(state?.lastTaskUpdatedId) ||
      Object.keys(state?.taskSummaries || {}).length
    ),
  );
}

export function hasCapabilityDiscoverySurface(sessionContext = {}) {
  return Boolean(
    sessionContext?.toolSearchAvailable ||
    sessionContext?.discoverSkillsAvailable ||
    sessionContext?.skillToolAvailable ||
    sessionContext?.listMcpResourcesAvailable ||
    sessionContext?.readMcpResourceAvailable ||
    (Array.isArray(sessionContext?.surfacedSkillNames) && sessionContext.surfacedSkillNames.length > 0) ||
    (Array.isArray(sessionContext?.workflowNames) && sessionContext.workflowNames.length > 0) ||
    (Array.isArray(sessionContext?.availableDeferredToolNames) && sessionContext.availableDeferredToolNames.length > 0) ||
    (Array.isArray(sessionContext?.loadedDeferredToolNames) && sessionContext.loadedDeferredToolNames.length > 0),
  );
}

export function isThinNeutralPrompt(promptEnvelope = {}) {
  const charCount = Number(promptEnvelope?.charCount || 0);
  const lineCount = Number(promptEnvelope?.lineCount || 0);
  const clauseCount = Number(promptEnvelope?.clauseCount || 0);

  return Boolean(
    charCount > 0 &&
    charCount <= 24 &&
    lineCount <= 1 &&
    clauseCount <= 1 &&
    !promptEnvelope?.questionLike &&
    !promptEnvelope?.listLike &&
    !promptEnvelope?.structuredArtifact,
  );
}

export function knownSurfaceMentioned(text, sessionContext = {}) {
  return promptMentionsAny(text, [
    ...(Array.isArray(sessionContext?.loadedCommandNames) ? sessionContext.loadedCommandNames : []),
    ...(Array.isArray(sessionContext?.workflowNames) ? sessionContext.workflowNames : []),
    ...(Array.isArray(sessionContext?.surfacedSkillNames) ? sessionContext.surfacedSkillNames : []),
  ]);
}

export function wantsTableLayout(text) {
  return promptMentionsAny(text, TABLE_OUTPUT_MARKERS);
}

export function wantsDiagramLayout(text) {
  return promptMentionsAny(text, DIAGRAM_OUTPUT_MARKERS);
}
