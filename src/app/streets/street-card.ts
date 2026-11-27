import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { StreetSelection } from './street-selection';

/** Carte compacte en bas de l'écran : stats de la rue sélectionnée. */
@Component({
  selector: 'app-street-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = selection();
    <div class="card" role="dialog" aria-label="Détail de la rue">
      <div class="head">
        <div class="title">
          <strong>{{ s.name }}</strong>
          <span class="badge" [class.gold]="fullyGold()">{{ fullyGold() ? 'Validée' : 'En cours' }}</span>
        </div>
        <button type="button" class="close" (click)="closed.emit()" aria-label="Fermer">✕</button>
      </div>
      @if (s.district) {
        <div class="district">{{ s.district }}</div>
      }
      <dl>
        <div><dt>Parcourue</dt><dd>{{ pct(s.doneM / s.lengthM) }} <small>({{ m(s.doneM) }} / {{ m(s.lengthM) }})</small></dd></div>
        <div><dt>Meilleure marche</dt><dd>{{ pct(s.bestWalkRatio) }}</dd></div>
        <div><dt>Passages</dt><dd>{{ s.passages }}</dd></div>
        <div><dt>Dernier passage</dt><dd>{{ s.lastAt ? date(s.lastAt) : '–' }}</dd></div>
        <div class="wide"><dt>Tronçons</dt><dd>{{ s.gold }} doré{{ s.gold > 1 ? 's' : '' }} · {{ s.pink }} rose{{ s.pink > 1 ? 's' : '' }} · {{ s.none }} non fait{{ s.none > 1 ? 's' : '' }}</dd></div>
      </dl>
    </div>
  `,
  styles: `
    .card {
      position: absolute; z-index: 8; left: 12px; right: 84px;
      bottom: calc(env(safe-area-inset-bottom) + 92px);
      padding: 12px 14px; border-radius: 14px; background: #fff; color: #263238;
      box-shadow: 0 4px 14px #0003; border-left: 4px solid #1E88E5;
    }
    .head { display: flex; align-items: flex-start; gap: 8px; }
    .title { flex: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 16px; }
    .badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px; background: #EC6A9C; color: #fff; }
    .badge.gold { background: #F2B705; color: #3e2c00; }
    .close { border: 0; background: none; font-size: 16px; color: #78909c; padding: 2px 4px; }
    .district { margin-top: 2px; font-size: 11px; color: #78909c; }
    dl { margin: 10px 0 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
    dl .wide { grid-column: 1 / -1; }
    dt { font-size: 11px; color: #78909c; }
    dd { margin: 1px 0 0; font-size: 14px; font-weight: 600; }
    small { font-weight: 400; color: #78909c; }
  `,
})
export class StreetCard {
  readonly selection = input.required<StreetSelection>();
  readonly closed = output<void>();

  protected readonly fullyGold = computed(() => {
    const s = this.selection();
    return s.gold > 0 && s.pink === 0 && s.none === 0;
  });

  protected pct(r: number): string {
    return `${Math.round(Math.min(1, r) * 100)} %`;
  }
  protected m(v: number): string {
    return v >= 1000 ? `${(v / 1000).toFixed(2).replace('.', ',')} km` : `${Math.round(v)} m`;
  }
  protected date(t: number): string {
    return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
