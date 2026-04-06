import { buildCapabilityPolicySnapshot, buildRouteCapabilityPolicyLines } from './capability-policy-registry.mjs';
import { buildRouteDecisionTieBreakers } from './decision-tie-breakers.mjs';
import { buildPromptHostState, compactState } from './host-state-context.mjs';
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

export function buildRouteStateContext(prompt, sessionContext = {}) {
  const signals = analyzeIntentProfile(prompt, sessionContext);
  const continuity = workflowContinuitySnapshot(sessionContext);
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
  const routeLines = buildRouteCapabilityPolicyLines(signals, sessionContext);
  const decisionLines = buildRouteDecisionLines(signals, sessionContext, {
    continuity,
    responseContract,
    rendererContract,
    executionPlaybook,
    recoveryPlaybook,
    decisionTieBreakers,
    specializationCandidates,
  });
  const shouldForceSnapshot = Boolean(signals.artifactShapeGuided);

  if (!routeLines.length && !hostState && !shouldForceSnapshot) {
    return '';
  }

  const snapshot = compactState({
    operator_profile: 'opus-compatible-claude-code',
    decision_model: 'host_defined_capability_policies',
    intent: summarizeIntentForState(signals),
    policy: buildCapabilityPolicySnapshot(sessionContext, signals),
    response_contract: responseContract,
    renderer_contract: rendererContract,
    execution_playbook: executionPlaybook,
    recovery_playbook: recoveryPlaybook,
    decision_tie_breakers: decisionTieBreakers,
    specialization_candidates: specializationCandidates,
    ...hostState,
  });

  return [
    '# hello2cc routing',
    '',
    '按下面的 JSON snapshot 执行；把它当成宿主给出的 intent、capability policy、rendering contract 和 guard-rail state。',
    '用正文只补执行顺序和 tie-breaker；不要自造并行私有 workflow。',
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
