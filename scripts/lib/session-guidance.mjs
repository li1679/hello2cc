import { FORCED_OUTPUT_STYLE_NAME, configuredModels } from './config.mjs';
import { resolveWebSearchGuidanceMode } from './api-topology.mjs';
import { observedAgentSurfaces } from './session-capabilities.mjs';

function formatNames(values) {
  return values.map((value) => `\`${value}\``).join(', ');
}

function formatCommandEntries(values) {
  return values
    .map((value) => {
      const name = String(value?.name || '').trim();
      const args = String(value?.args || '').trim();
      if (!name) return '';
      return `\`${args ? `${name} ${args}` : name}\``;
    })
    .filter(Boolean)
    .join(', ');
}

function formatMcpResources(values, limit = 4) {
  return values
    .slice(0, limit)
    .map((value) => `\`${value.server}:${value.uri}\``)
    .join(', ');
}

function detectedTools(sessionContext = {}) {
  return Array.isArray(sessionContext?.toolNames) ? sessionContext.toolNames.filter(Boolean) : [];
}

function detectedAgents(sessionContext = {}) {
  return Array.isArray(sessionContext?.agentTypes) ? sessionContext.agentTypes.filter(Boolean) : [];
}

function surfacedSkills(sessionContext = {}) {
  return Array.isArray(sessionContext?.surfacedSkillNames) ? sessionContext.surfacedSkillNames.filter(Boolean) : [];
}

function surfacedSkillEntries(sessionContext = {}) {
  return Array.isArray(sessionContext?.surfacedSkills) ? sessionContext.surfacedSkills.filter(Boolean) : [];
}

function loadedCommandEntries(sessionContext = {}) {
  return Array.isArray(sessionContext?.loadedCommands) ? sessionContext.loadedCommands.filter(Boolean) : [];
}

function workflowNames(sessionContext = {}) {
  return Array.isArray(sessionContext?.workflowNames) ? sessionContext.workflowNames.filter(Boolean) : [];
}

function availableDeferredToolNames(sessionContext = {}) {
  return Array.isArray(sessionContext?.availableDeferredToolNames) ? sessionContext.availableDeferredToolNames.filter(Boolean) : [];
}

function loadedDeferredToolNames(sessionContext = {}) {
  return Array.isArray(sessionContext?.loadedDeferredToolNames) ? sessionContext.loadedDeferredToolNames.filter(Boolean) : [];
}

function mcpResources(sessionContext = {}) {
  return Array.isArray(sessionContext?.mcpResources) ? sessionContext.mcpResources.filter(Boolean) : [];
}

function buildObservedSurfaceLines(sessionContext = {}) {
  const tools = detectedTools(sessionContext);
  const agents = detectedAgents(sessionContext);
  const workflows = workflowNames(sessionContext);
  const availableDeferred = availableDeferredToolNames(sessionContext);
  const loadedDeferred = loadedDeferredToolNames(sessionContext);
  const resources = mcpResources(sessionContext);

  if (
    tools.length === 0 &&
    agents.length === 0 &&
    workflows.length === 0 &&
    availableDeferred.length === 0 &&
    loadedDeferred.length === 0 &&
    resources.length === 0
  ) {
    return [
      '## 当前会话能力',
      '- Claude Code 还没有在 hook 负载里显式列出本会话能力；保持原生工作方式即可，不要凭空发明不存在的工具或 agent。',
    ];
  }

  const lines = ['## 当前会话能力'];
  if (tools.length) {
    lines.push(`- 已观测到的原生工具：${formatNames(tools)}。`);
  }
  if (agents.length) {
    lines.push(`- 已观测到的内建 agent：${formatNames(agents)}。`);
  }
  if (workflows.length) {
    lines.push(`- 当前会话已出现过 workflow：${formatNames(workflows)}。`);
  }
  if (availableDeferred.length) {
    lines.push(`- 当前会话已 surfaced 的 deferred tools：${formatNames(availableDeferred)}。`);
  }
  if (loadedDeferred.length) {
    lines.push(`- 当前会话已加载过的 deferred tools：${formatNames(loadedDeferred)}。`);
  }
  if (resources.length) {
    lines.push(`- 当前会话已观测到的 MCP resources：${formatMcpResources(resources)}。`);
  }
  return lines;
}

function buildSessionModelLines(sessionContext = {}) {
  const config = configuredModels(sessionContext);
  const lines = ['## 会话使用方式'];

  lines.push('- 像平常一样直接使用 Claude Code；不需要额外手动加载，也不需要切换到另一套工作流。');
  lines.push('- hello2cc 负责强化宿主已暴露的能力表面：原生工具、原生 agent、skills / workflows、MCP / connected tools 与计划任务习惯；它不替换现有 `CLAUDE.md`、项目规则或用户指定输出格式。');

  if (config.sessionModel) {
    lines.push(`- 当前会话模型别名：\`${config.sessionModel}\`。`);
  }

  if (config.routingPolicy === 'prompt-only') {
    lines.push('- 当前仅做原生能力引导，不改写原生工具输入。');
  } else {
    lines.push('- 当原生 `Agent` 调用没有显式 `model` 时，优先保持与当前会话模型一致。');
  }

  lines.push('- 如果原生工具调用里已经显式传入 `model`，始终以显式值为准。');
  return lines;
}

function buildWorkingHabitLines() {
  return [
    '## 原生工作习惯',
    '- 保持 Claude / Opus 风格的原生工作方式：先读相关代码，再改动；优先改已有文件而不是新建文件。',
    '- 可见文本默认跟随用户当前语言；除非用户明确要求，否则不要无故切换语言。',
    '- 不要把内部思考过程直接说出来；工具前说明保持一句简短行动描述，避免“我打算 / 我应该 / let’s”式元叙述。',
    '- 把宿主已暴露的 skills / workflows / plugin tools / MCP tools 视为一等能力；不要因为 hello2cc 存在就绕开它们。',
    '- 有专用读写 / 搜索工具时优先用专用工具，再考虑 shell。',
    '- 优先走最具体的能力表面：已加载的 workflow / slash command / skill 连续体 → 已 surfaced 的 skill → `DiscoverSkills` → 已知 MCP resource → 已加载 / 已 surfaced 的 deferred tool → `ToolSearch` → 更宽的 agent 路径。',
    '- 非 trivial 任务优先 `EnterPlanMode()`；如果后续是持续协作型 team 工作流，就把计划尽快落到原生 task board，而不是只停留在口头分工。',
    '- 不确定可用工具、agent、MCP、权限边界时，优先 `ToolSearch`。',
    '- Claude Code / hooks / MCP / settings / Agent SDK / Claude API 问题优先 `Claude Code Guide`（本地读搜 + `WebFetch` + `WebSearch`）。',
    '- 代码库研究与范围探索优先原生搜索，再按需要转 `Explore`（只读搜索）或 `Plan`（只读规划）。',
    '- 边界清晰的实现、修复、验证切片优先 `General-Purpose`（全工具面）。',
    '- 多线任务默认优先并行多个原生 `Agent` worker；续派优先 `SendMessage`；跑偏时再 `TaskStop`。',
    '- 普通 `Agent` worker 默认不要传 `name` / `team_name`；避免宿主把普通 subagent 误路由成 teammate。',
    '- 持续协作型多 agent 任务（例如 frontend + backend、research + plan + implement、重构 + 验证、共享任务盘 / owner / handoff）要更像原生 Opus 一样主动偏向 `TeamCreate`，而不是只在用户显式说 team 时才进入团队模式。',
    '- 进入 team 模式后，先 `TeamCreate`，然后 `TaskList` / `TaskCreate` 建立真实 task board，再启动实现 teammate；不要一建团队就只靠正文口头分工。',
    '- 选择 teammate 时遵守原生 agent 工具面：`Explore` / `Plan` 只读，只做搜索或规划；需要改文件、联调、验证的切片交给 `General-Purpose`。',
    '- 真正需要 agent team 时，后续 `Agent` 要显式传入 `name` + `team_name`；团队内任务流转优先 `TaskCreate` / `TaskList` / `TaskUpdate` / `TaskGet`，分派和接力时显式维护 `owner`，补充协作或续派时再 `SendMessage`；完成后及时 `TeamDelete`。不要依赖 `main` / `default` 这类隐式 team 上下文。',
    '- teammate 每回合结束后变成 idle 是正常行为，不等于失败；如果某个 teammate 出现 `0 tool uses`、没有实质推进或 task 失配，优先用 `TaskGet` / `TaskList` + `SendMessage` 在团队内重对齐，而不是立刻判定 team 路径失效。',
    '- 如果同一个前提错误已经出现过一次（例如当前 cwd 不是 git 仓库却尝试 worktree，或某个 team 已确认不存在），在前提变化前不要沿着同一路径原样重试；前提一旦恢复（例如切到 git 仓库、补好 WorktreeCreate hooks、重新建 team），再继续原生路径。',
    '- 普通 worker 的结果默认看完成通知 / 回传消息，不要把 `TaskOutput` 当成普通 worker 的默认结果获取方式。',
    '- 纯文本 `SendMessage` 最好带简短 `summary` 预览；如果忘了带，hello2cc 会尽量补齐兼容层，避免踩到宿主校验坑。',
    '- 外部系统与集成优先原生 MCP / connected tools，优先 `ListMcpResources` / `ReadMcpResource`。',
    '- 如果只被一个真实用户选择阻塞，优先 `AskUserQuestion`。',
    '- 只有用户明确要求隔离工作树时才使用 `EnterWorktree`。',
    '- 宣称完成前先跑与改动最贴近的验证；验证结果要诚实。',
  ];
}

function buildSpecificityLines(sessionContext = {}) {
  const loaded = loadedCommandEntries(sessionContext);
  const workflows = workflowNames(sessionContext);
  const availableDeferred = availableDeferredToolNames(sessionContext);
  const loadedDeferred = loadedDeferredToolNames(sessionContext);
  const resources = mcpResources(sessionContext);
  const skillToolAvailable = Boolean(sessionContext?.skillToolAvailable);
  const discoverSkillsAvailable = Boolean(sessionContext?.discoverSkillsAvailable);
  const listMcpResourcesAvailable = Boolean(sessionContext?.listMcpResourcesAvailable);
  const readMcpResourceAvailable = Boolean(sessionContext?.readMcpResourceAvailable);

  if (
    loaded.length === 0 &&
    workflows.length === 0 &&
    resources.length === 0 &&
    availableDeferred.length === 0 &&
    loadedDeferred.length === 0 &&
    !skillToolAvailable &&
    !discoverSkillsAvailable &&
    !listMcpResourcesAvailable &&
    !readMcpResourceAvailable
  ) {
    return [];
  }

  const lines = ['## Specificity 路由'];
  lines.push('- 默认顺序：已加载 workflow / slash command / skill 连续体 → 已 surfaced 的 skill → `DiscoverSkills` → 已知 MCP resource → 已加载 / 已 surfaced 的 deferred tool → `ToolSearch` → 更广的 `Agent` / `Plan`。');

  if (loaded.length) {
    lines.push(`- 当前会话已加载过的 skill / workflow：${formatCommandEntries(loaded)}。如果下一步是在续跑这些流程，直接沿着现有上下文继续。`);
  }

  if (workflows.length) {
    lines.push(`- 当前会话已出现过 workflow：${formatNames(workflows)}。如果任务在延续这些 workflow，优先继续现有流程而不是重开新流程。`);
  }

  if (resources.length && readMcpResourceAvailable) {
    lines.push(`- 已知具体 MCP resource 时，优先直接 \`ReadMcpResource\`；当前会话已观测到：${formatMcpResources(resources)}。`);
  } else if (resources.length) {
    lines.push(`- 当前会话已观测到 MCP resources：${formatMcpResources(resources)}；如果宿主提供专门读取入口，优先直接读取这些资源。`);
  }

  if (listMcpResourcesAvailable || readMcpResourceAvailable) {
    lines.push('- MCP specificity：已知 resource URI → `ReadMcpResource`；只知道 server / 想看资源目录 → `ListMcpResources`；连 server / resource 都不确定时再 `ToolSearch`。');
  }

  if (loadedDeferred.length) {
    lines.push(`- 这些 deferred tools 已经通过 ToolSearch 加载过：${formatNames(loadedDeferred)}。如果下一步正好要用它们，直接调用，不要重复 ToolSearch。`);
  }

  if (availableDeferred.length) {
    lines.push(`- 这些 deferred tools 已 surfaced：${formatNames(availableDeferred)}。需要它们时优先精确 ToolSearch，而不是先泛化到更宽的 agent 路径。`);
  }

  return lines;
}

function buildSkillWorkflowLines(sessionContext = {}) {
  const skillToolAvailable = Boolean(sessionContext?.skillToolAvailable);
  const discoverSkillsAvailable = Boolean(sessionContext?.discoverSkillsAvailable);
  const surfaced = surfacedSkills(sessionContext);
  const loaded = loadedCommandEntries(sessionContext);
  const workflows = workflowNames(sessionContext);

  if (
    !skillToolAvailable &&
    !discoverSkillsAvailable &&
    surfaced.length === 0 &&
    loaded.length === 0 &&
    workflows.length === 0
  ) {
    return [];
  }

  const lines = ['## Skills / 插件工作流'];

  if (skillToolAvailable) {
    lines.push('- 当前会话已暴露 `Skill`；如果本轮已经出现 `Skills relevant to your task`、用户明确提到某个 slash command / skill / workflow，或你已经知道有匹配 skill，优先调用它，而不是自己重写流程。');
    lines.push('- 不要猜 skill 名称；只使用当前会话已暴露、已提示或已发现的 skill。');
  }

  if (discoverSkillsAvailable) {
    lines.push('- 当前会话已暴露 `DiscoverSkills`；遇到中途转向、专门 workflow、插件化能力，或你怀疑已有现成 skill 但当前列表不够时，先发现再调用。');
  }

  if (surfaced.length) {
    lines.push(`- 当前会话已 surfaced 的 skills：${formatNames(surfaced)}。如果其中已有匹配项，优先直接用它，而不是再重复探索或重写流程。`);
  }

  if (loaded.length) {
    lines.push(`- 当前会话已加载过的 skill / workflow：${formatCommandEntries(loaded)}。如果你正在延续这些流程，直接沿着现有上下文继续，不要重复发现或重复加载。`);
  }

  if (workflows.length) {
    lines.push(`- 当前会话已出现过的 workflow：${formatNames(workflows)}。如果你正在延续这些 workflow，优先沿用当前连续体。`);
  }

  if (skillToolAvailable && discoverSkillsAvailable) {
    lines.push('- `DiscoverSkills` 用于 skill / workflow 发现；`ToolSearch` 用于工具 / MCP / 权限边界发现。');
  }

  if (surfacedSkillEntries(sessionContext).some((entry) => entry.description)) {
    lines.push('- surfaced skill 只是在当前回合提醒“有哪些现成流程”；真正执行时仍应通过 `Skill` 进入对应流程。');
  }

  return lines;
}

function buildAgentSurfaceLines(sessionContext = {}) {
  const surfaces = observedAgentSurfaces(detectedAgents(sessionContext));
  if (surfaces.length === 0) return [];

  return [
    '## 内建 Agent 能力面',
    ...surfaces.map((surface) => {
      if (surface.key === 'Explore') {
        return '- `Explore`：只读搜索；优先 `Glob/Grep/Read` 与只读 shell，不做编辑。';
      }
      if (surface.key === 'Plan') {
        return '- `Plan`：只读规划；工具面基本继承 `Explore`，输出计划而不是改文件。';
      }
      if (surface.key === 'general-purpose') {
        return '- `General-Purpose`：全工具面 `*`；适合边界清晰的实现、修复、验证切片。';
      }
      if (surface.key === 'claude-code-guide') {
        return '- `Claude Code Guide`：本地读搜 + `WebFetch` + `WebSearch`；适合 Claude Code / API / SDK / MCP 能力问题。';
      }
      return `- \`${surface.label}\`：${surface.role}；工具面 ${surface.toolSurface.join(' / ')}。`;
    }),
  ];
}

function buildTeamCoordinationLines() {
  return [
    '## Team / task-board 协作',
    '- 原生 team 顺序：`TeamCreate` → `TaskList` / `TaskCreate` → `Agent(name + team_name)` → `TaskUpdate` / `TaskGet` / `SendMessage` → `TeamDelete`。',
    '- task board 要写成真实可执行项：subject 清晰、description 足够让 teammate 独立推进；需要依赖关系时明确 `blockedBy` / `owner`。',
    '- teammate 开工前先看 `TaskList`，更新任务前先 `TaskGet`；开始做事时把任务推进到 `in_progress`，只有真正完成才标 `completed`。',
    '- 做完一个 task 后先 `TaskList` 看下一个未阻塞任务；如果卡住，就保持任务未完成并通过 `SendMessage` 说明 blocker 或需要的 handoff。',
    '- teammate 之间真正的沟通靠 `SendMessage`；写在普通正文里的话不是团队协作通道。',
  ];
}

function buildToolSearchLines() {
  return [
    '## ToolSearch 状态',
    '- 原生 `ToolSearch` 是默认优先路径：先用它确认可用工具、原生 agent 类型、MCP 能力、权限与边界。',
    '- hello2cc 不会主动把第三方模型从这条原生路径拉走。',
  ];
}

function buildWebSearchLines(sessionContext = {}) {
  const mode = resolveWebSearchGuidanceMode(sessionContext);

  if (mode === 'available') {
    return [
      '## 实时信息与 WebSearch',
      '- 当前会话已暴露原生 `WebSearch`；遇到最新/今天/新闻/价格/天气/发布动态等问题时，优先先拿到实时来源，再组织回答。',
      '- 如果 `WebSearch` 没有给出真实来源或搜索条目，就不要把记忆包装成联网结果。',
      '- `WebSearch` 只负责实时来源；代码执行、文件读写、MCP 与 agent 协作仍优先走各自原生工具。',
    ];
  }

  if (mode === 'proxy-conditional') {
    return [
      '## 实时信息与 WebSearch',
      '- 当前会话已暴露原生 `WebSearch`，但链路看起来是自定义 `ANTHROPIC_BASE_URL` 代理；有些代理会转发真实搜索，有些不会。',
      '- 仍然优先尝试原生 `WebSearch`；hello2cc 不会因为使用自定义代理就直接阻断这条路径。',
      '- 只有当 `WebSearch` 真正返回搜索条目或来源链接时，才把它当成联网成功；如果界面出现 `Did 0 searches`、无来源或无搜索结果，必须明确说明未完成真实搜索。',
      '- `WebSearch` 只负责实时来源；代码执行、文件读写、MCP 与 agent 协作仍优先走各自原生工具。',
    ];
  }

  if (mode === 'not-exposed') {
    return [
      '## 实时信息与 WebSearch',
      '- 当前会话未显式暴露原生 `WebSearch`；不要声称自己已经联网搜索了最新信息。',
      '- 如果用户要求最新/实时信息，优先查找宿主真实暴露的联网工具；没有就明确说明边界。',
    ];
  }

  if (mode === 'proxy-unknown') {
    return [
      '## 实时信息与 WebSearch',
      '- 当前链路看起来是自定义 `ANTHROPIC_BASE_URL` 代理；若宿主暴露原生 `WebSearch`，优先用它获取实时来源。',
      '- hello2cc 不会因为你使用代理就自动禁用 `WebSearch`；它只要求在没有真实搜索结果时诚实表达边界。',
      '- 只有拿到真实搜索条目或来源链接时，才按联网结果回答；否则必须明确说明边界，不要把记忆当成实时搜索。',
    ];
  }

  return [
    '## 实时信息与 WebSearch',
    '- 遇到最新/实时信息任务时，若宿主暴露原生 `WebSearch`，优先用它获取来源；不要只凭记忆回答这类问题。',
    '- 如果没有真实搜索条目或来源，就明确说明当前边界，不要假装已经联网。',
  ];
}

export function buildSessionStartContext(sessionContext = {}) {
  return [
    '# hello2cc',
    '',
    'hello2cc 会让第三方模型在 Claude Code 里尽量按宿主真实暴露的方式工作：优先使用已暴露的工具、agent、skills / workflows、MCP 与计划协作能力，而不是绕过它们另写一套。',
    '',
    '## 优先级',
    '- 用户当前消息、Claude Code 宿主规则、`CLAUDE.md` / `AGENTS.md` / 项目规则，始终高于 hello2cc。',
    '- hello2cc 不得覆盖现有工作流、输出格式、命令路由、顶部/底部信息栏或项目约定。',
    '',
    ...buildSessionModelLines(sessionContext),
    '',
    ...buildWorkingHabitLines(),
    '',
    ...buildSpecificityLines(sessionContext),
    '',
    ...buildSkillWorkflowLines(sessionContext),
    '',
    ...buildObservedSurfaceLines(sessionContext),
    '',
    ...buildAgentSurfaceLines(sessionContext),
    '',
    ...buildTeamCoordinationLines(),
    '',
    ...buildToolSearchLines(),
    '',
    ...buildWebSearchLines(sessionContext),
    '',
    '## 输出风格',
    `- 当前插件输出风格：\`${FORCED_OUTPUT_STYLE_NAME}\`。`,
    '- 如果更高优先级规则没有指定格式，保持 Claude Code 原生、简洁、结果导向的表达。',
    '- 如果需要表格，优先 Markdown 表格；只有 Markdown 明显不适合时再使用 ASCII。',
  ].join('\n');
}
