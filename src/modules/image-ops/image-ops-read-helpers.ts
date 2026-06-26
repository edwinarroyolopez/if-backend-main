import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import type { HydratedModel } from 'src/common/types/mongoose-model.type';
import { ProjectsService } from 'src/modules/projects/projects.service';
import { MediaBatchDocument } from './media-batch.schema';

export async function ensureMissionCompletionBatch(
  mediaBatchModel: HydratedModel<MediaBatchDocument>,
  event: {
    organizationId: string;
    projectId: string;
    missionId: string;
    completedBy: string;
  },
) {
  await mediaBatchModel.updateOne(
    { missionId: event.missionId },
    {
      $setOnInsert: {
        organizationId: event.organizationId,
        projectId: event.projectId,
        missionId: event.missionId,
        key: `batch-${event.missionId}`,
        status: 'PENDING_INGEST',
        createdBy: event.completedBy,
      },
    },
    { upsert: true },
  );
}

export async function listReadableMediaBatches(
  mediaBatchModel: HydratedModel<MediaBatchDocument>,
  projectsService: ProjectsService,
  principal: AuthenticatedPrincipal,
) {
  const organizationId = principal.activeOrganizationId;
  if (!organizationId) {
    return [];
  }

  const accessibleProjectIds = await projectsService.listAccessibleProjectIds(
    principal,
    'image',
    'image.media_batch.read',
  );
  if (accessibleProjectIds.length === 0) {
    return [];
  }

  const batches = await mediaBatchModel
    .find({ organizationId, projectId: { $in: accessibleProjectIds } })
    .sort({ createdAt: -1 });
  return batches.map((batch) => ({
    id: batch.id,
    missionId: batch.missionId,
    projectId: batch.projectId,
    key: batch.key,
    status: batch.status,
  }));
}
