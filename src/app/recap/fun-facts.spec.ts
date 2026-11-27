import { pickFunFact, pickRecord, type FunContext } from './fun-facts';
import type { FunFact } from './recap.model';

const ctx = (over: Partial<FunContext> = {}): FunContext => ({
  walkId: 'w', startedAt: new Date(2026, 10, 27, 7, 30).getTime(), durationMs: 42 * 60_000, distanceM: 3400,
  streetNames: ['Rue de la Providence', 'Rue Jonquières', 'Avenue Camille Pujol', 'Rue du Docteur-Paul-Pujol-Guilhem'],
  newGoldLengths: [{ name: 'Rue du Lys', lengthM: 139 }, { name: 'Rue de la Providence', lengthM: 856 }],
  toulouseAfter: 0.0231, goldStreetsTotal: 23, mainQuartier: { name: 'Guilheméry', remaining: 31 },
  totalDistanceM: 18_000, totalDurationMs: 4 * 3_600_000, walkCount: 6,
  previous: [{ distanceM: 2000, startedAt: new Date(2026, 10, 26, 7, 0).getTime(), goldGained: 1, streetsGained: 4 }],
  goldGained: 3, streetsGained: 9, ...over,
});

describe('pickFunFact', () => {
  it('ne répète jamais une stat avant d\'avoir fait le tour du catalogue', () => {
    const history: { fun: FunFact }[] = [];
    for (let i = 0; i < 60; i++) {
      const fun = pickFunFact(ctx({ walkId: `w${i}` }), history);
      history.push({ fun });
    }
    const ids = history.map((h) => h.fun.id);
    const roundSize = new Set(ids).size;
    expect(roundSize).toBeGreaterThan(15);
    // Dans n'importe quelle fenêtre de la taille du catalogue, aucune répétition.
    for (let i = 0; i + roundSize <= ids.length; i++) {
      expect(new Set(ids.slice(i, i + roundSize)).size).toBe(roundSize);
    }
  });

  it('tire toujours la même stat pour la même marche (tirage stable)', () => {
    expect(pickFunFact(ctx({ walkId: 'x' }), []).id).toBe(pickFunFact(ctx({ walkId: 'x' }), []).id);
  });

  it('a toujours quelque chose à dire, même pour une toute petite marche', () => {
    const f = pickFunFact(ctx({ distanceM: 50, durationMs: 60_000, streetNames: [], newGoldLengths: [], goldStreetsTotal: 0, toulouseAfter: 0, mainQuartier: null, walkCount: 1 }), []);
    expect(f.text.length).toBeGreaterThan(5);
  });
});

describe('pickRecord', () => {
  it('première marche, puis plus longue marche', () => {
    expect(pickRecord(ctx({ previous: [] }))?.id).toBe('record-first');
    expect(pickRecord(ctx())?.id).toBe('record-longest'); // 3,4 km > 2 km
  });

  it('record de rues dorées quand ce n\'est pas la plus longue', () => {
    expect(pickRecord(ctx({ distanceM: 1500 }))?.id).toBe('record-gold');
  });

  it('pas de record : rien', () => {
    expect(pickRecord(ctx({ distanceM: 1500, goldGained: 1, streetsGained: 2 }))).toBeNull();
  });
});
