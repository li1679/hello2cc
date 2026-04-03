import {
  availableDeferredToolNames,
  loadedCommandEntries,
  loadedDeferredToolNames,
  mcpResources,
  workflowEntries,
} from './session-context-accessors.mjs';
import {
  formatCommandEntries,
  formatMcpResources,
  formatNames,
} from './session-surface-formatters.mjs';

export function buildSkillWorkflowStep(signals, sessionContext = {}) {
  const skillToolAvailable = Boolean(sessionContext?.skillToolAvailable);
  const discoverSkillsAvailable = Boolean(sessionContext?.discoverSkillsAvailable);
  const surfacedSkillNames = Array.isArray(sessionContext?.surfacedSkillNames) ? sessionContext.surfacedSkillNames.filter(Boolean) : [];
  const loadedCommands = loadedCommandEntries(sessionContext);
  const workflows = workflowEntries(sessionContext);

  if (
    !skillToolAvailable &&
    !discoverSkillsAvailable &&
    surfacedSkillNames.length === 0 &&
    loadedCommands.length === 0 &&
    workflows.length === 0
  ) {
    return '';
  }

  const needsWorkflowRouting = Boolean(
    signals.skillSurface ||
    signals.skillWorkflowLike ||
    signals.complex ||
    signals.taskList ||
    signals.workflowContinuation,
  );

  if (!needsWorkflowRouting) {
    return '';
  }

  const lines = [];

  if (loadedCommands.length) {
    lines.push(`当前会话已加载过的 skill / workflow：${formatCommandEntries(loadedCommands)}。如果当前任务是在延续这些流程，直接沿着现有上下文继续，不要重复发现或重写。`);
  }

  if (workflows.length) {
    lines.push(`当前会话已出现过 workflow：${formatNames(workflows.map((entry) => entry.name))}。如果当前任务在延续这些流程，优先继续现有 workflow。`);
  }

  if (surfacedSkillNames.length) {
    lines.push(`当前会话已 surfaced 的 skills：${formatNames(surfacedSkillNames)}。如果其中有匹配项，优先直接调用对应 \`Skill\`。`);
  }

  if (skillToolAvailable) {
    lines.push('如果当前回合已经出现 `Skills relevant to your task`、用户明确提到某个 skill / slash command / plugin workflow，或你已经知道有匹配的宿主 skill，就优先调用 `Skill`，不要绕过它重写同一套流程。');
  }

  if (discoverSkillsAvailable) {
    lines.push('如果当前可见 skill 不能覆盖下一步，但任务像是可复用 workflow、插件能力或专门套路，先用 `DiscoverSkills` 做技能发现，再调用匹配的 `Skill`；不要猜 skill 名称。');
  }

  if (skillToolAvailable && discoverSkillsAvailable) {
    lines.push('`ToolSearch` 主要用于工具 / MCP / 权限边界发现；`DiscoverSkills` 主要用于 skill / workflow 发现，不要混用。');
  }

  return lines.join(' ');
}

export function buildMcpSpecificityStep(signals, sessionContext = {}) {
  const resources = mcpResources(sessionContext);
  const listAvailable = Boolean(sessionContext?.listMcpResourcesAvailable);
  const readAvailable = Boolean(sessionContext?.readMcpResourceAvailable);

  if (!signals.mcp && !signals.workflowContinuation && resources.length === 0) {
    return '';
  }

  const lines = [];

  if (resources.length) {
    if (readAvailable) {
      lines.push(`当前会话已观测到的 MCP resources：${formatMcpResources(resources)}。如果下一步继续用这些资源，优先直接 \`ReadMcpResource\`，不要先重新发现整个 MCP 面。`);
    } else {
      lines.push(`当前会话已观测到的 MCP resources：${formatMcpResources(resources)}。如果宿主提供资源读取入口，优先直接读取这些已知资源。`);
    }
  }

  if (listAvailable || readAvailable) {
    lines.push('MCP specificity 顺序：已知 resource URI → `ReadMcpResource`；只知道 server 或需要资源目录 → `ListMcpResources`；连 server / resource 都不确定时再 `ToolSearch`。');
  }

  return lines.join(' ');
}

export function buildDeferredToolStep(signals, sessionContext = {}) {
  const availableDeferred = availableDeferredToolNames(sessionContext);
  const loadedDeferred = loadedDeferredToolNames(sessionContext);

  if (loadedDeferred.length === 0 && availableDeferred.length === 0) {
    return '';
  }

  if (
    !signals.workflowContinuation &&
    !signals.capabilityQuery &&
    !signals.mcp &&
    !signals.tools
  ) {
    return '';
  }

  const lines = [];

  if (loadedDeferred.length) {
    lines.push(`这些 deferred tools 已经通过 ToolSearch 加载过：${formatNames(loadedDeferred)}。如果下一步正好要用它们，直接调用，不要重复 ToolSearch。`);
  }

  if (availableDeferred.length) {
    lines.push(`这些 deferred tools 已 surfaced：${formatNames(availableDeferred)}。需要它们时优先精确 ToolSearch，而不是先泛化到更宽的 agent 路径。`);
  }

  return lines.join(' ');
}

export function hasSpecificContinuationSurface(sessionContext = {}) {
  return Boolean(
    loadedCommandEntries(sessionContext).length ||
    workflowEntries(sessionContext).length ||
    mcpResources(sessionContext).length ||
    loadedDeferredToolNames(sessionContext).length ||
    availableDeferredToolNames(sessionContext).length
  );
}
