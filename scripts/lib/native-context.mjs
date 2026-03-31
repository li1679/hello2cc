import { FORCED_OUTPUT_STYLE_NAME, configuredModels } from './config.mjs';
import { classifyPrompt } from './prompt-signals.mjs';

function flattenPromptValue(value, seen = new WeakSet()) {
  if (typeof value === 'string') return value;
  if (!value) return '';
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '';

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => flattenPromptValue(item, seen)).filter(Boolean).join(' ');
  }

  const preferredKeys = ['text', 'prompt', 'message', 'content', 'input'];
  const parts = [];

  for (const key of preferredKeys) {
    if (key in value) {
      parts.push(flattenPromptValue(value[key], seen));
    }
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (preferredKeys.includes(key)) continue;
    parts.push(flattenPromptValue(nestedValue, seen));
  }

  return parts.filter(Boolean).join(' ');
}

export function extractPromptText(payload) {
  const candidates = [
    payload?.prompt,
    payload?.userPrompt,
    payload?.message,
    payload?.input,
    payload?.text,
  ];

  return candidates
    .map((candidate) => flattenPromptValue(candidate))
    .find((text) => String(text || '').trim()) || '';
}

function buildModelPolicyLines(config) {
  if (config.routingPolicy === 'prompt-only') return [];

  const renderModel = (value, note = '') =>
    value ? `\`${value}\`${note ? ` ${note}` : ''}` : '`(preserve Claude Code native inherit/session behavior)`';

  const lines = [
    '## Native Agent model policy',
    `- routing_policy: \`${config.routingPolicy}\``,
    `- mirror_session_model: \`${config.mirrorSessionModel}\``,
    `- session_model: \`${config.sessionModel || '(none detected yet)'}\``,
    `- primary_model: ${renderModel(config.primaryModel, config.explicitPrimaryModel ? '(explicit)' : '')}`,
    `- subagent_model: ${renderModel(config.subagentModel, config.explicitSubagentModel ? '(explicit or env)' : '')}`,
    `- guide_model: ${renderModel(config.guideModel, config.explicitGuideModel ? '(explicit)' : '(defaults to current session for Claude Code Guide)')}`,
    `- explore_model: ${renderModel(config.exploreModel, config.explicitExploreModel ? '(explicit)' : '(defaults to current session for Explore)')}`,
    `- plan_model: ${renderModel(config.planModel, config.explicitPlanModel ? '(explicit override)' : '')}`,
    `- general_model: ${renderModel(config.generalModel, config.explicitGeneralModel ? '(explicit override)' : '')}`,
    `- team_model: ${renderModel(config.teamModel, config.explicitTeamModel ? '(explicit override)' : '')}`,
    '- hello2cc only injects `Agent.model` when the host would otherwise fall back to a non-native default (for example `Claude Code Guide` / `Explore`) or when you explicitly configured an override.',
    '- If a native `Agent` call already sets `model`, hello2cc does not override it.',
  ];

  return ['', ...lines];
}

function envValue(name) {
  return String(process.env[name] || '').trim();
}

function isAnthropicHost(url) {
  const value = String(url || '').trim().toLowerCase();
  if (!value) return true;

  return value.includes('api.anthropic.com') || value.includes('api.claude.ai');
}

function toolSearchStatus(sessionContext = {}) {
  if (typeof sessionContext?.toolSearchAvailable === 'boolean') {
    return {
      available: sessionContext.toolSearchAvailable,
      observed: true,
      source: 'session',
    };
  }

  const enableToolSearch = envValue('ENABLE_TOOL_SEARCH');
  const baseUrl = envValue('ANTHROPIC_BASE_URL');
  const proxyLikely = Boolean(baseUrl) && !isAnthropicHost(baseUrl);

  if (proxyLikely && !enableToolSearch) {
    return {
      available: false,
      observed: false,
      source: 'env',
    };
  }

  return {
    available: true,
    observed: false,
    source: proxyLikely ? 'env-optimistic' : 'unknown',
  };
}

function buildToolSearchLines(sessionContext = {}) {
  const status = toolSearchStatus(sessionContext);

  if (status.available) {
    return [
      '## ToolSearch readiness',
      '- hello2cc only promotes native `ToolSearch` when the Claude Code host actually exposes it for the current session.',
      ...(status.observed ? ['- Current session status: `ToolSearch` is exposed by the host and can be used for capability discovery.'] : []),
    ];
  }

  return [
    '## ToolSearch readiness',
    '- Current session status: native `ToolSearch` is not exposed, so hello2cc cannot force it at the plugin layer.',
    '- If you use a third-party gateway or `ANTHROPIC_BASE_URL`, set `ENABLE_TOOL_SEARCH=true` (or `auto` / `auto:N`) in Claude Code settings or the launch environment.',
    '- Your gateway must forward beta headers and `tool_reference` blocks; otherwise Claude Code will still suppress true ToolSearch / defer-loading behavior.',
  ];
}

function quoteTrack(track) {
  return `\`${track}\``;
}

function recommendedTrackLabels(signals) {
  if (signals.tracks?.length) return signals.tracks;
  if (signals.research && signals.verify) return ['research', 'verification'];
  if (signals.research && signals.implement) return ['research', 'implementation'];
  if (signals.implement && signals.verify) return ['implementation', 'verification'];
  return [];
}

function buildTeamStep(signals) {
  const tracks = recommendedTrackLabels(signals);
  if (tracks.length < 2 && !signals.swarm) return '';

  const trackList = tracks.length > 0 ? tracks.map(quoteTrack).join(' / ') : '`track-1` / `track-2`';
  return `这是多线任务：优先 \`TeamCreate\` 建立原生团队，并立即为 ${trackList} 创建独立 \`TaskCreate\`；执行中持续使用 \`TaskList\` / \`TaskUpdate\` 跟踪进度。`;
}

export function buildSessionStartContext(sessionContext = {}) {
  const config = configuredModels(sessionContext);

  return [
    '# hello2cc',
    '',
    'hello2cc is a thin, native-first Claude Code plugin for GPT and other third-party models routed through Claude Code.',
    'Its job is to preserve Claude Code’s built-in workflows with a namespaced default main agent, minimal native-agent model injection, current-session mirroring, and a forced plugin output style.',
    '',
    '## Default posture',
    '- Trivial, low-risk edits: do them directly.',
    '- Read relevant files before changing code, and prefer editing existing files over creating new ones unless a new file is truly required.',
    '- Prefer dedicated Claude Code read / edit / write / search tools over shell commands whenever a dedicated tool exists.',
    '- If independent tool calls do not depend on each other, run them in parallel.',
    '- If you are unsure whether a tool, plugin, agent type, permission, or MCP capability exists, run `ToolSearch` before guessing.',
    '- For Claude Code / Claude API / Agent SDK / hooks / MCP / settings questions, prefer native `Claude Code Guide` first and use official docs when needed.',
    '- For multi-step or cross-file work, prefer `EnterPlanMode()` or at least `TaskCreate` / `TaskUpdate` / `TaskList`.',
    '- For repository understanding, start with native search / read tools and move to native `Agent` with `Explore` or `Plan` when the search surface becomes wider.',
    '- For bounded delegated implementation or verification, prefer native `Agent` with `General-Purpose` over ad-hoc text delegation.',
    '- For parallelizable work, prefer native `Agent`; for sustained coordination, use `TeamCreate` plus `Task*` rather than roleplaying a team in prose.',
    '- For external systems, connected tools, or MCP-backed data sources, run `ToolSearch` first and prefer native MCP tools before web fallback.',
    '- Never roleplay agents or teams in plain text when native tools exist.',
    '- Avoid speculative abstractions, one-off helpers, or defensive complexity for scenarios that cannot actually happen.',
    '- Before claiming completion, run the narrowest relevant validation first and expand only if needed.',
    '- Report validation honestly: if a check was not run or failed, say so plainly.',
    '- Prefer Markdown or aligned ASCII tables for comparisons, inventories, task matrices, validation summaries, and option trade-offs when they improve scanability.',
    '',
    '## Built-in agent types',
    '- `Explore`',
    '- `Plan`',
    '- `General-Purpose` (internal id `general-purpose`)',
    '- `Claude Code Guide` (internal id `claude-code-guide`)',
    '',
    '## Plugin output style',
    `- force-for-plugin output style: \`${FORCED_OUTPUT_STYLE_NAME}\``,
    '- On Claude Code builds that support plugin output-style forcing, hello2cc applies its thin native-first style without mutating user settings files.',
    '- The style is intentionally thin: keep Claude Code native behavior, restate only a minimal host-parity tasking subset, favor concise structured output, and use tables where they improve scanability.',
    '',
    ...buildToolSearchLines(sessionContext),
    '',
    ...buildModelPolicyLines(config),
  ].join('\n');
}

export function buildRouteSteps(prompt, sessionContext = {}) {
  const signals = classifyPrompt(prompt);
  const config = configuredModels(sessionContext);
  const toolSearch = toolSearchStatus(sessionContext);
  const steps = [];

  if (signals.toolSearchFirst && toolSearch.available) {
    steps.push('先 `ToolSearch` 确认可用工具、原生 agent 类型、插件能力、权限与 MCP 边界，不要凭记忆猜。');
  } else if (signals.toolSearchFirst && !toolSearch.available) {
    steps.push('当前会话没有暴露原生 `ToolSearch`：hello2cc 不能在插件层强行开启它。若你正通过第三方网关使用 Claude Code，请确认 `ENABLE_TOOL_SEARCH=true`，并确保网关透传 beta headers 与 `tool_reference` blocks。');
  }

  if (signals.mcp) {
    steps.push('如果任务涉及外部系统、数据源或集成平台，优先查找并调用原生 MCP / connected tools；只有在本地能力不存在时再退回网页搜索。');
  }

  if (signals.claudeGuide) {
    steps.push('这是 Claude Code / Claude API / Agent SDK / hooks / settings / MCP 能力问题：优先调用原生 `Agent` 的 `Claude Code Guide`，必要时再抓取官方文档。');
  } else if (signals.codeResearch) {
    steps.push('这是代码库研究 / 定位任务：先用原生读写 / 搜索工具缩小范围，再在需要更大搜索面时转原生 `Explore` 或 `Plan`。');
  } else if (signals.research) {
    steps.push('这是研究 / 对比 / 文档任务：先做定向搜索与证据收集，再在需要时转原生 `Explore` 或 `Plan`。');
  }

  if (signals.boundedImplementation) {
    steps.push('这是边界清晰的实现 / 修复 / 验证子任务：优先使用原生 `Agent` 的 `General-Purpose` 承接单一切片，而不是把探索、规划和实现都混在主线程。');
  }

  if (signals.complex) {
    steps.push('这是非 trivial 实现：先 `EnterPlanMode()`，或至少用 `TaskCreate` / `TaskUpdate` / `TaskList` 建立可追踪任务，再开始编辑。');
  }

  if (signals.plan) {
    steps.push('任务存在跨文件、架构取舍或多个阶段：优先计划模式；如果不进入计划模式，也要维护原生任务清单。');
  } else if (signals.taskList) {
    steps.push('该任务适合显式拆解：优先维护 `TaskCreate` / `TaskUpdate` / `TaskList`，不要只在正文里口头列步骤。');
  }

  if (signals.swarm) {
    steps.push('存在并行空间：先拆出独立 `Task*`，再并行调用原生 `Agent`；持续协作或共享状态时使用 `TeamCreate` + `Task*`，不要用文本模拟团队。');
  }

  const teamStep = buildTeamStep(signals);
  if (teamStep) {
    steps.push(teamStep);
  }

  if (signals.diagram) {
    steps.push('需要结构化表达：优先高质量 Markdown/ASCII 表格或图示，保持列宽、标签和连线风格一致。');
  }

  if (signals.verify) {
    steps.push('收尾前先做最贴近改动范围的验证，再视结果扩大范围；未验证不要声称已完成。');
  }

  if (config.routingPolicy !== 'prompt-only') {
    steps.push('如果原生 `Agent` 调用命中了 `Claude Code Guide` / `Explore` 等非原生默认模型路径，hello2cc 会优先镜像当前会话模型别名；只有显式配置了覆盖项时才会扩大注入范围。显式传入的 `model` 永远优先。');
  }

  if (steps.length === 0) return '';

  return [
    '# hello2cc native-first routing',
    '',
    '按下面顺序优先决策：',
    '',
    ...steps.map((step, index) => `${index + 1}. ${step}`),
  ].join('\n');
}
