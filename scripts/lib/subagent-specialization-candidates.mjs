import { describeSubagentSpecialization } from './specialization-selection.mjs';
import {
  finalizeCandidates,
  hasItems,
  upsertCandidate,
} from './specialization-candidate-shared.mjs';

export function buildSubagentSpecializationCandidates(mode, taskProfile = {}, details = {}) {
  const selection = describeSubagentSpecialization(mode, taskProfile, details);
  const selected = selection.specialization;
  const entries = new Map();

  if (taskProfile?.compare) {
    upsertCandidate(entries, 'compare', {
      reasons: ['parent task is a comparison or choice'],
      use_when: 'a direct judgment plus compact table is the right response shape',
    });
  }

  if (taskProfile?.plan || mode === 'plan') {
    upsertCandidate(entries, 'planning', {
      reasons: [mode === 'plan' ? 'subagent mode is Plan' : 'parent task requests planning'],
      use_when: 'the subagent should gather constraints and produce an executable plan',
    });
  }

  if (taskProfile?.capabilityQuery || taskProfile?.capabilityProbeShape) {
    upsertCandidate(entries, 'capability', {
      reasons: [
        taskProfile?.capabilityProbeShape ? 'parent task asks what host surfaces are available' : '',
        taskProfile?.capabilityQuery && !taskProfile?.capabilityProbeShape ? 'parent task asks about host capabilities' : '',
      ],
      use_when: 'the subagent should answer from visible host surfaces and only then name discovery gaps',
    });
  }

  if (taskProfile?.release) {
    upsertCandidate(entries, 'release', {
      reasons: ['parent task is a release flow'],
      use_when: 'the subagent should report release status and checklist first',
    });
  }

  if (hasItems(details?.blockedTaskRecords) || taskProfile?.handoff) {
    upsertCandidate(entries, 'handoff', {
      reasons: [
        hasItems(details?.blockedTaskRecords) ? 'assigned work is blocked' : '',
        taskProfile?.handoff ? 'parent task mentions handoff' : '',
      ],
      use_when: 'the subagent should continue blocker or handoff continuity before claiming completion',
    });
  }

  if (details?.hasTeamIdentity || hasItems(details?.teamActionState?.teamActionItems)) {
    upsertCandidate(entries, 'team_status', {
      reasons: ['subagent is operating inside team continuity'],
      use_when: 'the subagent should summarize task-board state and next action rather than free-form chat',
    });
  }

  if (taskProfile?.review && taskProfile?.verify) {
    upsertCandidate(entries, 'review_verification', {
      reasons: ['parent task combines review and verification'],
    });
  } else if (taskProfile?.review) {
    upsertCandidate(entries, 'review', {
      reasons: [taskProfile?.promptEnvelope?.reviewArtifact ? 'review-shaped artifact is present in parent task' : 'parent task is a review'],
    });
  } else if (taskProfile?.verify) {
    upsertCandidate(entries, 'verification', {
      reasons: ['parent task asks for verification'],
    });
  }

  if (taskProfile?.codeResearch || taskProfile?.research || mode === 'explore') {
    upsertCandidate(entries, 'research', {
      reasons: [mode === 'explore'
        ? 'subagent mode is Explore'
        : taskProfile?.promptEnvelope?.broadArtifactQuestion
          ? 'broad artifact question suggests repo investigation'
          : 'parent task needs research'],
    });
  }

  if (taskProfile?.explain || (taskProfile?.claudeGuide && selected === 'explanation')) {
    upsertCandidate(entries, 'explanation', {
      reasons: [taskProfile?.promptEnvelope?.targetedArtifactQuestion
        ? 'targeted artifact question suggests direct explanation'
        : taskProfile?.claudeGuide
          ? 'parent task is about Claude Code guide behavior or surfaces'
          : 'parent task asks for explanation'],
    });
  }

  upsertCandidate(entries, selected, {
    selected: true,
    selection_basis: selection.selection_basis,
    selection_strength: selection.selection_strength,
  });
  return finalizeCandidates(entries, selected);
}
