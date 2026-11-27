import { TestBed } from '@angular/core/testing';
import { DistrictCard } from './district-card';
import type { DistrictStats } from './district-stats';

const stats: DistrictStats = {
  name: 'Guilheméry', kind: 'small', totalM: 12_000, goldM: 1_500, doneM: 2_000,
  streets: 40, goldStreets: 6, pinkStreets: 3, segments: { gold: 20, pink: 5, none: 94 },
  walks: 4, lastAt: new Date(2026, 10, 27).getTime(),
};

describe('DistrictCard', () => {
  it('affiche les stats du quartier', async () => {
    const fixture = TestBed.createComponent(DistrictCard);
    fixture.componentRef.setInput('stats', stats);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Guilheméry');
    expect(text).toContain('13 % validé'); // 1,5 / 12 km
    expect(text).toContain('17 % parcouru'); // 2 / 12 km
    expect(text).toContain('12,0 km de voies');
    expect(text).toContain('6 / 40'); // rues dorées
    expect(text).toContain('9 / 40'); // rues parcourues
    expect(text).toContain('20 dorés · 5 roses · 94 non faits');
  });
});
