import { ResourceScopeContext } from 'src/platform/access-control/resource-scope.types';
import { MediaBatchDocument } from './media-batch.schema';
import { SampleDocument } from './sample.schema';

export function buildSampleScopeContext(
  sample: SampleDocument,
  projectAccessRoleIds: string[],
): ResourceScopeContext {
  return {
    resourceType: 'SAMPLE',
    resourceId: sample.id,
    organizationId: sample.organizationId,
    moduleKey: 'image',
    projectId: sample.projectId,
    projectAccessRoleIds,
    candidateScopes: [
      { type: 'SAMPLE', id: sample.id },
      { type: 'MEDIA_BATCH', id: sample.mediaBatchId },
      { type: 'PROJECT', id: sample.projectId },
      { type: 'MODULE', id: 'image' },
      { type: 'ORGANIZATION', id: sample.organizationId },
    ],
  };
}

export function buildMediaBatchScopeContext(
  mediaBatch: MediaBatchDocument,
  projectAccessRoleIds: string[],
): ResourceScopeContext {
  return {
    resourceType: 'MEDIA_BATCH',
    resourceId: mediaBatch.id,
    organizationId: mediaBatch.organizationId,
    moduleKey: 'image',
    projectId: mediaBatch.projectId,
    projectAccessRoleIds,
    candidateScopes: [
      { type: 'MEDIA_BATCH', id: mediaBatch.id },
      { type: 'PROJECT', id: mediaBatch.projectId },
      { type: 'MODULE', id: 'image' },
      { type: 'ORGANIZATION', id: mediaBatch.organizationId },
    ],
  };
}
