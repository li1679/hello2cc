import { compactState } from './host-state-shared.mjs';
import {
  hostSnapshot,
  promptHostStateSnapshot,
  protocolAdapters,
} from './host-state-snapshots.mjs';

export { compactState } from './host-state-shared.mjs';

export function buildSessionStartHostState(sessionContext = {}) {
  return compactState({
    hello2cc_role: ['native-operator-shell', 'host-state', 'protocol-adapter', 'failure-debounce'],
    operator_profile: 'opus-compatible-claude-code',
    precedence: [
      'user_message',
      'claude_code_host',
      'CLAUDE.md',
      'AGENTS.md',
      'project_rules',
      'hello2cc',
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
