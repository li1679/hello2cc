import { observedAgentSurfaces } from './session-capabilities.mjs';
import {
  availableDeferredToolNames,
  detectedAgents,
  mcpResources,
  surfacedSkills,
  workflowNames,
} from './session-context-accessors.mjs';
import {
  formatMcpResources,
  formatNames,
} from './session-surface-formatters.mjs';
import {
  activeTeamName,
  baseDecisionLadder,
  requestNeedsCapabilityDiscovery,
  requestNeedsDecisionHelp,
  requestNeedsParallelWorkers,
  requestNeedsPlanning,
  requestNeedsTeamWorkflow,
  requestNeedsWorkflowRouting,
  requestOutputShape,
  sessionModelLine,
} from './capability-policy-helpers.mjs';
import { resolveWebSearchGuidanceState } from './api-topology.mjs';

function hasDeferredSurface(sessionContext = {}) {
  return availableDeferredToolNames(sessionContext).length > 0;
}

function hasSkillSurface(sessionContext = {}) {
  return surfacedSkills(sessionContext).length > 0 || workflowNames(sessionContext).length > 0;
}

function hasMcpSurface(sessionContext = {}) {
  return mcpResources(sessionContext).length > 0;
}

export const CORE_POLICY_DEFINITIONS = [
  {
    id: 'specificity-ladder',
    title: 'Specificity / capability ladder',
    available: () => true,
    sessionLines(sessionContext) {
      const lines = [
        '- 宿主先定义能力边界与优先级；模型只在这个受约束空间里做语义匹配和最终工具选择。',
        '- 默认顺序：已加载连续体 → surfaced capability → discovery → 更宽的 agent / team 路径；不要一上来就退回最宽的工具或自创工作流。',
      ];
      const modelLine = sessionModelLine(sessionContext);
      if (modelLine) lines.push(`- ${modelLine}`);
      return lines;
    },
    routeLines(requestProfile) {
      const lines = [];
      const shouldSurface = Boolean(
        requestNeedsPlanning(requestProfile) ||
        requestProfile?.boundedImplementation ||
        requestProfile?.compare ||
        requestNeedsCapabilityDiscovery(requestProfile) ||
        requestNeedsWorkflowRouting(requestProfile) ||
        requestNeedsTeamWorkflow(requestProfile) ||
        requestNeedsParallelWorkers(requestProfile) ||
        requestNeedsDecisionHelp(requestProfile),
      );

      if (!shouldSurface) {
        return lines;
      }

      lines.push('先按宿主能力优先级决策，再在被允许的能力面内选择工具；不要把未知能力、隐含权限或未 surfaced 的 workflow 当成可直接使用。');

      if (requestNeedsPlanning(requestProfile)) {
        lines.push('如果实现路径 genuinely unclear、架构取舍明显或需要先探索再定方案，先走原生规划；路径清晰时直接推进。');
      }

      if (requestProfile?.boundedImplementation) {
        lines.push('这是边界清晰的实现 / 修复 / 验证切片：优先直接推进或交给 `General-Purpose`，不要先把探索、规划、team 协作混成一团。');
      }

      if (requestProfile?.compare) {
        lines.push('这是比较 / 选型 / 能力边界问题：默认直接回答，必要时用紧凑 Markdown 对比表；不要先进入 plan。');
      }

      return lines;
    },
    snapshot(sessionContext, requestProfile) {
      return {
        id: 'specificity-ladder',
        mode: 'host_defines_capability_priority',
        order: baseDecisionLadder(),
        output_shape: requestOutputShape(requestProfile),
        active_team: activeTeamName(sessionContext) || undefined,
      };
    },
  },
  {
    id: 'skills-workflows',
    title: 'Skills / workflows',
    available(sessionContext) {
      return Boolean(
        sessionContext?.skillToolAvailable ||
        sessionContext?.discoverSkillsAvailable ||
        hasSkillSurface(sessionContext),
      );
    },
    sessionLines(sessionContext) {
      const lines = [];
      const surfaced = surfacedSkills(sessionContext);
      const workflows = workflowNames(sessionContext);

      if (sessionContext?.skillToolAvailable) {
        lines.push('- `Skill` 是一等能力：如果 surfaced skill、已知 workflow、slash command 或已加载连续体已经覆盖任务，就直接用它，不要重写流程。');
      }

      if (sessionContext?.discoverSkillsAvailable) {
        lines.push('- `DiscoverSkills` 只用于 skill / workflow 发现；它不是通用工具发现器。');
      }

      if (surfaced.length) {
        lines.push(`- 当前 surfaced 的 skills：${formatNames(surfaced)}。`);
      }

      if (workflows.length) {
        lines.push(`- 当前会话已出现过 workflow：${formatNames(workflows)}。`);
      }

      return lines;
    },
    routeLines(requestProfile, sessionContext) {
      const lines = [];

      if (requestNeedsWorkflowRouting(requestProfile) && sessionContext?.skillToolAvailable) {
        lines.push('如果当前任务是在延续已 surfaced 的 skill / workflow，优先沿用当前连续体，不要重开一套平行流程。');
      }

      if ((requestNeedsWorkflowRouting(requestProfile) || requestNeedsCapabilityDiscovery(requestProfile)) && sessionContext?.discoverSkillsAvailable) {
        lines.push('如果感觉存在现成 workflow 但当前 surfaced 列表不够，先 `DiscoverSkills`，再调用匹配的 `Skill`；不要猜 skill 名称。');
      }

      return lines;
    },
    snapshot(sessionContext) {
      return {
        id: 'skills-workflows',
        surfaced_skills: surfacedSkills(sessionContext),
        workflows: workflowNames(sessionContext),
        discovery_tool: sessionContext?.discoverSkillsAvailable ? 'DiscoverSkills' : undefined,
        invoke_tool: sessionContext?.skillToolAvailable ? 'Skill' : undefined,
      };
    },
  },
  {
    id: 'mcp-resources',
    title: 'MCP resources / connected tools',
    available(sessionContext) {
      return Boolean(
        sessionContext?.listMcpResourcesAvailable ||
        sessionContext?.readMcpResourceAvailable ||
        hasMcpSurface(sessionContext),
      );
    },
    sessionLines(sessionContext) {
      const lines = [
        '- 外部系统、数据源和集成平台优先走宿主真实暴露的 MCP resource / connected tools，不要先靠泛化 agent 或 Bash 瞎试。',
      ];
      const resources = mcpResources(sessionContext);
      if (resources.length) {
        lines.push(`- 当前已观测到的 MCP resources：${formatMcpResources(resources)}。`);
      }
      if (sessionContext?.listMcpResourcesAvailable || sessionContext?.readMcpResourceAvailable) {
        lines.push('- MCP specificity：已知 resource URI → `ReadMcpResource`；只知道 server 或要列目录 → `ListMcpResources`；连资源都不确定时再 `ToolSearch`。');
      }
      return lines;
    },
    routeLines(requestProfile, sessionContext) {
      if (!requestProfile?.mcp && !hasMcpSurface(sessionContext)) {
        return [];
      }

      return [
        '如果当前任务涉及外部系统或数据源，优先已知的 MCP resource；只有资源和 server 都不确定时，才回退到更宽的发现路径。',
      ];
    },
    snapshot(sessionContext) {
      return {
        id: 'mcp-resources',
        known_resources: mcpResources(sessionContext).map((resource) => `${resource.server}:${resource.uri}`),
        list_tool: sessionContext?.listMcpResourcesAvailable ? 'ListMcpResources' : undefined,
        read_tool: sessionContext?.readMcpResourceAvailable ? 'ReadMcpResource' : undefined,
      };
    },
  },
  {
    id: 'tool-discovery',
    title: 'Deferred tools / ToolSearch',
    available(sessionContext) {
      return Boolean(sessionContext?.toolSearchAvailable || hasDeferredSurface(sessionContext));
    },
    sessionLines(sessionContext) {
      const lines = [];
      const deferred = availableDeferredToolNames(sessionContext);
      if (deferred.length) {
        lines.push(`- 当前 surfaced 的 deferred tools：${formatNames(deferred)}；需要时优先精确 ` + '`ToolSearch`' + '，不要先泛化到更宽的 agent 路径。');
      }
      if (sessionContext?.toolSearchAvailable) {
        lines.push('- `ToolSearch` 只用于工具 / MCP / agent 类型 / 权限边界发现；不是“什么都先搜一下”的默认动作。');
      }
      return lines;
    },
    routeLines(requestProfile, sessionContext) {
      const lines = [];
      if (!sessionContext?.toolSearchAvailable) {
        return lines;
      }

      if (requestNeedsCapabilityDiscovery(requestProfile)) {
        lines.push('如果你真正不确定可用工具、agent、MCP 能力或权限边界，再用 `ToolSearch`；已知更具体表面时直接用具体表面。');
      }

      if (!requestNeedsCapabilityDiscovery(requestProfile) && (requestNeedsWorkflowRouting(requestProfile) || hasSkillSurface(sessionContext) || hasMcpSurface(sessionContext))) {
        lines.push('当前已有更具体的宿主能力线索；除非这些线索无法覆盖下一步，否则不要先退回 `ToolSearch`。');
      }

      return lines;
    },
    snapshot(sessionContext) {
      return {
        id: 'tool-discovery',
        discovery_tool: sessionContext?.toolSearchAvailable ? 'ToolSearch' : undefined,
        surfaced_deferred_tools: availableDeferredToolNames(sessionContext),
        constrained_to_host_surface: true,
      };
    },
  },
  {
    id: 'agent-routing',
    title: 'Native agents',
    available(sessionContext) {
      return Boolean(sessionContext?.agentToolAvailable || detectedAgents(sessionContext).length);
    },
    sessionLines(sessionContext) {
      const lines = [
        '- `Agent` 不是默认万能兜底；优先把简单定向搜索留给原生搜索工具，把开放式探索交给 `Explore`，把只读规划交给 `Plan`，把边界清晰的实现 / 修复 / 验证交给 `General-Purpose`。',
      ];
      const surfaces = observedAgentSurfaces(detectedAgents(sessionContext));
      if (surfaces.length) {
        lines.push(`- 当前已观测到的 agent surfaces：${formatNames(surfaces.map((surface) => surface.label))}。`);
      }
      return lines;
    },
    routeLines(requestProfile) {
      const lines = [];

      if (requestProfile?.codeResearch) {
        lines.push('代码库研究与范围探索优先原生搜索，必要时再转 `Explore`（只读搜索）或 `Plan`（只读规划）。');
      }

      if (requestProfile?.boundedImplementation) {
        lines.push('边界清晰的实现、修复、验证切片优先 `General-Purpose`。');
      }

      if (requestNeedsParallelWorkers(requestProfile) && !requestNeedsTeamWorkflow(requestProfile)) {
        lines.push('这是一次性 fan-out / fan-in 的多线任务：优先并行 plain `Agent` workers，不要默认升级成 team。');
      }

      return lines;
    },
    snapshot(sessionContext) {
      return {
        id: 'agent-routing',
        observed_surfaces: observedAgentSurfaces(detectedAgents(sessionContext)).map((surface) => ({
          name: surface.label,
          role: surface.role,
          tool_surface: surface.toolSurface,
        })),
      };
    },
  },
  {
    id: 'websearch',
    title: 'WebSearch / current info',
    available(sessionContext) {
      return Boolean(sessionContext?.webSearchAvailable || sessionContext?.webFetchAvailable);
    },
    sessionLines(sessionContext) {
      if (!sessionContext?.webSearchAvailable) {
        return [
          '- 当前会话未显式看到原生 `WebSearch`；不要把记忆包装成已经联网获取的最新信息。',
        ];
      }

      return [
        '- 最新 / 今天 / 新闻 / 价格 / 发布动态等问题优先原生 `WebSearch` 拿来源；没有真实搜索条目或来源时必须诚实说明边界。',
      ];
    },
    routeLines(requestProfile, sessionContext) {
      if (!requestProfile?.currentInfo) {
        return [];
      }

      const { mode } = resolveWebSearchGuidanceState(sessionContext, {
        retryRequested: requestProfile?.webSearchRetry,
      });

      if (['available', 'proxy-conditional', 'generic'].includes(mode)) {
        return [];
      }

      if (mode === 'proxy-probe') {
        return [
          '这是实时信息任务：当前代理链路刚满足恢复条件，可做一次探测性 `WebSearch`；只有拿到真实搜索条目或来源时才按联网成功处理。',
        ];
      }

      if (mode === 'proxy-cooldown') {
        return [
          '这是实时信息任务：当前代理链路最近连续返回 `Did 0 searches` 或错误；先说明联网边界，不要在同一条件下机械重试。',
        ];
      }

      if (mode === 'not-exposed') {
        return [
          '这是实时信息任务：当前没有看到可用的原生联网搜索面，不要把记忆包装成实时结果。',
        ];
      }

      return [
        '这是实时信息任务：当前链路是否真正提供 `WebSearch` 仍不确定；只有拿到真实来源后才按联网结果回答。',
      ];
    },
    snapshot(sessionContext, requestProfile) {
      return {
        id: 'websearch',
        available: sessionContext?.webSearchAvailable || undefined,
        current_info_request: requestProfile?.currentInfo || undefined,
      };
    },
  },
  {
    id: 'ask-user-question',
    title: 'AskUserQuestion',
    available(sessionContext) {
      return Boolean(sessionContext?.askUserQuestionAvailable);
    },
    sessionLines() {
      return [
        '- `AskUserQuestion` 只用于真实阻塞选择或关键信息缺失；不要把“继续吗”“计划行不行”这类弱确认塞进去。',
      ];
    },
    routeLines(requestProfile) {
      if (!requestNeedsDecisionHelp(requestProfile)) {
        return [];
      }

      return [
        '如果执行过程中只被一个真实用户选择阻塞，优先 `AskUserQuestion` 发起结构化选择，不要把确认埋在长段落里。',
      ];
    },
    snapshot() {
      return {
        id: 'ask-user-question',
        tool: 'AskUserQuestion',
        use_only_for_real_blockers: true,
      };
    },
  },
];
