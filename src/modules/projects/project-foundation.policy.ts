import {
  ProjectHealth,
  ProjectKind,
  ProjectReadinessLevel,
  ProjectStatus,
} from 'src/common/types/domain.types';

export type ProjectBlockingReason = {
  code: string;
  message: string;
};

export type ProjectReadiness = {
  level: ProjectReadinessLevel;
  nextLevel: ProjectReadinessLevel | null;
  blockingReasons: ProjectBlockingReason[];
};

const ORDERED_READINESS: ProjectReadinessLevel[] = [
  'EMPTY',
  'DOCUMENTING',
  'DOCUMENTED',
  'ROADMAP_READY',
  'BACKLOG_READY',
  'READY_TO_START',
];

const VALID_PROJECT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  DRAFT: ['ACTIVE', 'CANCELLED', 'ARCHIVED'],
  ACTIVE: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['ACTIVE', 'CANCELLED'],
  COMPLETED: ['ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function normalizeProjectKind(projectKind: ProjectKind | undefined) {
  return projectKind ?? 'CLIENT';
}

export function normalizeProjectKey(key: string) {
  return key.trim().toUpperCase();
}

export function canTransitionProject(
  currentStatus: ProjectStatus,
  targetStatus: ProjectStatus,
) {
  return VALID_PROJECT_TRANSITIONS[currentStatus].includes(targetStatus);
}

export function buildProjectReadiness(input: {
  hasUsefulDocumentation: boolean;
  requiredDocumentationApproved: boolean;
  hasActiveRoadmap: boolean;
  hasReadyBacklog: boolean;
  hasMinimumTeam: boolean;
}) {
  if (!input.hasUsefulDocumentation) {
    return readiness('EMPTY', [
      {
        code: 'USEFUL_DOCUMENTATION_REQUIRED',
        message: 'No existe contenido documental util aprobado o en progreso',
      },
    ]);
  }

  if (!input.requiredDocumentationApproved) {
    return readiness('DOCUMENTING', [
      {
        code: 'REQUIRED_DOCUMENTATION_APPROVAL_REQUIRED',
        message: 'Faltan paginas documentales obligatorias aprobadas',
      },
    ]);
  }

  if (!input.hasActiveRoadmap) {
    return readiness('DOCUMENTED', [
      {
        code: 'ACTIVE_ROADMAP_REQUIRED',
        message: 'No existe una hoja de ruta activa',
      },
    ]);
  }

  if (!input.hasReadyBacklog) {
    return readiness('ROADMAP_READY', [
      {
        code: 'READY_BACKLOG_REQUIRED',
        message: 'No existe backlog priorizado con criterios minimos',
      },
    ]);
  }

  if (!input.hasMinimumTeam) {
    return readiness('BACKLOG_READY', [
      {
        code: 'MINIMUM_TEAM_AND_CAPACITY_REQUIRED',
        message: 'Falta equipo minimo y capacidad para planificar sprint',
      },
    ]);
  }

  return readiness('READY_TO_START', []);
}

export function isProjectHealth(value: string): value is ProjectHealth {
  return value === 'ON_TRACK' || value === 'AT_RISK' || value === 'BLOCKED';
}

function readiness(
  level: ProjectReadinessLevel,
  blockingReasons: ProjectBlockingReason[],
): ProjectReadiness {
  const index = ORDERED_READINESS.indexOf(level);
  return {
    level,
    nextLevel: ORDERED_READINESS[index + 1] ?? null,
    blockingReasons,
  };
}
