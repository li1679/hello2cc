import {
  normalizeDescription,
  normalizeName,
} from './transcript-context-utils.mjs';

function extractWorkflowEntries(record) {
  if (
    record?.type !== 'system' ||
    String(record?.subtype || '').trim() !== 'task_started' ||
    String(record?.task_type || '').trim() !== 'local_workflow'
  ) {
    return [];
  }

  const name = normalizeName(record?.workflow_name);
  if (!name) return [];

  return [{
    name,
    ...(normalizeDescription(record?.description) ? { description: normalizeDescription(record.description) } : {}),
    ...(normalizeDescription(record?.prompt) ? { prompt: normalizeDescription(record.prompt) } : {}),
  }];
}

export { extractWorkflowEntries };
