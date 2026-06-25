import { createHmac } from 'node:crypto';
import { DOCUMENTATION_SCHEMA_VERSION } from './constants';
import type { DocumentImportNormalizedPage } from './types';
import { isRecord } from './assertions';

export function buildPreviewToken(
  projectId: string,
  normalizedPages: DocumentImportNormalizedPage[],
  previewTokenSecret: string,
) {
  const digest = createHmac('sha256', previewTokenSecret)
    .update(projectId)
    .update('\n')
    .update(DOCUMENTATION_SCHEMA_VERSION)
    .update('\n')
    .update(stableStringify(normalizedPages))
    .digest('hex');
  return `doc-import-preview-v1.${digest}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
