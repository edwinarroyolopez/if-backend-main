import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import type { HydratedModel } from 'src/common/types/mongoose-model.type';
import { ProjectsService } from 'src/modules/projects/projects.service';
import {
  ResourceReference,
  ResourceScopeContext,
} from 'src/platform/access-control/resource-scope.types';
import {
  buildMediaBatchScopeContext,
  buildSampleScopeContext,
} from './image-ops.resource-scope';
import { MediaBatchDocument } from './media-batch.schema';
import { SampleDocument } from './sample.schema';

export async function resolveImageOpsResource(
  deps: {
    mediaBatchModel: HydratedModel<MediaBatchDocument>;
    sampleModel: HydratedModel<SampleDocument>;
    projectsService: ProjectsService;
  },
  reference: ResourceReference,
): Promise<ResourceScopeContext> {
  if (reference.resourceType === 'SAMPLE') {
    const sample = await deps.sampleModel.findById(reference.resourceId);
    if (!sample) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Sample was not found',
      );
    }
    const project = await deps.projectsService.findById(sample.projectId);
    return buildSampleScopeContext(sample, project?.accessRoleIds ?? []);
  }

  const mediaBatch = await deps.mediaBatchModel.findById(reference.resourceId);
  if (!mediaBatch) {
    throw new AppException(
      404,
      REASON_CODES.RESOURCE_NOT_FOUND,
      'Media batch was not found',
    );
  }
  const project = await deps.projectsService.findById(mediaBatch.projectId);
  return buildMediaBatchScopeContext(mediaBatch, project?.accessRoleIds ?? []);
}
