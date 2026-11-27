import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { DistrictStats } from './district-stats';

/** Carte compacte en bas de l'écran : stats du quartier dont on a tapé le nom. */
@Component({
  selector: 'app-district-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = stats();
    <div class="card" role="dialog" aria-label="Stats du quartier">
      <div class="head">
        <div class="title">
          <strong>{{ s.name }}</strong>
          <span class="badge">{{ s.kind === 'small' ? 'Quartier' : 'Grand quartier' }}</span>
        </div>
        <button type="button" class="close" (click)="closed.emit()" aria-label="Fermer">✕</button>
      </div>

      <div class="bar" aria-hidden="true">
        <span class="gold" [style.width.%]="pct(s.goldM)"></span>
        <span class="pink" [style.width.%]="pct(s.doneM - s.goldM)"></span>
      </div>
      <div class="bar-legend">
        <span><i class="dot gold"></i>{{ pct(s.goldM) }} % validé</span>
        <span><i class="dot pink"></i>{{ pct(s.doneM) }} % parcouru</span>
        <span class="muted">{{ km(s.totalM) }} de voies</span>
      </div>

      <dl>
        <div><dt>Rues dorées</dt><dd>{{ s.goldStreets }} <small>/ {{ s.streets }}</small></dd></div>
        <div><dt>Rues parcourues</dt><dd>{{ s.goldStreets + s.pinkStreets }} <small>/ {{ s.streets }}</small></dd></div>
        <div><dt>Km validés</dt><dd>{{ km(s.goldM) }}</dd></div>
        <div><dt>Km parcourus</dt><dd>{{ km(s.doneM) }}</dd></div>
        <div><dt>Marches</dt><dd>{{ s.walks }}</dd></div>
        <div><dt>Dernier passage</dt><dd>{{ s.lastAt ? date(s.lastAt) : '–' }}</dd></div>
        <div class="wide"><dt>Tronçons</dt><dd>{{ s.segments.gold }} dorés · {{ s.segments.pink }} roses · {{ s.segments.none }} non faits</dd></div>
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
    .badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px; background: #B8505E; color: #fff; }
    .close { border: 0; background: none; font-size: 16px; color: #78909c; padding: 2px 4px; }
    .bar { display: flex; height: 8px; margin-top: 10px; border-radius: 4px; overflow: hidden; background: #eceff1; }
    .bar .gold { background: #F2B705; }
    .bar .pink { background: #EC6A9C; }
    .bar-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 5px; font-size: 12px; }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: 0; }
    .dot.gold { background: #F2B705; }
    .dot.pink { background: #EC6A9C; }
    .muted { color: #78909c; }
    dl { margin: 10px 0 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
    dl .wide { grid-column: 1 / -1; }
    dt { font-size: 11px; color: #78909c; }
    dd { margin: 1px 0 0; font-size: 14px; font-weight: 600; }
    small { font-weight: 400; color: #78909c; }
  `,
})
export class DistrictCard {
  readonly stats = input.required<DistrictStats>();
  readonly closed = output<void>();

  protected pct(m: number): string {
    const total = this.stats().totalM;
    if (total <= 0) return '0';
    const v = (Math.max(0, m) / total) * 100;
    return v > 0 && v < 1 ? v.toFixed(1).replace('.', ',') : String(Math.round(v));
  }
  protected km(m: number): string {
    return m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`;
  }
  protected date(t: number): string {
    return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
