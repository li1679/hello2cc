import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

function trimmed(value) {
  return String(value || '').trim();
}

function envTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(trimmed(value).toLowerCase());
}

function claudeConfigHomeDir() {
  const configured = trimmed(process.env.CLAUDE_CONFIG_DIR);
  if (configured) return configured;
  return join(homedir(), '.claude');
}

function candidateSettingsPaths(cwd) {
  const seen = new Set();
  const paths = [];

  const push = (value) => {
    const normalized = trimmed(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    paths.push(normalized);
  };

  const configHomeDir = claudeConfigHomeDir();
  push(join(configHomeDir, 'settings.json'));
  if (envTruthy(process.env.CLAUDE_CODE_USE_COWORK_PLUGINS)) {
    push(join(configHomeDir, 'cowork_settings.json'));
  }

  const startDir = trimmed(cwd);
  if (!startDir) return paths;

  let dir = resolve(startDir);
  while (true) {
    push(join(dir, '.claude', 'settings.local.json'));
    push(join(dir, '.claude', 'settings.json'));

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return paths;
}

function parseJsonFile(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function hasConfiguredWorktreeCreateHook(settings) {
  const hooks = settings?.hooks;
  const entries = hooks?.WorktreeCreate;
  return Array.isArray(entries) && entries.some(Boolean);
}

function cwdLooksLikeGitRepo(cwd) {
  const startDir = trimmed(cwd);
  if (!startDir) return false;

  let dir = resolve(startDir);
  while (true) {
    if (existsSync(join(dir, '.git'))) return true;

    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

function hasWorktreeHookConfiguration(cwd) {
  return candidateSettingsPaths(cwd)
    .some((path) => hasConfiguredWorktreeCreateHook(parseJsonFile(path)));
}

/**
 * Returns true when the current cwd now appears eligible for worktree usage,
 * either because it lives inside a git repository or because WorktreeCreate
 * hooks are configured in Claude settings reachable from this cwd.
 */
export function worktreePreconditionsAppearSatisfied(cwd) {
  return cwdLooksLikeGitRepo(cwd) || hasWorktreeHookConfiguration(cwd);
}
