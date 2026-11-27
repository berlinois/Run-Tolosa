import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { WalkRecap } from './recap.model';

/** Récapitulatif de fin de marche (style « trophée »). */
@Component({
  selector: 'app-recap-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = recap();
    <div class="backdrop" (click)="closed.emit()"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Récapitulatif de la marche">
      <div class="hero">
        <div class="t">MARCHE TERMINÉE</div>
        <div class="big">{{ duration() }} · {{ distance() }}</div>
        @if (r.quartiers.length) {
          <div class="sub">{{ r.quartiers.slice(0, 3).join(' → ') }}</div>
        }
        <svg class="walk" viewBox="0 0 360 54" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <path [attr.d]="tracePath()" stroke="#FFD66B" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          @if (traceEnd(); as e) { <circle [attr.cx]="e[0]" [attr.cy]="e[1]" r="3.2" fill="#FFD66B" /> }
        </svg>
      </div>

      <div class="tiles">
        <div class="tile pink">
          <div class="ico"><span class="seg none"></span>›<span class="seg rose"></span></div>
          <div class="n">+{{ r.noneToPink }}</div>
          <div class="l">{{ r.noneToPink > 1 ? 'nouvelles rues' : 'nouvelle rue' }}<br />parcourue{{ r.noneToPink > 1 ? 's' : '' }}</div>
        </div>
        <div class="tile gold">
          <div class="ico"><span class="seg none"></span>›<span class="seg or"></span></div>
          <div class="n">+{{ r.noneToGold }}</div>
          <div class="l">{{ r.noneToGold > 1 ? 'rues validées' : 'rue validée' }}<br />du premier coup</div>
        </div>
        <div class="tile up">
          <div class="ico"><span class="seg rose"></span>›<span class="seg or"></span></div>
          <div class="n">+{{ r.pinkToGold }}</div>
          <div class="l">{{ r.pinkToGold > 1 ? 'rues passées' : 'rue passée' }}<br />du rose à l'or</div>
        </div>
      </div>

      @if (r.record; as rec) {
        <div class="fact record"><span class="emo">{{ rec.icon }}</span><span><b>Record !</b> {{ rec.text }}</span></div>
      }
      <div class="fact fun"><span class="emo">{{ r.fun.icon }}</span><span>{{ r.fun.text }}</span></div>

      <div class="chips">
        @for (q of r.newQuartiers.slice(0, 2); track q) {
          <span class="chip">📍 Nouveau quartier : {{ q }}</span>
        }
        <span class="chip">📈 +{{ pct(r.toulouseAfter - r.toulouseBefore) }} % de Toulouse <small>(total {{ pct(r.toulouseAfter) }} %)</small></span>
        @if (speed(); as v) { <span class="chip">⚡ {{ v }} km/h</span> }
      </div>

      <div class="foot">
        <button type="button" class="btn" (click)="showOnMap.emit()">Voir sur la carte</button>
      </div>
    </div>
  `,
  styles: `
    .backdrop { position: fixed; inset: 0; z-index: 30; background: #1b0a10a6; }
    .sheet {
      position: fixed; z-index: 31; left: 14px; right: 14px; top: 50%; transform: translateY(-50%);
      max-width: 440px; margin: 0 auto; max-height: calc(100dvh - 40px); overflow-y: auto;
      background: #fff; color: #263238; border-radius: 22px; box-shadow: 0 10px 30px #0006;
      animation: pop .35s cubic-bezier(.2,.9,.3,1.2) both;
    }
    @keyframes pop { from { opacity: 0; transform: translateY(-46%) scale(.96); } }
    .hero { position: relative; padding: 20px 16px 6px; text-align: center; color: #fff;
      background: radial-gradient(circle at 50% 25%, #C9586D, #6E2333); }
    .t { font-size: 12px; letter-spacing: .18em; opacity: .85; }
    .big { font-size: 30px; font-weight: 800; margin-top: 4px; }
    .sub { font-size: 13px; opacity: .9; margin-top: 2px; }
    .walk { display: block; width: 100%; height: 54px; margin-top: 4px; }
    .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 14px 14px 6px; }
    .tile { border-radius: 14px; padding: 10px 4px 9px; text-align: center; }
    .tile .n { font-size: 26px; font-weight: 800; line-height: 1.1; }
    .tile .l { font-size: 11px; line-height: 1.25; margin-top: 3px; }
    .tile .ico { display: flex; justify-content: center; align-items: center; gap: 3px; height: 18px; margin-bottom: 3px; font-size: 12px; }
    .pink { background: #fde7ef; color: #a3305a; } .gold { background: #fff4cf; color: #7a5600; }
    .up { background: linear-gradient(135deg, #fde7ef, #fff4cf); color: #6d3b12; }
    .seg { display: inline-block; width: 16px; height: 6px; border-radius: 3px; }
    .seg.none { background: #d5d8dc; } .seg.rose { background: #EC6A9C; } .seg.or { background: #F2B705; }
    .fact { display: flex; gap: 10px; align-items: flex-start; margin: 6px 14px 0; padding: 10px 12px; border-radius: 14px; font-size: 14px; line-height: 1.35; }
    .fact .emo { font-size: 20px; line-height: 1; }
    .record { background: linear-gradient(135deg, #FFF1C2, #FFD66B); color: #4a3300; }
    .fun { background: #f4f1fb; color: #3b2a5e; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 14px 12px; }
    .chip { font-size: 12.5px; background: #f4f5f7; border-radius: 20px; padding: 6px 10px; }
    .chip small { color: #78909c; }
    .foot { padding: 0 14px 14px; }
    .btn { width: 100%; border: 0; border-radius: 16px; padding: 14px; font-size: 16px; font-weight: 700; background: #B8505E; color: #fff; }
  `,
})
export class RecapCard {
  readonly recap = input.required<WalkRecap>();
  readonly closed = output<void>();
  readonly showOnMap = output<void>();

  /** Trace de la marche ramenée dans le bandeau (360 × 54), proportions conservées. */
  private readonly projected = computed(() => {
    const pts = this.recap().trace;
    if (pts.length < 2) return [] as [number, number][];
    const k = Math.cos((43.6 * Math.PI) / 180);
    const xs = pts.map((p) => p[0] * k), ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const s = Math.min(340 / Math.max(x1 - x0, 1e-9), 46 / Math.max(y1 - y0, 1e-9));
    const ox = (360 - (x1 - x0) * s) / 2, oy = (54 - (y1 - y0) * s) / 2;
    return pts.map((p, i) => [ox + (xs[i] - x0) * s, oy + (y1 - ys[i]) * s] as [number, number]);
  });
  protected readonly tracePath = computed(() => {
    const p = this.projected();
    return p.length ? 'M' + p.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') : '';
  });
  protected readonly traceEnd = computed(() => this.projected().at(-1) ?? null);

  protected duration(): string {
    const min = Math.round(this.recap().durationMs / 60_000);
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
  }
  protected distance(): string {
    const m = this.recap().distanceM;
    return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  }
  protected speed(): string | null {
    const r = this.recap();
    if (r.durationMs < 60_000 || r.distanceM < 100) return null;
    return ((r.distanceM / 1000) / (r.durationMs / 3_600_000)).toFixed(1).replace('.', ',');
  }
  protected pct(v: number): string {
    const p = Math.max(0, v) * 100;
    return p < 0.01 && p > 0 ? '< 0,01' : p.toFixed(2).replace('.', ',');
  }
}
