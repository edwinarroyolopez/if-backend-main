import { ProjectsLegacyDefaultsAccessHelpers } from './projects-legacy-defaults-access-helpers';
import {
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
import { toPlainDocumentChecklistItem } from './projects-legacy.utils';

export abstract class ProjectsLegacyReadModelHelpers extends ProjectsLegacyDefaultsAccessHelpers {
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
}
