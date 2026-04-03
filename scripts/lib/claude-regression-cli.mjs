import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fail } from './claude-regression-shared.mjs';

function quoteForPowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function spawnWindowsCommand(command, extraEnv) {
  return spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-Command', command], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv,
    },
    maxBuffer: 10 * 1024 * 1024,
    shell: false,
  });
}

function spawnClaudeFromPath(args, extraEnv = {}) {
  if (process.platform === 'win32') {
    const command = `claude ${args.map(quoteForPowerShell).join(' ')}`;
    return spawnWindowsCommand(command, extraEnv);
  }

  return spawnSync('claude', args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv,
    },
    maxBuffer: 10 * 1024 * 1024,
    shell: false,
  });
}

/**
 * Spawns the Claude CLI while preserving Windows PowerShell launcher compatibility.
 */
export function spawnClaude(args, extraEnv = {}) {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || '';
    const claudePs1 = appData ? join(appData, 'npm', 'claude.ps1') : '';
    if (claudePs1 && existsSync(claudePs1)) {
      const command = `& ${quoteForPowerShell(claudePs1)} ${args.map(quoteForPowerShell).join(' ')}`;
      return spawnWindowsCommand(command, extraEnv);
    }
  }

  return spawnClaudeFromPath(args, extraEnv);
}

function detectPluginCommand() {
  const singular = spawnClaude(['plugin', '--help']);
  if (!singular.error && singular.status === 0) {
    return 'plugin';
  }

  const plural = spawnClaude(['plugins', '--help']);
  if (!plural.error && plural.status === 0) {
    return 'plugins';
  }

  fail('claude CLI is required for real-session regression');
}

let cachedPluginCommand = '';

/**
 * Resolves the available Claude CLI plugin command once and caches it for reuse.
 */
export function ensureClaudeCli() {
  if (!cachedPluginCommand) {
    cachedPluginCommand = detectPluginCommand();
  }

  return cachedPluginCommand;
}
