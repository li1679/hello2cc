export const FORCED_OUTPUT_STYLE_NAME = '2cc:2cc Native';

export function envValue(name) {
  return String(process.env[name] || '').trim();
}

export function pluginOption(key) {
  return envValue(`CLAUDE_PLUGIN_OPTION_${key.toUpperCase()}`);
}

export function configuredPolicy() {
  return pluginOption('routing_policy') || 'native-inject';
}

export function configuredMirrorSessionModel() {
  return pluginOption('mirror_session_model') !== 'false';
}

export function shouldEmitAdditionalContext() {
  return true;
}

function mirroredSessionModel(sessionContext) {
  if (!configuredMirrorSessionModel()) return '';

  return String(
    sessionContext?.mainModel ||
    sessionContext?.model ||
    '',
  ).trim();
}

export function configuredModels(sessionContext = {}) {
  const sessionModel = mirroredSessionModel(sessionContext);
  const defaultAgentModelOption = pluginOption('default_agent_model');
  const primaryModelOption = pluginOption('primary_model');
  const subagentModelOption = pluginOption('subagent_model');
  const guideModelOption = pluginOption('guide_model');
  const exploreModelOption = pluginOption('explore_model');
  const planModelOption = pluginOption('plan_model');
  const generalModelOption = pluginOption('general_model');
  const teamModelOption = pluginOption('team_model');
  const envDefaultAgentModel = envValue('CLAUDE_CODE_SUBAGENT_MODEL');
  const defaultAgentModel = defaultAgentModelOption || envDefaultAgentModel || '';

  const primaryModel = primaryModelOption || sessionModel || '';
  const subagentModel = subagentModelOption || defaultAgentModel || sessionModel || primaryModel || '';
  const guideModel = guideModelOption || defaultAgentModel || sessionModel || primaryModel || '';
  const exploreModel = exploreModelOption || defaultAgentModel || sessionModel || subagentModel || primaryModel || '';
  const planModel = planModelOption || defaultAgentModel || primaryModel || sessionModel || subagentModel || '';
  const generalModel = generalModelOption || subagentModel || defaultAgentModel || primaryModel || sessionModel || '';
  const teamModel = teamModelOption || subagentModel || defaultAgentModel || generalModel || primaryModel || sessionModel || '';

  return {
    routingPolicy: configuredPolicy(),
    mirrorSessionModel: configuredMirrorSessionModel(),
    sessionModel,
    defaultAgentModel,
    primaryModel,
    subagentModel,
    guideModel,
    exploreModel,
    planModel,
    generalModel,
    teamModel,
    explicitDefaultAgentModel: Boolean(defaultAgentModelOption || envDefaultAgentModel),
    explicitPrimaryModel: Boolean(primaryModelOption),
    explicitSubagentModel: Boolean(subagentModelOption),
    explicitGuideModel: Boolean(guideModelOption),
    explicitExploreModel: Boolean(exploreModelOption),
    explicitPlanModel: Boolean(planModelOption),
    explicitGeneralModel: Boolean(generalModelOption),
    explicitTeamModel: Boolean(teamModelOption),
  };
}

