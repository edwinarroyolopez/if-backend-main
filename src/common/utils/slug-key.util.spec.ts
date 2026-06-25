import { buildSlugKeyFromName, normalizeSlugKey } from './slug-key.util';

describe('slug key utilities', () => {
  it.each([
    ['Automatizacion IA / Fase 2', 'automatizacion-ia-fase-2'],
    ['Automatización IA / Fase 2', 'automatizacion-ia-fase-2'],
    ['  Proyecto   con   espacios  ', 'proyecto-con-espacios'],
    ['MAYUSCULAS y Minusculas', 'mayusculas-y-minusculas'],
    ['alpha---beta___gamma', 'alpha-beta-gamma'],
    ['CRM & Ventas: Q3!', 'crm-ventas-q3'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeSlugKey(input)).toBe(expected);
  });

  it('returns an empty key when input has no usable characters', () => {
    expect(normalizeSlugKey(' / *** ')).toBe('');
  });

  it('builds a slug key from a display name', () => {
    expect(buildSlugKeyFromName('Automatización IA / Fase 2')).toBe(
      'automatizacion-ia-fase-2',
    );
  });
});
