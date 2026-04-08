import { FORCED_OUTPUT_STYLE_NAME } from './config.mjs';
import { compactState } from './host-state-context.mjs';
import { requiredSectionsForResponseShape } from './route-specializations.mjs';

function trimmed(value) {
  return String(value || '').trim();
}

function uniqueStrings(values = [], maxItems = 12) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => trimmed(value))
      .filter(Boolean),
  )].slice(0, maxItems);
}

function resolveStyle(options = {}) {
  const attached = trimmed(options.attachedOutputStyle);
  if (attached) {
    return {
      name: attached,
      source: 'attachment',
    };
  }

  const session = trimmed(options.outputStyle);
  if (session) {
    return {
      name: session,
      source: 'session',
    };
  }

  const explicit = trimmed(options.styleName);
  if (explicit) {
    return {
      name: explicit,
      source: 'explicit',
    };
  }

  return {
    name: FORCED_OUTPUT_STYLE_NAME,
    source: 'plugin_default',
  };
}

function openingForSections(sections = [], preferredShape = '') {
  const first = trimmed(sections[0]);

  if (first === 'judgment' || first === 'one_line_judgment') {
    return 'judgment_first';
  }

  if (first === 'findings') {
    return 'findings_first';
  }

  if (first === 'goal') {
    return 'goal_first';
  }

  if (first === 'direct_answer' || first === 'answer') {
    return 'direct_answer_first';
  }

  if (
    first === 'status'
    || first === 'current_status_or_answer'
    || first === 'approval_status'
    || first === 'handoff_status'
    || first === 'team_status'
    || first === 'release_status'
    || first === 'release_follow_up_status'
    || first === 'verification_status'
    || first === 'blocker_status'
    || first.endsWith('_status')
  ) {
    return 'status_first';
  }

  return preferredShape.includes('table')
    ? 'judgment_first'
    : 'direct_answer_first';
}

function avoidList(opening = '', preferredShape = '', hasCompactTable = false) {
  const items = [
    'restyling_above_higher_priority_rules',
    'long_preamble_before_opening',
  ];

  if (hasCompactTable) {
    items.push('ascii_tables_when_markdown_works');
  }

  if (opening === 'judgment_first') {
    items.push('recommendation_before_judgment');
  }

  if (opening === 'findings_first') {
    items.push('summary_before_findings');
  }

  if (opening === 'direct_answer_first') {
    items.push('background_before_direct_answer');
  }

  if (opening === 'status_first') {
    items.push('notes_before_status');
  }

  if (preferredShape === 'current_info_status_then_sources_then_uncertainty') {
    items.push('stale_memory_presented_as_live_result');
  }

  return uniqueStrings(items, 10);
}

export function buildRendererContract(responseContract = {}, options = {}) {
  const preferredShape = trimmed(responseContract?.preferred_shape);
  const requiredSections = uniqueStrings(
    Array.isArray(responseContract?.required_sections) && responseContract.required_sections.length > 0
      ? responseContract.required_sections
      : requiredSectionsForResponseShape(preferredShape),
    8,
  );
  const tableColumns = uniqueStrings(responseContract?.preferred_table_columns, 8);
  const hasCompactTable = requiredSections.includes('compact_table')
    || tableColumns.length > 0
    || preferredShape.includes('markdown_table');
  const style = resolveStyle(options);
  const opening = openingForSections(requiredSections, preferredShape);

  return compactState({
    style_name: style.name,
    style_source: style.source,
    opening,
    section_order: requiredSections,
    table_mode: hasCompactTable ? 'compact_markdown' : 'markdown_when_helpful',
    table_columns: tableColumns.length > 0 ? tableColumns : undefined,
    compact: responseContract?.prioritize_summary_first !== false,
    prefer_markdown: true,
    ascii_only_when_needed: true,
    preserve_higher_priority_format: true,
    avoid: avoidList(opening, preferredShape, hasCompactTable),
  });
}
