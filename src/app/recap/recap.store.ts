import { Injectable, computed, signal } from '@angular/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { WalkRecap } from './recap.model';

const RECAPS_PATH = 'recaps.json';

/**
 * Récaps de fin de marche (recaps.json). Contrairement à coverage.json, ce fichier
 * n'est PAS recalculé : la stat rigolote tirée pour une marche reste la même, et
 * l'historique sert à ne jamais la répéter.
 */
@Injectable({ providedIn: 'root' })
export class RecapStore {
  private readonly recaps = signal<WalkRecap[]>([]);
  private loaded?: Promise<void>;

  /** Tous les récaps (signal, pour la liste des marches). */
  readonly all = this.recaps.asReadonly();

  /** Dernier récap pas encore affiché. */
  readonly pending = computed(() => [...this.recaps()].reverse().find((r) => !r.shown) ?? null);

  load(): Promise<void> {
    this.loaded ??= Filesystem.readFile({ path: RECAPS_PATH, directory: Directory.Data, encoding: Encoding.UTF8 })
      .then(({ data }) => this.recaps.set((JSON.parse(data as string) as { recaps: WalkRecap[] }).recaps ?? []))
      .catch(() => this.recaps.set([]));
    return this.loaded;
  }

  async history(): Promise<WalkRecap[]> {
    await this.load();
    return [...this.recaps()].sort((a, b) => a.startedAt - b.startedAt);
  }

  async has(walkId: string): Promise<boolean> {
    await this.load();
    return this.recaps().some((r) => r.walkId === walkId);
  }

  async add(recap: WalkRecap): Promise<void> {
    await this.load();
    this.recaps.update((list) => [...list.filter((r) => r.walkId !== recap.walkId), recap]);
    await this.save();
  }

  async markShown(walkId: string): Promise<void> {
    this.recaps.update((list) => list.map((r) => (r.walkId === walkId ? { ...r, shown: true } : r)));
    await this.save();
  }

  /** Marche supprimée : son récap disparaît aussi. */
  async remove(walkId: string): Promise<void> {
    await this.load();
    this.recaps.update((list) => list.filter((r) => r.walkId !== walkId));
    await this.save();
  }

  private async save(): Promise<void> {
    await Filesystem.writeFile({
      path: RECAPS_PATH,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      data: JSON.stringify({ recaps: this.recaps() }),
    }).catch(() => undefined);
  }
}
