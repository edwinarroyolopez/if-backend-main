export function validProjectDocumentImport(
  projectName: string,
  projectKey: string,
) {
  return {
    schemaVersion: 'inflight.project.documentation.v1',
    generationStatus: 'READY',
    promptMetadata: {
      promptPurpose: 'PROJECT_DOCUMENTATION_INTERVIEW',
      promptTemplateVersion: 'project-documentation-interview-v1',
      contractVersion: 'inflight.project.documentation.v1',
      promptChecksum: 'fixture-checksum',
      generatedAt: '2026-06-24T00:00:00.000Z',
    },
    projectIdentity: {
      projectName,
      projectKey,
    },
    pages: [
      {
        clientReference: 'overview-page',
        title: 'Vision documental importada',
        slug: 'vision-documental-importada',
        pageType: 'OVERVIEW',
        summary: 'Resumen suficiente de la documentacion importada.',
        bodyMarkdown:
          '# Vision documental\nContenido importado desde una IA externa sin proveedor conectado.',
        status: 'DRAFT',
        sortOrder: 0,
        checklist: [
          {
            key: 'scope-confirmed',
            text: 'Alcance inicial confirmado',
            required: true,
            completed: false,
            order: 0,
            sourceReferences: [initialReference('project-description')],
          },
        ],
        facts: [
          {
            key: 'fact-external-flow',
            statement: 'El flujo usa una IA externa fuera de InflightOS.',
            sourceReferences: [initialReference('project-description')],
          },
        ],
        assumptions: [],
        decisions: [],
        risks: [],
        openQuestions: [],
        sourceReferences: [initialReference('project-description')],
      },
      {
        clientReference: 'risks-page',
        title: 'Riesgos abiertos',
        slug: 'riesgos-abiertos',
        pageType: 'RISKS',
        summary: 'Riesgos iniciales identificados durante la entrevista.',
        bodyMarkdown:
          '# Riesgos\nSe debe revisar la calidad del JSON antes de hacer commit.',
        status: 'DRAFT',
        sortOrder: 1,
        checklist: [],
        facts: [],
        assumptions: [],
        decisions: [],
        risks: [
          {
            key: 'risk-invalid-json',
            risk: 'El usuario podria pegar JSON invalido.',
            impact: 'MEDIUM',
            likelihood: 'LOW',
            mitigation: 'Validar contrato y semantica antes del commit.',
            sourceReferences: [initialReference('project-description')],
          },
        ],
        openQuestions: [],
        sourceReferences: [initialReference('project-description')],
      },
    ],
    facts: [],
    assumptions: [],
    decisions: [],
    risks: [],
    openQuestions: [],
    contradictions: [],
  };
}

export function invalidSchemaVersionImport(
  projectName: string,
  projectKey: string,
) {
  return {
    ...validProjectDocumentImport(projectName, projectKey),
    schemaVersion: 'wrong.schema.version',
  };
}

export function additionalPropertyImport(
  projectName: string,
  projectKey: string,
) {
  return {
    ...validProjectDocumentImport(projectName, projectKey),
    unexpected: true,
  };
}

export function invalidPageTypeImport(projectName: string, projectKey: string) {
  const payload = validProjectDocumentImport(projectName, projectKey);
  payload.pages[0] = { ...payload.pages[0], pageType: 'NOTES' };
  return payload;
}

export function duplicateSlugImport(projectName: string, projectKey: string) {
  const payload = validProjectDocumentImport(projectName, projectKey);
  payload.pages[1] = { ...payload.pages[1], slug: payload.pages[0].slug };
  return payload;
}

export function emptyBodyImport(projectName: string, projectKey: string) {
  const payload = validProjectDocumentImport(projectName, projectKey);
  payload.pages[0] = { ...payload.pages[0], bodyMarkdown: ' ' };
  return payload;
}

export function invalidChecklistImport(
  projectName: string,
  projectKey: string,
) {
  const payload = validProjectDocumentImport(projectName, projectKey);
  payload.pages[0].checklist[0] = {
    ...payload.pages[0].checklist[0],
    completed: 'no' as unknown as boolean,
  };
  return payload;
}

function initialReference(referenceKey: string) {
  return {
    referenceType: 'INITIAL_DESCRIPTION',
    referenceKey,
    path: '$.project.description',
    quote: 'Project description provided by the user.',
    confidence: 1,
  };
}
