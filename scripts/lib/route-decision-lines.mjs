import { buildRouteDecisionTieBreakers } from './decision-tie-breakers.mjs';
import { buildRendererContract } from './renderer-contracts.mjs';
import {
  buildRouteExecutionPlaybook,
  buildRouteRecoveryPlaybook,
  buildRouteResponseContract,
} from './route-state-playbooks.mjs';
import { buildRouteSpecializationCandidates } from './specialization-candidates.mjs';
import { workflowContinuitySnapshot } from './tool-policy-state.mjs';

export function buildRouteDecisionLines(signals = {}, sessionContext = {}, guidance = {}) {
  const continuity = guidance.continuity || workflowContinuitySnapshot(sessionContext);
  const agentTypes = Array.isArray(sessionContext?.agentTypes)
    ? sessionContext.agentTypes.map((agent) => String(agent || '').trim().toLowerCase()).filter(Boolean)
    : [];
  const hasReadOnlyPlanningHelpers = agentTypes.includes('plan') || agentTypes.includes('explore');
  const teamContinuity = continuity.team || {};
  const mailboxEvents = Array.isArray(teamContinuity.mailbox_events)
    ? teamContinuity.mailbox_events
    : [];
  const mailboxSummary = teamContinuity.mailbox_summary && typeof teamContinuity.mailbox_summary === 'object'
    ? teamContinuity.mailbox_summary
    : null;
  const handoffSummary = teamContinuity.handoff_summary && typeof teamContinuity.handoff_summary === 'object'
    ? teamContinuity.handoff_summary
    : null;
  const actionSummary = teamContinuity.team_action_summary && typeof teamContinuity.team_action_summary === 'object'
    ? teamContinuity.team_action_summary
    : null;
  const taskAssignmentEvents = mailboxEvents.filter((event) => event?.type === 'task_assignment');
  const idleMailboxEvents = mailboxEvents.filter((event) => event?.type === 'idle_notification');
  const terminationMailboxEvents = mailboxEvents.filter((event) => event?.type === 'teammate_terminated');
  const transcriptMailboxMessages = Array.isArray(sessionContext?.attachedTeammateMailbox?.messages)
    ? sessionContext.attachedTeammateMailbox.messages
    : [];
  const transcriptRelevantMemories = Array.isArray(sessionContext?.attachedRelevantMemories)
    ? sessionContext.attachedRelevantMemories
    : [];
  const transcriptMcpInstructions = Array.isArray(sessionContext?.mcpInstructionEntries)
    ? sessionContext.mcpInstructionEntries
    : [];
  const handoffCandidates = Array.isArray(teamContinuity.handoff_candidates)
    ? teamContinuity.handoff_candidates
    : [];
  const actionItems = Array.isArray(teamContinuity.team_action_items)
    ? teamContinuity.team_action_items
    : [];
  const planApprovalActionItems = actionItems.filter((item) => item?.action_type === 'review_plan_approval');
  const shutdownRejectionActionItems = actionItems.filter((item) => item?.action_type === 'resolve_shutdown_rejection');
  const responseContract = guidance.responseContract || buildRouteResponseContract(signals, sessionContext, continuity);
  const rendererContract = guidance.rendererContract || buildRendererContract(responseContract, {
    outputStyle: sessionContext?.outputStyle,
    attachedOutputStyle: sessionContext?.attachedOutputStyle,
  });
  const executionPlaybook = guidance.executionPlaybook || buildRouteExecutionPlaybook(signals, sessionContext, continuity);
  const recoveryPlaybook = guidance.recoveryPlaybook || buildRouteRecoveryPlaybook(sessionContext, continuity, signals);
  const decisionTieBreakers = guidance.decisionTieBreakers || buildRouteDecisionTieBreakers(signals, sessionContext, continuity);
  const specializationCandidates = guidance.specializationCandidates || buildRouteSpecializationCandidates(signals, sessionContext, continuity);
  const specialization = responseContract?.specialization;
  const lines = [
    '可见文本默认跟随用户当前语言；不要输出“我打算 / 我应该 / let’s”这类内部思考式元叙述。',
    '先遵守宿主能力优先级，再在被允许的能力面内选工具；不要把未 surfaced 的工具、workflow、agent、MCP 能力或权限当成已确认存在。',
  ];

  if (Array.isArray(sessionContext?.toolNames) && sessionContext.toolNames.length > 0) {
    lines.push('把 JSON snapshot 里的 `host.tools` 当成当前直接 surfaced 的原生工具面；`host.deferred_tools` 只是延迟发现/加载线索，不代表全部工具列表。');
  }

  if (hasReadOnlyPlanningHelpers) {
    lines.push('`Plan` / `Explore` 是只读 helper agent：它们可以帮你搜集信息或整理方案，但不等于 session 级 `EnterPlanMode`，也不会自动要求走 plan-mode approval flow。');
  }

  if (!signals?.lexiconGuided) {
    lines.push('当前不要依赖词表；优先依据 prompt 结构、已 surfaced 的 capability 名称、tool schema 和 continuity 来判断，不要把“无关键词”误读成“无意图”。');
    lines.push('不要要求用户原话与 capability / workflow 名称同语种或同词面；只在宿主已公开的 specialization 候选和 host path 里做语义匹配与收口。');
  }

  if (signals?.capabilityProbeShape) {
    lines.push('先判断用户是不是在问宿主可用能力、workflow、tool、MCP、agent 或权限边界；若是，先沿已 surfaced 的 capability 回答，确有缺口时再 `DiscoverSkills` 或 `ToolSearch`，不要把普通 repo 问题误送进发现链路。');
  }

  if (transcriptMcpInstructions.length > 0) {
    lines.push(`当前 transcript 已附带这些 MCP server instructions：${transcriptMcpInstructions.map((entry) => `\`${entry.name}\``).join(', ')}；涉及对应外部系统时，先沿这些 server instruction block 选 tool / resource，不要自己猜协议。`);
  }

  if (responseContract?.preferred_shape) {
    const columns = Array.isArray(responseContract.preferred_table_columns) && responseContract.preferred_table_columns.length > 0
      ? `；表格优先列：${responseContract.preferred_table_columns.join(' | ')}`
      : '';
    lines.push(`当前输出契约优先：\`${responseContract.preferred_shape}\`${columns}；先给结论或状态，再展开必要细节。`);
  }

  if (rendererContract?.opening) {
    const sectionOrder = Array.isArray(rendererContract.section_order) && rendererContract.section_order.length > 0
      ? `；章节顺序：${rendererContract.section_order.map((section) => `\`${section}\``).join(' -> ')}`
      : '';
    const tableMode = rendererContract.table_mode === 'compact_markdown'
      ? `；表格模式：紧凑 Markdown${Array.isArray(rendererContract.table_columns) && rendererContract.table_columns.length > 0 ? `（${rendererContract.table_columns.join(' | ')}）` : ''}`
      : rendererContract.prefer_markdown
        ? '；需要结构化表达时优先 Markdown'
        : '';
    lines.push(`当前渲染契约：风格 \`${rendererContract.style_name}\`；先按 \`${rendererContract.opening}\` 开场${sectionOrder}${tableMode}。`);
  }

  if (Array.isArray(executionPlaybook?.ordered_steps) && executionPlaybook.ordered_steps.length > 0) {
    lines.push(`当前执行剧本优先：${executionPlaybook.ordered_steps.map((step) => `\`${step}\``).join(' -> ')}；不要跳过前面的 continuity / protocol 收口步骤。`);
  }

  if (Array.isArray(recoveryPlaybook?.recipes) && recoveryPlaybook.recipes.length > 0) {
    lines.push(`遇到宿主 fail-closed 或 continuity guard 时，按 \`recovery_playbook\` 恢复；当前重点 guard：${recoveryPlaybook.recipes.map((recipe) => `\`${recipe.guard}\``).join(', ')}。`);
  }

  if (Array.isArray(decisionTieBreakers?.items) && decisionTieBreakers.items.length > 0) {
    lines.push(`当前 tie-breaker 顺序：${decisionTieBreakers.items.map((item) => `\`${item.id}\``).join(' -> ')}；多个“都能做”的路径并存时按这个顺序打破平局。`);
  }

  if (Array.isArray(specializationCandidates?.items) && specializationCandidates.items.length > 0) {
    lines.push(`specialization 候选只在这些可见边界里选：${specializationCandidates.items.map((item) => `\`${item.id}\`${item.selected ? ' (active)' : ''}`).join(', ')}；不要自造新的隐藏路由。`);
  }

  if (specialization && responseContract?.selection_strength === 'strong') {
    lines.push(`当前 active specialization \`${specialization}\`（\`${responseContract.selection_basis || 'host_continuity'}\`）优先；沿这个 continuity / protocol path 收口，不要只因为正文措辞变化就改道。`);
  } else if (specialization && responseContract?.selection_strength === 'medium') {
    lines.push(`当前 active specialization \`${specialization}\`（\`${responseContract.selection_basis || 'visible_surface'}\`）优先；沿这个可见 path 推进，除非更高优先级规则要求切换。`);
  } else if (Array.isArray(specializationCandidates?.items) && specializationCandidates.items.length > 0) {
    const candidateIds = specializationCandidates.items.map((item) => `\`${item.id}\``).join(', ');
    lines.push(`当前没有被宿主强 continuity 锁死的单一路由；直接依据用户原话语义，在这些候选里选最贴近的一项：${candidateIds}。`);
    lines.push('一旦在候选集内完成语义选择，就沿该 candidate 的 `use_when` / `avoid_when` / `recommended_shape` 收口；不要再从关键词、措辞或你自己刚生成的正文里反推这次选择。');
    if (specialization && responseContract?.selection_strength === 'weak') {
      lines.push(`当前 active specialization \`${specialization}\`（\`${responseContract.selection_basis || 'weak_request_shape'}\`）只是弱提示；可以被同一候选集内更贴近用户真实语义的路线替代。`);
    }
  }

  if (continuity.active_task_board) {
    lines.push('当前 session 已有 task board 连续体：优先沿用 `TaskList` / `TaskGet` / `TaskUpdate` 继续，而不是重开 plan、重建 team，或把任务状态藏回正文。');
  }

  if (continuity.plan_mode_entered) {
    lines.push('当前 session 仍在 active plan mode：保持读搜/设计路径，需求澄清走 `AskUserQuestion`，计划确认走 `ExitPlanMode`；不要在正文里自己问“计划是否可以”或直接开始实现。');
  }

  if (continuity.plan_mode_exited) {
    lines.push('当前 session 已退出过 plan mode：默认按已批准计划继续实施，不要重复请求计划确认，也不要无故重新进入 plan mode，除非需求边界再次变动。');
  }

  if (continuity.team?.active_team) {
    lines.push(`当前 session 已处于 team 连续体（${continuity.team.active_team}）：teammate 沟通走 \`SendMessage\`，任务状态走 \`TaskUpdate\`，不要把团队协作退化成正文口头广播。`);
  }

  if (transcriptRelevantMemories.length > 0) {
    lines.push(`当前 transcript 已附带这些 relevant memories：${transcriptRelevantMemories.map((memory) => `\`${memory.path}\``).join(', ')}；优先沿这些已 surfaced 的上下文回答或继续，不要先重搜同一路径。`);
  }

  if (Array.isArray(mailboxSummary?.summary_lines) && mailboxSummary.summary_lines.length > 0) {
    lines.push(`把这些 mailbox 摘要当成已送达的 inbox continuity：${mailboxSummary.summary_lines.map((summary) => `\`${summary}\``).join(' ; ')}；不要忽略后再靠正文重猜状态。`);
  }

  if (!mailboxSummary?.summary_lines?.length && transcriptMailboxMessages.length > 0) {
    const labels = transcriptMailboxMessages.map((message) => `\`${message.from}\`${message.summary ? ` ${message.summary}` : ''}`.trim());
    lines.push(`当前 transcript 附带 teammate mailbox 消息：${labels.join(' ; ')}；把它们当成已送达的协作上下文，不要忽略后又回头重问队友。`);
  }

  if (Array.isArray(handoffSummary?.summary_lines) && handoffSummary.summary_lines.length > 0) {
    lines.push(`把这些 task-board follow-up 摘要当成更高层的 handoff / reassignment 信号：${handoffSummary.summary_lines.map((summary) => `\`${summary}\``).join(' ; ')}；优先沿 \`TaskGet\` / \`TaskUpdate\` / \`SendMessage\` 收口。`);
  }

  if (Array.isArray(actionSummary?.summary_lines) && actionSummary.summary_lines.length > 0) {
    lines.push(`按这些 action items 的优先级处理：${actionSummary.summary_lines.map((summary) => `\`${summary}\``).join(' ; ')}；先处理更高优先级 action，再处理普通 follow-up。`);
  }

  if (actionSummary?.requires_compact_table) {
    lines.push('当用户是在问团队状态、下一步、或协作收口方案时，默认先给一句判断，再给紧凑 Markdown 表：`priority | action | task | teammate | next tool`，最后给结论；不要散文式流水账。');
  }

  if (continuity.team?.current_agent_assigned_tasks) {
    const taskLabels = continuity.team.current_agent_assigned_tasks
      .map((task) => `#${task.task_id}${task.subject ? ` ${task.subject}` : ''}`.trim());
    lines.push(`当前 teammate 已有明确分派任务：${taskLabels.join(', ')}；优先用 \`TaskGet\` / \`TaskUpdate\` 延续这些任务，不要先回头问“接下来做什么”或自称 idle。`);
  }

  if (taskAssignmentEvents.length > 0) {
    const assignmentLabels = taskAssignmentEvents
      .map((event) => `\`${event.summary}\`${event.assigned_by ? ` <- ${event.assigned_by}` : ''}`);
    lines.push(`当前 teammate mailbox 中有这些 \`task_assignment\` 事件：${assignmentLabels.join(' ; ')}；把它们当成已送达的任务分派，优先 \`TaskGet\` 读取、再 \`TaskUpdate(status:"in_progress")\` 接手，不要忽略后又回问 team lead。`);
  }

  if (continuity.team?.current_agent_blocked_tasks) {
    const blockedLabels = continuity.team.current_agent_blocked_tasks
      .map((task) => `#${task.task_id} <- ${task.blocked_by.map((blockerId) => `#${blockerId}`).join(', ')}`);
    lines.push(`当前 teammate 有被 blocker 卡住的任务：${blockedLabels.join(' ; ')}；先用 \`TaskGet\` / \`TaskUpdate\` 维护 blocker 状态，必要时再 \`SendMessage\` 说明 handoff，而不是把“我卡住了”只写在正文里。`);
  }

  if (idleMailboxEvents.length > 0) {
    const idleLabels = idleMailboxEvents.map((event) => `\`${event.teammate_name}\` ${event.summary}`);
    lines.push(`把这些 \`idle_notification\` 摘要当成 teammate 进入 idle 等待输入的信号而不是任务完成：${idleLabels.join(' ; ')}；若仍关联 task 或 blocker，就继续沿用 \`TaskGet\` / \`TaskUpdate\` / \`SendMessage\` 收口，不要只因为 idle 就重派或催促。`);
  }

  if (terminationMailboxEvents.length > 0) {
    const terminationLabels = terminationMailboxEvents.map((event) => `\`${event.teammate_name}\` ${event.summary}`);
    lines.push(`把这些 \`teammate_terminated\` 摘要当成对应 teammate 已退出的信号：${terminationLabels.join(' ; ')}；优先沿 \`TaskList\` / \`TaskUpdate(owner)\` 重新分派或完成，不要继续向已退出 teammate 发号施令。`);
  }

  if (planApprovalActionItems.length > 0) {
    const labels = planApprovalActionItems.map((item) => `\`${item.teammate_name}\`${item.plan_file_path ? ` @ ${item.plan_file_path}` : ''}`);
    lines.push(`这些 action item 是计划审批：${labels.join(' ; ')}；优先按 Claude Code team protocol 用 structured \`SendMessage.plan_approval_response\` 处理，reject 时必须给 feedback。`);
  }

  if (shutdownRejectionActionItems.length > 0) {
    const labels = shutdownRejectionActionItems.map((item) => `\`${item.teammate_name}\`${item.reason ? ` ${item.reason}` : ''}`);
    lines.push(`这些 action item 是 shutdown rejection：${labels.join(' ; ')}；不要机械重试 \`TeamDelete\` 或继续催退出，先 \`TaskGet\` / \`TaskList\` 确认剩余工作，再决定继续协作还是稍后再次 shutdown。`);
  }

  if (Array.isArray(teamContinuity?.reassignment_needed_task_ids) && teamContinuity.reassignment_needed_task_ids.length > 0) {
    lines.push(`这些 task 当前需要重新分派：${teamContinuity.reassignment_needed_task_ids.map((taskId) => `#${taskId}`).join(', ')}；优先 \`TaskGet\` 读取最新状态，再用 \`TaskUpdate(owner)\` 重新指派或在确认完成后收尾，不要把它们留在无 owner 漂浮状态。`);
  }

  if (handoffCandidates.length > 0) {
    const labels = handoffCandidates
      .map((candidate) => {
        const targets = Array.isArray(candidate.follow_up_targets) && candidate.follow_up_targets.length > 0
          ? ` -> ${candidate.follow_up_targets.map((name) => `\`${name}\``).join(', ')}`
          : '';
        return `#${candidate.task_id}${targets} ${candidate.summary}`;
      });
    lines.push(`宿主识别到这些 handoff / follow-up 候选：${labels.join(' ; ')}；先按 candidate 的 task 与 target teammate 收敛，再决定是发消息催 blocker、交接任务，还是直接改 owner。`);
  }

  if (continuity.team?.assigned_task_ids_by_teammate) {
    const assignments = Object.entries(continuity.team.assigned_task_ids_by_teammate)
      .map(([owner, taskIds]) => `\`${owner}\` => ${taskIds.map((taskId) => `#${taskId}`).join(', ')}`);
    if (assignments.length > 0) {
      lines.push(`当前 team task assignment 已知：${assignments.join(' ; ')}；继续推进、改 owner、补 blocker 或收尾时，优先走 \`TaskUpdate\`，不要用普通正文重新发号施令。`);
    }
  }

  if (Array.isArray(continuity.team?.blocked_task_ids) && continuity.team.blocked_task_ids.length > 0) {
    lines.push(`这些 task 当前存在 blocker：${continuity.team.blocked_task_ids.map((taskId) => `#${taskId}`).join(', ')}；阻塞关系属于 task board continuity，优先用 \`TaskUpdate(addBlockedBy/addBlocks)\` 或读取 blocker task，而不是只发一条口头 blocker 消息。`);
  }

  if (Array.isArray(continuity.team?.pending_plan_approval_from) && continuity.team.pending_plan_approval_from.length > 0) {
    lines.push(`这些 teammate 当前有待处理的计划审批：${continuity.team.pending_plan_approval_from.map((name) => `\`${name}\``).join(', ')}；优先按 Claude Code team protocol 用 structured \`SendMessage\` 处理 \`plan_approval_response\`，不要用普通正文口头批准/驳回；reject 时必须给 feedback。`);
  }

  if (Array.isArray(continuity.team?.idle_teammates) && continuity.team.idle_teammates.length > 0) {
    lines.push(`这些 teammate 当前更接近 idle：${continuity.team.idle_teammates.map((name) => `\`${name}\``).join(', ')}；若要分派新任务，优先用 \`TaskUpdate(owner)\` 或 task board 分配，而不是只发口头消息。`);
  }

  if (Array.isArray(continuity.recent_zero_result_toolsearch_queries) && continuity.recent_zero_result_toolsearch_queries.length > 0) {
    lines.push(`这些 ToolSearch 查询最近已零匹配：${continuity.recent_zero_result_toolsearch_queries.map((query) => `\`${query}\``).join(', ')}；除非 query 或 surfaced capability 已变化，否则不要机械重试。`);
  }

  if (signals.verify) {
    lines.push('宣称完成前先做最贴近改动范围的验证；没验证就明确说没验证。');
  }

  if ((signals.implement || signals.boundedImplementation) && !continuity.plan_mode_entered) {
    lines.push('当前更像边界清晰的实施切片：优先直接执行；必要时只派 `Explore` / `Plan` 做只读补充，不要仅因为多文件、需要先读代码，或宿主 surfaced 了 `Plan` agent 就进入 `EnterPlanMode`。');
  }

  if (specialization === 'compare') {
    lines.push('按 compare 方式回答：先直接给判断，再给紧凑 Markdown 对比表，最后给建议或适用边界。');
  }

  if (specialization === 'current_info') {
    lines.push('按 current-info 方式回答：优先基于真实 `WebSearch` 结果或明确的联网边界回答，先给当前状态/答案，再给来源与不确定性；不要把记忆伪装成实时结果。');
  }

  if (specialization === 'capability') {
    lines.push('按 capability 方式回答：先给直接结论，再列当前可见 capability surface 或 host gap，只有真实缺口才进入 `DiscoverSkills`、`ReadMcpResource` / `ListMcpResources` 或 `ToolSearch`。');
  }

  if (specialization === 'research') {
    lines.push('按 research 方式回答：优先给路径、符号、证据和未知项，不要先下没有锚点的泛化结论。');
  }

  if (specialization === 'planning') {
    lines.push('按 planning 方式回答：先收约束和真实阻塞，再给可执行计划；只有真阻塞才 AskUserQuestion，不要把弱确认伪装成计划审批。');
    if (!continuity.plan_mode_entered) {
      lines.push('当前 `planning` specialization 只要求这轮先给计划与顺序，不等于必须进入 session 级 plan mode；只有真实架构歧义、需求未清、高影响重构，或需要原生 plan approval flow 时才考虑 `EnterPlanMode`。');
    }
  }

  if (specialization === 'team_approval') {
    lines.push('按 team-approval 方式回答：优先处理 pending plan approval，先给审批状态，再按 Claude Code team protocol 用 structured `SendMessage.plan_approval_response` 回应，不要用普通正文口头批准/驳回。');
  }

  if (signals.review) {
    lines.push('按 review 方式回答：优先给 findings，按严重度/回归风险和文件路径展开；概述或 change summary 放后面。');
  }

  if (signals.explain) {
    lines.push('按 explain 方式回答：先直接回答“是什么 / 为什么 / 怎么做”，再补背景和引用，不要先写大段铺垫。');
  }

  if (signals.release) {
    lines.push('按 release / publish 方式回答：优先沿已加载 release workflow 或已 surfaced 的发布路径继续，先给发布状态与检查清单，再给 notes / acknowledgements。');
  }

  if (specialization === 'release_follow_up') {
    lines.push('按 release-follow-up 方式回答：沿当前发布连续体、已加载 release workflow 和剩余 follow-up item 继续，不要重新发明一套发布流程。');
  }

  if (specialization === 'blocked_verification') {
    lines.push('按 blocked-verification 方式回答：先说清当前 blocker 或“未运行验证”的边界，再给已有证据与解除阻塞路径；不要先给“已验证”的结论。');
  }

  if (specialization === 'team_status') {
    lines.push('按 team status 方式回答：优先基于 task board / mailbox / action summary 先给一句状态和下一步，再用紧凑表格展开，不要脱离宿主 continuity 自由发挥。');
  }

  if (specialization === 'handoff') {
    lines.push('按 handoff / blocker continuity 方式回答：优先沿已有 blocker、reassignment、follow-up candidate 收口，先说当前 handoff 状态，再给下一条需要执行的 task-board 或 SendMessage 动作。');
  }

  return lines;
}
