#!/usr/bin/env node
import { emptySuppress, readStdinJson } from './lib/hook-io.mjs';
import { rememberTeammateIdle } from './lib/session-state-preconditions.mjs';

const payload = readStdinJson('teammate-idle.mjs');
rememberTeammateIdle(payload);
emptySuppress();
