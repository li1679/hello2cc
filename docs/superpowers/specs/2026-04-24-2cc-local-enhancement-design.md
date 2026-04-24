# 2cc Local Enhancement Design

## Context

This repository is a copied fork of `hello2cc`. The original author is no longer updating it. The new target is a personal local Claude Code plugin named `2cc`, not an npm package and not a public distribution artifact.

The current implementation already has working hook coverage and a strong regression suite. `npm run check` passed on 2026-04-24 with 183 passing tests. The problem is not a broken baseline. The problem is that the plugin exposes too much internal routing structure to third-party models, and those models sometimes render that internal structure back to the user.

The user uses CCSwitch for the real third-party model mapping. `2cc` must not manage provider accounts, gateway credentials, or real model aliases. It should keep mapping responsibility at the CCSwitch layer and only align Claude Code-visible slots such as `opus`, `sonnet`, `haiku`, and `inherit`.

## Goals

`2cc` should make third-party models behave more like a clean Claude Code operator in Chinese conversations. The visible behavior should be short, result-first, and free of internal routing terms. The plugin should stop leaking plan/checklist templates into later turns when the topic changes.

The local fork should also be clearly branded as `2cc`. Package metadata, plugin metadata, marketplace metadata, documentation, output style names, validation checks, and user-facing install instructions should no longer present this as the original `hello2cc` project, except where attribution or migration history is useful.

## Non-goals

`2cc` will not publish to npm. It will not add a hosted service, model gateway, remote account management, or CCSwitch replacement. It will not silently swallow host failures to make behavior look successful. It will not add broad speculative features that are not tied to the two user-confirmed issues: third-party model behavior quality and stale checklist leakage.

## Primary diagnosis

The current route hook builds a large additional context block containing `response_contract`, `renderer_contract`, `execution_playbook`, `recovery_playbook`, `decision_tie_breakers`, `specialization_candidates`, `ordered_steps`, and `section_order`. This is meant as private routing guidance, but third-party models can treat it as a visible answer template.

A reproduced example shows that a later unrelated Chinese question can trigger a capability route snapshot. The injected context then asks the model to follow sections such as `direct_answer`, `visible_capabilities_or_surfaces`, and `gap_or_next_step`. That explains why a prior processing checklist or structured response shape can keep appearing after the user changes topic.

The capability probe signal is also too broad. Generic question-like prompts can become capability probes when host discovery surfaces are visible, even when the user is asking an everyday question rather than asking about Claude Code capabilities.

## Recommended architecture

The design is light shell, strong core.

The internal classifier, hook coverage, session state, model-slot normalization, and failure debounce stay. The route output becomes much smaller. Instead of sending a full operational playbook to the model on ordinary turns, the route hook should emit only a compact current-turn hint when the prompt truly needs routing help.

For ordinary chat, explanation, or unrelated topic shifts, route should suppress output entirely or emit only a short style reminder. For active team, active task board, active plan mode, or real fail-closed recovery, route may still emit continuity context. Even then, the context should describe the state, not prescribe visible sections or checklist format.

## Components

The metadata layer owns local fork identity. It updates `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, README files, changelog language, validation expectations, and output-style names from `hello2cc` to `2cc`. npm publishing fields and npm-oriented documentation are removed or marked irrelevant for local use.

The output style layer owns visible behavior. `output-styles/hello2cc-native.md` should become a `2cc` style with Chinese-first concise behavior. It should explicitly say that internal route hints, checklist names, JSON keys, section contracts, and playbook steps must not be echoed to the user. It should prefer short paragraphs over repeated task-list formatting unless the user asks for a list or a task board is actually active.

The route guidance layer owns current-turn injection. `scripts/lib/route-guidance.mjs`, `scripts/lib/route-decision-lines.mjs`, `scripts/lib/route-state-playbooks.mjs`, `scripts/lib/renderer-contracts.mjs`, and related tests should be adjusted so ordinary turns do not receive verbose `ordered_steps`, `section_order`, `specialization_candidates`, or internal renderer contracts. Strong continuity may keep a compact state summary.

The intent layer owns topic-change detection and capability routing. `scripts/lib/intent-profile-route-signals.mjs`, `scripts/lib/intent-profile-seed-signals.mjs`, `scripts/lib/prompt-envelope.mjs`, and related route tests should narrow `capabilityProbeShape` so generic question-like prompts are not treated as host capability questions unless they mention tools, agents, skills, MCP, hooks, plugins, permissions, Claude Code, or surfaced capability names.

The session-state layer owns stale continuity cleanup. When a new prompt has a clear unrelated topic and there is no active plan, active task board, active team, or unresolved failure guard, stale route signatures and weak workflow/checklist continuity should be cleared. Real host state must remain protected.

The test layer owns regression confidence. Existing tests should be preserved where the behavior is still desired. New tests should cover the confirmed bug: a checklist/planning-shaped turn followed by an unrelated Chinese question must not re-emit checklist or capability-route scaffolding. Another test should cover a genuine Claude Code capability question, which should still get a compact capability hint.

## Data flow

At session start, `2cc` may emit a compact identity and policy summary. On each prompt, the route hook extracts the current prompt, analyzes intent, checks real continuity, and decides whether extra context is necessary.

If the prompt is ordinary or unrelated to current continuity, the hook suppresses output and clears stale weak route memory. If the prompt needs help selecting a Claude Code capability, the hook emits a compact current-turn hint. If the prompt is inside real plan/team/task continuity, the hook emits compact state that keeps the model on the correct tool path without forcing a visible checklist.

PreToolUse and PostToolUse hooks continue to normalize model slots, team names, task updates, SendMessage summaries, and failure memory. They should expose errors clearly rather than hiding root causes.

## Error handling

Critical hook scripts should fail clearly when input JSON is invalid or an unknown command is requested. Existing fail-closed behavior for repeated failed preconditions remains. No new silent fallback should convert failures into fake success.

When route context is suppressed due to uncertainty, the model should rely on user text and Claude Code host instructions. Suppression is not a fallback success path; it is the safe default when the plugin has no real extra context to add.

## Testing

The implementation should keep `npm run validate`, `npm test`, and `npm run check` passing. Focused tests should be added before behavior changes. The new tests should assert that internal keys such as `ordered_steps`, `section_order`, `execution_playbook`, and `specialization_candidates` are not present in ordinary route output.

Tests should also assert that genuine host capability questions still receive compact guidance and that active plan/team/task continuity still preserves the necessary state.

## Rollout

This is a local fork, so the rollout is local-first. The working directory remains a normal git repository. Installation documentation should describe local marketplace or `claude --plugin-dir` usage. Version bumps should serve Claude Code plugin cache invalidation, not npm publishing.

The first implementation slice should fix visible behavior before broad cleanup. The second slice should rename and remove npm publishing assumptions. The third slice should refactor oversized route/status modules only where it directly supports the behavior change or validation clarity.

## Approval status

The user approved the direction on 2026-04-24. The approved direction is to build `2cc` as a personal local plugin, keep CCSwitch as the model mapping layer, improve third-party model behavior, and stop stale checklist leakage after topic changes.
