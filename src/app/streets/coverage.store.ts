import { Injectable, computed, signal } from '@angular/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { FeatureCollection, LineString } from 'geojson';
import type { Walk } from '../tracking/model';
import { Tracking } from '../tracking/tracking.plugin';
import { MATCHER_ID, matchWalk } from './matcher';
import { parseStreets, type Streets, type StreetsFile } from './streets';

export interface SegmentCoverage {
  passages: number;
  firstAt: number;
  lastAt: number;
  lastWalkId: string;
}

/** coverage.json : données DÉRIVÉES des traces, recalculables à tout moment. */
interface CoverageFile {
  /** Algo + version des rues : s'il change, tout est recalculé depuis les traces. */
  processedWith: string;
  /** Marches déjà comptées (source de vérité pour ne pas compter deux fois). */
  walkIds: string[];
  segments: Record<string, SegmentCoverage>;
}

const COVERAGE_PATH = 'coverage.json';

@Injectable({ providedIn: 'root' })
export class CoverageStore {
  private streets?: Promise<Streets>;
  private readonly file = signal<CoverageFile | null>(null);
  private segmentsRef?: Streets;
  private running: Promise<void> = Promise.resolve();

  readonly error = signal<string | null>(null);

  /** Tronçons validés, à dessiner en doré. */
  readonly coveredLines = computed<FeatureCollection<LineString>>(() => {
    const f = this.file();
    const streets = this.segmentsRef;
    if (!f || !streets) return { type: 'FeatureCollection', features: [] };
    return {
      type: 'FeatureCollection',
      features: Object.entries(f.segments).flatMap(([id, cov]) => {
        const s = streets.byId.get(id);
        return s
          ? [{ type: 'Feature' as const, properties: { id, passages: cov.passages }, geometry: { type: 'LineString' as const, coordinates: s.coords } }]
          : [];
      }),
    };
  });

  readonly stats = computed(() => {
    const f = this.file();
    const streets = this.segmentsRef;
    if (!f || !streets) return { segments: 0, km: 0 };
    let m = 0;
    for (const id of Object.keys(f.segments)) m += streets.byId.get(id)?.lengthM ?? 0;
    return { segments: Object.keys(f.segments).length, km: m / 1000 };
  });

  /** Prend en compte les marches terminées pas encore comptées (sérialisé). */
  sync(walks: Walk[]): Promise<void> {
    this.running = this.running.then(() => this.doSync(walks)).catch((e) => {
      this.error.set(`Calcul des rues impossible : ${(e as Error).message}`);
    });
    return this.running;
  }

  private async doSync(walks: Walk[]): Promise<void> {
    const streets = await this.loadStreets();
    const processedWith = `${MATCHER_ID}/${streets.version}`;
    let cov: CoverageFile | null = this.file() ?? (await this.readFile());
    if (!cov || cov.processedWith !== processedWith) {
      cov = { processedWith, walkIds: [], segments: {} }; // algo ou rues changés : on repart des traces
    }
    this.file.set(cov);

    const todo = walks
      .filter((w) => w.status !== 'recording' && !cov!.walkIds.includes(w.id))
      .sort((a, b) => a.startedAt - b.startedAt);
    if (todo.length === 0) return;

    for (const walk of todo) {
      const { points } = await Tracking.getTrack({ walkId: walk.id });
      const at = walk.endedAt ?? walk.startedAt;
      const segments: Record<string, SegmentCoverage> = { ...cov.segments };
      for (const id of matchWalk(points, streets.segments)) {
        const prev = segments[id];
        segments[id] = prev
          ? { passages: prev.passages + 1, firstAt: Math.min(prev.firstAt, at), lastAt: Math.max(prev.lastAt, at), lastWalkId: walk.id }
          : { passages: 1, firstAt: at, lastAt: at, lastWalkId: walk.id };
      }
      cov = { processedWith, walkIds: [...cov.walkIds, walk.id], segments };
      await this.writeFile(cov);
      this.file.set(cov);
      await Tracking.markProcessed({ walkId: walk.id, processedWith }).catch(() => undefined);
    }
  }

  /** Une marche supprimée ne doit plus compter : on recalcule tout. */
  async reset(): Promise<void> {
    await this.running;
    this.file.set(null);
    await Filesystem.deleteFile({ path: COVERAGE_PATH, directory: Directory.Data }).catch(() => undefined);
  }

  private loadStreets(): Promise<Streets> {
    this.streets ??= fetch('streets/toulouse.json')
      .then((r) => {
        if (!r.ok) throw new Error(`rues introuvables (HTTP ${r.status})`);
        return r.json() as Promise<StreetsFile>;
      })
      .then((f) => (this.segmentsRef = parseStreets(f)));
    return this.streets;
  }

  private async readFile(): Promise<CoverageFile | null> {
    try {
      const { data } = await Filesystem.readFile({ path: COVERAGE_PATH, directory: Directory.Data, encoding: Encoding.UTF8 });
      return JSON.parse(data as string) as CoverageFile;
    } catch {
      return null;
    }
  }

  private async writeFile(cov: CoverageFile): Promise<void> {
    await Filesystem.writeFile({
      path: COVERAGE_PATH,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      data: JSON.stringify(cov),
    });
  }
}
