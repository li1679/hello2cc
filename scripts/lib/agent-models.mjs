function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function canonicalAgentType(input) {
  const raw = String(input?.subagent_type || input?.agent_type || input?.name || '').trim();
  if (!raw) return '';

  const slug = normalizeSlug(raw);

  if (slug === 'explore') return 'Explore';
  if (slug === 'plan') return 'Plan';

  if ([
    'general-purpose',
    'general-purpose-agent',
    'generalpurpose',
    'general',
  ].includes(slug)) {
    return 'general-purpose';
  }

  if ([
    'claude-code-guide',
    'claude-code-guide-agent',
    'claude-guide',
    'guide',
    'claudecodeguide',
  ].includes(slug)) {
    return 'claude-code-guide';
  }

  return raw;
}

export function preferredModelForAgent(input, config) {
  if (!input || config.routingPolicy === 'prompt-only' || input.model) {
    return '';
  }

  const agentType = canonicalAgentType(input);
  const teamName = String(input?.team_name || '').trim();
  const hasTeamName = Boolean(teamName);

  if (agentType === 'claude-code-guide') {
    return config.guideModel || config.sessionModel || config.primaryModel || '';
  }

  if (agentType === 'Explore') {
    return config.exploreModel || config.sessionModel || config.subagentModel || config.primaryModel || '';
  }

  if (agentType === 'Plan' && config.explicitPlanModel) {
    return config.planModel || '';
  }

  if (agentType === 'general-purpose' && hasTeamName) {
    if (!config.explicitTeamModel && !config.explicitSubagentModel) {
      return '';
    }

    return config.teamModel || config.subagentModel || config.generalModel || config.primaryModel || '';
  }

  if (agentType === 'general-purpose') {
    if (!config.explicitGeneralModel && !config.explicitSubagentModel) {
      return '';
    }

    return config.generalModel || config.subagentModel || config.primaryModel || '';
  }

  if (hasTeamName) {
    if (!config.explicitTeamModel && !config.explicitSubagentModel) {
      return '';
    }

    return config.teamModel || config.subagentModel || config.generalModel || config.primaryModel || '';
  }

  if (!agentType) {
    return config.explicitSubagentModel ? config.subagentModel || '' : '';
  }

  if (config.explicitSubagentModel) {
    return config.subagentModel || '';
  }

  return '';
}
