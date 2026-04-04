#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { shouldEmitAdditionalContext } from './lib/config.mjs';

const cmd = process.argv[2] || '';

function readStdinJson() {
  try {
    const raw = readFileSync(0, 'utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function trimmed(value) {
  return String(value || '').trim();
}

function parseTeammateIdentity(payload = {}) {
  const candidates = [
    trimmed(payload?.agent_id),
    trimmed(process.env.CLAUDE_CODE_AGENT_ID),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const separator = candidate.indexOf('@');
    if (separator <= 0 || separator >= candidate.length - 1) continue;

    return {
      agentId: candidate,
      agentName: candidate.slice(0, separator),
      teamName: candidate.slice(separator + 1),
    };
  }

  return null;
}

function modeState(mode, identity) {
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
    ...(identity ? {
      teammate: {
        agent: identity.agentName,
        team: identity.teamName,
        coordination_channel: 'SendMessage',
      },
      coordination: {
        task_board: true,
        lifecycle: ['TaskList', 'TaskGet', 'TaskUpdate'],
      },
    } : {}),
  };
}

function buildTeammateOverlay(identity, mode) {
  if (!identity) return '';

  const toolSurfaceLine = mode === 'general'
    ? '- 你当前是可写 teammate；拿到明确切片后就直接读代码、改文件、验证，不要只发口头状态。'
    : '- 你当前是只读 teammate；只做搜索 / 读取 / 规划。若任务其实需要改文件或验证，立刻用 `SendMessage` 让 team lead 重新分派，不要硬撑。';

  return [
    '## hello2cc teammate overlay',
    '- 这是 team 内分工上下文；真正需要和队友沟通时，必须用 `SendMessage`，普通正文不会变成团队消息。',
    '- 开工前先 `TaskList` 看可用任务；如果已经拿到明确 task 或 owner，先 `TaskGet` 读取最新状态，再 `TaskUpdate(status:"in_progress")` 标记开工。',
    toolSurfaceLine,
    '- 完成时先 `TaskUpdate(status:"completed")`，然后再 `TaskList` 看是否还有未阻塞任务；如果被阻塞，就保持任务未完成并通过 `SendMessage` 说明 blocker / handoff。',
    '- teammate 每回合结束后变成 idle 是正常行为，不等于失败；team lead 可以通过 `SendMessage` 或重新分派任务继续唤醒。',
  ].join('\n');
}

function buildContext(mode, identity) {
  const teammateOverlay = buildTeammateOverlay(identity, mode);
  const baseContexts = {
    explore: [
      '# hello2cc Explore mode',
      '',
      '- Follow the parent task and any higher-priority `CLAUDE.md` / project formatting rules; do not restyle the response on your own.',
      '- The host has already defined the capability boundary; stay inside it instead of inventing a parallel workflow.',
      '- Stay read-only unless the parent task explicitly asks for changes.',
      '- If the parent task clearly maps to a visible host skill / workflow, or the conversation already surfaced a matching skill, use it instead of re-inventing the workflow.',
      '- Start with native search and targeted reads; use `ToolSearch` only for capability uncertainty, MCP discovery, or tool availability questions.',
      '- Return exact file paths, concrete symbols or interfaces, and any remaining unknowns.',
      '- When comparing candidates, entry points, or risks, prefer a compact Markdown table; use ASCII only when plain text layout is necessary.',
      '- Parallelize independent searches only when it materially improves coverage.',
    ],
    plan: [
      '# hello2cc Plan mode',
      '',
      '- Follow the parent task and any higher-priority `CLAUDE.md` / project formatting rules; do not restyle the response on your own.',
      '- The host has already defined the capability boundary; use the visible planning surface rather than inventing a parallel private flow.',
      '- If a surfaced host skill / workflow already covers the requested plan shape, prefer invoking it or routing back to it instead of drafting a parallel workflow from scratch.',
      '- Convert findings into an executable plan with ordered phases, dependencies, validation checks, and rollback risks.',
      '- Call out which slices stay in the main thread, which should become parallel native `Agent` work, and which ones truly need a persistent team workflow.',
      '- Use tables for task matrices, ownership splits, or trade-off comparisons when that makes the plan easier to scan.',
      '- Keep the plan concrete enough that a `General-Purpose` teammate can implement one slice without reinterpretation.',
    ],
    general: [
      '# hello2cc General-Purpose mode',
      '',
      '- Follow the parent task and any higher-priority `CLAUDE.md` / project formatting rules; do not restyle the response on your own.',
      '- The host has already defined the capability boundary; stay on the visible Claude Code path instead of switching to a private tool-selection strategy.',
      '- Stay tightly scoped to the assigned slice; avoid broad repo-wide drift.',
      '- Do not bypass an already-matching host skill / workflow just because you can complete the task manually.',
      '- Prefer surgical edits in existing files, use dedicated tools before shell when possible, and run the narrowest relevant validation before reporting done.',
      '- When the task is a comparison or trade-off summary, answer in Opus-compatible form: one-sentence judgment first, then a compact Markdown table, then the recommendation.',
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
    'Treat the JSON below as the authoritative execution envelope. The prose above only adds operating rules and collaboration steps.',
    '',
    '```json',
    JSON.stringify(modeState(mode, identity), null, 2),
    '```',
  ].join('\n');
}

function writeJson(additionalContext) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
      additionalContext,
    },
    suppressOutput: true,
  }));
}

function writeSuppress() {
  process.stdout.write(JSON.stringify({ suppressOutput: true }));
}

const payload = readStdinJson();
const teammateIdentity = parseTeammateIdentity(payload);

switch (cmd) {
  case 'explore':
    if (!shouldEmitAdditionalContext()) {
      writeSuppress();
      break;
    }
    writeJson(buildContext('explore', teammateIdentity));
    break;
  case 'plan':
    if (!shouldEmitAdditionalContext()) {
      writeSuppress();
      break;
    }
    writeJson(buildContext('plan', teammateIdentity));
    break;
  case 'general':
    if (!shouldEmitAdditionalContext()) {
      writeSuppress();
      break;
    }
    writeJson(buildContext('general', teammateIdentity));
    break;
  default:
    process.stderr.write(`subagent-context.mjs: unknown command "${cmd}"\n`);
    process.exit(1);
}
