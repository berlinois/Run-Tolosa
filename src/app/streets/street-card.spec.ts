import { TestBed } from '@angular/core/testing';
import { StreetCard } from './street-card';
import type { StreetSelection } from './street-selection';

const selection: StreetSelection = {
  name: 'Rue de la Providence', district: 'Bonhoure / Guilheméry', status: 'pink', segmentIds: ['a', 'b', 'c'],
  lengthM: 440, bestM: 240, segmentsDone: 2, passages: 3,
  lastAt: new Date(2026, 10, 26).getTime(),
  halo: { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: [] } },
  parts: { type: 'FeatureCollection', features: [] },
};

describe('StreetCard', () => {
  it('affiche les stats de la rue', async () => {
    const fixture = TestBed.createComponent(StreetCard);
    fixture.componentRef.setInput('selection', selection);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Rue de la Providence');
    expect(text).toContain('En cours');
    expect(text).toContain('55 %'); // 240 / 440
    expect(text).toContain('(240 m / 440 m)');
    expect(text).toContain('2 / 3');
    expect(text).toContain('26 nov. 2026');
  });
});
