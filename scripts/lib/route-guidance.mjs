import { buildCapabilityPolicySnapshot, buildRouteCapabilityPolicyLines } from './capability-policy-registry.mjs';
import { buildPromptHostState, compactState } from './host-state-context.mjs';
import { analyzeIntentProfile, summarizeIntentForState } from './intent-profile.mjs';

function buildRouteDecisionLines(signals = {}) {
  const lines = [
    '可见文本默认跟随用户当前语言；不要输出“我打算 / 我应该 / let’s”这类内部思考式元叙述。',
    '先遵守宿主能力优先级，再在被允许的能力面内选工具；不要把未 surfaced 的工具、workflow、agent、MCP 能力或权限当成已确认存在。',
  ];

  if (signals.verify) {
    lines.push('宣称完成前先做最贴近改动范围的验证；没验证就明确说没验证。');
  }

  return lines;
}

export function buildRouteStateContext(prompt, sessionContext = {}) {
  const signals = analyzeIntentProfile(prompt, sessionContext);
  const hostState = buildPromptHostState(sessionContext);
  const routeLines = buildRouteCapabilityPolicyLines(signals, sessionContext);
  const decisionLines = buildRouteDecisionLines(signals);

  if (!routeLines.length && !hostState) {
    return '';
  }

  const snapshot = compactState({
    operator_profile: 'opus-compatible-claude-code',
    decision_model: 'host_defined_capability_policies',
    intent: summarizeIntentForState(signals),
    policy: buildCapabilityPolicySnapshot(sessionContext, signals),
    ...hostState,
  });

  return [
    '# hello2cc routing',
    '',
    'Treat the JSON snapshot below as the authoritative host-side intent, capability policy, and guard-rail state.',
    'The prose only adds execution order and tie-breakers. The model still chooses within that policy envelope; it does not invent a parallel private workflow.',
    'Higher-priority user instructions, native tool contracts, explicit tool inputs, and real host permission results always win.',
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

