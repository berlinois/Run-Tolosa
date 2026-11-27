import { Injectable, computed, inject, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { RecapStore } from '../recap/recap.store';
import { CoverageStore } from '../streets/coverage.store';
import type { TrackPoint, TrackingStatus, Walk } from './model';
import { isTooShort, linesCollection, trackToLine } from './track-geo';
import { Tracking } from './tracking.plugin';

/**
 * État des marches côté interface. La vérité est dans les fichiers écrits par
 * TrackingService.java : ce store les relit à l'ouverture et à chaque retour
 * dans l'appli, et écoute les points en direct quand l'appli est visible.
 */
@Injectable({ providedIn: 'root' })
export class TrackingStore {
  readonly available = Capacitor.isNativePlatform();

  readonly status = signal<TrackingStatus>({ recording: false, walk: null });
  readonly walks = signal<Walk[]>([]);
  readonly liveTrack = signal<TrackPoint[]>([]);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  private readonly coverage = inject(CoverageStore);
  private readonly recaps = inject(RecapStore);

  readonly liveLine = computed(() => linesCollection([trackToLine(this.liveTrack())]));

  private started = false;

  init(): void {
    if (!this.available || this.started) return;
    this.started = true;
    void Tracking.addListener('point', ({ point, walk }) => {
      this.liveTrack.update((pts) => [...pts, point]);
      this.status.set({ recording: true, walk });
    });
    void Tracking.addListener('state', () => void this.refresh());
    void App.addListener('resume', () => void this.refresh());
    void this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      const status = await Tracking.getStatus();
      this.status.set(status);
      const { walks } = await Tracking.listWalks();
      this.walks.set(walks);
      // Points reçus pendant que l'écran était éteint : on relit le fichier.
      this.liveTrack.set(status.walk ? (await Tracking.getTrack({ walkId: status.walk.id })).points : []);
      void this.coverage.sync(walks);
    } catch (e) {
      this.error.set(`Lecture des marches impossible : ${(e as Error).message}`);
    }
  }

  async start(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const perms = await Tracking.requestPermissions({ permissions: ['location', 'notifications'] });
      if (perms.location !== 'granted') {
        this.error.set('Il faut autoriser la localisation « précise » pour enregistrer une marche.');
        return;
      }
      this.liveTrack.set([]);
      await Tracking.start();
      await this.refresh();
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  /** Marche juste arrêtée et trop courte : en attente de la décision de l'utilisateur. */
  readonly shortWalk = signal<Walk | null>(null);

  async stop(): Promise<void> {
    const walk = this.status().walk;
    this.busy.set(true);
    try {
      await Tracking.stop();
      if (walk && isTooShort(walk.startedAt, Date.now())) {
        this.shortWalk.set({ ...walk, endedAt: Date.now(), status: 'finished' });
      }
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  /** « Sauvegarder quand même » : la marche est déjà enregistrée, on ferme juste la popup. */
  keepShortWalk(): void {
    this.shortWalk.set(null);
  }

  /** « Supprimer » : suppression définitive des fichiers de la marche. */
  async deleteShortWalk(): Promise<void> {
    const walk = this.shortWalk();
    if (!walk) return;
    this.busy.set(true);
    try {
      await Tracking.deleteWalk({ walkId: walk.id });
      await this.recaps.remove(walk.id);
      this.shortWalk.set(null);
      await this.coverage.reset(); // elle a peut-être déjà été comptée : on recalcule
      await this.refresh();
    } catch (e) {
      this.error.set((e as Error).message);
      this.shortWalk.set(null);
    } finally {
      this.busy.set(false);
    }
  }

}
