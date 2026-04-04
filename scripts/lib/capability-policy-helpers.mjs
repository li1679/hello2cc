import { configuredModels } from './config.mjs';

function trimmed(value) {
  return String(value || '').trim();
}

export function uniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => trimmed(value))
      .filter(Boolean),
  )];
}

export function activeTeamName(sessionContext = {}) {
  const teamName = trimmed(sessionContext?.teamName);
  if (!teamName || ['main', 'default'].includes(teamName.toLowerCase())) {
    return '';
  }

  return teamName;
}

export function requestOutputShape(requestProfile = {}) {
  if (requestProfile?.compare) {
    return 'one_sentence_judgment_then_markdown_table_then_recommendation';
  }

  if (requestProfile?.wantsStructuredOutput) {
    return 'prefer_markdown_structure_then_ascii_if_needed';
  }

  return 'plain_native_prose';
}

export function trackList(requestProfile = {}) {
  return uniqueStrings(requestProfile?.tracks);
}

export function requestNeedsTeamWorkflow(requestProfile = {}) {
  return Boolean(
    requestProfile?.teamSemantics ||
    requestProfile?.teamWorkflow ||
    requestProfile?.proactiveTeamWorkflow ||
    requestProfile?.taskList,
  );
}

export function requestNeedsParallelWorkers(requestProfile = {}) {
  return Boolean(
    requestProfile?.swarm ||
    requestProfile?.parallelRequested,
  );
}

export function requestNeedsCapabilityDiscovery(requestProfile = {}) {
  return Boolean(
    requestProfile?.capabilityQuery ||
    requestProfile?.tools ||
    requestProfile?.mcp ||
    requestProfile?.skillWorkflowLike,
  );
}

export function requestNeedsWorkflowRouting(requestProfile = {}) {
  return Boolean(
    requestProfile?.workflowContinuation ||
    requestProfile?.skillSurface ||
    requestProfile?.claudeGuide,
  );
}

export function requestNeedsPlanning(requestProfile = {}) {
  return Boolean(requestProfile?.plan);
}

export function requestNeedsCurrentInfo(requestProfile = {}) {
  return Boolean(requestProfile?.currentInfo);
}

export function requestNeedsDecisionHelp(requestProfile = {}) {
  return Boolean(requestProfile?.decisionHeavy);
}

export function baseDecisionLadder() {
  return [
    '已加载 workflow / skill 连续体',
    '已 surfaced 的 skill / workflow',
    '已知 MCP resource',
    '已加载或已 surfaced 的 deferred tool',
    'ToolSearch / DiscoverSkills',
    '更宽的 Agent / Plan / team 路径',
  ];
}

export function sessionModelLine(sessionContext = {}) {
  const config = configuredModels(sessionContext);
  if (config.sessionModel) {
    return `当前会话模型别名：\`${config.sessionModel}\`。`;
  }

  const mainModel = trimmed(sessionContext?.mainModel);
  return mainModel ? `当前会话模型：\`${mainModel}\`。` : '';
}
