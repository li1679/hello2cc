#!/usr/bin/env node
import { runRealRegression } from './lib/claude-regression-runner.mjs';

try {
  runRealRegression();
} catch (error) {
  console.error(`FAIL ${error.message}`);
  process.exit(1);
}
