#!/usr/bin/env node
import { runOrchestratorCommand } from './lib/orchestrator-commands.mjs';

await runOrchestratorCommand(process.argv[2] || '');
