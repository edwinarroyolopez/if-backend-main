import { ProjectsLegacyReadModelHelpers } from './projects-legacy-read-model-helpers';
import {
  ProjectContextSnapshotDocument,
  ProjectDocument,
} from './projects-legacy.imports';
import {
  ProjectContextSnapshotReadModel,
  ProjectReadModel,
} from './projects-legacy.types';
import { toIsoDate } from './projects-legacy.utils';

export abstract class ProjectsLegacyAuditReadModels extends ProjectsLegacyReadModelHelpers {
  toReadModel(project: ProjectDocument): ProjectReadModel {
    return {
      id: project.id,
      organizationId: project.organizationId,
      projectKind: project.projectKind ?? 'CLIENT',
      key: project.key,
      name: project.name,
      description: project.description,
      objective: project.objective,
      ownerUserId: project.ownerUserId,
      clientId: project.clientId,
      opportunityId: project.opportunityId,
      status: project.status,
      health: project.health ?? 'ON_TRACK',
      healthReason: project.healthReason,
      healthUpdatedAt: project.healthUpdatedAt?.toISOString(),
      healthUpdatedBy: project.healthUpdatedBy,
      startDate: toIsoDate(project.startDate),
      targetDate: toIsoDate(project.targetDate),
      accessRoleIds: [...project.accessRoleIds],
      accessPolicyVersion: project.accessPolicyVersion,
      createdBy: project.createdBy,
      createdAt: project.createdAt?.toISOString(),
      updatedAt: project.updatedAt?.toISOString(),
    };
  }
  protected toContextSnapshotReadModel(
    snapshot: ProjectContextSnapshotDocument,
  ): ProjectContextSnapshotReadModel {
    return {
      id: snapshot.id,
      organizationId: snapshot.organizationId,
      projectId: snapshot.projectId,
      snapshotKey: snapshot.snapshotKey,
      title: snapshot.title,
      sourcePageIds: [...snapshot.sourcePageIds],
      sourcePageVersions: { ...snapshot.sourcePageVersions },
      approvedDocumentationHash: snapshot.approvedDocumentationHash,
      contentSummary: snapshot.contentSummary,
      facts: [...snapshot.facts],
      assumptions: [...snapshot.assumptions],
      decisions: [...snapshot.decisions],
      risks: [...snapshot.risks],
      openQuestions: [...snapshot.openQuestions],
      constraints: [...snapshot.constraints],
      createdBy: snapshot.createdBy,
      createdAt: snapshot.createdAt?.toISOString(),
    };
  }
  protected toProjectAuditSnapshot(project: ProjectDocument) {
    return {
      key: project.key,
      name: project.name,
      description: project.description,
      objective: project.objective,
      ownerUserId: project.ownerUserId,
      startDate: toIsoDate(project.startDate),
      targetDate: toIsoDate(project.targetDate),
    };
  }
}
