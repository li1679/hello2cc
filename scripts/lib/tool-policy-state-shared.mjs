import {
  participantNameOrEmpty,
  uniqueParticipantNames,
} from './participant-name.mjs';

const MAX_REMEMBERED_TASK_IDS = 12;
const MAX_REMEMBERED_READ_GUARDS = 20;
const MAX_REMEMBERED_ZERO_RESULT_QUERIES = 8;
const MAX_REMEMBERED_TASK_SUMMARIES = 20;
const MAX_REMEMBERED_TEAMMATES = 16;

export {
  MAX_REMEMBERED_TASK_IDS,
  MAX_REMEMBERED_TEAMMATES,
};

export function trimmed(value) {
  return String(value || '').trim();
}

export function uniqueStrings(values, maxItems = values?.length || 0) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => trimmed(value))
      .filter(Boolean),
  )].slice(0, maxItems || undefined);
}

export function booleanValue(value) {
  return value === true;
}

export function numberValue(value) {
  return Number.isFinite(value) ? Number(value) : 0;
}

export function nestedBoolean(object, path, fallback = false) {
  let current = object;
  for (const key of path) {
    if (!current || typeof current !== 'object') {
      return fallback;
    }
    current = current[key];
  }

  return current === undefined ? fallback : booleanValue(current);
}

export function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function normalizedReadGuards(value) {
  const entries = value && typeof value === 'object'
    ? Object.entries(value)
        .map(([taskId, record]) => {
          const normalizedTaskId = trimmed(taskId);
          const recordedAt = trimmed(record?.recordedAt);
          if (!normalizedTaskId || !recordedAt) {
            return null;
          }

          return [normalizedTaskId, {
            recordedAt,
            source: trimmed(record?.source),
          }];
        })
        .filter(Boolean)
        .sort(([, left], [, right]) => String(right.recordedAt).localeCompare(String(left.recordedAt)))
        .slice(0, MAX_REMEMBERED_READ_GUARDS)
    : [];

  return Object.fromEntries(entries);
}

function normalizedZeroResultQueries(value) {
  const entries = value && typeof value === 'object'
    ? Object.entries(value)
        .map(([query, record]) => {
          const normalizedQuery = trimmed(record?.query || query);
          const recordedAt = trimmed(record?.recordedAt);
          if (!normalizedQuery || !recordedAt) {
            return null;
          }

          return [normalizedQuery.toLowerCase(), {
            query: normalizedQuery,
            recordedAt,
          }];
        })
        .filter(Boolean)
        .sort(([, left], [, right]) => String(right.recordedAt).localeCompare(String(left.recordedAt)))
        .slice(0, MAX_REMEMBERED_ZERO_RESULT_QUERIES)
    : [];

  return Object.fromEntries(entries);
}

function normalizedTaskSummaries(value) {
  const entries = value && typeof value === 'object'
    ? Object.entries(value)
        .map(([taskId, record]) => {
          const normalizedTaskId = trimmed(taskId);
          const recordedAt = trimmed(record?.recordedAt);
          if (!normalizedTaskId || !recordedAt) {
            return null;
          }

          return [normalizedTaskId, {
            subject: trimmed(record?.subject),
            status: trimmed(record?.status),
            owner: participantNameOrEmpty(record?.owner),
            blocks: uniqueStrings(record?.blocks, MAX_REMEMBERED_TASK_IDS),
            blockedBy: uniqueStrings(record?.blockedBy || record?.blocked_by, MAX_REMEMBERED_TASK_IDS),
            recordedAt,
          }];
        })
        .filter(Boolean)
        .sort(([, left], [, right]) => String(right.recordedAt).localeCompare(String(left.recordedAt)))
        .slice(0, MAX_REMEMBERED_TASK_SUMMARIES)
    : [];

  return Object.fromEntries(entries);
}

export function openTaskEntry(record = {}) {
  const status = trimmed(record?.status).toLowerCase();
  return Boolean(status) && !['completed', 'deleted'].includes(status);
}

/**
 * Normalizes the workflow-state snapshot persisted inside session memory.
 */
export function normalizeWorkflowState(value = {}) {
  const toolSearch = value?.toolSearch && typeof value.toolSearch === 'object'
    ? value.toolSearch
    : {};

  return {
    activeTaskBoard: booleanValue(value?.activeTaskBoard),
    taskBoardSource: trimmed(value?.taskBoardSource),
    lastKnownTaskIds: uniqueStrings(value?.lastKnownTaskIds, MAX_REMEMBERED_TASK_IDS),
    taskReadGuards: normalizedReadGuards(value?.taskReadGuards),
    lastTaskCreatedId: trimmed(value?.lastTaskCreatedId),
    lastTaskReadId: trimmed(value?.lastTaskReadId),
    lastTaskUpdatedId: trimmed(value?.lastTaskUpdatedId),
    lastTaskUpdatedStatus: trimmed(value?.lastTaskUpdatedStatus),
    lastTaskOwner: participantNameOrEmpty(value?.lastTaskOwner),
    taskSummaries: normalizedTaskSummaries(value?.taskSummaries),
    knownTeammates: uniqueParticipantNames(value?.knownTeammates, MAX_REMEMBERED_TEAMMATES),
    shutdownRequestedTargets: uniqueParticipantNames(value?.shutdownRequestedTargets, MAX_REMEMBERED_TEAMMATES),
    shutdownBroadcastRequested: booleanValue(value?.shutdownBroadcastRequested),
    lastMessageTarget: participantNameOrEmpty(value?.lastMessageTarget),
    lastMessageKind: trimmed(value?.lastMessageKind),
    lastMessageSummary: trimmed(value?.lastMessageSummary || value?.last_message_summary),
    planModeEntered: booleanValue(value?.planModeEntered),
    planModeExited: booleanValue(value?.planModeExited),
    awaitingPlanApproval: booleanValue(value?.awaitingPlanApproval),
    lastPlanApprovalTarget: participantNameOrEmpty(value?.lastPlanApprovalTarget),
    askUserQuestionUsed: booleanValue(value?.askUserQuestionUsed),
    toolSearch: {
      lastQuery: trimmed(toolSearch?.lastQuery),
      lastMatchCount: Number.isFinite(toolSearch?.lastMatchCount) ? Number(toolSearch.lastMatchCount) : 0,
      zeroResultQueries: normalizedZeroResultQueries(toolSearch?.zeroResultQueries),
    },
  };
}

/**
 * Reads the normalized workflow-state snapshot from the session context.
 */
export function workflowState(sessionContext = {}) {
  return normalizeWorkflowState(sessionContext?.workflowState);
}

export function localTaskSummaryEntries(sessionContext = {}) {
  return Object.entries(workflowState(sessionContext).taskSummaries);
}

/**
 * Reads the last remembered route intent profile from session memory.
 */
export function lastIntentProfile(sessionContext = {}) {
  const profile = sessionContext?.lastIntentProfile && typeof sessionContext.lastIntentProfile === 'object'
    ? sessionContext.lastIntentProfile
    : sessionContext?.lastPromptSignals && typeof sessionContext.lastPromptSignals === 'object'
      ? sessionContext.lastPromptSignals
      : {};

  return {
    questionIntent: booleanValue(profile?.question) || booleanValue(profile?.questionIntent),
    compare: booleanValue(profile?.actions?.compare) || booleanValue(profile?.compare),
    research: booleanValue(profile?.actions?.research) || booleanValue(profile?.research),
    implement: booleanValue(profile?.actions?.implement) || booleanValue(profile?.implement),
    review: booleanValue(profile?.actions?.review) || booleanValue(profile?.review),
    explain: booleanValue(profile?.actions?.explain) || booleanValue(profile?.explain),
    release: booleanValue(profile?.actions?.release) || booleanValue(profile?.release),
    verify: booleanValue(profile?.actions?.verify) || booleanValue(profile?.verify),
    plan: booleanValue(profile?.actions?.plan) || booleanValue(profile?.plan),
    currentInfo: booleanValue(profile?.actions?.current_info) || booleanValue(profile?.currentInfo),
    parallelRequested: nestedBoolean(profile, ['collaboration', 'parallel_requested']) || booleanValue(profile?.parallelRequested),
    swarm: nestedBoolean(profile, ['collaboration', 'swarm']) || booleanValue(profile?.swarm),
    teamWorkflow: nestedBoolean(profile, ['collaboration', 'team_workflow']) || booleanValue(profile?.teamWorkflow),
    proactiveTeamWorkflow: nestedBoolean(profile, ['collaboration', 'proactive_team']) || booleanValue(profile?.proactiveTeamWorkflow),
    teamSemantics: nestedBoolean(profile, ['collaboration', 'team_semantics']) || booleanValue(profile?.teamSemantics),
    handoff: nestedBoolean(profile, ['collaboration', 'handoff']) || booleanValue(profile?.handoff),
    teamStatus: nestedBoolean(profile, ['collaboration', 'team_status']) || booleanValue(profile?.teamStatus),
    wantsWorktree: nestedBoolean(profile, ['collaboration', 'wants_worktree']) || booleanValue(profile?.wantsWorktree),
    taskList: nestedBoolean(profile, ['collaboration', 'task_board']) || booleanValue(profile?.taskList),
    claudeGuide: nestedBoolean(profile, ['routing', 'claude_guide']) || booleanValue(profile?.claudeGuide),
    capabilityQuery: nestedBoolean(profile, ['routing', 'capability_query']) || booleanValue(profile?.capabilityQuery),
    workflowContinuation: nestedBoolean(profile, ['routing', 'workflow_continuation']) || booleanValue(profile?.workflowContinuation),
    toolSearchFirst: nestedBoolean(profile, ['routing', 'tool_search_first']) || booleanValue(profile?.toolSearchFirst),
    boundedImplementation: nestedBoolean(profile, ['routing', 'bounded_implementation']) || booleanValue(profile?.boundedImplementation),
    decisionHeavy: nestedBoolean(profile, ['routing', 'decision_heavy']) || booleanValue(profile?.decisionHeavy),
    codeResearch: nestedBoolean(profile, ['routing', 'code_research']) || booleanValue(profile?.codeResearch),
    complex: nestedBoolean(profile, ['routing', 'complex']) || booleanValue(profile?.complex),
    webSearchRetry: nestedBoolean(profile, ['routing', 'websearch_retry']) || booleanValue(profile?.webSearchRetry),
    frontend: nestedBoolean(profile, ['topics', 'frontend']) || booleanValue(profile?.frontend),
    backend: nestedBoolean(profile, ['topics', 'backend']) || booleanValue(profile?.backend),
    mcp: nestedBoolean(profile, ['topics', 'mcp']) || booleanValue(profile?.mcp),
    skillSurface: nestedBoolean(profile, ['topics', 'skill_surface']) || booleanValue(profile?.skillSurface),
    tools: nestedBoolean(profile, ['topics', 'host_capabilities']) || booleanValue(profile?.tools),
    tracks: uniqueStrings(profile?.tracks, 8),
  };
}

/**
 * Reads the last remembered prompt-envelope snapshot from session memory.
 */
export function lastPromptEnvelope(sessionContext = {}) {
  const profile = sessionContext?.lastIntentProfile && typeof sessionContext.lastIntentProfile === 'object'
    ? sessionContext.lastIntentProfile
    : sessionContext?.lastPromptSignals && typeof sessionContext.lastPromptSignals === 'object'
      ? sessionContext.lastPromptSignals
      : {};
  const promptShape = profile?.analysis?.prompt_shape && typeof profile.analysis.prompt_shape === 'object'
    ? profile.analysis.prompt_shape
    : profile?.promptEnvelope && typeof profile.promptEnvelope === 'object'
      ? profile.promptEnvelope
      : {};

  return {
    questionLike: booleanValue(promptShape?.question_like) || booleanValue(promptShape?.questionLike),
    structuredArtifact: booleanValue(promptShape?.structured_artifact) || booleanValue(promptShape?.structuredArtifact),
    knownSurfaceMentioned: booleanValue(promptShape?.known_surface_mention) || booleanValue(promptShape?.knownSurfaceMentioned),
    structuralComplexity: booleanValue(promptShape?.structural_complexity) || booleanValue(promptShape?.structuralComplexity),
    multiLine: booleanValue(promptShape?.multi_line) || booleanValue(promptShape?.multiLine),
    multiClause: booleanValue(promptShape?.multi_clause) || booleanValue(promptShape?.multiClause),
    listLike: booleanValue(promptShape?.list_like) || booleanValue(promptShape?.listLike),
    targetedArtifactQuestion: booleanValue(promptShape?.targeted_artifact_question) || booleanValue(promptShape?.targetedArtifactQuestion),
    broadArtifactQuestion: booleanValue(promptShape?.broad_artifact_question) || booleanValue(promptShape?.broadArtifactQuestion),
    reviewArtifact: booleanValue(promptShape?.review_artifact) || booleanValue(promptShape?.reviewArtifact),
    repoArtifactHeavy: booleanValue(promptShape?.repo_artifact_heavy) || booleanValue(promptShape?.repoArtifactHeavy),
    lexiconGuided: nestedBoolean(profile, ['analysis', 'lexicon_guided']) || booleanValue(profile?.lexiconGuided),
    charCount: numberValue(promptShape?.char_count || promptShape?.charCount),
  };
}

export function taskIdFromInput(input = {}) {
  const candidates = [
    input?.taskId,
    input?.task_id,
    input?.id,
  ];

  return candidates.map((value) => trimmed(value)).find(Boolean) || '';
}

/**
 * Returns remembered ToolSearch queries that previously produced zero matches.
 */
export function recentZeroResultToolSearchQueries(sessionContext = {}) {
  return Object.values(workflowState(sessionContext).toolSearch.zeroResultQueries)
    .map((entry) => trimmed(entry?.query))
    .filter(Boolean);
}
