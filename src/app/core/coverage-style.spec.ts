import { coverageColor, coverageColorExpression, COVERAGE_LEVELS } from './coverage-style';

describe('coverage-style', () => {
  it('colore selon le nombre de passages', () => {
    expect(coverageColor(0)).toBe(COVERAGE_LEVELS[0].color);
    expect(coverageColor(1)).toBe(COVERAGE_LEVELS[1].color);
    expect(coverageColor(4)).toBe(COVERAGE_LEVELS[1].color);
    expect(coverageColor(5)).toBe(COVERAGE_LEVELS[2].color);
    expect(coverageColor(42)).toBe(COVERAGE_LEVELS[2].color);
  });

  it('produit une expression MapLibre "step" cohérente avec la palette', () => {
    expect(coverageColorExpression()).toEqual([
      'step',
      ['coalesce', ['get', 'passages'], 0],
      '#9e9e9e',
      1,
      '#43a047',
      5,
      '#1e88e5',
    ]);
  });
});
