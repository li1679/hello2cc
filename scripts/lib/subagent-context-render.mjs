const DEFAULT_SUMMARY_LIMIT = 2;
const DEFAULT_GUARD_LIMIT = 3;

function summarizeList(items, formatter, limit = DEFAULT_SUMMARY_LIMIT) {
  if (!Array.isArray(items) || items.length === 0) return '';

  const rendered = items
    .slice(0, limit)
    .map((item) => formatter(item))
    .filter(Boolean);

  if (rendered.length === 0) return '';

  const remainder = items.length - rendered.length;
  return remainder > 0
    ? `${rendered.join(' ; ')} ; +${remainder} more`
    : rendered.join(' ; ');
}

function summarizeGuards(recipes, limit = DEFAULT_GUARD_LIMIT) {
  if (!Array.isArray(recipes) || recipes.length === 0) return '';

  const uniqueGuards = [
    ...new Set(recipes.map((recipe) => recipe?.guard).filter(Boolean)),
  ];

  return summarizeList(uniqueGuards, (guard) => `\`${guard}\``, limit);
}

function summarizeAssignments(tasks) {
  return summarizeList(tasks, (task) => {
    if (!task?.task_id) return '';
    const subject = task.subject ? ` ${task.subject}` : '';
    const assignee = task.assigned_by ? ` <- ${task.assigned_by}` : '';
    return `#${task.task_id}${subject}${assignee}`;
  });
}

function summarizeBlockedTasks(tasks) {
  const blockedTasks = Array.isArray(tasks)
    ? tasks.filter(
        (task) =>
          Array.isArray(task?.blocked_by) && task.blocked_by.length > 0,
      )
    : [];

  return summarizeList(blockedTasks, (task) => {
    const blockers = task.blocked_by
      .map((blockerId) => `#${blockerId}`)
      .join(', ');
    return `#${task.task_id} <- ${blockers}`;
  });
}

function summarizeMailbox(summary) {
  if (
    !summary ||
    !Array.isArray(summary.summary_lines) ||
    summary.summary_lines.length === 0
  ) {
    return '';
  }

  return summarizeList(summary.summary_lines, (line) => `\`${line}\``);
}

function summarizeActionItems(summary) {
  if (
    !summary ||
    !Array.isArray(summary.summary_lines) ||
    summary.summary_lines.length === 0
  ) {
    return '';
  }

  return summarizeList(summary.summary_lines, (line) => `\`${line}\``);
}

function buildSharedRules() {
  return [
    '- Higher-priority host/project rules win.',
    '- Stay on visible Claude Code surfaces and follow the JSON contracts.',
    '- If `selection_mode` is `semantic_choice_within_candidates`, choose inside `specialization_candidates` by task meaning.',
  ];
}

export function buildModeGuidance(mode) {
  const sharedRules = buildSharedRules();
  const byMode = {
    explore: [
      '# 2cc Explore mode',
      '',
      ...sharedRules,
      '- Read-only: start with native search and targeted reads; use `ToolSearch` only for capability uncertainty.',
      '- Return exact paths, symbols, and unknowns; use compact Markdown tables when they help.',
    ],
    plan: [
      '# 2cc Plan mode',
      '',
      ...sharedRules,
      '- Read-only planning: produce an ordered plan with validation, rollback risks, and ownership splits.',
      '- Distinguish main-thread work, parallel native `Agent` work, and real team workflow.',
    ],
    general: [
      '# 2cc General-Purpose mode',
      '',
      ...sharedRules,
      '- Can write: prefer surgical edits and the narrowest relevant validation.',
      '- For compare/trade-off work, answer judgment first, then a compact Markdown table, then the recommendation or boundary.',
      '- Report changed files, validation status, and remaining risks plainly.',
    ],
  };

  return byMode[mode] || byMode.general;
}

export function buildTeammateOverlay(state) {
  if (!state?.teammate) return '';

  const coordination = state.coordination || {};
  const mailboxLine = summarizeMailbox(coordination.mailbox_summary);
  const actionLine = summarizeActionItems(coordination.team_action_summary);
  const assignmentLine = summarizeAssignments(
    coordination.current_assigned_tasks,
  );
  const pendingLine = summarizeAssignments(
    coordination.pending_assignment_notifications,
  );
  const blockedLine = summarizeBlockedTasks(
    coordination.current_assigned_tasks,
  );
  const guardLine = summarizeGuards(state.recovery_playbook?.recipes);
  const canWrite = state.can_write === true;

  const lines = [
    '## 2cc teammate overlay',
    '- Team protocol: coordinate via `SendMessage`; task flow stays on `TaskList` -> `TaskGet` -> `TaskUpdate`; plain text does not close tasks.',
    canWrite
      ? '- Writable teammate: once clear, read code, edit files, and validate.'
      : '- Read-only teammate: search, read, and plan only; route edits back through `SendMessage`.',
    ...(assignmentLine ? [`- 当前任务: ${assignmentLine}。`] : []),
    ...(pendingLine
      ? [`- mailbox 折叠 / task assignment: ${pendingLine}。`]
      : []),
    ...(mailboxLine ? [`- mailbox 折叠摘要: ${mailboxLine}。`] : []),
    ...(actionLine ? [`- 最该处理的动作: ${actionLine}。`] : []),
    ...(blockedLine ? [`- blocker continuity: ${blockedLine}。`] : []),
    ...(guardLine
      ? [`- Follow \`recovery_playbook\` guards first: ${guardLine}。`]
      : []),
    '- Closure rule: refresh via `TaskGet` / `TaskList`; use `TaskUpdate(status:"completed")` only when the slice is actually done.',
    '- Otherwise keep `TaskUpdate` truthful; use `SendMessage` only for blocker or handoff context.',
    '- `TeammateIdle` mirrors summary only; it never replaces `TaskUpdate` or closes tasks.',
  ];

  return lines.join('\n');
}

export function renderSubagentContext({ modeLines, teammateOverlay, state }) {
  return [
    ...modeLines,
    ...(teammateOverlay ? ['', teammateOverlay] : []),
    '',
    '# 2cc subagent_state',
    '',
    'Treat the JSON below as the authoritative execution/rendering envelope.',
    '',
    '```json',
    JSON.stringify(state),
    '```',
  ].join('\n');
}
