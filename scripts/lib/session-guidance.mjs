import { FORCED_OUTPUT_STYLE_NAME } from './config.mjs';
import { buildCapabilityPolicySnapshot, buildSessionCapabilityPolicyLines } from './capability-policy-registry.mjs';
import { buildSessionStartHostState } from './host-state-context.mjs';

export function buildSessionStartContext(sessionContext = {}) {
  const state = buildSessionStartHostState(sessionContext);
  const policyState = buildCapabilityPolicySnapshot(sessionContext, {}, {
    scope: 'session',
  });

  return [
    '# hello2cc',
    '',
    '先按 Claude Code 风格的三层约束执行：只在宿主公开的能力边界与优先级内做语义匹配和最终工具选择，并接受宿主的权限与 fail-closed 收口。',
    '',
    '## 优先级',
    '- 用户当前消息、Claude Code 宿主规则、`CLAUDE.md` / `AGENTS.md` / 项目规则，始终高于 hello2cc。',
    '- 不要替换 Claude Code 原生工作流；只在宿主真实暴露的能力面上做选择。',
    '- 显式工具输入、原生工具 schema、权限模式和宿主返回的真实状态，始终高于 hello2cc 的补充策略。',
    '- 当宿主只给出弱提示时，不要求用户原话与工具名或 workflow 名同语言、同关键词；直接基于用户原话语义，在宿主公开的 candidate/path 边界内选择最贴近的 Claude Code 原生路径。',
    '',
    ...buildSessionCapabilityPolicyLines(sessionContext),
    '',
    '## 输出风格',
    `- 输出风格固定为 \`${FORCED_OUTPUT_STYLE_NAME}\`。`,
    '- 如果更高优先级规则没有指定格式，保持 Claude Code 原生、简洁、结果导向的表达。',
    '- 当表格更清晰时优先 Markdown 表格；只有 Markdown 明显不适合时再用 ASCII。',
    '',
    '## 宿主状态快照',
    '```json',
    JSON.stringify(state, null, 2),
    '```',
    '',
    '## Capability policy snapshot',
    '```json',
    JSON.stringify(policyState, null, 2),
    '```',
  ].join('\n');
}
