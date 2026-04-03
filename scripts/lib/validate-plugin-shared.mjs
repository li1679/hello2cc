import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

function normalizeRelativePath(root, path) {
  const normalized = relative(root, path);
  return normalized || path;
}

/**
 * Creates shared file-system helpers and reporting callbacks for plugin validation.
 */
export function createValidationContext(root) {
  return {
    root,
    ok(message) {
      console.log(`OK ${message}`);
    },
    fail(message) {
      console.error(`FAIL ${message}`);
      process.exitCode = 1;
    },
    resolvePath(relativePath) {
      return join(root, relativePath);
    },
    relativePath(path) {
      return normalizeRelativePath(root, path);
    },
    exists(relativePath) {
      return existsSync(join(root, relativePath));
    },
    readJson(relativePath) {
      const absolutePath = join(root, relativePath);

      try {
        return JSON.parse(readFileSync(absolutePath, 'utf8'));
      } catch (error) {
        this.fail(`${relativePath}: ${error.message}`);
        return null;
      }
    },
    readText(relativePath) {
      return readFileSync(join(root, relativePath), 'utf8');
    },
  };
}

/**
 * Extracts YAML frontmatter from a markdown file when present.
 */
export function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return null;

  const end = text.indexOf('\n---\n', 4);
  if (end === -1) return null;

  return text.slice(4, end);
}
