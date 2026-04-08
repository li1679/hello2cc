import { EXECUTION_SURFACE_POLICY_DEFINITIONS } from './capability-policy-execution-surfaces.mjs';
import { KNOWLEDGE_SURFACE_POLICY_DEFINITIONS } from './capability-policy-knowledge-surfaces.mjs';

export const SURFACE_POLICY_DEFINITIONS = [
  ...KNOWLEDGE_SURFACE_POLICY_DEFINITIONS,
  ...EXECUTION_SURFACE_POLICY_DEFINITIONS,
];
