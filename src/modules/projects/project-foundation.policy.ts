import {
  ProjectHealth,
  ProjectKind,
  ProjectReadinessLevel,
  ProjectStatus,
} from 'src/common/types/domain.types';
import { normalizeSlugKey } from 'src/common/utils/slug-key.util';

export type ProjectBlockingReason = {
  code: string;
  message: string;
};

export type ProjectCompletedSignal = {
  code: string;
  message: string;
};

export type ProjectNextRecommendedAction = {
  code: string;
  message: string;
};

export type ProjectReadiness = {
  status: ProjectReadinessLevel;
  level: ProjectReadinessLevel;
  nextLevel: ProjectReadinessLevel | null;
  progress: number;
  blockingReasons: ProjectBlockingReason[];
  completedSignals: ProjectCompletedSignal[];
  nextRecommendedAction: ProjectNextRecommendedAction | null;
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
  return normalizeSlugKey(key);
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
  hasContextSnapshot: boolean;
  hasScrumReady: boolean;
  hasMinimumTeam: boolean;
}) {
  if (!input.hasUsefulDocumentation) {
    return readiness('EMPTY', input, [
      blockingReason(
        'USEFUL_DOCUMENTATION_REQUIRED',
        'No existe contenido documental util aprobado o en progreso',
      ),
    ]);
  }

  if (!input.requiredDocumentationApproved) {
    return readiness('DOCUMENTING', input, [
      blockingReason(
        'REQUIRED_DOCUMENTATION_APPROVAL_REQUIRED',
        'Faltan paginas documentales obligatorias aprobadas',
      ),
    ]);
  }

  if (!input.hasContextSnapshot) {
    return readiness('DOCUMENTED', input, [
      blockingReason(
        'CONTEXT_SNAPSHOT_REQUIRED',
        'Falta snapshot aprobado para congelar el contexto del roadmap',
      ),
    ]);
  }

  if (!input.hasActiveRoadmap) {
    return readiness('DOCUMENTED', input, [
      blockingReason(
        'ACTIVE_ROADMAP_REQUIRED',
        'No existe una hoja de ruta activa',
      ),
    ]);
  }

  if (!input.hasReadyBacklog) {
    return readiness('ROADMAP_READY', input, [
      blockingReason(
        'READY_BACKLOG_REQUIRED',
        'No existe backlog priorizado con criterios minimos',
      ),
    ]);
  }

  const finalBlockingReasons: ProjectBlockingReason[] = [];
  if (!input.hasScrumReady) {
    finalBlockingReasons.push(
      blockingReason(
        'SCRUM_PLANNING_REQUIRED',
        'Falta al menos un sprint real para iniciar la ejecucion',
      ),
    );
  }
  if (!input.hasMinimumTeam) {
    finalBlockingReasons.push(
      blockingReason(
        'MINIMUM_TEAM_AND_CAPACITY_REQUIRED',
        'Falta equipo minimo activo con capacidad para iniciar construccion',
      ),
    );
  }
  if (finalBlockingReasons.length > 0) {
    return readiness('BACKLOG_READY', input, finalBlockingReasons);
  }

  return readiness('READY_TO_START', input, []);
}

export function isProjectHealth(value: string): value is ProjectHealth {
  return value === 'ON_TRACK' || value === 'AT_RISK' || value === 'BLOCKED';
}

function readiness(
  level: ProjectReadinessLevel,
  input: {
    hasUsefulDocumentation: boolean;
    requiredDocumentationApproved: boolean;
    hasActiveRoadmap: boolean;
    hasReadyBacklog: boolean;
    hasContextSnapshot: boolean;
    hasScrumReady: boolean;
    hasMinimumTeam: boolean;
  },
  blockingReasons: ProjectBlockingReason[],
): ProjectReadiness {
  const index = ORDERED_READINESS.indexOf(level);
  const nextLevel = ORDERED_READINESS[index + 1] ?? null;
  return {
    status: level,
    level,
    nextLevel,
    progress: Math.round((index / (ORDERED_READINESS.length - 1)) * 100),
    blockingReasons,
    completedSignals: completedSignals(input),
    nextRecommendedAction: nextLevel ? nextRecommendedAction(nextLevel) : null,
  };
}

function blockingReason(code: string, message: string): ProjectBlockingReason {
  return { code, message };
}

function completedSignals(input: {
  hasUsefulDocumentation: boolean;
  requiredDocumentationApproved: boolean;
  hasActiveRoadmap: boolean;
  hasReadyBacklog: boolean;
  hasContextSnapshot: boolean;
  hasScrumReady: boolean;
  hasMinimumTeam: boolean;
}): ProjectCompletedSignal[] {
  const signals: ProjectCompletedSignal[] = [];
  if (input.hasUsefulDocumentation) {
    signals.push({
      code: 'DOCUMENTATION_STARTED',
      message: 'Existe documentacion inicial del proyecto',
    });
  }
  if (input.requiredDocumentationApproved) {
    signals.push({
      code: 'DOCUMENTATION_APPROVED',
      message: 'La documentacion requerida esta aprobada',
    });
  }
  if (input.hasActiveRoadmap) {
    signals.push({
      code: 'ROADMAP_ACTIVE',
      message: 'Existe una version activa del roadmap',
    });
  }
  if (input.hasContextSnapshot) {
    signals.push({
      code: 'CONTEXT_SNAPSHOT_READY',
      message: 'Existe snapshot aprobado de contexto',
    });
  }
  if (input.hasReadyBacklog) {
    signals.push({
      code: 'BACKLOG_READY',
      message: 'Existe backlog priorizado y listo',
    });
  }
  if (input.hasScrumReady) {
    signals.push({
      code: 'SCRUM_READY',
      message: 'Existe Scrum real preparado para ejecucion',
    });
  }
  if (input.hasMinimumTeam) {
    signals.push({
      code: 'MINIMUM_TEAM_READY',
      message: 'Existe equipo minimo con capacidad definida',
    });
  }

  return signals;
}

function nextRecommendedAction(
  nextLevel: ProjectReadinessLevel,
): ProjectNextRecommendedAction {
  switch (nextLevel) {
    case 'DOCUMENTING':
      return {
        code: 'START_DOCUMENTATION',
        message: 'Crear o importar documentacion base del proyecto',
      };
    case 'DOCUMENTED':
      return {
        code: 'APPROVE_DOCUMENTATION',
        message: 'Revisar y aprobar documentacion requerida',
      };
    case 'ROADMAP_READY':
      return {
        code: 'CREATE_ACTIVE_ROADMAP',
        message: 'Crear snapshot aprobado y activar una version del roadmap',
      };
    case 'BACKLOG_READY':
      return {
        code: 'PREPARE_BACKLOG',
        message: 'Convertir candidatos aprobados en backlog real',
      };
    case 'READY_TO_START':
      return {
        code: 'ASSIGN_TEAM_CAPACITY',
        message: 'Asignar equipo minimo y capacidad para iniciar construccion',
      };
    case 'EMPTY':
      return {
        code: 'CREATE_PROJECT',
        message: 'Crear el proyecto antes de calcular preparacion',
      };
  }
}
