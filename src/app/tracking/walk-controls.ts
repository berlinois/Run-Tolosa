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
          <button type="button" class="stop" (click)="store.stop()" [disabled]="store.busy()">■ Arrêter</button>
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

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
