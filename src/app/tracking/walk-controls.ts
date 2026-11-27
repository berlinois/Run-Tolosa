import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { formatDistance, formatDuration } from './track-geo';
import { TrackingStore } from './tracking.store';

@Component({
  selector: 'app-walk-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.available) {
      <div class="panel">
        @if (store.status().walk; as walk) {
          <div class="stats">
            <span class="dot"></span>
            <strong>{{ elapsed() }}</strong>
            <span>{{ distance(walk.distanceM) }}</span>
            <span class="muted">{{ walk.pointCount }} pts</span>
          </div>
          <button type="button" class="stop" (click)="confirmStop.set(true)" [disabled]="store.busy()">■ Arrêter</button>
        } @else {
          <button type="button" class="start" (click)="store.start()" [disabled]="store.busy()">
            ▶ Démarrer une marche
          </button>
          @if (store.walks().length; as n) {
            <div class="muted small">{{ n }} marche{{ n > 1 ? 's' : '' }} enregistrée{{ n > 1 ? 's' : '' }}</div>
          }
        }
        @if (store.error(); as err) {
          <div class="error">{{ err }}</div>
        }
      </div>

      @if (confirmStop() && store.status().walk; as walk) {
        <div class="backdrop" (click)="confirmStop.set(false)"></div>
        <div class="dialog confirm" role="alertdialog" aria-modal="true" aria-labelledby="stop-title">
          <div class="ring" aria-hidden="true">🚶</div>
          <h2 id="stop-title">Terminer la marche ?</h2>
          <p>Ta marche est enregistrée, tu peux encore continuer.</p>
          <div class="mini">
            <div><b>{{ elapsed() }}</b><span>durée</span></div>
            <div><b>{{ distance(walk.distanceM) }}</b><span>distance</span></div>
          </div>
          <div class="stack">
            <button type="button" class="green" (click)="stopConfirmed()" [disabled]="store.busy()">✓ Oui, arrêter la marche</button>
            <button type="button" class="ghost" (click)="confirmStop.set(false)">▶ Continuer à marcher</button>
          </div>
        </div>
      }

      @if (store.shortWalk(); as walk) {
        <div class="backdrop"></div>
        <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="short-title" aria-describedby="short-desc">
          <h2 id="short-title">Marche trop courte</h2>
          <p id="short-desc">
            Cette marche n'a duré que <strong>{{ duration(walk) }}</strong> ({{ distance(walk.distanceM) }}).
            Confirmez-vous sa suppression ? Elle sera effacée définitivement.
          </p>
          <div class="actions">
            <button type="button" class="keep" (click)="store.keepShortWalk()" [disabled]="store.busy()">
              Sauvegarder quand même
            </button>
            <button type="button" class="delete" (click)="store.deleteShortWalk()" [disabled]="store.busy()">
              Supprimer
            </button>
          </div>
        </div>
      }
    }
  `,
  styles: `
    .panel {
      position: absolute; z-index: 5; left: 12px; right: 84px;
      bottom: calc(env(safe-area-inset-bottom) + 20px);
      display: flex; flex-direction: column; gap: 6px;
    }
    button { border: 0; border-radius: 24px; padding: 13px 18px; font-size: 16px; font-weight: 600; color: #fff; box-shadow: 0 2px 6px #0004; }
    .start { background: #43a047; }
    .stop { background: #c62828; }
    .stats {
      display: flex; gap: 10px; align-items: center; padding: 8px 12px;
      background: #fffe; border-radius: 12px; box-shadow: 0 1px 4px #0003; font-size: 15px;
    }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: #e53935; animation: blink 1.2s infinite; }
    @keyframes blink { 50% { opacity: .3; } }
    .muted { color: #757575; }
    .small { font-size: 12px; padding-left: 8px; text-shadow: 0 0 3px #fff; }
    .backdrop { position: fixed; inset: 0; z-index: 20; background: #0007; }
    .confirm { text-align: center; }
    .confirm .ring { width: 60px; height: 60px; margin: 0 auto 10px; border-radius: 50%; display: grid; place-items: center; background: #fdecef; font-size: 28px; }
    .confirm p { margin-top: 4px; }
    .mini { display: flex; justify-content: center; gap: 24px; margin: 14px 0 18px; }
    .mini b { display: block; font-size: 22px; } .mini span { font-size: 13px; color: #78909c; }
    .stack { display: flex; flex-direction: column; gap: 10px; }
    .stack button { width: 100%; padding: 14px; font-size: 16px; }
    .green { background: #2E9D57; box-shadow: 0 4px 12px #2e9d5755; }
    .ghost { background: #f1f3f4; color: #263238; box-shadow: none; }
    .dialog {
      position: fixed; z-index: 21; left: 16px; right: 16px; top: 50%; transform: translateY(-50%);
      max-width: 420px; margin: 0 auto; padding: 20px; border-radius: 16px;
      background: #fff; color: #212121; box-shadow: 0 8px 24px #0005;
    }
    .dialog h2 { margin: 0 0 8px; font-size: 18px; }
    .dialog p { margin: 0; color: #424242; font-size: 15px; line-height: 1.4; }
    .actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
    .actions button { padding: 10px 16px; font-size: 15px; box-shadow: none; }
    .keep { background: transparent; color: #B8505E; }
    .delete { background: #c62828; }
    .error { padding: 8px 10px; background: #000c; color: #fff; border-radius: 8px; font-size: 13px; }
  `,
})
export class WalkControls {
  protected readonly store = inject(TrackingStore);
  private readonly now = signal(Date.now());

  protected readonly elapsed = computed(() => {
    const walk = this.store.status().walk;
    return walk ? formatDuration(this.now() - walk.startedAt) : '';
  });

  protected readonly distance = formatDistance;
  /** Popup « Terminer la marche ? » ouverte. */
  protected readonly confirmStop = signal(false);

  protected stopConfirmed(): void {
    this.confirmStop.set(false);
    void this.store.stop();
  }

  protected duration(walk: { startedAt: number; endedAt: number | null }): string {
    return formatDuration((walk.endedAt ?? Date.now()) - walk.startedAt);
  }

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
