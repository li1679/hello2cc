import {
  test,
  assert,
  parseAdditionalContextJson,
  run,
  isolatedEnv,
  writeTranscript,
} from './helpers/orchestrator-test-helpers.mjs';

test('route emits proxy WebSearch state after repeated zero-search degradation', () => {
  const env = isolatedEnv({
    ANTHROPIC_BASE_URL: 'https://proxy.example.com/v1',
  });

  run('post-tool-use', {
    session_id: 'route-websearch-proxy',
    model: 'opus',
    tool_name: 'WebSearch',
    tool_response: {
      results: [],
    },
  }, env);
  run('post-tool-use', {
    session_id: 'route-websearch-proxy',
    model: 'opus',
    tool_name: 'WebSearch',
    tool_response: {
      results: [],
    },
  }, env);

  const output = run('route', {
    session_id: 'route-websearch-proxy',
    tools: ['WebSearch'],
    prompt: '帮我查下今天 AI 新闻',
  }, env);
  const state = parseAdditionalContextJson(output.hookSpecificOutput.additionalContext);

  assert.equal(state.websearch.tool, 'WebSearch');
  assert.equal(state.websearch.mode, 'proxy-cooldown');
  assert.equal(state.websearch.degraded, true);
  assert.equal(state.intent.analysis.lexicon_guided, undefined);
  assert.equal(state.intent.analysis.host_boundary_guided, true);
  assert.equal(state.route.specialization, 'current_info');
  assert.equal(state.route.selection_basis, 'current_info_boundary');
  assert.equal(state.route.selection_strength, 'strong');
  assert.equal(state.policy.requested_output_shape, 'current_info_status_then_sources_then_uncertainty');
  assert.ok(state.route.guards.includes('websearch_real_source_required'));
  assert.ok(state.route.guards.includes('websearch_retry_cooldown'));
});

test('route emits MCP resource state when the host already surfaced it', () => {
  const env = isolatedEnv();
  const sessionId = 'route-mcp';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
    tools: ['ListMcpResources', 'ReadMcpResource'],
  }, [
    {
      type: 'assistant',
      session_id: sessionId,
      attachments: [
        {
          type: 'mcp_resource',
          server: 'github',
          uri: 'repo://issues/9',
          name: 'Issue #9',
          description: 'Issue resource',
          content: {},
        },
        {
          type: 'mcp_instructions_delta',
          addedNames: ['github'],
          addedBlocks: ['Use github issue tools for issue workflows.'],
          removedNames: [],
        },
      ],
    },
  ]);

  const output = run('route', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tools: ['ListMcpResources', 'ReadMcpResource'],
    prompt: 'Use MCP or connected tools to inspect external systems if available.',
  }, env);
  const state = parseAdditionalContextJson(output.hookSpecificOutput.additionalContext);

  assert.deepEqual(state.host.mcp_resources, ['github:repo://issues/9']);
  assert.deepEqual(state.host.attachments.mcp_instructions.server_names, ['github']);
  assert.ok(state.policy.policies.some((policy) => policy.id === 'mcp-resources' && Array.isArray(policy.instruction_servers) && policy.instruction_servers.includes('github')));
});

test('route derives capability probes from host-capability question anchors', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-capability-probe',
    tools: ['ToolSearch', 'DiscoverSkills', 'ListMcpResources', 'ReadMcpResource'],
    prompt: '利用できる外部連携はありますか？',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;
  const state = parseAdditionalContextJson(context);

  assert.equal(state.intent.analysis.lexicon_guided, undefined);
  assert.equal(state.intent.analysis.capability_probe_shape, true);
  assert.equal(state.intent.routing?.capability_query, undefined);
  assert.equal(state.route.specialization, 'capability');
  assert.equal(state.route.selection_basis, 'capability_probe_shape');
  assert.equal(state.route.selection_strength, 'medium');
  assert.equal(state.policy.requested_output_shape, 'direct_answer_then_visible_capabilities_then_gap_or_next_step');
  assert.ok(state.route.guards.includes('visible_capability_surface_first'));
  assert.ok(state.route.guards.includes('narrow_discovery_for_real_gap_only'));
  assert.ok(state.route.tie_breakers.includes('visible_surface_answer_before_discovery_fallback'));
  assert.ok(state.policy.policies.some((policy) => policy.id === 'tool-discovery'));
  assert.match(context, /宿主可用能力、workflow、tool、MCP、agent 或权限边界/);
});

test('route suppresses generic everyday questions even when discovery tools are visible', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-generic-everyday-question',
    tools: ['ToolSearch', 'DiscoverSkills', 'ListMcpResources', 'ReadMcpResource'],
    prompt: '今天适合出去玩吗？',
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('route does not leak checklist scaffolding after topic switch', () => {
  const env = isolatedEnv();
  const sessionId = 'route-topic-switch-no-checklist-sticky';

  run('route', {
    session_id: sessionId,
    tools: ['TaskCreate', 'TaskUpdate', 'Agent', 'ToolSearch'],
    prompt: '请先列出处理清单，然后优化这个项目。',
  }, env);

  const output = run('route', {
    session_id: sessionId,
    tools: ['TaskCreate', 'TaskUpdate', 'Agent', 'ToolSearch'],
    prompt: '顺便问一下，今天适合出去玩吗？',
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('route keeps real capability questions compact and hides internal playbooks', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-real-capability-compact',
    tools: ['ToolSearch', 'DiscoverSkills', 'ListMcpResources', 'ReadMcpResource'],
    prompt: 'Claude Code 现在有哪些可用工具、skills 和 MCP？',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;
  const state = parseAdditionalContextJson(context);

  assert.match(context, /^# 2cc routing/);
  assert.equal(state.intent.analysis.capability_probe_shape, true);
  assert.equal(state.route.specialization, 'capability');
  assert.deepEqual(state.host.tools, ['ToolSearch', 'DiscoverSkills', 'ListMcpResources', 'ReadMcpResource']);
  assert.ok(!Object.hasOwn(state, 'response_contract'));
  assert.ok(!Object.hasOwn(state, 'renderer_contract'));
  assert.ok(!Object.hasOwn(state, 'execution_playbook'));
  assert.ok(!Object.hasOwn(state, 'specialization_candidates'));
  assert.doesNotMatch(context, /ordered_steps|section_order|execution_playbook|specialization_candidates/);
});

test('route keeps lexicon-only current-info requests on visible WebSearch surface instead of a strong boundary', () => {
  const env = isolatedEnv();
  const sessionId = 'route-current-info-visible-surface';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
    tools: ['WebSearch'],
  }, [
    {
      type: 'assistant',
      session_id: sessionId,
      attachments: [
        {
          type: 'output_style',
          style: 'compact-native',
        },
      ],
    },
  ]);
  const output = run('route', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tools: ['WebSearch'],
    prompt: 'What are the latest AI news updates?',
  }, env);
  const state = parseAdditionalContextJson(output.hookSpecificOutput.additionalContext);

  assert.equal(state.intent.analysis.host_boundary_guided, undefined);
  assert.equal(state.intent.analysis.lexicon_guided, true);
  assert.equal(state.route.specialization, 'current_info');
  assert.equal(state.route.selection_basis, 'visible_websearch_surface');
  assert.equal(state.route.selection_strength, 'medium');
  assert.equal(state.policy.requested_output_shape, 'current_info_status_then_sources_then_uncertainty');
});

test('route derives slash-pair current-info comparisons into WebSearch query hygiene guidance', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-zh-compare-current-info',
    tools: ['WebSearch'],
    prompt: '帮我搜索最新新闻，并对比下Codex/claude最新的技术',
  }, env);
  const context = output.hookSpecificOutput.additionalContext;
  const state = parseAdditionalContextJson(context);

  assert.equal(state.intent.analysis.lexicon_guided, undefined);
  assert.equal(state.intent.analysis.host_boundary_guided, true);
  assert.equal(state.intent.analysis.prompt_shape.option_pair_like, true);
  assert.equal(state.intent.actions.compare, true);
  assert.equal(state.intent.actions.current_info, true);
  assert.equal(state.intent.output.table, true);
  assert.equal(state.route.specialization, 'compare');
  assert.equal(state.route.selection_basis, 'weak_request_shape');
  assert.ok(state.policy.policies.some((policy) => policy.id === 'websearch' && policy.current_info_request));
  assert.match(context, /先拆成多次短 `WebSearch` 获取真实来源/);
  assert.match(context, /allowed_domains/);
  assert.match(context, /Did 0 searches/);
});

test('route exposes transcript attachment reminders and surfaced agent deltas in host state', () => {
  const env = isolatedEnv();
  const sessionId = 'route-attachment-signals';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
    tools: ['Agent'],
    agents: ['Explore', 'Plan', 'general-purpose'],
  }, [
    {
      type: 'assistant',
      session_id: sessionId,
      attachments: [
        {
          type: 'agent_listing_delta',
          addedTypes: ['Explore'],
          addedLines: ['Explore'],
          removedTypes: [],
          isInitial: true,
        },
        {
          type: 'critical_system_reminder',
          content: 'Stay inside the host-defined workflow boundary.',
        },
        {
          type: 'output_style',
          style: 'compact-native',
        },
      ],
    },
  ]);

  const output = run('route', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tools: ['Agent'],
    agents: ['Explore', 'Plan', 'general-purpose'],
    prompt: '继续。',
  }, env);
  const state = parseAdditionalContextJson(output.hookSpecificOutput.additionalContext);

  assert.deepEqual(state.host.delta_surfaces.agents, [
    {
      name: 'Explore',
      role: '只读搜索',
      tool_surface: ['Glob/Grep/Read', 'Bash(只读)'],
    },
  ]);
  assert.equal(state.host.attachments.output_style, 'compact-native');
  assert.equal(state.host.attachments.critical_system_reminder.active, true);
  assert.match(state.host.attachments.critical_system_reminder.preview, /workflow boundary/i);
});

test('route keeps straightforward multi-file implementation free of semantic routing text', () => {
  const env = isolatedEnv();
  const output = run('route', {
    session_id: 'route-cached-upstream-degraded',
    prompt: 'Implement a multi-file change and verify the result.',
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

