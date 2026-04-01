import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const scriptPath = resolve('scripts/orchestrator.mjs');

function run(cmd, payload, env = {}) {
  const result = spawnSync(process.execPath, [scriptPath, cmd], {
    cwd: resolve('.'),
    env: {
      ...process.env,
      ...env,
    },
    input: payload ? JSON.stringify(payload) : '',
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout) : {};
}

function isolatedEnv(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'hello2cc-test-'));

  return {
    HOME: root,
    USERPROFILE: root,
    CLAUDE_PLUGIN_DATA: join(root, 'plugin-data'),
    CLAUDE_PLUGIN_ROOT: resolve('.'),
    ...overrides,
  };
}

function writeTranscript(root, sessionId, payload, extraRecords = []) {
  const transcriptPath = join(root, 'session.jsonl');
  const records = [
    {
      type: 'system',
      subtype: 'init',
      session_id: sessionId,
      ...payload,
    },
    ...extraRecords,
  ];
  writeFileSync(transcriptPath, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf8');
  return transcriptPath;
}

test('session-start keeps native-first guidance concise and skill-free', () => {
  const env = isolatedEnv();
  const output = run('session-start', {
    session_id: 'session-1',
    model: 'opus',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /像平常一样直接使用 Claude Code/);
  assert.match(context, /CLAUDE\.md/);
  assert.match(context, /ToolSearch 状态/);
  assert.match(context, /EnterPlanMode\(\)/);
  assert.match(context, /当前插件输出风格/);
  assert.match(context, /优先 Markdown 表格/);
  assert.match(context, /当前会话模型别名：`opus`/);
  assert.doesNotMatch(context, /Skill\(/);
  assert.doesNotMatch(context, /skills?/i);
});

test('session-start keeps ToolSearch guidance strictly native-first on proxy sessions', () => {
  const env = isolatedEnv({
    ANTHROPIC_BASE_URL: 'https://proxy.example.com/v1',
    ENABLE_TOOL_SEARCH: '',
  });
  const output = run('session-start', {
    session_id: 'session-no-toolsearch',
    model: 'opus',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /ToolSearch 状态/);
  assert.match(context, /原生 `ToolSearch` 是默认优先路径/);
  assert.match(context, /不会主动把第三方模型从这条原生路径拉走/);
});

test('session-start ignores proxy-error transcript noise and keeps native-first guidance unchanged', () => {
  const env = isolatedEnv();
  const transcriptPath = writeTranscript(env.HOME, 'session-transport-degraded', {
    model: 'opus',
    tools: ['ToolSearch', 'EnterPlanMode'],
  }, [
    {
      type: 'assistant',
      session_id: 'session-transport-degraded',
      error: 'invalid_request',
      message: {
        content: [
          {
            type: 'text',
            text: 'tool_reference blocks with a 400. Extra inputs are not permitted because defer_loading is unsupported.',
          },
        ],
      },
    },
  ]);
  const output = run('session-start', {
    session_id: 'session-transport-degraded',
    transcript_path: transcriptPath,
    model: 'opus',
    tools: ['ToolSearch', 'EnterPlanMode'],
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /原生 `ToolSearch` 是默认优先路径/);
  assert.doesNotMatch(context, /兼容性与诊断/);
  assert.doesNotMatch(context, /tool_reference/);
  assert.doesNotMatch(context, /上游/);
});

test('session-start surfaces advanced native capabilities when the host exposes them', () => {
  const env = isolatedEnv();
  const output = run('session-start', {
    session_id: 'session-capabilities',
    model: 'opus',
    tools: [
      'ToolSearch',
      'AskUserQuestion',
      'SendMessage',
      'TeamDelete',
      'ListMcpResources',
      'ReadMcpResource',
      'EnterWorktree',
      'LSP',
      'NotebookEdit',
      'PowerShell',
    ],
    agents: ['Claude Code Guide', 'Explore'],
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /AskUserQuestion/);
  assert.match(context, /SendMessage/);
  assert.match(context, /TeamDelete/);
  assert.match(context, /ListMcpResources/);
  assert.match(context, /ReadMcpResource/);
  assert.match(context, /EnterWorktree/);
  assert.match(context, /LSP/);
  assert.match(context, /NotebookEdit/);
  assert.match(context, /PowerShell/);
});

test('route promotes native guide flow without skill references', () => {
  const env = isolatedEnv();
  run('session-start', {
    session_id: 'route-guide',
    model: 'opus',
  }, env);
  const output = run('route', {
    session_id: 'route-guide',
    prompt: 'How do Claude Code hooks and MCP permissions work?',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /Claude Code Guide/);
  assert.match(context, /ToolSearch/);
  assert.doesNotMatch(context, /Skill\(/);
  assert.doesNotMatch(context, /skills?/i);
});

test('route extracts prompt text from structured payloads', () => {
  const env = isolatedEnv();
  run('session-start', {
    session_id: 'route-structured',
    model: 'opus',
  }, env);
  const output = run('route', {
    session_id: 'route-structured',
    prompt: {
      role: 'user',
      content: [
        { type: 'text', text: 'Research this repo, implement the change, and verify the result.' },
      ],
    },
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /并行发起多个原生 `Agent` worker/);
  assert.match(context, /等待完成通知/);
  assert.doesNotMatch(context, /TeamCreate/);
});

test('route keeps codebase research on native search tools before agent escalation', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-code-research',
    prompt: 'Research where the router composes navigation links in this repo.',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /代码库研究/);
  assert.match(context, /原生读写 \/ 搜索工具/);
  assert.doesNotMatch(context, /先 `ToolSearch`/);
});

test('route promotes TeamCreate only for explicit team workflows', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-team',
    prompt: 'Use TeamCreate to build a persistent agent team for this multi-agent workflow.',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /TeamCreate/);
  assert.match(context, /SendMessage/);
  assert.match(context, /TeamDelete/);
  assert.doesNotMatch(context, /TaskOutput/);
});

test('route promotes General-Purpose for bounded implementation slices', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-general',
    prompt: 'Implement a focused one-file fix and validate it.',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /General-Purpose/);
});

test('route uses AskUserQuestion on decision-heavy tasks', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-ask-user',
    prompt: 'Which approach should I choose between option A and B if there is a trade-off?',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /AskUserQuestion/);
});

test('route prefers MCP resource tools', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-mcp',
    prompt: 'Use MCP or connected tools to inspect external systems if available.',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /ToolSearch/);
  assert.match(context, /ListMcpResources/);
  assert.match(context, /ReadMcpResource/);
});

test('route keeps ToolSearch-first intent optimistic on proxy sessions without host proof either way', () => {
  const env = isolatedEnv({
    ANTHROPIC_BASE_URL: 'https://proxy.example.com/v1',
    ENABLE_TOOL_SEARCH: '',
  });
  const output = run('route', {
    session_id: 'route-no-toolsearch',
    prompt: 'Use ToolSearch to discover MCP tools and plugin capabilities.',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /先 `ToolSearch` 确认/);
  assert.doesNotMatch(context, /没有暴露原生 `ToolSearch`/);
});

test('route keeps ToolSearch-first guidance even after transcript records beta proxy incompatibility', () => {
  const env = isolatedEnv();
  const sessionId = 'route-toolsearch-degraded';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
    tools: ['ToolSearch', 'ListMcpResources', 'ReadMcpResource'],
  }, [
    {
      type: 'assistant',
      session_id: sessionId,
      error: 'invalid_request',
      message: {
        content: [
          {
            type: 'text',
            text: 'tool_reference blocks with a 400. Extra inputs are not permitted because defer_loading is unsupported.',
          },
        ],
      },
    },
  ]);
  const output = run('route', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tools: ['ToolSearch', 'ListMcpResources', 'ReadMcpResource'],
    prompt: 'Use ToolSearch to discover MCP tools and plugin capabilities.',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /先 `ToolSearch` 确认/);
  assert.doesNotMatch(context, /兼容/);
  assert.doesNotMatch(context, /tool_reference/);
});

test('route remembers upstream instability from session-start but keeps native-first guidance active', () => {
  const env = isolatedEnv();
  const sessionId = 'route-cached-upstream-degraded';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
    tools: ['EnterPlanMode', 'TodoWrite', 'Agent'],
  }, [
    {
      type: 'assistant',
      session_id: sessionId,
      error: 'request_failed',
      message: {
        content: [
          {
            type: 'text',
            text: 'Connection error. Request timed out.',
          },
        ],
      },
    },
  ]);

  run('session-start', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    model: 'opus',
    tools: ['EnterPlanMode', 'TodoWrite', 'Agent'],
  }, env);

  const output = run('route', {
    session_id: sessionId,
    prompt: 'Implement a multi-file change and verify the result.',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /EnterPlanMode\(\)/);
  assert.doesNotMatch(context, /连接 \/ 鉴权 \/ 上游账号异常/);
  assert.doesNotMatch(context, /上游代理问题/);
});

test('route keeps strict native task-board guidance instead of TodoWrite fallback semantics', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-todowrite',
    tools: ['TodoWrite'],
    prompt: 'Implement a multi-file change and keep a todo list for the work.',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /TaskCreate/);
  assert.match(context, /TaskList/);
  assert.match(context, /TaskUpdate/);
  assert.match(context, /TaskGet/);
  assert.doesNotMatch(context, /TodoWrite/);
});

test('route keeps TeamCreate guidance for explicit team workflows even without host proof', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-no-team',
    prompt: 'Use TeamCreate and teammates to coordinate research and implementation in parallel.',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /TeamCreate/);
  assert.match(context, /SendMessage/);
  assert.match(context, /TeamDelete/);
});

test('route warns against using TaskOutput as the default worker polling path', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-no-taskoutput-polling',
    tools: ['Agent', 'SendMessage', 'TaskStop', 'TaskOutput'],
    prompt: 'Research this repo, implement the change, and verify the result.',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /不要把 `TaskOutput` 当成普通 worker 的默认结果获取方式/);
});

test('route keeps Claude Code Guide guidance for capability questions even without host proof', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-no-guide',
    prompt: 'How do Claude Code hooks and MCP permissions work?',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /Claude Code Guide/);
});

test('route only recommends EnterWorktree when the user explicitly asks', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-worktree',
    prompt: 'Use a git worktree for an isolated worktree while changing this feature.',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /EnterWorktree/);
});

test('route prefers markdown-first structured output instead of forcing ascii tables', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-diagram',
    prompt: 'Please present the modules as a table or diagram.',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /优先标准 Markdown 表格或图示/);
  assert.doesNotMatch(context, /Markdown\/ASCII/);
});

test('route skips explicit slash commands', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-slash',
    prompt: '/config',
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('pre-agent-model injects guide model using official permission fields', () => {
  const env = isolatedEnv();
  const output = run(
    'pre-agent-model',
    {
      session_id: 'guide-model',
      tool_name: 'Agent',
      tool_input: {
        subagent_type: 'Claude Code Guide',
      },
    },
    {
      ...env,
      CLAUDE_PLUGIN_OPTION_GUIDE_MODEL: 'cc-gpt-5.4',
    },
  );

  assert.equal(output.hookSpecificOutput.permissionDecision, 'allow');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /cc-gpt-5\.4/);
  assert.equal(output.hookSpecificOutput.updatedInput.model, 'cc-gpt-5.4');
});

test('pre-agent-model mirrors the current session model for Explore by default', () => {
  const env = isolatedEnv();
  run('session-start', {
    session_id: 'explore-model',
    model: 'opus',
  }, env);

  const output = run(
    'pre-agent-model',
    {
      session_id: 'explore-model',
      tool_name: 'Agent',
      tool_input: {
        subagent_type: 'Explore',
      },
    },
    env,
  );

  assert.equal(output.hookSpecificOutput.updatedInput.model, 'opus');
});

test('pre-agent-model only injects team model when explicitly configured', () => {
  const env = isolatedEnv();
  const nativeOutput = run(
    'pre-agent-model',
    {
      session_id: 'team-model-native',
      tool_name: 'Agent',
      tool_input: {
        team_name: 'delivery-squad',
      },
    },
    env,
  );

  assert.deepEqual(nativeOutput, { suppressOutput: true });

  const output = run(
    'pre-agent-model',
    {
      session_id: 'team-model',
      tool_name: 'Agent',
      tool_input: {
        team_name: 'delivery-squad',
      },
    },
    {
      ...env,
      CLAUDE_PLUGIN_OPTION_TEAM_MODEL: 'cc-gpt-5.4',
    },
  );

  assert.equal(output.hookSpecificOutput.updatedInput.model, 'cc-gpt-5.4');
});

test('pre-agent-model respects explicit model input', () => {
  const env = isolatedEnv();
  const output = run('pre-agent-model', {
    session_id: 'explicit-model',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'Plan',
      model: 'custom-model',
    },
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('pre-agent-model mirrors the current session model alias for Claude Code Guide by default', () => {
  const env = isolatedEnv();

  run('session-start', {
    session_id: 'mirror-session',
    model: 'opus',
  }, env);

  const output = run('pre-agent-model', {
    session_id: 'mirror-session',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'claude-code-guide',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.updatedInput.model, 'opus');
});

test('pre-agent-model preserves native Plan inherit behavior unless explicitly overridden', () => {
  const env = isolatedEnv();
  run('session-start', {
    session_id: 'plan-inherit',
    model: 'opus',
  }, env);

  const nativeOutput = run('pre-agent-model', {
    session_id: 'plan-inherit',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'Plan',
    },
  }, env);

  assert.deepEqual(nativeOutput, { suppressOutput: true });

  const overriddenOutput = run('pre-agent-model', {
    session_id: 'plan-inherit',
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'Plan',
    },
  }, {
    ...env,
    CLAUDE_PLUGIN_OPTION_PLAN_MODEL: 'cc-gpt-5.4',
  });

  assert.equal(overriddenOutput.hookSpecificOutput.updatedInput.model, 'cc-gpt-5.4');
});

test('pre-agent-model can discover the current session model from transcript_path for Explore', () => {
  const env = isolatedEnv();
  const sessionId = 'transcript-model';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
    output_style: 'hello2cc:hello2cc Native',
  });

  const output = run('pre-agent-model', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'Explore',
    },
  }, env);

  assert.equal(output.hookSpecificOutput.updatedInput.model, 'opus');
});

test('config-change clears cached session context so stale models are not reused', () => {
  const env = isolatedEnv();
  run('session-start', {
    session_id: 'config-change',
    model: 'opus',
  }, env);

  const cachePath = join(env.CLAUDE_PLUGIN_DATA, 'runtime', 'session-context.json');
  assert.equal(existsSync(cachePath), true);

  const output = run('config-change', {
    session_id: 'config-change',
    source: 'project_settings',
    file_path: join(env.HOME, '.claude', 'settings.json'),
  }, env);

  assert.deepEqual(output, { suppressOutput: true });

  const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
  assert.equal(cached['config-change'], undefined);
});
test('route keeps native task-board guidance for explicit task-tracking requests', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-task-board',
    tools: ['TaskCreate', 'TaskList', 'TaskUpdate', 'TaskGet'],
    prompt: 'Create a task board checklist to research, implement, and verify this change.',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /TaskCreate/);
  assert.match(context, /TaskList/);
  assert.match(context, /TaskUpdate/);
  assert.match(context, /TaskGet/);
});
