import { observedAgentSurfaces } from './session-capabilities.mjs';
import {
  availableDeferredToolNames,
  detectedAgents,
  detectedTools,
  loadedCommandEntries,
  loadedDeferredToolNames,
  mcpResources,
  surfacedSkillEntries,
  surfacedSkills,
  workflowNames,
} from './session-context-accessors.mjs';
import {
  formatCommandEntries,
  formatMcpResources,
  formatNames,
} from './session-surface-formatters.mjs';

export function buildObservedSurfaceLines(sessionContext = {}) {
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

export function buildSpecificityLines(sessionContext = {}) {
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

export function buildSkillWorkflowLines(sessionContext = {}) {
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

export function buildAgentSurfaceLines(sessionContext = {}) {
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
