import {
  mcpInstructionEntries,
  mcpResources,
  surfacedSkills,
  workflowNames,
} from './session-context-accessors.mjs';
import {
  formatMcpResources,
  formatNames,
} from './session-surface-formatters.mjs';
import {
  requestNeedsCapabilityDiscovery,
  requestNeedsGuideSurface,
  requestNeedsWorkflowRouting,
} from './capability-policy-helpers.mjs';
import { hasMcpSurface, hasSkillSurface } from './capability-policy-surface-helpers.mjs';

export const KNOWLEDGE_SURFACE_POLICY_DEFINITIONS = [
  {
    id: 'claude-code-guide',
    title: 'Claude Code Guide',
    available(sessionContext) {
      return Boolean(
        sessionContext?.claudeCodeGuideAvailable ||
        sessionContext?.webFetchAvailable ||
        sessionContext?.webSearchAvailable,
      );
    },
    sessionLines(sessionContext) {
      const lines = [];

      if (sessionContext?.claudeCodeGuideAvailable) {
        lines.push('- 遇到 Claude Code / hooks / settings / API / SDK 问题时，优先沿 `Claude Code Guide` 这条 guide surface 回答，不要改走 skill/workflow 发现。');
      }

      if (sessionContext?.webFetchAvailable || sessionContext?.webSearchAvailable) {
        lines.push('- guide 题如果需要补最新官方细节，优先在可见的 `WebFetch` / `WebSearch` 边界内补来源；没有真实来源就明确说明边界。');
      }

      return lines;
    },
    routeLines(requestProfile, sessionContext) {
      if (!requestNeedsGuideSurface(requestProfile)) {
        return [];
      }

      return [
        sessionContext?.claudeCodeGuideAvailable
          ? '把当前问题按 Claude Code guide 主题处理：优先直接回答，并在需要时沿可见的 `ClaudeCodeGuide` / guide surface 补机制或边界；不要改走 `Skill`、`DiscoverSkills` 或 `ToolSearch`。'
          : '把当前问题按 Claude Code guide 主题处理：优先直接回答；只有现有上下文不足且确有来源需求时，才用可见的 `WebFetch` / `WebSearch` 补官方来源，不要改走 `Skill`、`DiscoverSkills` 或 `ToolSearch`。',
      ];
    },
    snapshot(sessionContext) {
      const sourceTools = [
        sessionContext?.webFetchAvailable ? 'WebFetch' : '',
        sessionContext?.webSearchAvailable ? 'WebSearch' : '',
      ].filter(Boolean);

      return {
        id: 'claude-code-guide',
        guide_surface: sessionContext?.claudeCodeGuideAvailable ? 'ClaudeCodeGuide' : undefined,
        source_tools: sourceTools.length ? formatNames(sourceTools) : undefined,
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
        lines.push('- 只在 skill / workflow 发现时用 `DiscoverSkills`；不要把它当成通用工具发现器。');
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
      const instructionEntries = mcpInstructionEntries(sessionContext);
      if (resources.length) {
        lines.push(`- 当前已观测到的 MCP resources：${formatMcpResources(resources)}。`);
      }
      if (instructionEntries.length) {
        lines.push(`- 当前这些 MCP servers 已附带使用说明：${formatNames(instructionEntries.map((entry) => entry.name))}；优先按对应 instruction block 使用该 server 的 tools / resources，不要自己猜约定。`);
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
        ...(mcpInstructionEntries(sessionContext).length
          ? ['如果某个 MCP server 已附带 usage instructions，先沿该 server 的 instruction block 选择 tools / resources，再决定是否需要更宽的发现。']
          : []),
      ];
    },
    snapshot(sessionContext) {
      return {
        id: 'mcp-resources',
        known_resources: mcpResources(sessionContext).map((resource) => `${resource.server}:${resource.uri}`),
        instruction_servers: mcpInstructionEntries(sessionContext).map((entry) => entry.name),
        list_tool: sessionContext?.listMcpResourcesAvailable ? 'ListMcpResources' : undefined,
        read_tool: sessionContext?.readMcpResourceAvailable ? 'ReadMcpResource' : undefined,
      };
    },
  },
];
