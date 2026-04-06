import { compactState } from './host-state-context.mjs';
import { buildRendererContract } from './renderer-contracts.mjs';
import { buildSubagentSpecializationCandidates } from './specialization-candidates.mjs';
import {
  buildSubagentExecutionPlaybook,
  buildSubagentRecoveryPlaybook,
  buildSubagentResponseContract,
  buildSubagentTieBreakers,
  currentAssignedTasks,
  currentBlockedTaskRecords,
  currentMailboxState,
  currentPendingAssignmentRecords,
  currentPendingAssignments,
  currentTeamActionState,
  subagentRecoveryGuardLabels,
  subagentTaskIntentProfile,
  subagentTaskIntentState,
} from './subagent-state-helpers.mjs';
import { readTeamEntry } from './team-state-store.mjs';

function modeState(mode, identity, payload = {}, teamState = {}) {
  const assignedTasks = currentAssignedTasks(identity, teamState);
  const pendingAssignments = currentPendingAssignments(identity, teamState);
  const pendingAssignmentRecords = currentPendingAssignmentRecords(identity, teamState);
  const blockedTaskRecords = currentBlockedTaskRecords(identity, teamState);
  const mailboxState = currentMailboxState(identity, teamState);
  const teamActionState = currentTeamActionState(identity, {
    pendingAssignmentRecords,
    blockedTaskRecords,
  });
  const taskProfile = subagentTaskIntentProfile(payload);
  const taskIntentState = subagentTaskIntentState(payload);
  const stateByMode = {
    explore: {
      mode: 'Explore',
      capability: 'read-only-search',
      can_write: false,
    },
    plan: {
      mode: 'Plan',
      capability: 'read-only-planning',
      can_write: false,
    },
    general: {
      mode: 'General-Purpose',
      capability: 'full-tool-surface',
      can_write: true,
    },
  };
  const responseContract = buildSubagentResponseContract(mode, identity, taskProfile, teamActionState, {
    blockedTaskRecords,
  });
  const rendererContract = buildRendererContract(responseContract);
  const executionPlaybook = buildSubagentExecutionPlaybook(mode, identity, taskProfile, {
    assignedTasks,
    pendingAssignments,
    blockedTaskRecords,
    teamActionState,
  });
  const recoveryPlaybook = buildSubagentRecoveryPlaybook(mode, taskProfile, {
    canWrite: Boolean(stateByMode[mode]?.can_write),
    pendingAssignments,
    blockedTaskRecords,
    hasTeamIdentity: Boolean(identity),
  });
  const decisionTieBreakers = buildSubagentTieBreakers(mode, taskProfile, {
    hasTeamIdentity: Boolean(identity),
    pendingAssignments,
    blockedTaskRecords,
  });
  const specializationCandidates = buildSubagentSpecializationCandidates(mode, taskProfile, {
    hasTeamIdentity: Boolean(identity),
    pendingAssignments,
    blockedTaskRecords,
    teamActionState,
  });

  return {
    hello2cc_role: 'host-state',
    operator_profile: 'opus-compatible-claude-code',
    execution_envelope: 'host_defined_capability_policies',
    semantic_routing: 'host_guarded_model_decides',
    tool_choice: 'follow_visible_capability_contracts',
    higher_priority_rules: [
      'parent_task',
      'claude_code_host',
      'CLAUDE.md',
      'AGENTS.md',
      'project_rules',
    ],
    ...(stateByMode[mode] || {}),
    task_intent: taskIntentState,
    response_contract: responseContract,
    renderer_contract: rendererContract,
    execution_playbook: executionPlaybook,
    recovery_playbook: recoveryPlaybook,
    decision_tie_breakers: decisionTieBreakers,
    specialization_candidates: specializationCandidates,
    ...(identity ? {
      teammate: {
        agent: identity.agentName,
        team: identity.teamName,
        coordination_channel: 'SendMessage',
      },
        coordination: {
          task_board: true,
          lifecycle: ['TaskList', 'TaskGet', 'TaskUpdate'],
          ...(assignedTasks.length ? {
            current_assigned_tasks: assignedTasks,
          } : {}),
          ...(pendingAssignments.length ? {
            pending_assignment_notifications: pendingAssignments,
          } : {}),
          ...(mailboxState.mailboxEvents.length ? {
            mailbox_events: mailboxState.mailboxEvents,
          } : {}),
          ...(mailboxState.mailboxSummary ? {
            mailbox_summary: mailboxState.mailboxSummary,
          } : {}),
          ...(teamActionState.teamActionItems.length ? {
            team_action_items: teamActionState.teamActionItems,
          } : {}),
          ...(teamActionState.teamActionSummary ? {
            team_action_summary: teamActionState.teamActionSummary,
          } : {}),
        },
      } : {}),
  };
}

function buildTeammateOverlay(identity, mode, payload = {}, teamState = {}) {
  if (!identity) return '';

  const assignedTasks = currentAssignedTasks(identity, teamState);
  const pendingAssignments = currentPendingAssignments(identity, teamState);
  const pendingAssignmentRecords = currentPendingAssignmentRecords(identity, teamState);
  const blockedTaskRecords = currentBlockedTaskRecords(identity, teamState);
  const mailboxState = currentMailboxState(identity, teamState);
  const teamActionState = currentTeamActionState(identity, {
    pendingAssignmentRecords,
    blockedTaskRecords,
  });
  const taskProfile = subagentTaskIntentProfile(payload);
  const responseContract = buildSubagentResponseContract(mode, identity, taskProfile, teamActionState, {
    blockedTaskRecords,
  });
  const rendererContract = buildRendererContract(responseContract);
  const executionPlaybook = buildSubagentExecutionPlaybook(mode, identity, taskProfile, {
    assignedTasks,
    pendingAssignments,
    blockedTaskRecords,
    teamActionState,
  });
  const recoveryPlaybook = buildSubagentRecoveryPlaybook(mode, taskProfile, {
    canWrite: mode === 'general',
    pendingAssignments,
    blockedTaskRecords,
    hasTeamIdentity: true,
  });
  const decisionTieBreakers = buildSubagentTieBreakers(mode, taskProfile, {
    hasTeamIdentity: true,
    pendingAssignments,
    blockedTaskRecords,
  });
  const specializationCandidates = buildSubagentSpecializationCandidates(mode, taskProfile, {
    hasTeamIdentity: true,
    pendingAssignments,
    blockedTaskRecords,
    teamActionState,
  });
  const mailboxSummaryLine = Array.isArray(mailboxState.mailboxSummary?.summary_lines) && mailboxState.mailboxSummary.summary_lines.length > 0
    ? `- 把这些 mailbox 摘要当成已送达 inbox：${mailboxState.mailboxSummary.summary_lines.map((summary) => `\`${summary}\``).join(' ; ')}；不要忽略后再回问 team lead。`
    : '';
  const actionSummaryLine = Array.isArray(teamActionState.teamActionSummary?.summary_lines) && teamActionState.teamActionSummary.summary_lines.length > 0
    ? `- 按这些 action items 的优先级处理：${teamActionState.teamActionSummary.summary_lines.map((summary) => `\`${summary}\``).join(' ; ')}；先处理更高优先级动作，再写正文总结。`
    : '';
  const responseLine = responseContract.preferred_shape
    ? `- 当前输出契约优先：\`${responseContract.preferred_shape}\`${Array.isArray(responseContract.preferred_table_columns) && responseContract.preferred_table_columns.length > 0 ? `；表格优先列：${responseContract.preferred_table_columns.join(' | ')}` : ''}。`
    : '';
  const rendererLine = rendererContract.opening
    ? `- 当前渲染契约优先：风格 \`${rendererContract.style_name}\`；先按 \`${rendererContract.opening}\` 开场${Array.isArray(rendererContract.section_order) && rendererContract.section_order.length > 0 ? `；章节顺序：${rendererContract.section_order.map((section) => `\`${section}\``).join(' -> ')}` : ''}${rendererContract.table_mode === 'compact_markdown' ? `；表格模式：紧凑 Markdown${Array.isArray(rendererContract.table_columns) && rendererContract.table_columns.length > 0 ? `（${rendererContract.table_columns.join(' | ')}）` : ''}` : '；需要结构化表达时优先 Markdown'}。`
    : '';
  const responseSelectionLine = responseContract.specialization
    ? responseContract.selection_strength === 'strong'
      ? `- 当前 active specialization \`${responseContract.specialization}\`（\`${responseContract.selection_basis || 'host_continuity'}\`）优先；沿这个 continuity / protocol path 行动，不要因为措辞变化就偏航。`
      : responseContract.selection_strength === 'medium'
        ? `- 当前 active specialization \`${responseContract.specialization}\`（\`${responseContract.selection_basis || 'visible_surface'}\`）优先；沿这个可见 path 执行。`
        : `- 当前 active specialization \`${responseContract.specialization}\`（\`${responseContract.selection_basis || 'weak_parent_task_shape'}\`）只用来约束输出与 tie-breaker；仍直接按父任务语义执行。`
    : '';
  const playbookLine = Array.isArray(executionPlaybook.ordered_steps) && executionPlaybook.ordered_steps.length > 0
    ? `- 当前执行顺序优先：${executionPlaybook.ordered_steps.map((step) => `\`${step}\``).join(' -> ')}。`
    : '';
  const recoveryLine = Array.isArray(recoveryPlaybook.recipes) && recoveryPlaybook.recipes.length > 0
    ? `- 遇到宿主 guard 或 continuity 收口时，按 \`recovery_playbook\` 恢复；当前重点：${subagentRecoveryGuardLabels(recoveryPlaybook).map((guard) => `\`${guard}\``).join(', ')}。`
    : '';
  const tieBreakerLine = Array.isArray(decisionTieBreakers.items) && decisionTieBreakers.items.length > 0
    ? `- 当前 tie-breaker 顺序：${decisionTieBreakers.items.map((item) => `\`${item.id}\``).join(' -> ')}；当多个路径都能做时，按这个顺序打破平局。`
    : '';
  const candidateLine = Array.isArray(specializationCandidates?.items) && specializationCandidates.items.length > 0
    ? `- specialization 候选只在这些可见边界里选：${specializationCandidates.items.map((item) => `\`${item.id}\`${item.selected ? ' (active)' : ''}`).join(', ')}；不要自己发明隐藏 workflow。`
    : '';
  const taskAssignmentEvents = mailboxState.mailboxEvents.filter((event) => event?.type === 'task_assignment');
  const toolSurfaceLine = mode === 'general'
    ? '- 你当前是可写 teammate；拿到明确切片后就直接读代码、改文件、验证，不要只发口头状态。'
    : '- 你当前是只读 teammate；只做搜索 / 读取 / 规划。若任务其实需要改文件或验证，立刻用 `SendMessage` 让 team lead 重新分派，不要硬撑。';
  const assignmentLine = assignedTasks.length > 0
    ? `- 当前已明确分派给你的任务：${assignedTasks.map((task) => `#${task.task_id}${task.subject ? ` ${task.subject}` : ''}`.trim()).join(', ')}；优先先 \`TaskGet\` 读取这些任务，再决定是否 \`TaskUpdate(status:"in_progress")\`。`
    : '- 开工前先 `TaskList` 看可用任务；如果已经拿到明确 task 或 owner，先 `TaskGet` 读取最新状态，再 `TaskUpdate(status:"in_progress")` 标记开工。';
  const pendingAssignmentLine = taskAssignmentEvents.length > 0
    ? `- 当前 mailbox 中有这些 task assignment 事件：${taskAssignmentEvents.map((event) => `\`${event.summary}\``).join(' ; ')}；把它们当成已送达的分派，先 \`TaskGet\` 读取，再 \`TaskUpdate(status:"in_progress")\` 标记接手。`
    : pendingAssignments.length > 0
      ? `- 宿主 mailbox 最近向你投递了这些 task assignment 摘要：${pendingAssignments.map((task) => `#${task.task_id}${task.subject ? ` ${task.subject}` : ''}${task.assigned_by ? ` <- ${task.assigned_by}` : ''}`).join(' ; ')}；把它们当成已送达的分派，不要重新问 team lead。`
    : '';
  const blockedLine = assignedTasks.some((task) => task.blocked_by.length > 0)
    ? `- 这些已分派任务当前仍有 blocker：${assignedTasks.filter((task) => task.blocked_by.length > 0).map((task) => `#${task.task_id} <- ${task.blocked_by.map((blockerId) => `#${blockerId}`).join(', ')}`).join(' ; ')}；先处理 blocker continuity，再决定是否继续实现或发 handoff。`
    : '';

  return [
    '## hello2cc teammate overlay',
    '- 用 `SendMessage` 和队友沟通；普通正文不会变成团队消息。',
    ...(responseLine ? [responseLine] : []),
    ...(rendererLine ? [rendererLine] : []),
    ...(responseSelectionLine ? [responseSelectionLine] : []),
    ...(playbookLine ? [playbookLine] : []),
    ...(recoveryLine ? [recoveryLine] : []),
    ...(tieBreakerLine ? [tieBreakerLine] : []),
    ...(candidateLine ? [candidateLine] : []),
    ...(mailboxSummaryLine ? [mailboxSummaryLine] : []),
    ...(actionSummaryLine ? [actionSummaryLine] : []),
    assignmentLine,
    ...(pendingAssignmentLine ? [pendingAssignmentLine] : []),
    ...(blockedLine ? [blockedLine] : []),
    toolSurfaceLine,
    '- 回合结束时直接结束当前回合；让宿主通过 `TeammateIdle` 自动同步最近 task / message 摘要给 team lead，不要自己伪造 `idle_notification` 之类的结构化状态消息。',
    '- 完成时先 `TaskUpdate(status:"completed")`，然后再 `TaskList` 看是否还有未阻塞任务；如果被阻塞，就保持任务未完成并通过 `SendMessage` 说明 blocker / handoff。',
    '- 把每回合结束后的 idle 当成正常状态；需要继续时，等 team lead 通过 `SendMessage` 或重新分派任务唤醒你。',
  ].join('\n');
}

export function buildContext(mode, identity, payload = {}) {
  const teamState = identity ? readTeamEntry(identity.teamName) : {};
  const teammateOverlay = buildTeammateOverlay(identity, mode, payload, teamState);
  const baseContexts = {
    explore: [
      '# hello2cc Explore mode',
      '',
      '- Follow the parent task and any higher-priority `CLAUDE.md` / project formatting rules; do not restyle the response on your own.',
      '- Stay inside the host-defined capability boundary instead of inventing a parallel workflow.',
      '- Stay read-only unless the parent task explicitly asks for changes.',
      '- If the parent task clearly maps to a visible host skill / workflow, or the conversation already surfaced a matching skill, use it instead of re-inventing the workflow.',
      '- Start with native search and targeted reads; use `ToolSearch` only for capability uncertainty, MCP discovery, or tool availability questions.',
      '- Return exact file paths, concrete symbols or interfaces, and any remaining unknowns.',
      '- When comparing candidates, entry points, or risks, prefer a compact Markdown table; use ASCII only when plain text layout is necessary.',
      '- Follow the JSON `response_contract`, `renderer_contract`, `execution_playbook`, and `recovery_playbook` as the concrete output and recovery envelope.',
      '- Parallelize independent searches only when it materially improves coverage.',
    ],
    plan: [
      '# hello2cc Plan mode',
      '',
      '- Follow the parent task and any higher-priority `CLAUDE.md` / project formatting rules; do not restyle the response on your own.',
      '- Use the visible planning surface rather than inventing a parallel private flow.',
      '- If a surfaced host skill / workflow already covers the requested plan shape, prefer invoking it or routing back to it instead of drafting a parallel workflow from scratch.',
      '- Convert findings into an executable plan with ordered phases, dependencies, validation checks, and rollback risks.',
      '- Call out which slices stay in the main thread, which should become parallel native `Agent` work, and which ones truly need a persistent team workflow.',
      '- Use tables for task matrices, ownership splits, or trade-off comparisons when that makes the plan easier to scan.',
      '- Follow the JSON `response_contract`, `renderer_contract`, `execution_playbook`, and `recovery_playbook` as the concrete output and recovery envelope.',
      '- Keep the plan concrete enough that a `General-Purpose` teammate can implement one slice without reinterpretation.',
    ],
    general: [
      '# hello2cc General-Purpose mode',
      '',
      '- Follow the parent task and any higher-priority `CLAUDE.md` / project formatting rules; do not restyle the response on your own.',
      '- Stay on the visible Claude Code path instead of switching to a private tool-selection strategy.',
      '- Stay tightly scoped to the assigned slice; avoid broad repo-wide drift.',
      '- Do not bypass an already-matching host skill / workflow just because you can complete the task manually.',
      '- Prefer surgical edits in existing files, use dedicated tools before shell when possible, and run the narrowest relevant validation before reporting done.',
      '- When the task is a comparison or trade-off summary, follow the compare response contract: state the judgment first, then use a compact Markdown table, then give the recommendation or boundary.',
      '- Follow the JSON `response_contract`, `renderer_contract`, `execution_playbook`, and `recovery_playbook` as the concrete output and recovery envelope.',
      '- Summarize changed files, validations, and remaining risks in a compact table when there are multiple items.',
      '- Report outcomes faithfully: if a validation failed or was not run, say so plainly.',
      '- If the task needs more context or a split into multiple tracks, say so explicitly instead of improvising a team in plain text.',
    ],
  };

  const lines = baseContexts[mode] || [];
  return [
    ...lines,
    ...(teammateOverlay ? ['', teammateOverlay] : []),
    '',
    '# hello2cc subagent_state',
    '',
    '按下面的 JSON 执行；把它当成当前 execution / rendering envelope。正文只补充操作规则与协作步骤。',
    '',
    '```json',
    JSON.stringify(compactState(modeState(mode, identity, payload, teamState)), null, 2),
    '```',
  ].join('\n');
}
