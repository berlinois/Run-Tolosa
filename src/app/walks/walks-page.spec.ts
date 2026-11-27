import { TestBed } from '@angular/core/testing';
import { RecapStore } from '../recap/recap.store';
import type { Walk } from '../tracking/model';
import { TrackingStore } from '../tracking/tracking.store';
import { WalksPage, isFalseStart } from './walks-page';
import { WalksUiService } from './walks-ui.service';

const walk = (id: string, start: Date, minutes: number, distanceM: number, pointCount = 500): Walk => ({
  id, startedAt: start.getTime(), endedAt: start.getTime() + minutes * 60_000, status: 'processed', distanceM, pointCount, processedWith: 'x',
});

describe('WalksPage', () => {
  it('repère les faux départs', () => {
    expect(isFalseStart(walk('a', new Date(), 0.02, 0, 1))).toBe(true);
    expect(isFalseStart(walk('b', new Date(), 42, 3400))).toBe(false);
  });

  it('liste les marches par mois, avec totaux et faux départs', async () => {
    TestBed.configureTestingModule({});
    const tracking = TestBed.inject(TrackingStore);
    tracking.walks.set([
      walk('w1', new Date(2026, 10, 28, 7, 12), 42, 3400),
      walk('w2', new Date(2026, 10, 26, 17, 51), 0.03, 0, 1),
      walk('w3', new Date(2026, 9, 30, 8, 0), 30, 2500),
    ]);
    const recaps = TestBed.inject(RecapStore);
    // Récap de w1 injecté directement (sans passer par le stockage).
    (recaps as unknown as { recaps: { set: (v: unknown) => void } }).recaps.set([{
      walkId: 'w1', startedAt: 0, endedAt: 0, durationMs: 0, distanceM: 0, noneToPink: 9, noneToGold: 4, pinkToGold: 2,
      quartiers: [], newQuartiers: [], toulouseBefore: 0, toulouseAfter: 0, trace: [], record: null,
      fun: { id: 'x', family: 'equivalence', icon: '🥐', text: 'x' }, shown: true,
    }]);
    TestBed.inject(WalksUiService).pageOpen.set(true);
    const fixture = TestBed.createComponent(WalksPage);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Mes marches');
    expect(text).toContain('5,9 km'); // total
    expect(text).toContain('15'); // rues gagnées : 9 + 4 + 2
    expect(text).toContain('NOVEMBRE 2026');
    expect(text).toContain('OCTOBRE 2026');
    expect(text).toContain('Sam. 28');
    expect(text).toContain('faux départ');
    expect(text).toContain('42 min');
    expect(text).toContain('3,4 km');
  });
});
