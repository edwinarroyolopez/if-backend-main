import { ProjectsLegacyDocumentHelpers } from './projects-legacy-document-helpers';
import {
  AuthenticatedPrincipal,
  ClientSession,
  ProjectDocument,
  ProjectDocumentPageDocument,
  ProjectDocumentationChecklistItem,
  ProjectDocumentationDocument,
  ProjectRoadmapDocument,
  ProjectRoadmapItem,
} from './projects-legacy.imports';
import {
  ProjectDocumentPageReadModel,
  ProjectDocumentationUpdate,
  ProjectRoadmapUpdate,
} from './projects-legacy.types';
import {
  projectMatchesAccess,
  toPlainDocumentChecklistItem,
} from './projects-legacy.utils';

export abstract class ProjectsLegacyReadModelHelpers extends ProjectsLegacyDocumentHelpers {
  toDocumentPageReadModel(
    page: ProjectDocumentPageDocument,
  ): ProjectDocumentPageReadModel {
    return {
      id: page.id,
      organizationId: page.organizationId,
      projectId: page.projectId,
      parentPageId: page.parentPageId,
      title: page.title,
      slug: page.slug,
      summary: page.summary,
      bodyMarkdown: page.bodyMarkdown,
      pageType: page.pageType,
      status: page.status,
      source: page.source,
      sortOrder: page.sortOrder,
      version: page.version,
      checklist: page.checklist.map(toPlainDocumentChecklistItem),
      facts: [...page.facts],
      assumptions: [...page.assumptions],
      decisions: [...page.decisions],
      risks: [...page.risks],
      openQuestions: [...page.openQuestions],
      sourceImportId: page.sourceImportId,
      createdBy: page.createdBy,
      updatedBy: page.updatedBy,
      createdAt: page.createdAt?.toISOString(),
      updatedAt: page.updatedAt?.toISOString(),
    };
  }
  protected applyProjectDocumentationUpdates(
    documentation: ProjectDocumentationDocument,
    updates: ProjectDocumentationUpdate,
  ) {
    let changed = false;
    if (
      updates.parentPageId !== undefined &&
      updates.parentPageId !== documentation.parentPageId
    ) {
      documentation.parentPageId = updates.parentPageId;
      changed = true;
    }
    if (updates.slug !== undefined && updates.slug !== documentation.slug) {
      documentation.slug = updates.slug;
      changed = true;
    }
    if (updates.title !== undefined && updates.title !== documentation.title) {
      documentation.title = updates.title;
      changed = true;
    }
    if (
      updates.summary !== undefined &&
      updates.summary !== documentation.summary
    ) {
      documentation.summary = updates.summary;
      changed = true;
    }
    if (
      updates.bodyMarkdown !== undefined &&
      updates.bodyMarkdown !== documentation.bodyMarkdown
    ) {
      documentation.bodyMarkdown = updates.bodyMarkdown;
      changed = true;
    }
    if (
      updates.pageType !== undefined &&
      updates.pageType !== documentation.pageType
    ) {
      documentation.pageType = updates.pageType;
      changed = true;
    }
    if (
      updates.status !== undefined &&
      updates.status !== documentation.status
    ) {
      documentation.status = updates.status;
      changed = true;
    }
    if (
      updates.sortOrder !== undefined &&
      updates.sortOrder !== documentation.sortOrder
    ) {
      documentation.sortOrder = updates.sortOrder;
      changed = true;
    }
    if (updates.checklist !== undefined) {
      const nextChecklist = updates.checklist.map((item) => ({
        id: item.id,
        text: item.text,
        required: item.required,
        completed: item.completed,
      }));
      if (
        !this.areProjectDocumentationChecklistsEqual(
          documentation.checklist,
          nextChecklist,
        )
      ) {
        documentation.checklist = nextChecklist;
        changed = true;
      }
    }
    return changed;
  }
  protected applyProjectRoadmapUpdates(
    roadmap: ProjectRoadmapDocument,
    updates: ProjectRoadmapUpdate,
  ) {
    let changed = false;
    if (updates.title !== undefined && updates.title !== roadmap.title) {
      roadmap.title = updates.title;
      changed = true;
    }
    if (updates.status !== undefined && updates.status !== roadmap.status) {
      roadmap.status = updates.status;
      changed = true;
    }
    if (
      updates.horizonMonths !== undefined &&
      updates.horizonMonths !== roadmap.horizonMonths
    ) {
      roadmap.horizonMonths = updates.horizonMonths;
      changed = true;
    }
    if (updates.notes !== undefined && updates.notes !== roadmap.notes) {
      roadmap.notes = updates.notes;
      changed = true;
    }
    if (updates.items !== undefined) {
      const nextItems = updates.items.map((item) => ({
        id: item.id,
        title: item.title,
        startDate: item.startDate,
        endDate: item.endDate,
        status: item.status,
        owners: item.owners ? [...item.owners] : undefined,
        dependencies: item.dependencies ? [...item.dependencies] : undefined,
        deliveryRisk: item.deliveryRisk,
      }));
      if (!this.areProjectRoadmapItemsEqual(roadmap.items, nextItems)) {
        roadmap.items = nextItems;
        changed = true;
      }
    }
    return changed;
  }
  protected toProjectDocumentationSnapshot(
    documentation: ProjectDocumentationDocument,
  ) {
    return {
      parentPageId: documentation.parentPageId,
      slug: documentation.slug,
      title: documentation.title,
      summary: documentation.summary,
      bodyMarkdown: documentation.bodyMarkdown,
      pageType: documentation.pageType,
      status: documentation.status,
      version: documentation.version,
      sortOrder: documentation.sortOrder,
      checklist: documentation.checklist.map((item) => ({
        id: item.id,
        text: item.text,
        required: item.required,
        completed: item.completed,
      })),
    };
  }
  protected toProjectRoadmapSnapshot(roadmap: ProjectRoadmapDocument) {
    return {
      title: roadmap.title,
      status: roadmap.status,
      version: roadmap.version,
      horizonMonths: roadmap.horizonMonths,
      notes: roadmap.notes,
      items: roadmap.items.map((item) => ({
        id: item.id,
        title: item.title,
        startDate: item.startDate,
        endDate: item.endDate,
        status: item.status,
        owners: item.owners ? [...item.owners] : [],
        dependencies: item.dependencies ? [...item.dependencies] : [],
        deliveryRisk: item.deliveryRisk,
      })),
    };
  }
  protected areProjectDocumentationChecklistsEqual(
    current: ProjectDocumentationChecklistItem[],
    next: ProjectDocumentationChecklistItem[],
  ) {
    if (current.length !== next.length) {
      return false;
    }
    return current.every(
      (item, index) =>
        item.id === next[index].id &&
        item.text === next[index].text &&
        item.required === next[index].required &&
        item.completed === next[index].completed,
    );
  }
  protected areProjectRoadmapItemsEqual(
    current: ProjectRoadmapItem[],
    next: ProjectRoadmapItem[],
  ) {
    if (current.length !== next.length) {
      return false;
    }
    return current.every((item, index) => {
      const nextItem = next[index];
      const owners = item.owners ?? [];
      const nextOwners = nextItem.owners ?? [];
      const dependencies = item.dependencies ?? [];
      const nextDependencies = nextItem.dependencies ?? [];
      if (owners.length !== nextOwners.length) {
        return false;
      }
      if (dependencies.length !== nextDependencies.length) {
        return false;
      }
      const ownersMatch = owners.every((owner, ownerIndex) => {
        return owner === nextOwners[ownerIndex];
      });
      const dependenciesMatch = dependencies.every(
        (dependency, dependencyIndex) => {
          return dependency === nextDependencies[dependencyIndex];
        },
      );
      return (
        item.id === nextItem.id &&
        item.title === nextItem.title &&
        item.startDate === nextItem.startDate &&
        item.endDate === nextItem.endDate &&
        item.status === nextItem.status &&
        ownersMatch &&
        dependenciesMatch &&
        item.deliveryRisk === nextItem.deliveryRisk
      );
    });
  }
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
