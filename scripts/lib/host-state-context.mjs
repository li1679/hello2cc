import { compactState } from './host-state-shared.mjs';
import {
  hostSnapshot,
  promptHostStateSnapshot,
  protocolAdapters,
} from './host-state-snapshots.mjs';

export { compactState } from './host-state-shared.mjs';

export function buildSessionStartHostState(sessionContext = {}) {
  return compactState({
    '2cc_role': ['native-operator-shell', 'host-state', 'protocol-adapter', 'failure-debounce'],
    operator_profile: '2cc-local-claude-code-adapter',
    precedence: [
      'user_message',
      'claude_code_host',
      'CLAUDE.md',
      'AGENTS.md',
      'project_rules',
      '2cc',
    ],
    policy_summary: {
      specificity_ladder: [
        'loaded workflow / skill continuity',
        'surfaced skill / workflow',
        'known MCP resource',
        'loaded or surfaced deferred tool',
        'ToolSearch / DiscoverSkills',
        'broader Agent / Plan / team path',
      ],
      explicit_only: ['EnterWorktree'],
      host_guarded_inputs: ['Agent.team_name', 'Agent.isolation=worktree', 'SendMessage.summary'],
    },
    protocol_adapters: protocolAdapters(sessionContext),
    ...hostSnapshot(sessionContext, {
      includeStableWebSearchModes: true,
    }),
  });
}

export function buildPromptHostState(sessionContext = {}) {
  return promptHostStateSnapshot(sessionContext);
}

export function hasDynamicPromptHostState(sessionContext = {}) {
  const snapshot = promptHostStateSnapshot(sessionContext);

  return Boolean(compactState({
    host: compactState({
      delta_surfaces: snapshot?.host?.delta_surfaces,
      attachments: snapshot?.host?.attachments,
      surfaced_skills: snapshot?.host?.surfaced_skills,
      loaded_commands: snapshot?.host?.loaded_commands,
      workflows: snapshot?.host?.workflows,
      deferred_tools: snapshot?.host?.deferred_tools,
      mcp_resources: snapshot?.host?.mcp_resources,
      active_team: snapshot?.host?.active_team,
      continuity: snapshot?.host?.continuity,
    }),
    websearch: snapshot?.websearch,
    guards: snapshot?.guards,
  }));
}
