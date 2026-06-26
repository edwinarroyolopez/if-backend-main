import { ProjectsLegacyDocumentHelpers } from './projects-legacy-document-helpers';
import {
  AuthenticatedPrincipal,
  ClientSession,
  ProjectDocument,
  ProjectDocumentationChecklistItem,
} from './projects-legacy.imports';
import { projectMatchesAccess } from './projects-legacy.utils';

export abstract class ProjectsLegacyDefaultsAccessHelpers extends ProjectsLegacyDocumentHelpers {
  protected async ensureProjectDocumentation(
    project: ProjectDocument,
    actorId: string,
    session?: ClientSession,
  ) {
    const documentation = await this.projectDocumentationModel
      .findOne({ projectId: project.id })
      .session(session ?? null);
    if (documentation) {
      return documentation;
    }
    try {
      const [document] = await this.projectDocumentationModel.create(
        [
          {
            projectId: project.id,
            parentPageId: undefined,
            slug: 'overview',
            title: 'Documentacion del proyecto',
            summary: 'Resumen base del documento operativo del proyecto.',
            bodyMarkdown:
              'Esta vista muestra el documento de operacion base del proyecto.',
            pageType: 'OVERVIEW',
            status: 'DRAFT',
            version: 1,
            sortOrder: 0,
            checklist: [
              {
                id: 'goals-defined',
                text: 'Objetivos y restricciones iniciales definidos',
                required: true,
                completed: false,
              },
              {
                id: 'roadmap-v1',
                text: 'Roadmap inicial cargado',
                required: false,
                completed: false,
              },
            ] as ProjectDocumentationChecklistItem[],
            createdBy: actorId,
            updatedBy: actorId,
          },
        ],
        { session },
      );
      return document;
    } catch (error: unknown) {
      const existing = await this.projectDocumentationModel
        .findOne({ projectId: project.id })
        .session(session ?? null);
      if (existing) {
        return existing;
      }
      throw error;
    }
  }

  protected async ensureProjectRoadmap(
    project: ProjectDocument,
    actorId: string,
    session?: ClientSession,
  ) {
    const roadmap = await this.projectRoadmapModel
      .findOne({ projectId: project.id })
      .session(session ?? null);
    if (roadmap) {
      return roadmap;
    }
    try {
      const [roadmapDocument] = await this.projectRoadmapModel.create(
        [
          {
            projectId: project.id,
            title: 'Roadmap del proyecto',
            status: 'PLANNING',
            version: 1,
            horizonMonths: 6,
            notes:
              'Plan inicial en borrador, completar hitos conforme avance la entrega.',
            items: [
              {
                id: 'kickoff',
                title: 'Kickoff operativo',
                startDate: new Date().toISOString().split('T')[0],
                endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
                  .toISOString()
                  .split('T')[0],
                status: 'PLANNED',
                owners: ['PM'],
                dependencies: [],
                deliveryRisk: 'Definir riesgos del despliegue.',
              },
            ],
            createdBy: actorId,
            updatedBy: actorId,
          },
        ],
        { session },
      );
      return roadmapDocument;
    } catch (error: unknown) {
      const existing = await this.projectRoadmapModel
        .findOne({ projectId: project.id })
        .session(session ?? null);
      if (existing) {
        return existing;
      }
      throw error;
    }
  }

  protected async listAccessibleProjects(
    principal: AuthenticatedPrincipal,
    moduleKey: string,
    permissionKey: string,
  ) {
    const organizationId = principal.activeOrganizationId;
    if (!organizationId) {
      return [];
    }
    const access =
      await this.principalAuthorizationService.getProjectCollectionAccess(
        principal,
        { organizationId, moduleKey, permissionKey },
      );
    const explicitProjectIds = Object.keys(
      access.projectScopedRoleIdsByProjectId,
    );
    if (access.broadRoleIds.length === 0 && explicitProjectIds.length === 0) {
      return [];
    }
    const query: {
      organizationId: string;
      accessRoleIds?: { $in: string[] };
      _id?: { $in: string[] };
      $or?: Array<Record<string, unknown>>;
    } = { organizationId };
    if (access.broadRoleIds.length > 0 && explicitProjectIds.length > 0) {
      query.$or = [
        { accessRoleIds: { $in: access.broadRoleIds } },
        { _id: { $in: explicitProjectIds } },
      ];
    } else if (access.broadRoleIds.length > 0) {
      query.accessRoleIds = { $in: access.broadRoleIds };
    } else {
      query._id = { $in: explicitProjectIds };
    }
    const projects = await this.projectModel
      .find(query)
      .sort({ createdAt: -1 });
    return projects.filter((project) => projectMatchesAccess(project, access));
  }
}
