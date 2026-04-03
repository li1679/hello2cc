#!/usr/bin/env node
import { validateHooks } from './lib/validate-plugin-hooks.mjs';
import {
  validateJsonFiles,
  validatePluginManifest,
} from './lib/validate-plugin-manifest.mjs';
import {
  validateAgents,
  validateLifecycleScripts,
  validateNativeFirstRouting,
  validateNoEmbeddedSkills,
  validateNoLegacyCompat,
  validateOutputStyles,
} from './lib/validate-plugin-surface.mjs';
import { createValidationContext } from './lib/validate-plugin-shared.mjs';

const root = process.argv[2] || process.cwd();
const context = createValidationContext(root);

validateJsonFiles(context);
validatePluginManifest(context);
validateHooks(context);
validateAgents(context);
validateNoEmbeddedSkills(context);
validateNoLegacyCompat(context);
validateOutputStyles(context);
validateNativeFirstRouting(context);
validateLifecycleScripts(context);

if (process.exitCode) {
  process.exit(process.exitCode);
}
