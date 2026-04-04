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
    'hello2cc 采用 Claude Code 风格的三层结构：宿主先定义能力边界与优先级，再把“何时用 / 何时别用”编译进提示词，模型只在这个受约束的空间里做语义匹配和最终工具选择，最后仍由宿主做权限与 fail-closed 校验。',
    '',
    '## 优先级',
    '- 用户当前消息、Claude Code 宿主规则、`CLAUDE.md` / `AGENTS.md` / 项目规则，始终高于 hello2cc。',
    '- hello2cc 不会替换 Claude Code 原生工作流；它只把第三方模型固定在宿主真实暴露的能力面上。',
    '- 显式工具输入、原生工具 schema、权限模式和宿主返回的真实状态，始终高于 hello2cc 的补充策略。',
    '',
    ...buildSessionCapabilityPolicyLines(sessionContext),
    '',
    '## 输出风格',
    `- 当前插件输出风格：\`${FORCED_OUTPUT_STYLE_NAME}\`。`,
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

