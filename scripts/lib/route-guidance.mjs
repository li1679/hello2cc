import { buildCapabilityPolicySnapshot, buildRouteCapabilityPolicyLines } from './capability-policy-registry.mjs';
import { buildRouteDecisionTieBreakers } from './decision-tie-breakers.mjs';
import { buildPromptHostState, compactState, hasDynamicPromptHostState } from './host-state-context.mjs';
import { analyzeIntentProfile, summarizeIntentForState } from './intent-profile.mjs';
import { buildRendererContract } from './renderer-contracts.mjs';
import { buildRouteDecisionLines } from './route-decision-lines.mjs';
import {
  buildRouteExecutionPlaybook,
  buildRouteRecoveryPlaybook,
  buildRouteResponseContract,
} from './route-state-playbooks.mjs';
import { buildRouteSpecializationCandidates } from './specialization-candidates.mjs';
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
    '当前宿主已 surfaced 更高优先级的 skill/workflow owner；主流程沿宿主连续体推进，不要再额外拼一套 hello2cc 私有执行剧本。',
    'hello2cc 在这一轮只保留 Claude Code 风格外显、原生工具语义、参数净化与 fail-closed 收口；不要覆盖宿主 skill 的步骤编排。',
  ];

  if (!signals?.lexiconGuided) {
    lines.push('不要依赖关键词命中；直接依据用户原话语义，在宿主已 surfaced 的 skill/workflow 连续体内匹配下一步。');
  }

  return lines;
}

export function buildRouteStateContext(prompt, sessionContext = {}) {
  const signals = analyzeIntentProfile(prompt, sessionContext);
  const continuity = workflowContinuitySnapshot(sessionContext);
  const workflowOwner = selectWorkflowOwner(signals, sessionContext);
  const responseContract = buildRouteResponseContract(signals, sessionContext, continuity);
  const rendererContract = buildRendererContract(responseContract, {
    outputStyle: sessionContext?.outputStyle,
    attachedOutputStyle: sessionContext?.attachedOutputStyle,
  });
  const executionPlaybook = buildRouteExecutionPlaybook(signals, sessionContext, continuity);
  const recoveryPlaybook = buildRouteRecoveryPlaybook(sessionContext, continuity, signals);
  const decisionTieBreakers = buildRouteDecisionTieBreakers(signals, sessionContext, continuity);
  const specializationCandidates = buildRouteSpecializationCandidates(signals, sessionContext, continuity);
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
      rendererContract,
      executionPlaybook,
      recoveryPlaybook,
      decisionTieBreakers,
      specializationCandidates,
    });
  const shouldForceSnapshot = Boolean(signals.artifactShapeGuided);

  if (!routeLines.length && !hasDynamicHostState && !shouldForceSnapshot) {
    return '';
  }

  const snapshot = compactState({
    operator_profile: 'opus-compatible-claude-code',
    decision_model: 'host_defined_capability_policies',
    intent: summarizeIntentForState(signals),
    workflow_owner: workflowOwner,
    policy: buildCapabilityPolicySnapshot(sessionContext, signals, routePolicyOptions),
    ...(!hostOwnedRouting ? {
      response_contract: responseContract,
      renderer_contract: rendererContract,
      execution_playbook: executionPlaybook,
      recovery_playbook: recoveryPlaybook,
      decision_tie_breakers: decisionTieBreakers,
      specialization_candidates: specializationCandidates,
    } : {}),
    ...hostState,
  });

  return [
    '# hello2cc routing',
    '',
    hostOwnedRouting
      ? '按下面的 JSON snapshot 执行；宿主已暴露更高优先级 workflow owner，本轮只保留 hello2cc 的风格壳层、工具语义和协议收口。'
      : '按下面的 JSON snapshot 执行；把它当成宿主给出的 intent、capability policy、rendering contract 和 guard-rail state。',
    hostOwnedRouting
      ? '不要自造并行私有 workflow，也不要用 hello2cc 的执行剧本覆盖宿主已 surfaced 的 skill/workflow。'
      : '用正文只补执行顺序和 tie-breaker；不要自造并行私有 workflow。',
    '更高优先级的用户指令、原生工具契约、显式工具输入和宿主真实权限结果始终覆盖这里。',
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
