import { CORE_POLICY_DEFINITIONS } from './capability-policy-core-definitions.mjs';
import { EXECUTION_POLICY_DEFINITIONS } from './capability-policy-execution-definitions.mjs';
import {
  baseDecisionLadder,
  requestOutputShape,
  trackList,
} from './capability-policy-helpers.mjs';

const POLICY_DEFINITIONS = [
  ...CORE_POLICY_DEFINITIONS,
  ...EXECUTION_POLICY_DEFINITIONS,
];

function policySelected(policy, options = {}) {
  const includeIds = Array.isArray(options?.includeIds) ? new Set(options.includeIds) : null;
  const excludeIds = Array.isArray(options?.excludeIds) ? new Set(options.excludeIds) : null;

  if (includeIds && !includeIds.has(policy.id)) {
    return false;
  }

  if (excludeIds && excludeIds.has(policy.id)) {
    return false;
  }

  return true;
}

function activePolicies(sessionContext = {}, options = {}) {
  return POLICY_DEFINITIONS.filter((policy) => (
    policy.available(sessionContext) && policySelected(policy, options)
  ));
}

function selectedPolicies(sessionContext = {}, requestProfile = {}, options = {}) {
  return activePolicies(sessionContext, options).filter((policy) => {
    const lines = policy.routeLines(requestProfile, sessionContext);
    return lines.length > 0;
  });
}

export function buildSessionCapabilityPolicyLines(sessionContext = {}, options = {}) {
  const lines = [];

  for (const policy of activePolicies(sessionContext, options)) {
    const policyLines = policy.sessionLines(sessionContext);
    if (!policyLines.length) continue;
    lines.push(`## ${policy.title}`);
    lines.push(...policyLines);
    lines.push('');
  }

  return lines.length ? lines.slice(0, -1) : [];
}

export function buildRouteCapabilityPolicyLines(requestProfile = {}, sessionContext = {}, options = {}) {
  const lines = [];

  for (const policy of selectedPolicies(sessionContext, requestProfile, options)) {
    const policyLines = policy.routeLines(requestProfile, sessionContext);
    if (!policyLines.length) continue;
    lines.push(`## ${policy.title}`);
    lines.push(...policyLines);
    lines.push('');
  }

  return lines.length ? lines.slice(0, -1) : [];
}

export function buildCapabilityPolicySnapshot(sessionContext = {}, requestProfile = {}, options = {}) {
  const policies = (options.scope === 'session'
    ? activePolicies(sessionContext, options)
    : selectedPolicies(sessionContext, requestProfile, options))
    .map((policy) => policy.snapshot(sessionContext, requestProfile))
    .filter(Boolean);

  return {
    engine: 'host_defined_capability_policies',
    selection_mode: 'model_chooses_within_host_bounds',
    specificity_ladder: baseDecisionLadder(),
    request_tracks: trackList(requestProfile),
    requested_output_shape: requestOutputShape(requestProfile),
    policies,
  };
}
