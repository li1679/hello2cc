import { describeSubagentSpecialization } from './specialization-selection.mjs';
import {
  finalizeCandidates,
  hasItems,
  upsertCandidate,
} from './specialization-candidate-shared.mjs';

const SEMANTIC_SUBAGENT_FAMILY_IDS = [
  'compare',
  'planning',
  'capability',
  'research',
  'explanation',
  'review',
  'verification',
  'release',
];

function recommendedShapeForCandidate(id = '') {
  const candidateId = String(id || '').trim().toLowerCase();

  if (candidateId === 'compare') return 'one_sentence_judgment_then_markdown_table_then_recommendation';
  if (candidateId === 'planning') return 'ordered_plan_with_validation_and_risks';
  if (candidateId === 'capability') return 'direct_answer_then_visible_capabilities_then_gap_or_next_step';
  if (candidateId === 'handoff') return 'handoff_status_then_compact_table_then_reassignment_or_follow_up';
  if (candidateId === 'team_status') return 'one_line_plus_compact_markdown_table';
  if (candidateId === 'review_verification') return 'findings_first_then_verification_evidence_then_risk_call';
  if (candidateId === 'review') return 'findings_first_then_open_questions_then_change_summary';
  if (candidateId === 'verification') return 'verification_status_then_evidence_then_gaps';
  if (candidateId === 'research') return 'direct_findings_with_paths_and_unknowns';
  if (candidateId === 'explanation') return 'direct_explanation_then_key_points_and_references';
  if (candidateId === 'release') return 'release_status_then_checklist_then_notes';
  return '';
}

function genericSemanticCandidate(id = '') {
  const shape = recommendedShapeForCandidate(id);
  return shape ? { recommended_shape: shape } : {};
}

function seedSemanticSubagentFamilies(entries) {
  for (const id of SEMANTIC_SUBAGENT_FAMILY_IDS) {
    upsertCandidate(entries, id, genericSemanticCandidate(id));
  }
}

function hasSemanticTaskFrame(taskProfile = {}) {
  return Boolean(
    taskProfile?.compare
    || taskProfile?.plan
    || taskProfile?.capabilityQuery
    || taskProfile?.capabilityProbeShape
    || taskProfile?.release
    || taskProfile?.review
    || taskProfile?.verify
    || taskProfile?.codeResearch
    || taskProfile?.research
    || taskProfile?.explain
    || taskProfile?.claudeGuide
    || taskProfile?.handoff
    || taskProfile?.teamStatus
    || taskProfile?.workflowContinuation
    || taskProfile?.questionIntent
    || taskProfile?.promptEnvelope?.structuralComplexity
  );
}

export function buildSubagentSpecializationCandidates(mode, taskProfile = {}, details = {}) {
  const selection = describeSubagentSpecialization(mode, taskProfile, details);
  const selected = selection.specialization;
  const entries = new Map();
  if (hasSemanticTaskFrame(taskProfile)) {
    seedSemanticSubagentFamilies(entries);
  }

  if (taskProfile?.compare) {
    upsertCandidate(entries, 'compare', {
      reasons: ['parent task is a comparison or choice'],
    });
  }

  if (taskProfile?.plan || mode === 'plan') {
    upsertCandidate(entries, 'planning', {
      reasons: [mode === 'plan' ? 'subagent mode is Plan' : 'parent task requests planning'],
    });
  }

  if (taskProfile?.capabilityQuery || taskProfile?.capabilityProbeShape) {
    upsertCandidate(entries, 'capability', {
      reasons: [
        taskProfile?.capabilityProbeShape ? 'parent task asks what host surfaces are available' : '',
        taskProfile?.capabilityQuery && !taskProfile?.capabilityProbeShape ? 'parent task asks about host capabilities' : '',
      ],
    });
  }

  if (taskProfile?.release) {
    upsertCandidate(entries, 'release', {
      reasons: ['parent task is a release flow'],
    });
  }

  if (hasItems(details?.blockedTaskRecords) || taskProfile?.handoff) {
    upsertCandidate(entries, 'handoff', {
      reasons: [
        hasItems(details?.blockedTaskRecords) ? 'assigned work is blocked' : '',
        taskProfile?.handoff ? 'parent task mentions handoff' : '',
      ],
      recommended_shape: recommendedShapeForCandidate('handoff'),
    });
  }

  if (details?.hasTeamIdentity || hasItems(details?.teamActionState?.teamActionItems)) {
    upsertCandidate(entries, 'team_status', {
      reasons: ['subagent is operating inside team continuity'],
      recommended_shape: recommendedShapeForCandidate('team_status'),
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
