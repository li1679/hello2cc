# 2cc Local Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the copied `hello2cc` fork into a personal local plugin named `2cc`, while making third-party models less likely to leak internal route checklists or keep stale checklist formats after topic changes.

**Architecture:** Keep the existing hook core, CCSwitch boundary, model-slot normalization, and regression suite. Change the visible route layer from verbose playbook injection to compact current-turn hints, and narrow generic capability routing so ordinary questions do not become Claude Code capability prompts.

**Tech Stack:** Node.js ESM, Claude Code plugin manifest, Claude Code hooks, Node test runner, local marketplace installation.

---

## File structure

`C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/package.json` becomes private local metadata for `2cc`. It keeps the local validation and test scripts, removes npm publishing intent, and keeps version sync with the plugin manifest.

`C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/.claude-plugin/plugin.json` becomes the `2cc` plugin manifest. It keeps the existing user config keys because those are wired into code through environment variables.

`C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/.claude-plugin/marketplace.json` becomes a local marketplace entry named `2cc-local` with plugin name `2cc`.

`C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/output-styles/2cc-native.md` replaces `output-styles/hello2cc-native.md`. The style is the visible contract for short Chinese Claude Code-like output and for not echoing route internals.

`C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/scripts/lib/config.mjs` owns the forced output style name.

`C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/scripts/lib/route-guidance.mjs` owns the current-turn additional context shape. It should stop emitting verbose internal playbooks for ordinary turns.

`C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/scripts/lib/route-decision-lines.mjs` owns natural-language route hints. It should stop exposing section order, execution steps, renderer contracts, and specialization lists in prose.

`C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/scripts/lib/intent-profile-route-signals.mjs` owns capability probe detection. It should require a host capability anchor instead of treating every generic question as a capability probe.

`C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/scripts/lib/validate-plugin-manifest.mjs` and `C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/scripts/lib/validate-plugin-surface.mjs` keep validation aligned with the local `2cc` fork.

`C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/tests/orchestrator-route-host-capabilities.test.mjs`, `C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/tests/orchestrator-route-execution.test.mjs`, and related route tests capture the new compact route behavior.

---

### Task 1: Add failing regressions for stale checklist leakage and generic capability misrouting

**Files:**
- Modify: `C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/tests/orchestrator-route-host-capabilities.test.mjs`

- [ ] **Step 1: Add the failing tests**

Append these tests after the existing capability-probe test. These tests prove the reported bug before changing routing code.

```js
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
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```powershell
node --test tests/orchestrator-route-host-capabilities.test.mjs
```

Expected: FAIL. The first two added tests fail because generic questions currently produce route context. The compact capability test fails because route context still starts with `# hello2cc routing` and includes internal playbook fields.

- [ ] **Step 3: Commit the failing tests**

Run:

```powershell
git add tests/orchestrator-route-host-capabilities.test.mjs
git commit -m "test: capture stale route checklist leakage"
```

Expected: commit succeeds with only the test file staged.

---

### Task 2: Rename the local fork metadata to 2cc and remove npm publishing intent

**Files:**
- Modify: `C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/package.json`
- Modify: `C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/.claude-plugin/plugin.json`
- Modify: `C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/.claude-plugin/marketplace.json`
- Modify: `C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/scripts/lib/config.mjs`
- Modify: `C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/scripts/lib/validate-plugin-manifest.mjs`

- [ ] **Step 1: Replace package metadata**

Replace `package.json` with this exact JSON:

```json
{
  "name": "2cc",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Personal local Claude Code alignment plugin for CCSwitch-backed third-party models.",
  "license": "Apache-2.0",
  "scripts": {
    "release:notes": "node ./scripts/generate-release-notes.mjs",
    "validate": "node ./scripts/validate-plugin.mjs .",
    "test": "node --test",
    "test:real": "node ./scripts/claude-real-regression.mjs",
    "check": "npm run validate && npm test"
  },
  "files": [
    ".claude-plugin/",
    "agents/",
    "hooks/",
    "scripts/",
    "output-styles/"
  ],
  "engines": {
    "node": ">=18"
  }
}
```

- [ ] **Step 2: Update the plugin manifest identity**

In `.claude-plugin/plugin.json`, set the top-level identity fields to these exact values and keep the existing `userConfig` object unchanged except for visible project-name wording inside descriptions.

```json
{
  "name": "2cc",
  "version": "0.1.0",
  "description": "Personal local Claude Code alignment plugin for CCSwitch-backed third-party models.",
  "author": {
    "name": "2cc local"
  },
  "license": "Apache-2.0",
  "keywords": [
    "claude-code",
    "plugin",
    "ccswitch",
    "third-party-models",
    "alignment",
    "local"
  ],
  "outputStyles": "./output-styles"
}
```

The final file must still include the existing `userConfig` after `outputStyles`. Do not remove config keys such as `routing_policy`, `mirror_session_model`, `default_agent_model`, `primary_model`, `subagent_model`, `guide_model`, `explore_model`, `plan_model`, `general_model`, or `team_model`.

- [ ] **Step 3: Replace marketplace metadata**

Replace `.claude-plugin/marketplace.json` with this exact JSON:

```json
{
  "name": "2cc-local",
  "owner": {
    "name": "2cc local"
  },
  "metadata": {
    "description": "Local marketplace for the personal 2cc Claude Code plugin"
  },
  "plugins": [
    {
      "name": "2cc",
      "description": "Personal local Claude Code alignment plugin for CCSwitch-backed third-party models.",
      "version": "0.1.0",
      "source": "./",
      "author": {
        "name": "2cc local"
      }
    }
  ]
}
```

- [ ] **Step 4: Update the forced output style constant**

In `scripts/lib/config.mjs`, replace the first line with this code:

```js
export const FORCED_OUTPUT_STYLE_NAME = '2cc:2cc Native';
```

- [ ] **Step 5: Update manifest validation wording**

In `scripts/lib/validate-plugin-manifest.mjs`, replace the marketplace-entry failure string so it no longer names `hello2cc`:

```js
context.fail('marketplace.json should expose the plugin entry matching plugin.json name');
```

- [ ] **Step 6: Run metadata validation**

Run:

```powershell
npm run validate
```

Expected: FAIL at this point if output style validation still expects `output-styles/hello2cc-native.md`. That failure is expected until Task 3 changes the style file and validator.

---

### Task 3: Replace the output style with a 2cc-native style that forbids route-internal leakage

**Files:**
- Delete: `C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/output-styles/hello2cc-native.md`
- Create: `C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/output-styles/2cc-native.md`
- Modify: `C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/scripts/lib/validate-plugin-surface.mjs`
- Modify: route and subagent tests that assert the old style name

- [ ] **Step 1: Create the new output style**

Create `output-styles/2cc-native.md` with this exact content:

```markdown
---
name: 2cc Native
description: 个人本地 2cc 输出风格：中文短句、结果优先、原生 Claude Code 工具语义优先，不外露内部路由。
keep-coding-instructions: true
force-for-plugin: true
---

# 2cc Native

把 Claude Code 的原生工作流当成默认路径。用户、Claude Code 宿主、CLAUDE.md、AGENTS.md、项目规则永远优先于这个风格。

## 行动方式

先按宿主暴露的工具、agent、skills、MCP、权限和 hook 结果行动。没有被宿主暴露的能力，不要当成已经存在。CCSwitch 负责真实模型映射；2cc 只使用 Claude Code 可见的 `opus`、`sonnet`、`haiku`、`inherit` 槽位。

## 可见输出

中文场景默认用中文短句。先给结果，再给必要依据。少写内部过程。不要输出 2cc routing、response_contract、renderer_contract、execution_playbook、ordered_steps、section_order、specialization_candidates、decision_tie_breakers、recovery_playbook 这些内部字段或它们的翻译。

不要因为上一轮出现过计划、清单、表格、章节名，就在新话题里继续套用。只有用户明确要求清单，或 Claude Code 当前真的处在 plan mode、team、task board 连续体里，才保留对应结构。

比较、取舍、工具选择问题可以用紧凑 Markdown 表格。普通回答用自然段即可。不要为了显得有流程而固定列步骤。

## 收口

失败要暴露真实原因。不要写假成功。完成状态要有验证依据；没验证就说明没验证。
```

- [ ] **Step 2: Delete the old style file**

Run:

```powershell
Remove-Item -LiteralPath "C:\Users\HP\OneDrive\Desktop\新建文件夹\hello2cc\output-styles\hello2cc-native.md"
```

Expected: `output-styles/hello2cc-native.md` no longer exists.

- [ ] **Step 3: Update output style validation path and wording**

In `scripts/lib/validate-plugin-surface.mjs`, replace the `validateOutputStyles` function with this code:

```js
/**
 * Validates the forced native output style metadata and precedence hints.
 */
export function validateOutputStyles(context) {
  const relativePath = 'output-styles/2cc-native.md';
  if (!context.exists(relativePath)) {
    context.fail('missing output-styles/2cc-native.md');
    return;
  }

  const text = context.readText(relativePath);
  const frontmatter = parseFrontmatter(text);
  if (!frontmatter) {
    context.fail('invalid frontmatter in output-styles/2cc-native.md');
    return;
  }

  if (!/^name:\s*.+$/m.test(frontmatter)) {
    context.fail('missing name in output-styles/2cc-native.md');
  }

  if (!/^description:\s*.+$/m.test(frontmatter)) {
    context.fail('missing description in output-styles/2cc-native.md');
  }

  if (!/^keep-coding-instructions:\s*true$/m.test(frontmatter)) {
    context.fail('output style should keep coding instructions');
  } else {
    context.ok('output style frontmatter');
  }

  if (!/^force-for-plugin:\s*true$/m.test(frontmatter)) {
    context.fail('output style should enable force-for-plugin');
  } else {
    context.ok('output style force-for-plugin');
  }

  if (!/CLAUDE\.md|AGENTS\.md/.test(text)) {
    context.fail('output style should explicitly defer to higher-priority CLAUDE.md / AGENTS.md rules');
  } else {
    context.ok('output style precedence');
  }

  if (!/ordered_steps|section_order|execution_playbook/.test(text)) {
    context.fail('output style should explicitly prevent route-internal leakage');
  } else {
    context.ok('output style route-internal leakage guard');
  }
}
```

- [ ] **Step 4: Update test expectations for the forced style name**

Run this search:

```powershell
Select-String -Path "tests\*.mjs" -Pattern "hello2cc:hello2cc Native|hello2cc Native|hello2cc-native"
```

For each match, replace expected values with `2cc:2cc Native`, `2cc Native`, or `2cc-native` according to the assertion being tested.

- [ ] **Step 5: Run validation**

Run:

```powershell
npm run validate
```

Expected: PASS.

- [ ] **Step 6: Commit the local fork identity and style changes**

Run:

```powershell
git add package.json .claude-plugin/plugin.json .claude-plugin/marketplace.json scripts/lib/config.mjs scripts/lib/validate-plugin-manifest.mjs scripts/lib/validate-plugin-surface.mjs output-styles tests
git commit -m "chore: rename local fork to 2cc"
```

Expected: commit succeeds. If no tests were modified in this task, `git add tests` stages no files and the commit still succeeds with metadata and style files.

---

### Task 4: Narrow capability probes so generic questions do not become host capability routes

**Files:**
- Modify: `C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/scripts/lib/intent-profile-route-signals.mjs`
- Modify: `C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/tests/orchestrator-route-host-capabilities.test.mjs`

- [ ] **Step 1: Add anchored host capability detection**

In `scripts/lib/intent-profile-route-signals.mjs`, add this helper above `deriveCapabilitySignals`:

```js
const HOST_CAPABILITY_QUESTION_MARKERS = [
  'claude code',
  'tool',
  'tools',
  'agent',
  'agents',
  'skill',
  'skills',
  'mcp',
  'hook',
  'hooks',
  'plugin',
  'plugins',
  'permission',
  'permissions',
  'workflow',
  'workflows',
  'capability',
  'capabilities',
  '可用工具',
  '工具',
  '智能体',
  '子代理',
  '技能',
  '权限',
  '插件',
  '工作流',
  '能力',
  '外部能力',
  '外部连携',
  '連携',
  '使える機能',
  '利用できる外部連携',
];

function hasCapabilityQuestionAnchor(seed = {}) {
  return Boolean(
    seed.promptEnvelope?.knownSurfaceMentioned ||
    seed.explicitHostFeature ||
    seed.mcp ||
    seed.skillSurface ||
    seed.guideTopic ||
    seed.collaboration?.has?.('worktree') ||
    promptMentionsAny(seed.slots?.text, HOST_CAPABILITY_QUESTION_MARKERS)
  );
}
```

- [ ] **Step 2: Require the anchor for capabilityProbeShape**

In `deriveCapabilitySignals`, add the helper to the `capabilityProbeShape` Boolean condition immediately before `hasCapabilityDiscoverySurface(sessionContext)`:

```js
      hasCapabilityQuestionAnchor(seed) &&
      hasCapabilityDiscoverySurface(sessionContext)
```

- [ ] **Step 3: Keep the Japanese capability test meaningful**

In `tests/orchestrator-route-host-capabilities.test.mjs`, rename the test title from `route derives language-agnostic capability probes from question shape` to this exact title:

```js
test('route derives capability probes from host-capability question anchors', () => {
```

Keep its prompt as `利用できる外部連携はありますか？` because `外部連携` is now a supported capability anchor.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
node --test tests/orchestrator-route-host-capabilities.test.mjs
```

Expected: the generic everyday question tests now pass. The compact capability test still fails until Task 5 removes internal playbooks from route output.

- [ ] **Step 5: Commit the capability narrowing**

Run:

```powershell
git add scripts/lib/intent-profile-route-signals.mjs tests/orchestrator-route-host-capabilities.test.mjs
git commit -m "fix: narrow generic capability probe routing"
```

Expected: commit succeeds.

---

### Task 5: Make route additional context compact and stop exposing internal playbooks

**Files:**
- Modify: `C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/scripts/lib/route-guidance.mjs`
- Modify: `C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/scripts/lib/route-decision-lines.mjs`
- Modify route-output tests that assert internal route fields

- [ ] **Step 1: Add compact route helpers**

In `scripts/lib/route-guidance.mjs`, add these helpers after `buildHostOwnedDecisionLines`:

```js
function hasRealContinuity(continuity = {}) {
  return Boolean(
    continuity.active_task_board ||
    continuity.plan_mode_entered ||
    continuity.plan_mode_exited ||
    continuity.team?.active_team ||
    continuity.team?.team_action_items?.length ||
    continuity.team?.handoff_candidates?.length ||
    continuity.recent_zero_result_toolsearch_queries?.length ||
    continuity.websearch?.degraded
  );
}

function compactRouteState({ responseContract = {}, recoveryPlaybook = {}, decisionTieBreakers = {} } = {}) {
  return compactState({
    specialization: responseContract.specialization,
    selection_basis: responseContract.selection_basis,
    selection_strength: responseContract.selection_strength,
    guards: Array.isArray(recoveryPlaybook.recipes)
      ? recoveryPlaybook.recipes.map((recipe) => recipe.guard).filter(Boolean)
      : undefined,
    tie_breakers: Array.isArray(decisionTieBreakers.items)
      ? decisionTieBreakers.items.map((item) => item.id).filter(Boolean).slice(0, 4)
      : undefined,
  });
}

function buildCompactRouteSnapshot({
  signals = {},
  sessionContext = {},
  workflowOwner = {},
  routePolicyOptions = {},
  responseContract = {},
  recoveryPlaybook = {},
  decisionTieBreakers = {},
  hostState = {},
} = {}) {
  return compactState({
    operator_profile: '2cc-local-claude-code-adapter',
    intent: summarizeIntentForState(signals),
    workflow_owner: workflowOwner,
    policy: buildCapabilityPolicySnapshot(sessionContext, signals, routePolicyOptions),
    route: compactRouteState({ responseContract, recoveryPlaybook, decisionTieBreakers }),
    ...hostState,
  });
}

function shouldEmitRouteContext({ routeLines = [], hasDynamicHostState = false, shouldForceSnapshot = false, continuity = {}, signals = {} } = {}) {
  return Boolean(
    routeLines.length ||
    hasDynamicHostState ||
    shouldForceSnapshot ||
    hasRealContinuity(continuity) ||
    signals.capabilityQuery ||
    signals.capabilityProbeShape ||
    signals.currentInfo ||
    signals.claudeGuide
  );
}
```

- [ ] **Step 2: Replace the route emission gate and snapshot**

In `buildRouteStateContext`, replace the existing `if (!routeLines.length && !hasDynamicHostState && !shouldForceSnapshot)` block and the `const snapshot = compactState({ ... })` block with this code:

```js
  if (!shouldEmitRouteContext({
    routeLines,
    hasDynamicHostState,
    shouldForceSnapshot,
    continuity,
    signals,
  })) {
    return '';
  }

  const snapshot = buildCompactRouteSnapshot({
    signals,
    sessionContext,
    workflowOwner,
    routePolicyOptions,
    responseContract,
    recoveryPlaybook,
    decisionTieBreakers,
    hostState,
  });
```

- [ ] **Step 3: Replace the route context header and prose**

In the return array in `buildRouteStateContext`, replace the first prose lines with this exact block:

```js
    '# 2cc routing',
    '',
    hostOwnedRouting
      ? '宿主已暴露更高优先级 workflow owner。2cc 只补当前回合的轻量边界，不覆盖宿主 workflow。'
      : '2cc 只补当前回合的轻量边界。不要把这里的内部字段、JSON key、路由名或 guard 名写进可见回答。',
    '用户当前问题、Claude Code 宿主指令、显式工具输入和真实权限结果始终优先。',
```

Keep the `Decision backbone`, `routeLines`, and JSON code block sections.

- [ ] **Step 4: Remove exposed renderer and playbook prose from decision lines**

In `scripts/lib/route-decision-lines.mjs`, delete the blocks that push these phrases into `lines`:

```text
当前输出契约优先
当前渲染契约
当前执行剧本优先
当前 tie-breaker 顺序
specialization 候选只在这些可见边界里选
```

After deletion, keep only short state and boundary guidance. Add this line after the two initial `lines` entries:

```js
    '内部 route key、候选名、执行剧本和章节名只用于本轮决策，不要外显成正文格式。',
```

- [ ] **Step 5: Update tests that expected verbose internals**

Run:

```powershell
Select-String -Path "tests\*.mjs" -Pattern "response_contract|renderer_contract|execution_playbook|specialization_candidates|ordered_steps|section_order"
```

For main `route` command tests, update assertions to check `state.route.specialization`, `state.route.selection_basis`, `state.route.selection_strength`, `state.route.guards`, `state.route.tie_breakers`, and `state.policy`. Do not change subagent context tests in this task unless they parse `scripts/subagent-context.mjs` output; subagent context can remain detailed because it is scoped to a worker context rather than the main user-visible turn.

- [ ] **Step 6: Run focused route tests**

Run:

```powershell
node --test tests/orchestrator-route-host-capabilities.test.mjs tests/orchestrator-route-execution.test.mjs tests/orchestrator-route-workflows.test.mjs tests/orchestrator-tool-policy.test.mjs
```

Expected: PASS. If a test still expects internal route fields from the main `route` command, update it to the compact shape from Step 5.

- [ ] **Step 7: Commit compact route output**

Run:

```powershell
git add scripts/lib/route-guidance.mjs scripts/lib/route-decision-lines.mjs tests
git commit -m "fix: keep route guidance compact and private"
```

Expected: commit succeeds.

---

### Task 6: Refresh docs for a personal local 2cc install

**Files:**
- Modify: `C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/README.md`
- Modify: `C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/README_CN.md`
- Modify: `C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/docs/ccstatusline.md`
- Modify: `C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/CHANGELOG.md`

- [ ] **Step 1: Replace README_CN with local-first documentation**

Replace the entire `README_CN.md` file with this content:

````markdown
# 2cc

个人本地 Claude Code 插件，用来让通过 CCSwitch 接入的第三方模型更接近 Claude Code 原生工作方式。

`2cc` 不接管模型账号，不替代 CCSwitch，不发布 npm。CCSwitch 负责真实模型映射；`2cc` 只在 Claude Code 插件层做输出风格、工具语义、agent/team/task 参数归一、失败防抖和上下文收口。

## 本地安装

```bash
git clone https://github.com/li1679/hello2cc.git 2cc
cd 2cc
claude plugins marketplace add "$(pwd)"
claude plugins install 2cc@2cc-local
```

Windows PowerShell 可以把 `$(pwd)` 换成仓库绝对路径：

```powershell
claude plugins marketplace add "C:\Users\HP\OneDrive\Desktop\新建文件夹\hello2cc"
claude plugins install 2cc@2cc-local
```

安装后重启 Claude Code，或执行 `/reload-plugins`。

## 这一版重点

`2cc` 的目标是少露内部流程、少复读清单、少误路由。普通问题不应该因为上一轮出现过计划或 checklist，就继续套用旧格式。只有真实 active plan、team、task board 或失败恢复还存在时，才保留连续体提示。

## 推荐配置

真实模型落点继续放在 CCSwitch。`2cc` 配置里优先使用 `inherit`、`opus`、`sonnet`、`haiku` 这些 Claude Code 原生槽位，不把第三方模型别名直接写进 `Agent.model`。

## 本地验证

```bash
npm run check
```

这个命令只验证本地插件结构和测试，不代表发布 npm。

## ccstatusline 桥接

如果 Claude Code 的 `StatusLine` payload 把 usage 字段传成 `0`，可以使用 `scripts/ccstatusline-bridge.mjs` 从 transcript 回填。配置示例在 `docs/ccstatusline.md`。
````

- [ ] **Step 2: Replace README with concise English local documentation**

Replace the entire `README.md` file with this content:

````markdown
# 2cc

Personal local Claude Code plugin for CCSwitch-backed third-party models.

`2cc` does not manage model accounts, replace CCSwitch, or publish to npm. CCSwitch owns the real model mapping. `2cc` stays at the Claude Code plugin layer and keeps output style, tool semantics, agent/team/task input normalization, failure debounce, and context boundaries closer to native Claude Code behavior.

## Local install

```bash
git clone https://github.com/li1679/hello2cc.git 2cc
cd 2cc
claude plugins marketplace add "$(pwd)"
claude plugins install 2cc@2cc-local
```

On Windows PowerShell, use the local repository path:

```powershell
claude plugins marketplace add "C:\Users\HP\OneDrive\Desktop\新建文件夹\hello2cc"
claude plugins install 2cc@2cc-local
```

Restart Claude Code after installing, or run `/reload-plugins`.

## What this fork changes

`2cc` aims to reduce internal process leakage, stale checklist repetition, and generic misrouting. Ordinary questions should not keep using a previous plan or checklist format. Continuity stays only when a real active plan, team, task board, or failure recovery path exists.

## CCSwitch boundary

Keep real model routing in CCSwitch. In `2cc`, prefer Claude Code-native slots such as `inherit`, `opus`, `sonnet`, and `haiku`; do not put third-party model aliases directly into `Agent.model`.

## Local validation

```bash
npm run check
```

This validates the local plugin and tests. It is not an npm publish flow.
````

- [ ] **Step 3: Update ccstatusline docs**

In `docs/ccstatusline.md`, replace `hello2cc` with `2cc` where it refers to the plugin. Update command examples to point at the local repository path and `scripts/ccstatusline-bridge.mjs`. Do not keep `D:/GitHub/dev/hello2cc` in examples.

Use this Windows example:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"C:/Users/HP/OneDrive/Desktop/新建文件夹/hello2cc/scripts/ccstatusline-bridge.mjs\""
  }
}
```

- [ ] **Step 4: Add a changelog entry**

At the top of `CHANGELOG.md`, add this section:

```markdown
## 0.1.0 - 2cc local fork

- Rename the personal local fork to `2cc`.
- Keep CCSwitch as the model mapping layer and remove npm publishing intent.
- Add route regressions for stale checklist leakage after topic changes.
- Narrow generic capability routing so ordinary questions do not become Claude Code capability prompts.
- Compact route guidance so third-party models do not echo internal playbooks or section contracts.
```

- [ ] **Step 5: Run documentation search**

Run:

```powershell
Select-String -Path "README.md","README_CN.md","docs\*.md","CHANGELOG.md" -Pattern "hellowind777|npm install|npm version|publishConfig|hello2cc-local"
```

Expected: no matches that describe current install or current identity. Historical attribution may remain only if the line explicitly says this project started as a copied fork.

- [ ] **Step 6: Commit docs**

Run:

```powershell
git add README.md README_CN.md docs/ccstatusline.md CHANGELOG.md
git commit -m "docs: document 2cc as a local plugin"
```

Expected: commit succeeds.

---

### Task 7: Final validation and cleanup

**Files:**
- Modify only files needed to fix validation failures from the commands in this task.

- [ ] **Step 1: Run full validation**

Run:

```powershell
npm run check
```

Expected: PASS with `npm run validate` passing and all Node tests passing.

- [ ] **Step 2: Run local packaging inspection without enabling publishing**

Run:

```powershell
npm pack --dry-run
```

Expected: command completes and prints a tarball preview. The preview is only a local packaging inspection. `package.json` still contains `"private": true`, and documentation does not describe npm publishing.

- [ ] **Step 3: Check for accidental route internals in user-facing docs**

Run:

```powershell
Select-String -Path "README.md","README_CN.md","docs\*.md","output-styles\*.md" -Pattern "response_contract|renderer_contract|execution_playbook|ordered_steps|section_order|specialization_candidates"
```

Expected: matches only in `output-styles/2cc-native.md`, where those terms are named as fields that must not be echoed.

- [ ] **Step 4: Check git status**

Run:

```powershell
git status --short --branch
```

Expected: branch is ahead of origin with the implementation commits and no unstaged files.

- [ ] **Step 5: Commit validation-only fixes if any were needed**

If Step 1, Step 2, or Step 3 required code or docs corrections, run:

```powershell
git add .
git commit -m "chore: finish 2cc local validation"
```

Expected: commit succeeds only when there were validation corrections to stage. If there were no corrections, `git status --short` remains clean and no commit is created.
