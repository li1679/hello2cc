import { availableDeferredToolNames } from './session-context-accessors.mjs';
import {
  activeTeamName,
  requestNeedsParallelWorkers,
  requestNeedsPlanning,
  requestNeedsTeamWorkflow,
  uniqueStrings,
} from './capability-policy-helpers.mjs';

export const EXECUTION_POLICY_DEFINITIONS = [
  {
    id: 'team-workflow',
    title: 'TeamCreate / task board / teammate routing',
    available() {
      return true;
    },
    sessionLines() {
      return [
        '- team 语义只在“持久 task board / owner / handoff / shared teammate context”成立时启用；普通并行 worker 不等于 team。',
        '- 进入 team 模式后，先 `TeamCreate`，再 `TaskList` / `TaskCreate` 建真实 task board，再启动 teammate；后续 `Agent` 显式传 `name` + `team_name`。',
        '- team 内沟通靠 `SendMessage`，任务流转靠 `TaskList` / `TaskGet` / `TaskUpdate` / `TaskCreate`；不要在正文里角色扮演团队。',
      ];
    },
    routeLines(requestProfile) {
      const lines = [];

      if (requestNeedsTeamWorkflow(requestProfile)) {
        lines.push('把当前任务按持续协作型 team 语义处理：优先 `TeamCreate` → `TaskList` / `TaskCreate` 建真实 task board → teammate，而不是只靠一次性 plain workers 或正文口头分工。');
      } else if (requestNeedsParallelWorkers(requestProfile)) {
        lines.push('把当前任务按一次性并行 worker 处理而不是持久 team；普通 worker 默认不要带 `name` / `team_name`。');
      }

      return lines;
    },
    snapshot(sessionContext, requestProfile) {
      return {
        id: 'team-workflow',
        active_team: activeTeamName(sessionContext) || undefined,
        requested: requestNeedsTeamWorkflow(requestProfile) || undefined,
        task_board_tools: uniqueStrings([
          sessionContext?.taskListAvailable ? 'TaskList' : '',
          sessionContext?.taskGetAvailable ? 'TaskGet' : '',
          sessionContext?.taskCreateAvailable ? 'TaskCreate' : '',
          sessionContext?.taskUpdateAvailable ? 'TaskUpdate' : '',
          sessionContext?.sendMessageAvailable ? 'SendMessage' : '',
        ]),
      };
    },
  },
  {
    id: 'task-tracking',
    title: 'Todo / task tracking',
    available(sessionContext) {
      return Boolean(
        sessionContext?.todoWriteAvailable ||
        sessionContext?.taskCreateAvailable ||
        sessionContext?.taskListAvailable ||
        sessionContext?.taskUpdateAvailable,
      );
    },
    sessionLines() {
      return [
        '- 复杂任务用宿主任务能力显式跟踪，不要只在正文里口头列步骤；简单单步任务则直接做。',
      ];
    },
    routeLines(requestProfile, sessionContext) {
      const lines = [];
      const trackingTool = sessionContext?.taskCreateAvailable ? 'TaskCreate / TaskList / TaskUpdate' : (sessionContext?.todoWriteAvailable ? 'TodoWrite' : '');
      if (!trackingTool) return lines;

      if (requestNeedsPlanning(requestProfile) || requestNeedsTeamWorkflow(requestProfile)) {
        lines.push(`把当前任务按多步任务处理：优先用 \`${trackingTool}\` 维护真实任务状态，而不是把计划藏在长段落里。`);
      }
      return lines;
    },
    snapshot(sessionContext) {
      return {
        id: 'task-tracking',
        task_tools: uniqueStrings([
          sessionContext?.todoWriteAvailable ? 'TodoWrite' : '',
          sessionContext?.taskCreateAvailable ? 'TaskCreate' : '',
          sessionContext?.taskListAvailable ? 'TaskList' : '',
          sessionContext?.taskGetAvailable ? 'TaskGet' : '',
          sessionContext?.taskUpdateAvailable ? 'TaskUpdate' : '',
        ]),
      };
    },
  },
  {
    id: 'enter-worktree',
    title: 'EnterWorktree',
    available(sessionContext) {
      return Boolean(sessionContext?.enterWorktreeAvailable);
    },
    sessionLines() {
      return [
        '- 只在用户明确要求隔离工作树 / 并行工作区时使用 `EnterWorktree`；不要把它当成普通分支切换的默认替代。',
      ];
    },
    routeLines(requestProfile) {
      if (!requestProfile?.wantsWorktree) {
        return [];
      }

      return [
        '用户明确要求隔离工作树：只有在确实需要独立工作区时才进入 `EnterWorktree`，不要把它当成普通实现路径。',
      ];
    },
    snapshot(sessionContext, requestProfile) {
      return {
        id: 'enter-worktree',
        explicit_only: true,
        requested: requestProfile?.wantsWorktree || undefined,
        blocked_retry_cwds: uniqueStrings(Object.keys(sessionContext?.preconditionFailures?.worktreeByCwd || {})),
      };
    },
  },
  {
    id: 'deferred-tool-follow-through',
    title: 'Deferred tool follow-through',
    available(sessionContext) {
      return availableDeferredToolNames(sessionContext).length > 0;
    },
    sessionLines(sessionContext) {
      return [
        `- 当前 surfaced 的 deferred tools：${availableDeferredToolNames(sessionContext).map((tool) => `\`${tool}\``).join(', ')}；如果下一步正好需要这些能力，优先精确加载并直接使用，不要重新回到更宽的 agent 路径。`,
      ];
    },
    routeLines(requestProfile, sessionContext) {
      if (!availableDeferredToolNames(sessionContext).length || requestNeedsTeamWorkflow(requestProfile)) {
        return [];
      }

      return [
        '把当前已出现的 deferred tool 线索当成下一步的优先路径；如果它们覆盖下一步，就沿着该具体工具面继续，不要直接升级成更宽的协作路径。',
      ];
    },
    snapshot(sessionContext) {
      return {
        id: 'deferred-tool-follow-through',
        surfaced_deferred_tools: availableDeferredToolNames(sessionContext),
      };
    },
  },
];
