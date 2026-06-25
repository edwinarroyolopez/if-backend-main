import { ProjectsLegacyCoreHelpers } from './projects-legacy-core-helpers';
import {
  AppException,
  ClientSession,
  PROJECT_BACKLOG_ITEM_TYPES,
  ProjectBacklogItemType,
  ProjectDocument,
  ProjectRoadmapDocument,
  REASON_CODES,
  createHash,
} from './projects-legacy.imports';
import {
  ProjectBacklogCandidatePreview,
  ProjectBacklogImportPreviewReadModel,
  ProjectRoadmapReadModel,
  RoadmapImportIssue,
} from './projects-legacy.types';
import {
  canonicalJson,
  emptyBacklogImportPreview,
  groupByRoadmapVersionId,
  isRecord,
  isValidRoadmapEstimate,
  numberValue,
  recordArray,
  stringArray,
  stringValue,
} from './projects-legacy.utils';

export abstract class ProjectsLegacyRoadmapHelpers extends ProjectsLegacyCoreHelpers {
  protected async toVersionedRoadmapReadModel(
    roadmap: ProjectRoadmapDocument,
    session?: ClientSession,
  ): Promise<ProjectRoadmapReadModel> {
    const versions = await this.projectRoadmapVersionModel
      .find({ roadmapId: roadmap.id })
      .sort({ versionNumber: -1 })
      .session(session ?? null);
    const milestones = await this.projectRoadmapMilestoneModel
      .find({ roadmapId: roadmap.id })
      .sort({ order: 1 })
      .session(session ?? null);
    const epics = await this.projectRoadmapEpicModel
      .find({ roadmapId: roadmap.id })
      .sort({ order: 1 })
      .session(session ?? null);
    const milestoneByVersion = groupByRoadmapVersionId(milestones);
    const epicByVersion = groupByRoadmapVersionId(epics);
    const versionReadModels = versions.map((version) => ({
      id: version.id,
      roadmapId: version.roadmapId,
      projectId: version.projectId,
      snapshotId: version.snapshotId,
      snapshotKey: version.snapshotKey,
      snapshotHash: version.snapshotHash,
      title: version.title,
      versionLabel: version.versionLabel,
      versionNumber: version.versionNumber,
      startDate: version.startDate,
      endDate: version.endDate,
      status: version.status,
      planningAssumptions: version.planningAssumptions,
      constraints: version.constraints,
      horizons: version.horizons,
      milestones: milestoneByVersion.get(version.id) ?? [],
      epics: epicByVersion.get(version.id) ?? [],
      backlogCandidates: version.backlogCandidates,
      createdAt: version.createdAt?.toISOString(),
      updatedAt: version.updatedAt?.toISOString(),
    }));
    return {
      id: roadmap.id,
      organizationId: roadmap.organizationId,
      projectId: roadmap.projectId,
      title: roadmap.title,
      status: roadmap.status,
      activeVersionId: roadmap.activeVersionId,
      latestVersionId: roadmap.latestVersionId,
      activeVersion: versionReadModels.find(
        (version) => version.id === roadmap.activeVersionId,
      ),
      versions: versionReadModels,
      createdBy: roadmap.createdBy,
      createdAt: roadmap.createdAt?.toISOString(),
      updatedAt: roadmap.updatedAt?.toISOString(),
    };
  }
  protected async buildBacklogImportPreview(
    project: ProjectDocument,
    session?: ClientSession,
  ): Promise<ProjectBacklogImportPreviewReadModel> {
    const errors: RoadmapImportIssue[] = [];
    const warnings: RoadmapImportIssue[] = [];
    const roadmap = await this.projectRoadmapModel
      .findOne({
        organizationId: project.organizationId,
        projectId: project.id,
        status: 'ACTIVE',
        activeVersionId: { $exists: true },
      })
      .session(session ?? null);
    if (!roadmap?.activeVersionId) {
      errors.push({
        path: '$.roadmap',
        message: 'An active roadmap is required before importing backlog.',
      });
      return emptyBacklogImportPreview(errors);
    }
    const version = await this.projectRoadmapVersionModel
      .findOne({
        _id: roadmap.activeVersionId,
        roadmapId: roadmap.id,
        projectId: project.id,
        status: 'ACTIVE',
      })
      .session(session ?? null);
    if (!version) {
      errors.push({
        path: '$.roadmap.activeVersionId',
        message: 'Active roadmap version was not found.',
      });
      return emptyBacklogImportPreview(errors, roadmap.id);
    }
    const [milestones, epics, existingItems] = await Promise.all([
      this.projectRoadmapMilestoneModel
        .find({ roadmapVersionId: version.id })
        .sort({ order: 1 })
        .session(session ?? null),
      this.projectRoadmapEpicModel
        .find({ roadmapVersionId: version.id })
        .sort({ order: 1 })
        .session(session ?? null),
      this.projectBacklogItemModel
        .find({
          organizationId: project.organizationId,
          projectId: project.id,
          roadmapVersionId: version.id,
          sourceCandidateKey: { $exists: true },
        })
        .session(session ?? null),
    ]);
    const milestoneByKey = new Map(milestones.map((item) => [item.key, item]));
    const epicByKey = new Map(epics.map((item) => [item.key, item]));
    const existingKeys = new Set(
      existingItems.map((item) => item.sourceCandidateKey).filter(Boolean),
    );
    const rawCandidates = version.backlogCandidates.filter(isRecord);
    if (rawCandidates.length === 0) {
      errors.push({
        path: '$.backlogCandidates',
        message: 'Active roadmap has no backlog candidates to import.',
      });
    }
    const candidates: ProjectBacklogCandidatePreview[] = [];
    rawCandidates.forEach((candidate, index) => {
      const key = stringValue(candidate.key);
      const epicKey = stringValue(candidate.epicKey);
      const epic = epicByKey.get(epicKey);
      const milestone = epic
        ? milestoneByKey.get(epic.milestoneKey)
        : undefined;
      const type = stringValue(candidate.type) || 'STORY';
      if (!key) {
        errors.push({
          path: `$.backlogCandidates[${index}].key`,
          message: 'Candidate key is required.',
        });
      }
      if (!epic || !milestone) {
        errors.push({
          path: `$.backlogCandidates[${key || index}].epicKey`,
          message: 'Candidate epicKey must reference an active roadmap epic.',
        });
      }
      if (
        !PROJECT_BACKLOG_ITEM_TYPES.includes(type as ProjectBacklogItemType)
      ) {
        errors.push({
          path: `$.backlogCandidates[${key || index}].type`,
          message: 'Candidate type is not supported.',
        });
      }
      if (!isValidRoadmapEstimate(candidate.estimate)) {
        errors.push({
          path: `$.backlogCandidates[${key || index}].estimate`,
          message: 'Candidate estimate is not valid.',
        });
      }
      if (!stringValue(candidate.title)) {
        errors.push({
          path: `$.backlogCandidates[${key || index}].title`,
          message: 'Candidate title is required.',
        });
      }
      if (
        !key ||
        !epic ||
        !milestone ||
        !isValidRoadmapEstimate(candidate.estimate)
      ) {
        return;
      }
      const alreadyImported = existingKeys.has(key);
      if (alreadyImported) {
        warnings.push({
          path: `$.backlogCandidates[${key}]`,
          message: 'Candidate already imported; commit will skip it.',
        });
      }
      const sourceReferences = recordArray(candidate.sourceReferences);
      candidates.push({
        roadmapId: roadmap.id,
        roadmapVersionId: version.id,
        milestoneId: milestone.id,
        milestoneKey: milestone.key,
        milestoneTitle: milestone.title,
        epicId: epic.id,
        epicKey: epic.key,
        epicTitle: epic.title,
        title: stringValue(candidate.title),
        description: stringValue(candidate.description),
        type: type as ProjectBacklogItemType,
        priority: numberValue(candidate.priority) || epic.priority || index + 1,
        estimate: candidate.estimate as Record<string, unknown>,
        status: 'UNREFINED',
        acceptanceCriteria: stringArray(candidate.acceptanceCriteria),
        sourceReferences,
        traceability: {
          roadmapId: roadmap.id,
          roadmapVersionId: version.id,
          roadmapVersionLabel: version.versionLabel,
          snapshotId: version.snapshotId,
          snapshotKey: version.snapshotKey,
          snapshotHash: version.snapshotHash,
          milestoneId: milestone.id,
          milestoneKey: milestone.key,
          epicId: epic.id,
          epicKey: epic.key,
          sourceCandidateKey: key,
          sourceReferences,
        },
        order: numberValue(candidate.order) || index,
        sourceCandidateKey: key,
        alreadyImported,
      });
    });
    const previewToken = createHash('sha256')
      .update(
        canonicalJson({
          projectId: project.id,
          roadmapId: roadmap.id,
          roadmapVersionId: version.id,
          candidateKeys: candidates.map(
            (candidate) => candidate.sourceCandidateKey,
          ),
        }),
      )
      .digest('hex');
    return {
      valid: errors.length === 0,
      previewToken: `backlog-import-${previewToken}`,
      roadmapId: roadmap.id,
      roadmapVersionId: version.id,
      roadmapVersionLabel: version.versionLabel,
      snapshotId: version.snapshotId,
      warnings,
      errors,
      summary: {
        candidates: candidates.length,
        alreadyImported: candidates.filter(
          (candidate) => candidate.alreadyImported,
        ).length,
        willCreate: candidates.filter((candidate) => !candidate.alreadyImported)
          .length,
      },
      candidates,
    };
  }
  protected async getBacklogItemForWrite(
    project: ProjectDocument,
    itemId: string,
    session: ClientSession,
  ) {
    const item = await this.projectBacklogItemModel
      .findOne({
        _id: itemId,
        organizationId: project.organizationId,
        projectId: project.id,
      })
      .session(session);
    if (!item) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Backlog item was not found',
      );
    }
    return item;
  }
}
