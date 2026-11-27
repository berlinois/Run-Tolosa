import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import type { WalkRecap } from '../recap/recap.model';
import { RecapStore } from '../recap/recap.store';
import { CoverageStore } from '../streets/coverage.store';
import type { Walk } from '../tracking/model';
import { Tracking } from '../tracking/tracking.plugin';
import { TrackingStore } from '../tracking/tracking.store';
import { WalksUiService } from './walks-ui.service';

interface Row {
  walk: Walk;
  recap: WalkRecap | null;
  durationMs: number;
  falseStart: boolean;
}

/** Faux départ : quelques secondes, ou presque aucun mouvement. */
export function isFalseStart(w: Walk): boolean {
  const d = (w.endedAt ?? w.startedAt) - w.startedAt;
  return d < 10_000 || (w.distanceM < 10 && w.pointCount < 5);
}

const MONTHS = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];
const DAYS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];

@Component({
  selector: 'app-walks-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ui.pageOpen()) {
      <div class="page" role="dialog" aria-modal="true" aria-labelledby="walks-title">
        <header>
          <button type="button" class="back" (click)="ui.pageOpen.set(false)" aria-label="Retour">←</button>
          <h2 id="walks-title">Mes marches</h2>
          <span class="count">{{ rows().length }}</span>
        </header>

        <div class="scroll">
          <div class="sum">
            <div><b>{{ km(totals().distanceM) }}</b><span>au total</span></div>
            <div><b>{{ hm(totals().durationMs) }}</b><span>de marche</span></div>
            <div><b>{{ totals().streets }}</b><span>rues gagnées</span></div>
          </div>
          @if (backfilling()) {
            <p class="info">⏳ Calcul des rues gagnées des anciennes marches…</p>
          }

          @if (rows().length === 0) {
            <p class="info">Pas encore de marche. Lance-toi !</p>
          } @else {
            <div class="tr th"><span>DATE</span><span>DURÉE</span><span>DISTANCE</span><span>RUES +</span><span></span></div>
            @for (group of groups(); track group.label) {
              <div class="month">{{ group.label }}</div>
              @for (row of group.rows; track row.walk.id) {
                <div class="tr" [class.false]="row.falseStart" (click)="openDetail(row)">
                  <div class="d">
                    <b>{{ day(row.walk.startedAt) }}</b>
                    <small>{{ time(row.walk.startedAt) }} @if (row.falseStart) { <span class="tag">faux départ</span> }</small>
                  </div>
                  <span>{{ dur(row.durationMs) }}</span>
                  <span>{{ dist(row.walk.distanceM) }}</span>
                  @if (row.recap; as r) {
                    <span class="gain"><i class="dot rose"></i>{{ r.noneToPink }} <i class="dot or"></i>{{ r.noneToGold + r.pinkToGold }}</span>
                  } @else {
                    <span class="muted">–</span>
                  }
                  <button type="button" class="trash" [class.red]="row.falseStart" (click)="$event.stopPropagation(); askDelete(row)" aria-label="Supprimer la marche">🗑</button>
                </div>
              }
            }
          }
        </div>
      </div>

      @if (detail(); as row) {
        <div class="backdrop" (click)="detail.set(null)"></div>
        <div class="sheet" role="dialog" aria-modal="true" aria-label="Détail de la marche">
          <div class="hero">
            <div class="t">{{ longDate(row.walk) }}</div>
            <div class="big">{{ dur(row.durationMs) }} · {{ dist(row.walk.distanceM) }}</div>
            @if (tracePath(); as d) {
              <svg viewBox="0 0 330 50" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                <path [attr.d]="d" stroke="#FFD66B" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            }
          </div>
          <div class="grid">
            <div><b>{{ row.walk.steps !== undefined ? row.walk.steps.toLocaleString('fr-FR') : '–' }}</b><span>pas</span></div>
            <div><b>{{ row.walk.ascentM !== undefined ? '+' + round(row.walk.ascentM) + ' m' : '–' }}</b><span>dénivelé</span></div>
            <div><b>{{ speed(row) }}</b><span>allure</span></div>
          </div>
          @if (row.recap; as r) {
            <div class="tiles">
              <div class="tile pink"><b>+{{ r.noneToPink }}</b><span>rien → rose</span></div>
              <div class="tile gold"><b>+{{ r.noneToGold }}</b><span>rien → doré</span></div>
              <div class="tile up"><b>+{{ r.pinkToGold }}</b><span>rose → doré</span></div>
            </div>
            <div class="facts">
              @if (r.quartiers.length) { <div>📍 {{ r.quartiers.slice(0, 4).join(' → ') }}</div> }
              @if (r.record; as rec) { <div>{{ rec.icon }} {{ rec.text }}</div> }
              <div>{{ r.fun.icon }} {{ r.fun.text }}</div>
            </div>
          }
          <div class="btns">
            <button type="button" class="btn main" (click)="showOnMap(row)">🗺 Voir sur la carte</button>
            <button type="button" class="btn del" (click)="askDelete(row)" aria-label="Supprimer la marche">🗑</button>
          </div>
        </div>
      }

      @if (toDelete(); as row) {
        <div class="backdrop top" (click)="toDelete.set(null)"></div>
        <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="del-title">
          <h2 id="del-title">{{ row.falseStart ? 'Supprimer ce faux départ ?' : 'Supprimer cette marche ?' }}</h2>
          <p>{{ longDate(row.walk) }} · {{ dur(row.durationMs) }} · {{ dist(row.walk.distanceM) }}</p>
          @if (!row.falseStart) {
            <div class="warn">⚠️ Suppression <b>définitive</b> de la trace. Les rues que seule cette marche avait coloriées perdront leur couleur (calcul refait automatiquement).</div>
          }
          <div class="btns">
            <button type="button" class="btn ghost" (click)="toDelete.set(null)">Annuler</button>
            <button type="button" class="btn danger" (click)="confirmDelete(row)" [disabled]="tracking.busy()">Supprimer</button>
          </div>
        </div>
      }
    }
  `,
  styles: `
    .page { position: fixed; inset: 0; z-index: 40; background: #fff; color: #263238; display: flex; flex-direction: column; animation: slide .25s ease-out; }
    @keyframes slide { from { transform: translateY(24px); opacity: 0; } }
    header { display: flex; align-items: center; gap: 10px; padding: calc(env(safe-area-inset-top) + 12px) 16px 12px; border-bottom: 1px solid #eceff1; }
    header h2 { margin: 0; flex: 1; font-size: 20px; }
    .back { border: 0; background: none; font-size: 22px; padding: 4px 8px 4px 0; color: #263238; }
    .count { font-size: 13px; color: #78909c; }
    .scroll { flex: 1; overflow-y: auto; padding-bottom: calc(env(safe-area-inset-bottom) + 20px); }
    .sum { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 12px 16px; }
    .sum div { background: #f7f3f4; border-radius: 12px; padding: 8px 10px; }
    .sum b { display: block; font-size: 18px; } .sum span { font-size: 11px; color: #78909c; }
    .info { margin: 6px 16px; font-size: 13px; color: #78909c; }
    .month { padding: 12px 16px 4px; font-size: 12px; font-weight: 700; letter-spacing: .08em; color: #78909c; }
    .tr { display: grid; grid-template-columns: 1.3fr .8fr .8fr .85fr 32px; align-items: center; gap: 6px; padding: 10px 16px; border-bottom: 1px solid #eceff1; font-size: 14px; }
    .th { font-size: 11px; color: #78909c; font-weight: 700; letter-spacing: .04em; padding: 8px 16px; }
    .d b { display: block; } .d small { color: #78909c; font-size: 12px; }
    .false { background: #fff8e6; }
    .tag { font-size: 10.5px; background: #ffe9b0; color: #7a5600; border-radius: 8px; padding: 1px 6px; }
    .gain { display: flex; gap: 4px; align-items: center; font-weight: 700; }
    .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .dot.rose { background: #EC6A9C; } .dot.or { background: #F2B705; }
    .muted { color: #b0bec5; }
    .trash { border: 0; background: none; font-size: 17px; color: #b0bec5; padding: 4px; }
    .trash.red { color: #c62828; }
    .backdrop { position: fixed; inset: 0; z-index: 41; background: #0007; }
    .backdrop.top { z-index: 43; }
    .sheet { position: fixed; z-index: 42; left: 0; right: 0; bottom: 0; max-height: 88dvh; overflow-y: auto; background: #fff; border-radius: 22px 22px 0 0;
      box-shadow: 0 -6px 24px #0004; padding: 16px 16px calc(env(safe-area-inset-bottom) + 18px); animation: up .25s ease-out; }
    @keyframes up { from { transform: translateY(40px); opacity: 0; } }
    .hero { border-radius: 16px; background: radial-gradient(circle at 50% 25%, #C9586D, #6E2333); color: #fff; padding: 12px 14px 4px; }
    .hero .t { font-size: 12px; opacity: .85; text-transform: uppercase; letter-spacing: .04em; }
    .hero .big { font-size: 22px; font-weight: 800; }
    .hero svg { display: block; width: 100%; height: 50px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 12px 0; }
    .grid div { background: #f4f5f7; border-radius: 12px; padding: 8px 10px; }
    .grid b { display: block; font-size: 16px; } .grid span { font-size: 11px; color: #78909c; }
    .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .tile { border-radius: 12px; padding: 8px; text-align: center; } .tile b { display: block; font-size: 20px; } .tile span { font-size: 10.5px; }
    .pink { background: #fde7ef; color: #a3305a; } .gold { background: #fff4cf; color: #7a5600; } .up { background: linear-gradient(135deg, #fde7ef, #fff4cf); color: #6d3b12; }
    .facts { margin-top: 10px; font-size: 13px; color: #455a64; display: flex; flex-direction: column; gap: 4px; }
    .btns { display: flex; gap: 8px; margin-top: 14px; }
    .btn { flex: 1; border: 0; border-radius: 14px; padding: 13px; font-size: 15px; font-weight: 700; }
    .main { background: #B8505E; color: #fff; } .del { flex: .4; background: #fdecec; color: #c62828; }
    .ghost { background: #f1f3f4; color: #263238; } .danger { background: #c62828; color: #fff; }
    .dialog { position: fixed; z-index: 44; left: 18px; right: 18px; top: 50%; transform: translateY(-50%); max-width: 420px; margin: 0 auto;
      background: #fff; border-radius: 20px; padding: 20px; box-shadow: 0 10px 30px #0006; }
    .dialog h2 { margin: 0 0 8px; font-size: 19px; } .dialog p { margin: 0; font-size: 14px; color: #455a64; }
    .warn { background: #fff4f4; border-radius: 12px; padding: 10px 12px; font-size: 13px; color: #8e2f40; margin-top: 10px; line-height: 1.4; }
  `,
})
export class WalksPage {
  protected readonly ui = inject(WalksUiService);
  protected readonly tracking = inject(TrackingStore);
  private readonly recaps = inject(RecapStore);
  private readonly coverage = inject(CoverageStore);

  protected readonly detail = signal<Row | null>(null);
  protected readonly toDelete = signal<Row | null>(null);
  protected readonly backfilling = signal(false);
  private readonly detailTrace = signal<[number, number][]>([]);
  private backfilled = false;

  protected readonly rows = computed<Row[]>(() => {
    const recapOf = new Map(this.recaps.all().map((r) => [r.walkId, r]));
    return this.tracking.walks()
      .filter((w) => w.status !== 'recording')
      .sort((a, b) => b.startedAt - a.startedAt)
      .map((walk) => ({
        walk,
        recap: recapOf.get(walk.id) ?? null,
        durationMs: (walk.endedAt ?? walk.startedAt) - walk.startedAt,
        falseStart: isFalseStart(walk),
      }));
  });

  protected readonly groups = computed(() => {
    const out: { label: string; rows: Row[] }[] = [];
    for (const row of this.rows()) {
      const d = new Date(row.walk.startedAt);
      const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      if (out.at(-1)?.label !== label) out.push({ label, rows: [] });
      out.at(-1)!.rows.push(row);
    }
    return out;
  });

  protected readonly totals = computed(() => {
    let distanceM = 0, durationMs = 0, streets = 0;
    for (const r of this.rows()) {
      distanceM += r.walk.distanceM;
      durationMs += r.durationMs;
      if (r.recap) streets += r.recap.noneToPink + r.recap.noneToGold + r.recap.pinkToGold;
    }
    return { distanceM, durationMs, streets };
  });

  protected readonly tracePath = computed(() => {
    const pts = this.detailTrace();
    if (pts.length < 2) return null;
    const k = Math.cos((43.6 * Math.PI) / 180);
    const xs = pts.map((p) => p[0] * k), ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const s = Math.min(310 / Math.max(x1 - x0, 1e-9), 42 / Math.max(y1 - y0, 1e-9));
    const ox = (330 - (x1 - x0) * s) / 2, oy = (50 - (y1 - y0) * s) / 2;
    return 'M' + pts.map((p, i) => `${(ox + (xs[i] - x0) * s).toFixed(1)} ${(oy + (y1 - ys[i]) * s).toFixed(1)}`).join('L');
  });

  constructor() {
    // À la première ouverture : récaps des anciennes marches, calculés une seule fois.
    effect(() => {
      if (!this.ui.pageOpen() || this.backfilled) return;
      this.backfilled = true;
      void this.recaps.load();
      this.backfilling.set(true);
      void this.coverage.backfillRecaps(this.tracking.walks()).finally(() => this.backfilling.set(false));
    });
  }

  protected async openDetail(row: Row): Promise<void> {
    this.detail.set(row);
    this.detailTrace.set(row.recap?.trace ?? []);
    if (!row.recap) {
      try {
        const { points } = await Tracking.getTrack({ walkId: row.walk.id });
        const good = points.filter((p) => p.acc <= 25);
        const step = Math.max(1, Math.ceil(good.length / 160));
        this.detailTrace.set(good.filter((_, i) => i % step === 0).map((p) => [p.lon, p.lat]));
      } catch {
        this.detailTrace.set([]);
      }
    }
  }

  protected showOnMap(row: Row): void {
    const trace = this.detailTrace();
    if (trace.length < 2) return;
    this.ui.focus.set({ walkId: row.walk.id, trace });
    this.detail.set(null);
    this.ui.pageOpen.set(false);
  }

  protected askDelete(row: Row): void {
    this.toDelete.set(row);
  }

  protected async confirmDelete(row: Row): Promise<void> {
    await this.tracking.deleteWalk(row.walk.id);
    this.toDelete.set(null);
    if (this.detail()?.walk.id === row.walk.id) this.detail.set(null);
    if (this.ui.focus()?.walkId === row.walk.id) this.ui.focus.set(null);
  }

  protected day(t: number): string {
    const d = new Date(t);
    return `${DAYS[d.getDay()]} ${d.getDate()}`;
  }
  protected time(t: number): string {
    const d = new Date(t);
    return `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
  }
  protected longDate(w: Walk): string {
    const d = new Date(w.startedAt);
    const end = new Date(w.endedAt ?? w.startedAt);
    return `${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })} · ${this.time(d.getTime())} → ${this.time(end.getTime())}`;
  }
  protected dur(ms: number): string {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s} s`;
    const min = Math.round(s / 60);
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
  }
  protected hm(ms: number): string {
    const min = Math.round(ms / 60_000);
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
  }
  protected dist(m: number): string {
    return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  }
  protected km(m: number): string {
    return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  }
  protected speed(row: Row): string {
    if (row.durationMs < 60_000 || row.walk.distanceM < 100) return '–';
    return `${((row.walk.distanceM / 1000) / (row.durationMs / 3_600_000)).toFixed(1).replace('.', ',')} km/h`;
  }
  protected round(v: number): number {
    return Math.round(v);
  }
}
