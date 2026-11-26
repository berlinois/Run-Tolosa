import type { ExpressionSpecification } from 'maplibre-gl';

/**
 * Palette de couverture des rues, selon le nombre de passages enregistrés.
 * Centralisée ici pour être testée et réutilisée (carte, légende, stats).
 */
export const COVERAGE_LEVELS = [
  { minPassages: 0, color: '#9e9e9e', label: 'Jamais parcourue' },
  { minPassages: 1, color: '#43a047', label: '1 à 4 passages' },
  { minPassages: 5, color: '#1e88e5', label: '5 passages et plus' },
] as const;

/** Couleur d'un tronçon, côté TypeScript (légende, tests). */
export function coverageColor(passages: number): string {
  let color: string = COVERAGE_LEVELS[0].color;
  for (const level of COVERAGE_LEVELS) {
    if (passages >= level.minPassages) color = level.color;
  }
  return color;
}

/**
 * Même règle, exprimée pour MapLibre : la couleur est calculée par le moteur
 * de rendu à partir de la propriété `passages` de chaque tronçon.
 */
export function coverageColorExpression(): ExpressionSpecification {
  const [first, ...rest] = COVERAGE_LEVELS;
  return [
    'step',
    ['coalesce', ['get', 'passages'], 0],
    first.color,
    ...rest.flatMap((l) => [l.minPassages, l.color]),
  ] as ExpressionSpecification;
}
