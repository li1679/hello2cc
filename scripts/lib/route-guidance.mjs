import { buildCapabilityPolicySnapshot, buildRouteCapabilityPolicyLines } from './capability-policy-registry.mjs';
import { buildRouteDecisionTieBreakers } from './decision-tie-breakers.mjs';
import { buildPromptHostState, compactState, hasDynamicPromptHostState } from './host-state-context.mjs';
import { analyzeIntentProfile, summarizeIntentForState } from './intent-profile.mjs';
import { buildRouteDecisionLines } from './route-decision-lines.mjs';
import {
  buildRouteRecoveryPlaybook,
  buildRouteResponseContract,
} from './route-state-playbooks.mjs';
import { workflowContinuitySnapshot } from './tool-policy-state.mjs';
import { selectWorkflowOwner } from './workflow-owner-arbitration.mjs';

const HOST_OWNED_ROUTE_POLICY_IDS = [
  'skills-workflows',
  'claude-code-guide',
  'mcp-resources',
  'tool-discovery',
  'agent-routing',
  'websearch',
  'ask-user-question',
  'enter-worktree',
  'deferred-tool-follow-through',
];

function buildHostOwnedDecisionLines(signals = {}, workflowOwner = {}) {
  const lines = [
    '当前宿主已 surfaced 更高优先级的 skill/workflow owner；主流程沿宿主连续体推进，不要再额外拼一套 2cc 私有执行剧本。',
    '2cc 在这一轮只保留 Claude Code 风格外显、原生工具语义、参数净化与 fail-closed 收口；不要覆盖宿主 skill 的步骤编排。',
  ];

  if (!signals?.lexiconGuided) {
    lines.push('不要依赖关键词命中；直接依据用户原话语义，在宿主已 surfaced 的 skill/workflow 连续体内匹配下一步。');
  }

  return lines;
}

function hasRealContinuity(continuity = {}) {
  return Boolean(
    continuity.active_task_board ||
    continuity.plan_mode_entered ||
    continuity.plan_mode_exited ||
    continuity.team?.active_team ||
    continuity.team?.team_action_items?.length ||
    continuity.team?.handoff_candidates?.length ||
    continuity.recent_zero_result_toolsearch_queries?.length ||
    continuity.websearch?.degraded
  );
}

function compactRouteState({ responseContract = {}, recoveryPlaybook = {}, decisionTieBreakers = {} } = {}) {
  return compactState({
    specialization: responseContract.specialization,
    selection_basis: responseContract.selection_basis,
    selection_strength: responseContract.selection_strength,
    guards: Array.isArray(recoveryPlaybook.recipes)
      ? recoveryPlaybook.recipes.map((recipe) => recipe.guard).filter(Boolean)
      : undefined,
    tie_breakers: Array.isArray(decisionTieBreakers.items)
      ? decisionTieBreakers.items.map((item) => item.id).filter(Boolean).slice(0, 4)
      : undefined,
  });
}

function buildRoutePolicySnapshot(sessionContext = {}, signals = {}, options = {}, responseContract = {}) {
  const policy = buildCapabilityPolicySnapshot(sessionContext, signals, options);
  const requestedOutputShape = responseContract.preferred_shape;

  if (!requestedOutputShape) {
    return policy;
  }

  return compactState({
    ...policy,
    requested_output_shape: requestedOutputShape,
    policies: Array.isArray(policy.policies)
      ? policy.policies.map((item) => (item?.output_shape
        ? { ...item, output_shape: requestedOutputShape }
        : item))
      : policy.policies,
  });
}

function buildCompactRouteSnapshot({
  signals = {},
  sessionContext = {},
  workflowOwner = {},
  routePolicyOptions = {},
  responseContract = {},
  recoveryPlaybook = {},
  decisionTieBreakers = {},
  hostState = {},
} = {}) {
  return compactState({
    operator_profile: '2cc-local-claude-code-adapter',
    intent: summarizeIntentForState(signals),
    workflow_owner: workflowOwner,
    policy: buildRoutePolicySnapshot(sessionContext, signals, routePolicyOptions, responseContract),
    route: compactRouteState({ responseContract, recoveryPlaybook, decisionTieBreakers }),
    ...hostState,
  });
}

function shouldEmitRouteContext({
  routeLines = [],
  hasDynamicHostState = false,
  shouldForceSnapshot = false,
  continuity = {},
  signals = {},
} = {}) {
  return Boolean(
    routeLines.length ||
    hasDynamicHostState ||
    shouldForceSnapshot ||
    hasRealContinuity(continuity) ||
    signals.capabilityQuery ||
    signals.capabilityProbeShape ||
    signals.currentInfo ||
    signals.claudeGuide
  );
}

export function buildRouteStateContext(prompt, sessionContext = {}) {
  const signals = analyzeIntentProfile(prompt, sessionContext);
  const continuity = workflowContinuitySnapshot(sessionContext);
  const workflowOwner = selectWorkflowOwner(signals, sessionContext);
  const responseContract = buildRouteResponseContract(signals, sessionContext, continuity);
  const recoveryPlaybook = buildRouteRecoveryPlaybook(sessionContext, continuity, signals);
  const decisionTieBreakers = buildRouteDecisionTieBreakers(signals, sessionContext, continuity);
  const hostState = buildPromptHostState(sessionContext);
  const hasDynamicHostState = hasDynamicPromptHostState(sessionContext);
  const hostOwnedRouting = workflowOwner.owner === 'host_skill_workflow';
  const routePolicyOptions = hostOwnedRouting
    ? { includeIds: HOST_OWNED_ROUTE_POLICY_IDS }
    : {};
  const routeLines = buildRouteCapabilityPolicyLines(signals, sessionContext, routePolicyOptions);
  const decisionLines = hostOwnedRouting
    ? buildHostOwnedDecisionLines(signals, workflowOwner)
    : buildRouteDecisionLines(signals, sessionContext, {
      continuity,
      responseContract,
      recoveryPlaybook,
      decisionTieBreakers,
    });
  const shouldForceSnapshot = Boolean(signals.artifactShapeGuided);

  if (!shouldEmitRouteContext({
    routeLines,
    hasDynamicHostState,
    shouldForceSnapshot,
    continuity,
    signals,
  })) {
    return '';
  }

  const snapshot = buildCompactRouteSnapshot({
    signals,
    sessionContext,
    workflowOwner,
    routePolicyOptions,
    responseContract,
    recoveryPlaybook,
    decisionTieBreakers,
    hostState,
  });

  return [
    '# 2cc routing',
    '',
    hostOwnedRouting
      ? '宿主已暴露更高优先级 workflow owner。2cc 只补当前回合的轻量边界，不覆盖宿主 workflow。'
      : '2cc 只补当前回合的轻量边界。不要把这里的内部字段、JSON key、路由名或 guard 名写进可见回答。',
    '用户当前问题、Claude Code 宿主指令、显式工具输入和真实权限结果始终优先。',
    '',
    '## Decision backbone',
    ...decisionLines.map((line, index) => `${index + 1}. ${line}`),
    '',
    ...routeLines,
    ...(routeLines.length ? [''] : []),
    '```json',
    JSON.stringify(snapshot, null, 2),
    '```',
  ].join('\n');
}
