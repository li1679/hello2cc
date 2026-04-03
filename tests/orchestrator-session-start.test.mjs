import {
  test,
  assert,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  join,
  run,
  isolatedEnv,
  writeTranscript,
} from './helpers/orchestrator-test-helpers.mjs';

test('session-start keeps host-surface guidance concise without blocking skills', () => {
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
  assert.match(context, /默认跟随用户当前语言/);
  assert.match(context, /不要把内部思考过程直接说出来/);
  assert.match(context, /skills \/ workflows|skills \/ workflows|技能|宿主已暴露的能力表面/i);
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

test('session-start explains native team and task-board coordination', () => {
  const env = isolatedEnv();
  const output = run('session-start', {
    session_id: 'session-team-coordination',
    model: 'opus',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /Team \/ task-board 协作/);
  assert.match(context, /TeamCreate/);
  assert.match(context, /TaskList/);
  assert.match(context, /TaskCreate/);
  assert.match(context, /TaskUpdate/);
  assert.match(context, /SendMessage/);
  assert.match(context, /普通正文里的话不是团队协作通道/);
});

test('session-start explains how to use native WebSearch for real-time questions', () => {
  const env = isolatedEnv();
  const output = run('session-start', {
    session_id: 'session-websearch',
    model: 'opus',
    tools: ['WebSearch'],
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /实时信息与 WebSearch/);
  assert.match(context, /已暴露原生 `WebSearch`/);
  assert.match(context, /不要把记忆包装成联网结果/);
});

test('session-start keeps WebSearch guidance honest on proxy-like sessions', () => {
  const env = isolatedEnv({
    ANTHROPIC_BASE_URL: 'https://proxy.example.com/v1',
  });
  const output = run('session-start', {
    session_id: 'session-websearch-proxy',
    model: 'opus',
    tools: ['WebSearch'],
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /自定义 `ANTHROPIC_BASE_URL` 代理/);
  assert.match(context, /不会因为使用自定义代理就直接阻断这条路径/);
  assert.match(context, /Did 0 searches/);
  assert.match(context, /未完成真实搜索/);
});

test('session-start explains how surfaced skills and DiscoverSkills fit into the host capability surface', () => {
  const env = isolatedEnv();
  const output = run('session-start', {
    session_id: 'session-skills',
    model: 'opus',
    tools: ['Skill', 'DiscoverSkills', 'ToolSearch'],
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /Skills \/ 插件工作流/);
  assert.match(context, /已暴露 `Skill`/);
  assert.match(context, /已暴露 `DiscoverSkills`/);
  assert.match(context, /`DiscoverSkills` 用于 skill \/ workflow 发现/);
});

test('session-start surfaces skill_discovery names from transcript context', () => {
  const env = isolatedEnv();
  const sessionId = 'session-surfaced-skills';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
    tools: ['Skill', 'DiscoverSkills'],
  }, [
    {
      type: 'assistant',
      session_id: sessionId,
      message: {
        attachments: [
          {
            type: 'skill_discovery',
            skills: [
              { name: 'brainstorm', description: 'Help ideate directions' },
              { name: 'release', description: 'Ship and publish changes' },
            ],
          },
        ],
      },
    },
  ]);

  const output = run('session-start', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tools: ['Skill', 'DiscoverSkills'],
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /当前会话已 surfaced 的 skills：`brainstorm`, `release`/);
});

test('session-start builds a finer capability graph from workflows, deferred tools, and MCP resources', () => {
  const env = isolatedEnv();
  const sessionId = 'session-capability-graph';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
    tools: ['Skill', 'DiscoverSkills', 'ToolSearch', 'ListMcpResources', 'ReadMcpResource', 'Agent'],
    agents: ['Explore', 'Plan', 'general-purpose', 'claude-code-guide'],
  }, [
    {
      type: 'assistant',
      session_id: sessionId,
      message: {
        content: [
          {
            type: 'text',
            text: '<command-name>brainstorm</command-name>\n<command-args>--focus host-surface</command-args>\n<skill-format>true</skill-format>',
          },
        ],
      },
      attachments: [
        {
          type: 'deferred_tools_delta',
          addedNames: ['mcp__github__add_issue_comment'],
          addedLines: ['mcp__github__add_issue_comment'],
          removedNames: [],
        },
        {
          type: 'mcp_resource',
          server: 'github',
          uri: 'repo://issues/7',
          name: 'Issue #7',
          description: 'Issue resource',
          content: {},
        },
      ],
    },
    {
      type: 'system',
      subtype: 'task_started',
      session_id: sessionId,
      task_type: 'local_workflow',
      workflow_name: 'release',
      description: 'Run release workflow',
    },
    {
      type: 'user',
      session_id: sessionId,
      message: {
        content: [
          {
            type: 'tool_result',
            content: [
              {
                type: 'tool_reference',
                tool_name: 'mcp__github__add_issue_comment',
              },
            ],
          },
        ],
      },
    },
  ]);

  const output = run('session-start', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tools: ['Skill', 'DiscoverSkills', 'ToolSearch', 'ListMcpResources', 'ReadMcpResource', 'Agent'],
    agents: ['Explore', 'Plan', 'general-purpose', 'claude-code-guide'],
  }, env);
  const context = output.hookSpecificOutput.additionalContext;

  assert.match(context, /Specificity 路由/);
  assert.match(context, /已加载过的 skill \/ workflow：`brainstorm --focus host-surface`/);
  assert.match(context, /已出现过 workflow：`release`/);
  assert.match(context, /已 surfaced 的 deferred tools：`mcp__github__add_issue_comment`/);
  assert.match(context, /已加载过的 deferred tools：`mcp__github__add_issue_comment`/);
  assert.match(context, /已观测到的 MCP resources：`github:repo:\/\/issues\/7`/);
  assert.match(context, /Explore.*只读搜索/);
  assert.match(context, /Plan.*只读规划/);
  assert.match(context, /General-Purpose.*全工具面/);
  assert.match(context, /Claude Code Guide.*WebFetch.*WebSearch/);
});
