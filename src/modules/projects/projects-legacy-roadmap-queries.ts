import { ProjectsLegacyContextSnapshots } from './projects-legacy-context-snapshots';
import { AppException, REASON_CODES } from './projects-legacy.imports';
import { ProjectRoadmapReadModel } from './projects-legacy.types';
import { sanitizeRoadmapImportPreview } from './projects-legacy.utils';

export abstract class ProjectsLegacyRoadmapQueries extends ProjectsLegacyContextSnapshots {
  async listProjectRoadmaps(projectId: string) {
    const project = await this.getExistingProject(projectId);
    const roadmaps = await this.projectRoadmapModel
      .find({ projectId: project.id })
      .sort({ createdAt: -1 });
    const readModels: ProjectRoadmapReadModel[] = [];
    for (const roadmap of roadmaps) {
      readModels.push(await this.toVersionedRoadmapReadModel(roadmap));
    }
    return readModels;
  }
  async getVersionedProjectRoadmap(projectId: string, roadmapId: string) {
    const project = await this.getExistingProject(projectId);
    const roadmap = await this.projectRoadmapModel.findOne({
      _id: roadmapId,
      projectId: project.id,
    });
    if (!roadmap) {
      throw new AppException(
        404,
        REASON_CODES.RESOURCE_NOT_FOUND,
        'Roadmap was not found',
      );
    }
    return this.toVersionedRoadmapReadModel(roadmap);
  }
  async buildRoadmapPrompt(
    projectId: string,
    snapshotId: string,
    roadmapDraft?: string,
  ) {
    const project = await this.getExistingProject(projectId);
    const snapshot = await this.getContextSnapshotDocument(project, snapshotId);
    const cleanRoadmapDraft = roadmapDraft?.trim();
    const snapshotPageRefs = snapshot.sourcePageIds.map((pageId) => ({
      pageId,
      pageVersion: snapshot.sourcePageVersions[pageId],
    }));
    const sourcePageVersions = await this.projectDocumentPageVersionModel.find({
      organizationId: project.organizationId,
      projectId: project.id,
      $or: snapshotPageRefs,
    });
    const versionByPageRef = new Map(
      sourcePageVersions.map((version) => [
        `${version.pageId}:${version.pageVersion}`,
        version,
      ]),
    );
    const orderedSourcePageVersions = snapshotPageRefs.map((pageRef) => {
      const sourcePageVersion = versionByPageRef.get(
        `${pageRef.pageId}:${pageRef.pageVersion}`,
      );
      if (!sourcePageVersion) {
        throw new AppException(
          409,
          REASON_CODES.RESOURCE_STATE_CONFLICT,
          'Snapshot source document page version is missing',
          pageRef,
        );
      }
      return sourcePageVersion;
    });
    const prompt = [
      '# Project Roadmap Generation Prompt v1',
      'InflightOS does not call external AI providers. Copy this prompt into your external AI tool and paste the resulting JSON back into InflightOS.',
      'Return pure JSON only. The JSON must validate against ai/contracts/inflight-project-roadmap-v1.schema.json.',
      'Use the approved source pages below as the documentary context. Every milestone, epic and backlog candidate must cite the pageId/pageVersion references it uses.',
      'If a user roadmap draft is supplied, use it as planning input only. Do not treat it as an approved fact when it contradicts the approved snapshot or source pages.',
      '',
      `Project: ${project.name}`,
      `Project key: ${project.key}`,
      `Snapshot id: ${snapshot.id}`,
      `Snapshot key: ${snapshot.snapshotKey}`,
      `Snapshot hash: ${snapshot.approvedDocumentationHash}`,
      '',
      'Approved snapshot summary:',
      snapshot.contentSummary,
      '',
      `Facts: ${snapshot.facts.join('; ') || 'none'}`,
      `Assumptions: ${snapshot.assumptions.join('; ') || 'none'}`,
      `Decisions: ${snapshot.decisions.join('; ') || 'none'}`,
      `Risks: ${snapshot.risks.join('; ') || 'none'}`,
      `Open questions: ${snapshot.openQuestions.join('; ') || 'none'}`,
      `Constraints: ${snapshot.constraints.join('; ') || 'none'}`,
      '',
      'Approved source pages:',
      ...orderedSourcePageVersions.flatMap((pageVersion, index) => [
        '',
        `## Source page ${index + 1}: ${pageVersion.title}`,
        `Reference: pageId=${pageVersion.pageId}; pageVersion=${pageVersion.pageVersion}; slug=${pageVersion.slug}; type=${pageVersion.pageType}; status=${pageVersion.status}`,
        `Summary: ${pageVersion.summary?.trim() || 'none'}`,
        'Content:',
        pageVersion.bodyMarkdown?.trim() || 'none',
        `Facts: ${pageVersion.facts.join('; ') || 'none'}`,
        `Assumptions: ${pageVersion.assumptions.join('; ') || 'none'}`,
        `Decisions: ${pageVersion.decisions.join('; ') || 'none'}`,
        `Risks: ${pageVersion.risks.join('; ') || 'none'}`,
        `Open questions: ${pageVersion.openQuestions.join('; ') || 'none'}`,
      ]),
      ...(cleanRoadmapDraft
        ? [
            '',
            'User roadmap draft:',
            cleanRoadmapDraft,
            '',
            'Draft usage rules:',
            '- Use this draft to enrich horizons, sequencing, gates, metrics, dependencies and candidate backlog.',
            '- Preserve traceability to approved source pages whenever turning draft content into roadmap items.',
            '- If the draft adds unsupported commitments, deadlines, team capacity or estimates, convert them into assumptions or questions instead of facts.',
            '- If the draft contradicts the approved snapshot or source pages, return CONTRADICTIONS_FOUND with references.',
          ]
        : []),
    ].join('\n');
    return {
      prompt,
      promptTemplateVersion: 'project-roadmap-generation-v1',
      contractVersion: 'inflight.project.roadmap.v1',
      expectedSchemaVersion: 'inflight.project.roadmap.v1',
      snapshot: this.toContextSnapshotReadModel(snapshot),
      instructions: [
        'Copiar prompt',
        'Usarlo con una IA externa',
        'Pegar aqui JSON puro sin markdown',
        'Previsualizar antes de commit',
      ],
    };
  }
  async previewProjectRoadmapImport(projectId: string, roadmapImport: unknown) {
    const project = await this.getExistingProject(projectId);
    const preview = await this.buildRoadmapImportPreview(
      project,
      roadmapImport,
    );
    if (preview.errors.length > 0) {
      throw new AppException(
        400,
        REASON_CODES.VALIDATION_FAILED,
        'Roadmap import JSON failed validation',
        { errors: preview.errors },
      );
    }
    return sanitizeRoadmapImportPreview(preview);
  }
}
