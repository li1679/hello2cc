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

test('pre-send-message injects a summary for plain-text messages', () => {
  const env = isolatedEnv();
  const output = run('pre-send-message', {
    session_id: 'send-message-summary',
    tool_name: 'SendMessage',
    tool_input: {
      to: 'agent-a1b',
      message: 'Fix the null pointer in src/auth/validate.ts:42 and rerun the focused tests.',
    },
  }, env);

  assert.match(output.hookSpecificOutput.updatedInput.summary, /Fix the null pointer/i);
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /SendMessage\.summary/);
});

test('pre-send-message preserves existing summaries and structured messages', () => {
  const env = isolatedEnv();

  const withSummary = run('pre-send-message', {
    session_id: 'send-message-summary-existing',
    tool_name: 'SendMessage',
    tool_input: {
      to: 'agent-a1b',
      summary: 'fix auth bug',
      message: 'Fix the null pointer in src/auth/validate.ts:42.',
    },
  }, env);
  assert.deepEqual(withSummary, { suppressOutput: true });

  const structured = run('pre-send-message', {
    session_id: 'send-message-structured',
    tool_name: 'SendMessage',
    tool_input: {
      to: 'team-lead',
      message: {
        type: 'shutdown_request',
      },
    },
  }, env);
  assert.deepEqual(structured, { suppressOutput: true });
});
