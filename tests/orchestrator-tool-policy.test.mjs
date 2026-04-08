import {
  test,
  assert,
  parseAdditionalContextJson,
  run,
  isolatedEnv,
  writeTranscript,
} from './helpers/orchestrator-test-helpers.mjs';

test('pre-task-create no longer denies trivial direct execution paths', () => {
  const env = isolatedEnv();

  run('route', {
    session_id: 'task-create-direct',
    tools: ['TaskCreate'],
    prompt: 'Implement a focused one-file fix.',
  }, env);

  const output = run('pre-task-create', {
    session_id: 'task-create-direct',
    tool_name: 'TaskCreate',
    tool_input: {
      subject: 'Fix bug',
      description: 'Apply the straightforward fix',
    },
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('pre-task-create allows tracked multi-step work', () => {
  const env = isolatedEnv();

  run('route', {
    session_id: 'task-create-complex',
    tools: ['TaskCreate', 'TaskList', 'TaskGet', 'TaskUpdate'],
    prompt: 'Coordinate research and implementation with teammates on a shared task board.',
  }, env);

  const output = run('pre-task-create', {
    session_id: 'task-create-complex',
    tool_name: 'TaskCreate',
    tool_input: {
      subject: 'Research current auth flow',
      description: 'Inspect frontend and backend auth entry points',
    },
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('pre-task-update no longer pre-denies TaskUpdate before TaskGet and leaves staleness to native tool guidance', () => {
  const env = isolatedEnv();
  const sessionId = 'task-update-read-first';

  run('route', {
    session_id: sessionId,
    tools: ['TaskList', 'TaskGet', 'TaskUpdate'],
    prompt: 'Coordinate implementation on a shared task board.',
  }, env);

  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TaskList',
    tool_response: {
      tasks: [
        { id: '7', subject: 'Implement API', status: 'pending', blockedBy: [] },
      ],
    },
  }, env);

  const output = run('pre-task-update', {
    session_id: sessionId,
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: '7',
      status: 'in_progress',
    },
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('pre-task-update blocks assigning a task to an unknown teammate inside an active team', () => {
  const env = isolatedEnv();
  const sessionId = 'task-update-unknown-teammate';

  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TaskCreate',
    tool_response: {
      task: {
        id: '7',
        subject: 'Implement API',
      },
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TaskGet',
    tool_input: {
      taskId: '7',
    },
    tool_response: {
      task: {
        id: '7',
        subject: 'Implement API',
        description: 'Do the work',
        status: 'pending',
        blocks: [],
        blockedBy: [],
      },
    },
  }, env);

  const blocked = run('pre-task-update', {
    session_id: sessionId,
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: '7',
      owner: 'backend-owner',
    },
  }, env);

  assert.equal(blocked.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(blocked.hookSpecificOutput.permissionDecisionReason, /does not have that teammate|surface the real teammate first/i);
});

test('pre-task-update blocks self-blocking and unknown blocker references', () => {
  const env = isolatedEnv();
  const sessionId = 'task-update-blockers-guarded';

  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TaskCreate',
    tool_response: {
      task: {
        id: '7',
        subject: 'Implement API',
      },
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TaskCreate',
    tool_response: {
      task: {
        id: '3',
        subject: 'Land backend contract',
      },
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TaskGet',
    tool_input: {
      taskId: '7',
    },
    tool_response: {
      task: {
        id: '7',
        subject: 'Implement API',
        description: 'Do the work',
        status: 'pending',
        blocks: [],
        blockedBy: [],
      },
    },
  }, env);

  const selfBlocked = run('pre-task-update', {
    session_id: sessionId,
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: '7',
      addBlockedBy: ['7'],
    },
  }, env);
  assert.equal(selfBlocked.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(selfBlocked.hookSpecificOutput.permissionDecisionReason, /cannot block itself|block itself/i);

  const unknownBlocked = run('pre-task-update', {
    session_id: sessionId,
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: '7',
      addBlockedBy: ['99'],
    },
  }, env);
  assert.equal(unknownBlocked.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(unknownBlocked.hookSpecificOutput.permissionDecisionReason, /not known in current task-board continuity|refresh with TaskList\/TaskGet/i);

  const allowed = run('pre-task-update', {
    session_id: sessionId,
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: '7',
      addBlockedBy: ['3'],
    },
  }, env);
  assert.deepEqual(allowed, { suppressOutput: true });
});

test('pre-tool-search no longer denies fallback discovery when a surfaced workflow already matches', () => {
  const env = isolatedEnv();
  const sessionId = 'tool-search-surfaced';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
    tools: ['Skill', 'DiscoverSkills', 'ToolSearch'],
  }, [
    {
      type: 'assistant',
      session_id: sessionId,
      message: {
        content: [
          {
            type: 'text',
            text: '<command-name>release</command-name>\n<skill-format>true</skill-format>',
          },
        ],
      },
      attachments: [
        {
          type: 'skill_discovery',
          skills: [
            { name: 'release', description: 'Ship and publish changes' },
          ],
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
  ]);

  run('route', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tools: ['Skill', 'DiscoverSkills', 'ToolSearch'],
    prompt: 'Continue the release workflow and use the already surfaced path.',
  }, env);

  const output = run('pre-tool-search', {
    session_id: sessionId,
    tool_name: 'ToolSearch',
    tool_input: {
      query: 'github release publish',
    },
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('pre-tool-search no longer denies repeated zero-match retries for the same query', () => {
  const env = isolatedEnv();
  const sessionId = 'tool-search-repeat-zero';

  run('route', {
    session_id: sessionId,
    prompt: 'What tools are available for Slack delivery in this environment?',
  }, env);

  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'ToolSearch',
    tool_input: {
      query: 'slack send',
    },
    tool_response: {
      query: 'slack send',
      matches: [],
      total_deferred_tools: 0,
    },
  }, env);

  const output = run('pre-tool-search', {
    session_id: sessionId,
    tool_name: 'ToolSearch',
    tool_input: {
      query: 'slack send',
    },
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('pre-tool-search allows question-like non-lexicon prompts when no better surfaced path exists', () => {
  const env = isolatedEnv();
  const sessionId = 'tool-search-non-lexicon-question';

  run('route', {
    session_id: sessionId,
    prompt: '利用できる外部連携はありますか？',
  }, env);

  const output = run('pre-tool-search', {
    session_id: sessionId,
    tool_name: 'ToolSearch',
    tool_input: {
      query: 'slack send',
    },
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('pre-tool-search no longer denies ordinary non-discovery prompts without a more specific surfaced path', () => {
  const env = isolatedEnv();
  const sessionId = 'tool-search-no-capability-probe';

  run('route', {
    session_id: sessionId,
    prompt: '继续处理这个改动。',
  }, env);

  const output = run('pre-tool-search', {
    session_id: sessionId,
    tool_name: 'ToolSearch',
    tool_input: {
      query: 'slack send',
    },
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('pre-tool-search no longer denies non-lexicon fallback discovery when loaded workflow continuity already owns the path', () => {
  const env = isolatedEnv();
  const sessionId = 'tool-search-release-follow-up-non-lexicon';
  const transcriptPath = writeTranscript(env.HOME, sessionId, {
    model: 'opus',
    tools: ['Skill', 'ToolSearch'],
  }, [
    {
      type: 'assistant',
      session_id: sessionId,
      message: {
        content: [
          {
            type: 'text',
            text: '<command-name>release</command-name>\n<skill-format>true</skill-format>',
          },
        ],
      },
    },
    {
      type: 'system',
      subtype: 'task_started',
      session_id: sessionId,
      task_type: 'local_workflow',
      workflow_name: 'release',
      description: 'Run release workflow',
    },
  ]);

  run('route', {
    session_id: sessionId,
    transcript_path: transcriptPath,
    tools: ['Skill', 'ToolSearch'],
    prompt: '把剩下的收掉。',
  }, env);

  const output = run('pre-tool-search', {
    session_id: sessionId,
    tool_name: 'ToolSearch',
    tool_input: {
      query: 'github release publish',
    },
  }, env);

  assert.deepEqual(output, { suppressOutput: true });
});

test('pre-enter-plan-mode no longer denies clear comparison prompts and still allows ambiguous implementation work', () => {
  const env = isolatedEnv();

  run('route', {
    session_id: 'plan-block-compare',
    prompt: 'Compare TeamCreate with plain Agent workers and present it as a table.',
  }, env);

  const compareAllowed = run('pre-enter-plan-mode', {
    session_id: 'plan-block-compare',
    tool_name: 'EnterPlanMode',
    tool_input: {},
  }, env);

  assert.deepEqual(compareAllowed, { suppressOutput: true });

  run('route', {
    session_id: 'plan-allow-ambiguous',
    prompt: 'Implement authentication across frontend and backend with a new session model and approval flow.',
  }, env);

  const allowed = run('pre-enter-plan-mode', {
    session_id: 'plan-allow-ambiguous',
    tool_name: 'EnterPlanMode',
    tool_input: {},
  }, env);

  assert.deepEqual(allowed, { suppressOutput: true });
});

test('pre-enter-plan-mode allows structurally complex non-lexicon prompts', () => {
  const env = isolatedEnv();

  run('route', {
    session_id: 'plan-allow-non-lexicon',
    prompt: '認証まわりを全面的に見直し、既存実装との差分整理、移行手順、検証観点まで含めて進めたい。',
  }, env);

  const allowed = run('pre-enter-plan-mode', {
    session_id: 'plan-allow-non-lexicon',
    tool_name: 'EnterPlanMode',
    tool_input: {},
  }, env);

  assert.deepEqual(allowed, { suppressOutput: true });
});

test('pre-exit-plan-mode no longer pre-denies and leaves out-of-mode validation to the native tool', () => {
  const env = isolatedEnv();

  const outsidePlanMode = run('pre-exit-plan-mode', {
    session_id: 'exit-plan-blocked',
    tool_name: 'ExitPlanMode',
    tool_input: {},
  }, env);

  assert.deepEqual(outsidePlanMode, { suppressOutput: true });

  run('post-tool-use', {
    session_id: 'exit-plan-allowed',
    tool_name: 'EnterPlanMode',
    tool_input: {},
    tool_response: {
      success: true,
    },
  }, env);

  const allowed = run('pre-exit-plan-mode', {
    session_id: 'exit-plan-allowed',
    tool_name: 'ExitPlanMode',
    tool_input: {},
  }, env);

  assert.deepEqual(allowed, { suppressOutput: true });
});

test('pre-ask-user-question no longer denies weak confirmation prompts but still allows real blocking choices', () => {
  const env = isolatedEnv();

  const weakConfirmationAllowed = run('pre-ask-user-question', {
    session_id: 'question-weak-confirm',
    tool_name: 'AskUserQuestion',
    tool_input: {
      questions: [
        {
          header: 'Proceed',
          question: 'Should I proceed?',
          options: [
            { label: 'Yes', description: 'Continue immediately' },
            { label: 'No', description: 'Stop here' },
          ],
        },
      ],
    },
  }, env);

  assert.deepEqual(weakConfirmationAllowed, { suppressOutput: true });

  const localizedWeakConfirmationAllowed = run('pre-ask-user-question', {
    session_id: 'question-weak-confirm-localized',
    tool_name: 'AskUserQuestion',
    tool_input: {
      questions: [
        {
          header: '继续',
          question: '现在要继续吗？',
          options: [
            { label: '继续', description: '立即继续' },
            { label: '停止', description: '先停在这里' },
          ],
        },
      ],
    },
  }, env);

  assert.deepEqual(localizedWeakConfirmationAllowed, { suppressOutput: true });

  run('route', {
    session_id: 'question-real-choice',
    prompt: 'Add caching to the API and choose the right storage backend.',
  }, env);

  const allowed = run('pre-ask-user-question', {
    session_id: 'question-real-choice',
    tool_name: 'AskUserQuestion',
    tool_input: {
      questions: [
        {
          header: 'Backend',
          question: 'Which cache backend should we use?',
          options: [
            { label: 'Redis', description: 'External shared cache' },
            { label: 'Memory', description: 'Process-local cache only' },
          ],
        },
      ],
    },
  }, env);

  assert.deepEqual(allowed, { suppressOutput: true });

  const structureAllowed = run('pre-ask-user-question', {
    session_id: 'question-real-choice',
    tool_name: 'AskUserQuestion',
    tool_input: {
      questions: [
        {
          header: 'Backend',
          question: 'Cache backend',
          options: [
            { label: 'Redis', description: 'External shared cache' },
            { label: 'Memory', description: 'Process-local cache only' },
          ],
        },
      ],
    },
  }, env);

  assert.deepEqual(structureAllowed, { suppressOutput: true });

  const localizedAllowed = run('pre-ask-user-question', {
    session_id: 'question-real-choice',
    tool_name: 'AskUserQuestion',
    tool_input: {
      questions: [
        {
          header: '缓存方案',
          question: '多实例部署时应该选哪种缓存方案？',
          options: [
            { label: '共享缓存', description: '多个实例共享同一缓存层，支持横向扩展。' },
            { label: '进程内缓存', description: '每个实例各自缓存，实现更简单，但跨实例不一致。' },
          ],
        },
      ],
    },
  }, env);

  assert.deepEqual(localizedAllowed, { suppressOutput: true });

  const clarificationAllowed = run('pre-ask-user-question', {
    session_id: 'question-specific-clarification',
    tool_name: 'AskUserQuestion',
    tool_input: {
      questions: [
        {
          header: '配置确认',
          question: '请确认 `src/auth/config.ts` 应该读取哪个 SSO endpoint，以及是否沿用现有 staging 域名？',
        },
      ],
    },
  }, env);

  assert.deepEqual(clarificationAllowed, { suppressOutput: true });
});

test('route exposes active and exited plan-mode continuity for Claude Code style follow-through', () => {
  const env = isolatedEnv();
  const sessionId = 'route-plan-mode-continuity';

  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'EnterPlanMode',
    tool_input: {},
    tool_response: {
      success: true,
    },
  }, env);

  const planningOutput = run('route', {
    session_id: sessionId,
    tools: ['EnterPlanMode', 'ExitPlanMode', 'AskUserQuestion'],
    prompt: 'Continue planning the implementation before we write code.',
  }, env);
  const planningState = parseAdditionalContextJson(planningOutput.hookSpecificOutput.additionalContext);

  assert.equal(planningState.host.continuity.plan_mode_entered, true);
  assert.equal(planningState.response_contract.specialization, 'planning');
  assert.equal(planningState.response_contract.preferred_shape, 'ordered_plan_with_validation_and_open_questions');
  assert.equal(planningState.execution_playbook.role, 'planner');
  assert.equal(planningState.execution_playbook.specialization, 'planning');
  assert.deepEqual(planningState.execution_playbook.primary_tools, ['AskUserQuestion', 'ExitPlanMode']);
  assert.ok(planningState.recovery_playbook.recipes.some((recipe) => recipe.guard === 'plan_mode_protocol'));
  assert.ok(planningState.decision_tie_breakers.items.some((item) => item.id === 'constraints_before_plan_shape'));
  assert.ok(planningState.decision_tie_breakers.items.some((item) => item.id === 'blocking_question_before_plan_freeze'));
  assert.match(planningOutput.hookSpecificOutput.additionalContext, /ExitPlanMode/);
  assert.match(planningOutput.hookSpecificOutput.additionalContext, /AskUserQuestion/);

  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'ExitPlanMode',
    tool_input: {},
    tool_response: {
      success: true,
      plan: '1. Update the auth flow\n2. Verify the API contract',
    },
  }, env);

  const implementationOutput = run('route', {
    session_id: sessionId,
    tools: ['EnterPlanMode', 'ExitPlanMode'],
    prompt: 'Continue implementing from the approved plan.',
  }, env);
  const implementationState = parseAdditionalContextJson(implementationOutput.hookSpecificOutput.additionalContext);

  assert.equal(implementationState.host.continuity.plan_mode_exited, true);
  assert.equal(implementationState.execution_playbook.continuation_rule, 'continue_from_last_approved_plan');
  assert.match(implementationOutput.hookSpecificOutput.additionalContext, /已退出过 plan mode|已批准计划|继续实施/);
});

test('route treats non-lexicon approved-plan follow-up as direct execution continuity', () => {
  const env = isolatedEnv();
  const sessionId = 'route-plan-mode-continuity-non-lexicon';

  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'EnterPlanMode',
    tool_input: {},
    tool_response: {
      success: true,
    },
  }, env);

  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'ExitPlanMode',
    tool_input: {},
    tool_response: {
      success: true,
      plan: '1. Update auth flow\n2. Verify API contract',
    },
  }, env);

  const output = run('route', {
    session_id: sessionId,
    tools: ['EnterPlanMode', 'ExitPlanMode'],
    prompt: '按刚才批准的方案继续。',
  }, env);
  const state = parseAdditionalContextJson(output.hookSpecificOutput.additionalContext);

  assert.equal(state.intent.actions.implement, true);
  assert.equal(state.response_contract.role, 'direct_executor');
  assert.equal(state.execution_playbook.role, 'direct_executor');
  assert.equal(state.execution_playbook.continuation_rule, 'continue_from_last_approved_plan');
});

test('route exposes idle teammates so task assignment stays on the task board path', () => {
  const env = isolatedEnv();
  const sessionId = 'route-idle-teammates';

  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'frontend-owner',
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'backend-owner',
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TaskList',
    tool_response: {
      tasks: [
        { id: '7', subject: 'Implement API', status: 'in_progress', owner: 'frontend-owner', blockedBy: [] },
      ],
    },
  }, env);

  const output = run('route', {
    session_id: sessionId,
    tools: ['TaskList', 'TaskUpdate', 'SendMessage'],
    prompt: 'Continue coordinating the team on the shared task board.',
  }, env);
  const state = parseAdditionalContextJson(output.hookSpecificOutput.additionalContext);

  assert.equal(state.host.continuity.team.active_team, 'delivery-squad');
  assert.deepEqual([...state.host.continuity.team.known_teammates].sort(), ['backend-owner', 'frontend-owner']);
  assert.deepEqual(state.host.continuity.team.idle_teammates, ['backend-owner']);
  assert.match(output.hookSpecificOutput.additionalContext, /TaskUpdate\(owner\)|分派新任务/);
});

test('route exposes assigned task continuity for the team lead after TaskUpdate owner changes', () => {
  const env = isolatedEnv();
  const sessionId = 'route-task-assignment-leader';

  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'frontend-owner',
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TaskCreate',
    tool_response: {
      task: {
        id: '7',
        subject: 'Implement API',
      },
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TaskGet',
    tool_input: {
      taskId: '7',
    },
    tool_response: {
      task: {
        id: '7',
        subject: 'Implement API',
        description: 'Do the work',
        status: 'pending',
        owner: '',
        blocks: [],
        blockedBy: [],
      },
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: '7',
      owner: 'frontend-owner',
      status: 'in_progress',
    },
    tool_response: {
      success: true,
      taskId: '7',
      updatedFields: ['owner', 'status'],
      statusChange: {
        from: 'pending',
        to: 'in_progress',
      },
    },
  }, env);

  const output = run('route', {
    session_id: sessionId,
    tools: ['TaskGet', 'TaskUpdate', 'SendMessage'],
    prompt: 'Continue coordinating the assigned team work.',
  }, env);
  const state = parseAdditionalContextJson(output.hookSpecificOutput.additionalContext);

  assert.deepEqual(state.host.continuity.team.assigned_task_ids_by_teammate, {
    'frontend-owner': ['7'],
  });
  assert.equal(state.host.continuity.team.idle_teammates, undefined);
  assert.match(output.hookSpecificOutput.additionalContext, /assigned team task assignment 已知|TaskUpdate/);
});

test('route exposes current agent assigned tasks from shared team continuity', () => {
  const env = isolatedEnv();
  const leaderSessionId = 'route-task-assignment-shared-leader';
  const teammateSessionId = 'route-task-assignment-shared-worker';
  const teammateTranscriptPath = writeTranscript(env.HOME, teammateSessionId, {
    model: 'opus',
    tools: ['TaskGet', 'TaskUpdate'],
  }, [
    {
      type: 'assistant',
      session_id: teammateSessionId,
      team_name: 'delivery-squad',
      agent_name: 'frontend-owner',
    },
  ]);

  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'frontend-owner',
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TaskCreate',
    tool_response: {
      task: {
        id: '7',
        subject: 'Implement API',
      },
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: '7',
      owner: 'frontend-owner',
      status: 'in_progress',
      subject: 'Implement API',
    },
    tool_response: {
      success: true,
      taskId: '7',
      updatedFields: ['owner', 'status'],
      statusChange: {
        from: 'pending',
        to: 'in_progress',
      },
    },
  }, env);

  const output = run('route', {
    session_id: teammateSessionId,
    transcript_path: teammateTranscriptPath,
    tools: ['TaskGet', 'TaskUpdate', 'SendMessage'],
    prompt: 'Continue my assigned teammate work.',
  }, env);
  const state = parseAdditionalContextJson(output.hookSpecificOutput.additionalContext);

  assert.deepEqual(state.host.continuity.team.current_agent_assigned_tasks, [
    {
      task_id: '7',
      subject: 'Implement API',
      status: 'in_progress',
      assigned_by: 'team-lead',
    },
  ]);
  assert.match(output.hookSpecificOutput.additionalContext, /明确分派任务|TaskGet|TaskUpdate/);
});

test('route exposes pending task-assignment mailbox continuity for the assigned teammate and clears it after pickup', () => {
  const env = isolatedEnv();
  const leaderSessionId = 'route-task-assignment-mailbox-leader';
  const teammateSessionId = 'route-task-assignment-mailbox-worker';
  const teammateTranscriptPath = writeTranscript(env.HOME, teammateSessionId, {
    model: 'opus',
    tools: ['TaskGet', 'TaskUpdate', 'SendMessage'],
  }, [
    {
      type: 'assistant',
      session_id: teammateSessionId,
      team_name: 'delivery-squad',
      agent_name: 'frontend-owner',
    },
  ]);

  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'frontend-owner',
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TaskCreate',
    tool_response: {
      task: {
        id: '7',
        subject: 'Implement API',
      },
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: '7',
      owner: 'frontend-owner',
      status: 'in_progress',
      subject: 'Implement API',
      description: 'Implement the API slice.',
    },
    tool_response: {
      success: true,
      taskId: '7',
      updatedFields: ['owner', 'status'],
      statusChange: {
        from: 'pending',
        to: 'in_progress',
      },
    },
  }, env);

  const assignedOutput = run('route', {
    session_id: teammateSessionId,
    transcript_path: teammateTranscriptPath,
    tools: ['TaskGet', 'TaskUpdate', 'SendMessage'],
    prompt: 'Continue my teammate work.',
  }, env);
  const assignedState = parseAdditionalContextJson(assignedOutput.hookSpecificOutput.additionalContext);

  assert.deepEqual(assignedState.host.continuity.team.current_agent_pending_assignments, [
    {
      task_id: '7',
      owner: 'frontend-owner',
      subject: 'Implement API',
      description: 'Implement the API slice.',
      assigned_by: 'team-lead',
      recorded_at: assignedState.host.continuity.team.current_agent_pending_assignments[0].recorded_at,
    },
  ]);
  assert.deepEqual(assignedState.host.continuity.team.mailbox_events, [
    {
      type: 'task_assignment',
      teammate_name: 'frontend-owner',
      summary: '[Task Assigned] #7 - Implement API',
      task_id: '7',
      task_ids: ['7'],
      subject: 'Implement API',
      description: 'Implement the API slice.',
      assigned_by: 'team-lead',
      recorded_at: assignedState.host.continuity.team.mailbox_events[0].recorded_at,
      follow_up: 'task_pickup',
    },
  ]);
  assert.deepEqual(assignedState.host.continuity.team.mailbox_summary, {
    total_events: 1,
    latest_event_type: 'task_assignment',
    latest_summary: '[Task Assigned] #7 - Implement API',
    event_count_by_type: {
      task_assignment: 1,
    },
    event_types: ['task_assignment'],
    teammate_names: ['frontend-owner'],
    task_ids: ['7'],
    requires_task_pickup: true,
    summary_lines: ['[Task Assigned] #7 - Implement API'],
  });
  assert.match(assignedOutput.hookSpecificOutput.additionalContext, /mailbox.*折叠|已送达的任务分派/i);
  assert.match(assignedOutput.hookSpecificOutput.additionalContext, /task_assignment|已送达的任务分派|TaskGet/);

  run('post-tool-use', {
    session_id: teammateSessionId,
    transcript_path: teammateTranscriptPath,
    tool_name: 'TaskGet',
    tool_input: {
      taskId: '7',
    },
    tool_response: {
      task: {
        id: '7',
        subject: 'Implement API',
        description: 'Implement the API slice.',
        status: 'in_progress',
        owner: 'frontend-owner',
        blocks: [],
        blockedBy: [],
      },
    },
  }, env);

  const clearedOutput = run('route', {
    session_id: teammateSessionId,
    transcript_path: teammateTranscriptPath,
    tools: ['TaskGet', 'TaskUpdate', 'SendMessage'],
    prompt: 'Continue my teammate work.',
  }, env);
  const clearedState = parseAdditionalContextJson(clearedOutput.hookSpecificOutput.additionalContext);
  assert.equal(clearedState.host.continuity.team.current_agent_pending_assignments, undefined);
});

test('route exposes blocker continuity for leader and teammate paths', () => {
  const env = isolatedEnv();
  const leaderSessionId = 'route-blocker-continuity-leader';
  const teammateSessionId = 'route-blocker-continuity-worker';
  const teammateTranscriptPath = writeTranscript(env.HOME, teammateSessionId, {
    model: 'opus',
    tools: ['TaskGet', 'TaskUpdate'],
  }, [
    {
      type: 'assistant',
      session_id: teammateSessionId,
      team_name: 'delivery-squad',
      agent_name: 'frontend-owner',
    },
  ]);

  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'frontend-owner',
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'backend-owner',
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TaskList',
    tool_response: {
      tasks: [
        { id: '7', subject: 'Implement API', status: 'in_progress', owner: 'frontend-owner', blocks: [], blockedBy: ['3'] },
        { id: '3', subject: 'Land backend contract', status: 'pending', owner: 'backend-owner', blocks: ['7'], blockedBy: [] },
      ],
    },
  }, env);

  const leaderOutput = run('route', {
    session_id: leaderSessionId,
    tools: ['TaskGet', 'TaskUpdate', 'SendMessage'],
    prompt: 'Continue coordinating blocker resolution on the team task board.',
  }, env);
  const leaderState = parseAdditionalContextJson(leaderOutput.hookSpecificOutput.additionalContext);
  const [leaderHandoffCandidate] = leaderState.host.continuity.team.handoff_candidates;
  assert.equal(leaderState.response_contract.specialization, 'handoff');
  assert.deepEqual(leaderState.host.continuity.team.blocked_task_ids, ['7']);
  assert.deepEqual(leaderState.host.continuity.team.blocking_task_ids, ['3']);
  assert.deepEqual(leaderState.host.continuity.team.handoff_candidate_task_ids, ['7']);
  assert.deepEqual(leaderState.host.continuity.team.handoff_candidates, [
    {
      task_id: '7',
      subject: 'Implement API',
      current_owner: 'frontend-owner',
      blocker_task_ids: ['3'],
      follow_up_targets: ['backend-owner'],
      reasons: ['blocked_by_teammate'],
      recorded_at: leaderHandoffCandidate.recorded_at,
      recommended_action: 'follow_up_blocker_owner',
      summary: '#7 Implement API is blocked by backend-owner',
    },
  ]);
  assert.deepEqual(leaderState.host.continuity.team.handoff_summary, {
    total_candidates: 1,
    candidate_task_ids: ['7'],
    follow_up_teammates: ['backend-owner'],
    includes_blocker_handoffs: true,
    summary_lines: ['#7 Implement API is blocked by backend-owner'],
  });
  assert.ok(leaderState.recovery_playbook.recipes.some((recipe) => recipe.guard === 'handoff_candidate_continuity'));
  assert.ok(leaderState.decision_tie_breakers.items.some((item) => item.id === 'existing_handoff_candidate_before_new_branch'));
  assert.deepEqual(leaderState.execution_playbook.ordered_steps, [
    'inspect_handoff_candidates',
    'refresh_task_state',
    'close_or_reassign_via_TaskUpdate',
    'summarize_next_owner_or_blocker',
  ]);
  assert.match(leaderOutput.hookSpecificOutput.additionalContext, /handoff \/ reassignment|blocked by backend-owner|follow-up 候选/i);
  assert.match(leaderOutput.hookSpecificOutput.additionalContext, /存在 blocker|TaskUpdate\(addBlockedBy\/addBlocks\)/);

  const teammateOutput = run('route', {
    session_id: teammateSessionId,
    transcript_path: teammateTranscriptPath,
    tools: ['TaskGet', 'TaskUpdate', 'SendMessage'],
    prompt: 'Continue my assigned teammate work and resolve blockers.',
  }, env);
  const teammateState = parseAdditionalContextJson(teammateOutput.hookSpecificOutput.additionalContext);
  assert.deepEqual(teammateState.host.continuity.team.current_agent_blocked_tasks, [
    {
      task_id: '7',
      subject: 'Implement API',
      owner: 'frontend-owner',
      blocked_by: ['3'],
    },
  ]);
  assert.deepEqual(teammateState.execution_playbook.ordered_steps, [
    'read_current_task_state',
    'resolve_blocker_or_prepare_handoff',
    'record_handoff_via_TaskUpdate',
    'send_follow_up_if_needed',
  ]);
  assert.ok(teammateState.execution_playbook.avoid_shortcuts.includes('idle_or_summary_before_task_board_closure'));
  assert.match(teammateOutput.hookSpecificOutput.additionalContext, /被 blocker 卡住|handoff/);
});

test('route keeps blocked verification on verification-blocker playbook instead of team coordination defaults', () => {
  const env = isolatedEnv();
  const leaderSessionId = 'route-blocked-verification-leader';

  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'frontend-owner',
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'backend-owner',
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TaskList',
    tool_response: {
      tasks: [
        { id: '7', subject: 'Verify auth flow', status: 'in_progress', owner: 'frontend-owner', blocks: [], blockedBy: ['3'] },
        { id: '3', subject: 'Land backend contract', status: 'pending', owner: 'backend-owner', blocks: ['7'], blockedBy: [] },
      ],
    },
  }, env);

  const output = run('route', {
    session_id: leaderSessionId,
    tools: ['TaskGet', 'TaskUpdate', 'SendMessage'],
    prompt: 'Verify the auth change and tell me if it passed.',
  }, env);
  const state = parseAdditionalContextJson(output.hookSpecificOutput.additionalContext);

  assert.equal(state.response_contract.specialization, 'blocked_verification');
  assert.equal(state.response_contract.role, 'direct_executor');
  assert.equal(state.execution_playbook.specialization, 'blocked_verification');
  assert.equal(state.execution_playbook.role, 'direct_executor');
  assert.deepEqual(state.execution_playbook.ordered_steps, [
    'inspect_current_blocker',
    'state_validation_evidence_or_not_run_boundary',
    'name_the_unblock_path',
  ]);
  assert.ok(state.decision_tie_breakers.items.some((item) => item.id === 'blocker_or_not_run_before_verified_claim'));
  assert.ok(state.recovery_playbook.recipes.some((recipe) => recipe.guard === 'verification_blocker_continuity'));
  assert.ok(!state.execution_playbook.ordered_steps.includes('inspect_task_board_continuity'));
  assert.ok(!state.execution_playbook.ordered_steps.includes('advance_or_reassign_tasks'));
  assert.ok(!state.execution_playbook.ordered_steps.includes('use_SendMessage_for_real_team_coordination'));
});

test('route exposes teammate_terminated mailbox continuity after shutdown approval and clears it after reassignment', () => {
  const env = isolatedEnv();
  const leaderSessionId = 'route-teammate-terminated-leader';
  const teammateSessionId = 'route-teammate-terminated-worker';
  const teammateTranscriptPath = writeTranscript(env.HOME, teammateSessionId, {
    model: 'opus',
    tools: ['SendMessage'],
  }, [
    {
      type: 'assistant',
      session_id: teammateSessionId,
      team_name: 'delivery-squad',
      agent_name: 'frontend-owner',
    },
  ]);

  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'frontend-owner',
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'backend-owner',
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TaskCreate',
    tool_response: {
      task: {
        id: '7',
        subject: 'Implement API',
      },
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: '7',
      owner: 'frontend-owner',
      status: 'in_progress',
      subject: 'Implement API',
    },
    tool_response: {
      success: true,
      taskId: '7',
      updatedFields: ['owner', 'status'],
      statusChange: {
        from: 'pending',
        to: 'in_progress',
      },
    },
  }, env);
  run('post-tool-use', {
    session_id: teammateSessionId,
    transcript_path: teammateTranscriptPath,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'team-lead',
      message: {
        type: 'shutdown_response',
        request_id: 'shutdown-1',
        approve: true,
      },
    },
    tool_response: {
      success: true,
    },
  }, env);

  const terminatedOutput = run('route', {
    session_id: leaderSessionId,
    tools: ['TaskList', 'TaskUpdate', 'SendMessage'],
    prompt: 'Continue coordinating the team after a worker shutdown.',
  }, env);
  const terminatedState = parseAdditionalContextJson(terminatedOutput.hookSpecificOutput.additionalContext);
  const [notification] = terminatedState.host.continuity.team.pending_termination_notifications;
  const [mailboxEvent] = terminatedState.host.continuity.team.mailbox_events;

  assert.equal(notification.teammate_name, 'frontend-owner');
  assert.match(notification.message, /has shut down|need reassignment/i);
  assert.deepEqual(notification.affected_tasks, [
    {
      task_id: '7',
      subject: 'Implement API',
    },
  ]);
  assert.equal(mailboxEvent.type, 'teammate_terminated');
  assert.equal(mailboxEvent.teammate_name, 'frontend-owner');
  assert.deepEqual(mailboxEvent.affected_task_ids, ['7']);
  assert.match(mailboxEvent.summary, /has shut down|need reassignment/i);
  assert.deepEqual(terminatedState.host.continuity.team.handoff_candidate_task_ids, ['7']);
  assert.deepEqual(terminatedState.host.continuity.team.reassignment_needed_task_ids, ['7']);
  assert.deepEqual(terminatedState.host.continuity.team.handoff_candidates, [
    {
      task_id: '7',
      subject: 'Implement API',
      previous_owner: 'frontend-owner',
      follow_up_targets: ['backend-owner'],
      reasons: ['terminated_teammate'],
      recorded_at: mailboxEvent.recorded_at,
      recommended_action: 'reassign_or_follow_up',
      summary: '#7 Implement API lost owner frontend-owner; follow up with backend-owner',
    },
  ]);
  assert.deepEqual(terminatedState.host.continuity.team.mailbox_summary, {
    total_events: 1,
    latest_event_type: 'teammate_terminated',
    latest_summary: mailboxEvent.summary,
    event_count_by_type: {
      teammate_terminated: 1,
    },
    event_types: ['teammate_terminated'],
    teammate_names: ['frontend-owner'],
    task_ids: ['7'],
    reassignment_needed_task_ids: ['7'],
    requires_reassignment: true,
    summary_lines: [mailboxEvent.summary],
  });
  assert.deepEqual(terminatedState.host.continuity.team.handoff_summary, {
    total_candidates: 1,
    candidate_task_ids: ['7'],
    follow_up_teammates: ['backend-owner'],
    reassignment_needed_task_ids: ['7'],
    includes_shutdown_reassignments: true,
    summary_lines: ['#7 Implement API lost owner frontend-owner; follow up with backend-owner'],
  });
  assert.equal(terminatedState.host.continuity.team.assigned_task_ids_by_teammate, undefined);
  assert.ok(!((terminatedState.host.continuity.team.open_task_owners || []).includes('frontend-owner')));
  assert.match(terminatedOutput.hookSpecificOutput.additionalContext, /mailbox.*折叠|teammate_terminated|需要重新分派/i);
  assert.match(terminatedOutput.hookSpecificOutput.additionalContext, /teammate_terminated|重新分派|TaskUpdate\(owner\)/);

  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: '7',
      owner: 'backend-owner',
      status: 'in_progress',
      subject: 'Implement API',
    },
    tool_response: {
      success: true,
      taskId: '7',
      updatedFields: ['owner', 'status'],
      statusChange: {
        from: 'pending',
        to: 'in_progress',
      },
    },
  }, env);

  const reassignedOutput = run('route', {
    session_id: leaderSessionId,
    tools: ['TaskList', 'TaskUpdate', 'SendMessage'],
    prompt: 'Continue coordinating the team after reassigning the task.',
  }, env);
  const reassignedState = parseAdditionalContextJson(reassignedOutput.hookSpecificOutput.additionalContext);

  assert.equal(reassignedState.host.continuity.team.pending_termination_notifications, undefined);
  assert.equal(reassignedState.host.continuity.team.mailbox_events, undefined);
  assert.equal(reassignedState.host.continuity.team.mailbox_summary, undefined);
  assert.equal(reassignedState.host.continuity.team.handoff_candidates, undefined);
  assert.equal(reassignedState.host.continuity.team.handoff_summary, undefined);
  assert.equal(reassignedState.host.continuity.team.reassignment_needed_task_ids, undefined);
  assert.deepEqual(reassignedState.host.continuity.team.assigned_task_ids_by_teammate, {
    'backend-owner': ['7'],
  });
});

test('route exposes pending teammate plan approvals for the team lead', () => {
  const env = isolatedEnv();
  const leaderSessionId = 'route-pending-plan-approval-leader';
  const teammateSessionId = 'route-pending-plan-approval-worker';
  const teammateTranscriptPath = writeTranscript(env.HOME, teammateSessionId, {
    model: 'opus',
    tools: ['SendMessage'],
  }, [
    {
      type: 'assistant',
      session_id: teammateSessionId,
      team_name: 'delivery-squad',
      agent_name: 'frontend-owner',
    },
  ]);

  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'frontend-owner',
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: teammateSessionId,
    transcript_path: teammateTranscriptPath,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'team-lead',
      message: {
        type: 'plan_approval_request',
        requestId: 'plan-42',
        planFilePath: 'plans/frontend-owner.md',
      },
    },
    tool_response: {
      success: true,
    },
  }, env);

  const output = run('route', {
    session_id: leaderSessionId,
    tools: ['SendMessage', 'TaskUpdate'],
    prompt: 'Continue coordinating the team and handle any pending approvals.',
  }, env);
  const state = parseAdditionalContextJson(output.hookSpecificOutput.additionalContext);

  assert.equal(state.host.continuity.team.active_team, 'delivery-squad');
  assert.deepEqual(state.host.continuity.team.pending_plan_approval_from, ['frontend-owner']);
  assert.deepEqual(state.host.continuity.team.pending_plan_approval_requests, [
    {
      teammate_name: 'frontend-owner',
      request_id: 'plan-42',
      plan_file_path: 'plans/frontend-owner.md',
      recorded_at: state.host.continuity.team.pending_plan_approval_requests[0].recorded_at,
    },
  ]);
  assert.deepEqual(state.host.continuity.team.team_action_items, [
    {
      action_type: 'review_plan_approval',
      priority: 100,
      teammate_name: 'frontend-owner',
      request_id: 'plan-42',
      plan_file_path: 'plans/frontend-owner.md',
      recorded_at: state.host.continuity.team.team_action_items[0].recorded_at,
      next_tool: 'SendMessage.plan_approval_response',
      summary: '[Plan Approval Request from frontend-owner] review and answer with structured plan_approval_response',
    },
  ]);
  assert.deepEqual(state.host.continuity.team.team_action_summary, {
    total_actions: 1,
    top_action_type: 'review_plan_approval',
    top_priority: 100,
    action_types: ['review_plan_approval'],
    teammate_names: ['frontend-owner'],
    requires_immediate_response: true,
    summary_lines: ['[Plan Approval Request from frontend-owner] review and answer with structured plan_approval_response'],
  });
  assert.equal(state.host.continuity.team.idle_teammates, undefined);
  assert.equal(state.response_contract.specialization, 'team_approval');
  assert.equal(state.response_contract.selection_basis, 'team_protocol_continuity');
  assert.equal(state.response_contract.selection_strength, 'strong');
  assert.equal(state.response_contract.preferred_shape, 'approval_status_then_compact_table_then_response_action');
  assert.equal(state.execution_playbook.specialization, 'team_approval');
  assert.ok(state.recovery_playbook.recipes.some((recipe) => recipe.guard === 'team_approval_protocol'));
  assert.ok(state.decision_tie_breakers.items.some((item) => item.id === 'pending_plan_approval_before_general_status'));
  assert.ok(state.decision_tie_breakers.items.some((item) => item.id === 'structured_plan_response_before_prose'));
  assert.equal(state.specialization_candidates.active, 'team_approval');
  assert.ok(state.specialization_candidates.items.some((item) => item.id === 'team_approval' && item.selected));
  assert.ok(state.specialization_candidates.items.some((item) => item.id === 'team_approval' && item.selection_strength === 'strong'));
  assert.match(output.hookSpecificOutput.additionalContext, /action items|plan_approval_response/i);
  assert.match(output.hookSpecificOutput.additionalContext, /plan_approval_response|待处理的计划审批/);
});

test('route prioritizes pending plan approval from continuity even for non-lexicon prompts', () => {
  const env = isolatedEnv();
  const leaderSessionId = 'route-team-approval-non-lexicon-leader';
  const teammateSessionId = 'route-team-approval-non-lexicon-worker';
  const teammateTranscriptPath = writeTranscript(env.HOME, teammateSessionId, {
    model: 'opus',
    tools: ['SendMessage'],
  }, [
    {
      type: 'assistant',
      session_id: teammateSessionId,
      team_name: 'delivery-squad',
      agent_name: 'frontend-owner',
    },
  ]);

  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: teammateSessionId,
    transcript_path: teammateTranscriptPath,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'team-lead',
      message: {
        type: 'plan_approval_request',
        requestId: 'plan-7',
        planFilePath: 'plans/frontend-owner.md',
      },
    },
    tool_response: {
      success: true,
    },
  }, env);

  const output = run('route', {
    session_id: leaderSessionId,
    tools: ['SendMessage', 'TaskUpdate'],
    prompt: '先把最急的收掉。',
  }, env);
  const state = parseAdditionalContextJson(output.hookSpecificOutput.additionalContext);

  assert.equal(state.intent?.analysis?.lexicon_guided, undefined);
  assert.equal(state.response_contract.specialization, 'team_approval');
  assert.equal(state.response_contract.selection_basis, 'team_protocol_continuity');
  assert.equal(state.response_contract.selection_strength, 'strong');
  assert.equal(state.specialization_candidates.active, 'team_approval');
});

test('route prioritizes multi-action leader coordination with a compact-table hint', () => {
  const env = isolatedEnv();
  const leaderSessionId = 'route-team-actions-priority-leader';
  const frontendSessionId = 'route-team-actions-priority-frontend';
  const backendSessionId = 'route-team-actions-priority-backend';
  const frontendTranscriptPath = writeTranscript(env.HOME, frontendSessionId, {
    model: 'opus',
    tools: ['SendMessage'],
  }, [
    {
      type: 'assistant',
      session_id: frontendSessionId,
      team_name: 'delivery-squad',
      agent_name: 'frontend-owner',
    },
  ]);
  const backendTranscriptPath = writeTranscript(env.HOME, backendSessionId, {
    model: 'opus',
    tools: ['SendMessage'],
  }, [
    {
      type: 'assistant',
      session_id: backendSessionId,
      team_name: 'delivery-squad',
      agent_name: 'backend-owner',
    },
  ]);

  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'frontend-owner',
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'backend-owner',
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TaskList',
    tool_response: {
      tasks: [
        { id: '7', subject: 'Implement API', status: 'in_progress', owner: 'frontend-owner', blocks: [], blockedBy: ['3'] },
        { id: '3', subject: 'Land backend contract', status: 'pending', owner: 'backend-owner', blocks: ['7'], blockedBy: [] },
      ],
    },
  }, env);
  run('post-tool-use', {
    session_id: frontendSessionId,
    transcript_path: frontendTranscriptPath,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'team-lead',
      message: {
        type: 'plan_approval_request',
        requestId: 'plan-99',
        planFilePath: 'plans/frontend-owner.md',
      },
    },
    tool_response: {
      success: true,
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'backend-owner',
      message: {
        type: 'shutdown_request',
      },
    },
    tool_response: {
      success: true,
    },
  }, env);
  run('post-tool-use', {
    session_id: backendSessionId,
    transcript_path: backendTranscriptPath,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'team-lead',
      message: {
        type: 'shutdown_response',
        request_id: 'shutdown-9',
        approve: false,
        reason: 'Still finishing verification',
      },
    },
    tool_response: {
      success: true,
    },
  }, env);

  const output = run('route', {
    session_id: leaderSessionId,
    tools: ['TaskGet', 'TaskUpdate', 'SendMessage'],
    prompt: 'Summarize the team state and tell me what to do next.',
  }, env);
  const state = parseAdditionalContextJson(output.hookSpecificOutput.additionalContext);
  const [planAction, shutdownAction, handoffAction] = state.host.continuity.team.team_action_items;

  assert.deepEqual(state.host.continuity.team.shutdown_rejection_records, [
    {
      teammate_name: 'backend-owner',
      reason: 'Still finishing verification',
      recorded_at: state.host.continuity.team.shutdown_rejection_records[0].recorded_at,
    },
  ]);
  assert.deepEqual(state.host.continuity.team.team_action_items, [
    {
      action_type: 'review_plan_approval',
      priority: 100,
      teammate_name: 'frontend-owner',
      request_id: 'plan-99',
      plan_file_path: 'plans/frontend-owner.md',
      recorded_at: planAction.recorded_at,
      next_tool: 'SendMessage.plan_approval_response',
      summary: '[Plan Approval Request from frontend-owner] review and answer with structured plan_approval_response',
    },
    {
      action_type: 'resolve_shutdown_rejection',
      priority: 95,
      teammate_name: 'backend-owner',
      reason: 'Still finishing verification',
      recorded_at: shutdownAction.recorded_at,
      next_tool: 'TaskGet/SendMessage',
      summary: '[Shutdown Rejected] backend-owner: Still finishing verification',
    },
    {
      action_type: 'follow_up_handoff',
      priority: 80,
      task_id: '7',
      teammate_name: 'frontend-owner',
      follow_up_targets: ['backend-owner'],
      recorded_at: handoffAction.recorded_at,
      next_tool: 'TaskGet/SendMessage',
      summary: '#7 Implement API is blocked by backend-owner',
    },
  ]);
  assert.deepEqual(state.host.continuity.team.team_action_summary, {
    total_actions: 3,
    top_action_type: 'review_plan_approval',
    top_priority: 100,
    action_types: ['review_plan_approval', 'resolve_shutdown_rejection', 'follow_up_handoff'],
    teammate_names: ['frontend-owner', 'backend-owner'],
    task_ids: ['7'],
    requires_immediate_response: true,
    requires_compact_table: true,
    recommended_response_shape: 'one_line_plus_compact_markdown_table',
    preferred_table_columns: ['priority', 'action', 'task', 'teammate', 'next_tool'],
    summary_lines: [
      '[Plan Approval Request from frontend-owner] review and answer with structured plan_approval_response',
      '[Shutdown Rejected] backend-owner: Still finishing verification',
      '#7 Implement API is blocked by backend-owner',
    ],
  });
  assert.equal(state.response_contract.preferred_shape, 'one_line_plus_compact_markdown_table');
  assert.equal(state.response_contract.specialization, 'team_approval');
  assert.equal(state.response_contract.selection_basis, 'team_protocol_continuity');
  assert.equal(state.response_contract.selection_strength, 'strong');
  assert.deepEqual(state.response_contract.preferred_table_columns, ['priority', 'action', 'task', 'teammate', 'next_tool']);
  assert.equal(state.renderer_contract.opening, 'judgment_first');
  assert.deepEqual(state.renderer_contract.section_order, ['one_line_judgment', 'compact_table', 'next_step']);
  assert.equal(state.renderer_contract.table_mode, 'compact_markdown');
  assert.deepEqual(state.renderer_contract.table_columns, ['priority', 'action', 'task', 'teammate', 'next_tool']);
  assert.ok(state.renderer_contract.avoid.includes('ascii_tables_when_markdown_works'));
  assert.equal(state.execution_playbook.role, 'team_lead');
  assert.equal(state.execution_playbook.specialization, 'team_approval');
  assert.deepEqual(state.execution_playbook.primary_tools, ['SendMessage.plan_approval_response', 'TaskGet', 'SendMessage']);
  assert.equal(state.recovery_playbook.fail_closed, true);
  assert.ok(state.recovery_playbook.recipes.some((recipe) => recipe.guard === 'team_approval_protocol'));
  assert.ok(state.recovery_playbook.recipes.some((recipe) => recipe.guard === 'pending_plan_approval_protocol'));
  assert.ok(state.recovery_playbook.recipes.some((recipe) => recipe.guard === 'shutdown_rejection_follow_up'));
  assert.ok(state.recovery_playbook.recipes.some((recipe) => recipe.guard === 'task_handoff_or_blocker_continuity'));
  assert.ok(state.decision_tie_breakers.items.some((item) => item.id === 'pending_plan_approval_before_general_status'));
  assert.ok(state.decision_tie_breakers.items.some((item) => item.id === 'structured_plan_response_before_prose'));
  assert.ok(state.decision_tie_breakers.items.some((item) => item.id === 'higher_priority_action_before_follow_up'));
  assert.equal(state.specialization_candidates.active, 'team_approval');
  assert.ok(state.specialization_candidates.items.some((item) => item.id === 'team_approval' && item.selection_basis === 'team_protocol_continuity'));
  assert.match(output.hookSpecificOutput.additionalContext, /priority \| action \| task \| teammate \| next tool/);
  assert.match(output.hookSpecificOutput.additionalContext, /shutdown rejection|Still finishing verification/i);
  assert.match(output.hookSpecificOutput.additionalContext, /action items|更高优先级 action/i);
  assert.match(output.hookSpecificOutput.additionalContext, /recovery_playbook|pending_plan_approval_protocol|shutdown_rejection_follow_up/);
});

test('leader plan approval response clears pending approval continuity', () => {
  const env = isolatedEnv();
  const leaderSessionId = 'route-pending-plan-approval-cleared';
  const teammateSessionId = 'route-pending-plan-approval-cleared-worker';
  const teammateTranscriptPath = writeTranscript(env.HOME, teammateSessionId, {
    model: 'opus',
    tools: ['SendMessage'],
  }, [
    {
      type: 'assistant',
      session_id: teammateSessionId,
      team_name: 'delivery-squad',
      agent_name: 'frontend-owner',
    },
  ]);

  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: teammateSessionId,
    transcript_path: teammateTranscriptPath,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'team-lead',
      message: {
        type: 'plan_approval_request',
        requestId: 'plan-42',
        planFilePath: 'plans/frontend-owner.md',
      },
    },
    tool_response: {
      success: true,
    },
  }, env);
  run('post-tool-use', {
    session_id: leaderSessionId,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'frontend-owner',
      message: {
        type: 'plan_approval_response',
        requestId: 'plan-42',
        approved: true,
      },
    },
    tool_response: {
      success: true,
    },
  }, env);

  const output = run('route', {
    session_id: leaderSessionId,
    tools: ['SendMessage', 'TaskUpdate'],
    prompt: 'Continue coordinating the team after handling approvals.',
  }, env);
  const state = parseAdditionalContextJson(output.hookSpecificOutput.additionalContext);

  assert.equal(state.host.continuity.team.pending_plan_approval_from, undefined);
  assert.deepEqual(state.host.continuity.team.idle_teammates, ['frontend-owner']);
});

test('route exposes workflow continuity after task and tool policy activity', () => {
  const env = isolatedEnv();
  const sessionId = 'route-workflow-continuity';

  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TeamCreate',
    tool_input: {
      team_name: 'delivery-squad',
    },
    tool_response: {
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TaskCreate',
    tool_response: {
      task: {
        id: '11',
        subject: 'Implement CLI policy layer',
      },
    },
  }, env);

  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'TaskGet',
    tool_input: {
      taskId: '11',
    },
    tool_response: {
      task: {
        id: '11',
        subject: 'Implement CLI policy layer',
        description: 'Continue the tracked task',
        status: 'pending',
        blocks: [],
        blockedBy: [],
      },
    },
  }, env);

  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'general-purpose',
      name: 'frontend-owner',
      team_name: 'delivery-squad',
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'SendMessage',
    tool_input: {
      to: 'frontend-owner',
      message: {
        type: 'shutdown_request',
      },
    },
  }, env);
  run('post-tool-use', {
    session_id: sessionId,
    tool_name: 'ToolSearch',
    tool_input: {
      query: 'slack send',
    },
    tool_response: {
      query: 'slack send',
      matches: [],
      total_deferred_tools: 0,
    },
  }, env);

  const output = run('route', {
    session_id: sessionId,
    tools: ['TaskCreate', 'TaskGet', 'TaskUpdate', 'ToolSearch'],
    prompt: 'Continue the tracked task-board work.',
  }, env);
  const state = parseAdditionalContextJson(output.hookSpecificOutput.additionalContext);

  assert.equal(state.host.continuity.active_task_board, true);
  assert.deepEqual(state.host.continuity.known_task_ids, ['11']);
  assert.equal(state.host.continuity.last_task_read_id, '11');
  assert.deepEqual(state.host.continuity.recent_zero_result_toolsearch_queries, ['slack send']);
  assert.equal(state.host.continuity.team.active_team, 'delivery-squad');
  assert.deepEqual(state.host.continuity.team.known_teammates, ['frontend-owner']);
  assert.deepEqual(state.host.continuity.team.shutdown_requested_targets, ['frontend-owner']);
});
