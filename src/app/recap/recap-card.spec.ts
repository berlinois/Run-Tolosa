import { TestBed } from '@angular/core/testing';
import { RecapCard } from './recap-card';
import type { WalkRecap } from './recap.model';

const recap: WalkRecap = {
  walkId: 'w', startedAt: 0, endedAt: 42 * 60_000, durationMs: 42 * 60_000, distanceM: 3400,
  noneToPink: 9, noneToGold: 4, pinkToGold: 2, quartiers: ['Guilheméry', 'Bonhoure', 'Côte Pavée'], newQuartiers: ['Côte Pavée'],
  toulouseBefore: 0.0213, toulouseAfter: 0.0231, trace: [[1.46, 43.6], [1.45, 43.605], [1.442, 43.608]],
  record: { id: 'record-longest', family: 'record', icon: '🏆', text: 'Ta plus longue marche jusqu\'ici : 3,4 km.' },
  fun: { id: 'pont-neuf', family: 'equivalence', icon: '🌉', text: 'Tu as marché 15 Pont-Neuf bout à bout.' },
  shown: false,
};

describe('RecapCard', () => {
  it('affiche durée, distance, transitions, record, stat rigolote et progression', async () => {
    const fixture = TestBed.createComponent(RecapCard);
    fixture.componentRef.setInput('recap', recap);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('42 min · 3,4 km');
    expect(text).toContain('Guilheméry → Bonhoure → Côte Pavée');
    expect(text).toContain('+9');
    expect(text).toContain('+4');
    expect(text).toContain('+2');
    expect(text).toContain('Record !');
    expect(text).toContain('15 Pont-Neuf');
    expect(text).toContain('Nouveau quartier : Côte Pavée');
    expect(text).toContain('+0,18 % de Toulouse');
    expect(text).toContain('4,9 km/h');
  });
});
