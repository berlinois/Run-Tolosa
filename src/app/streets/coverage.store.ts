import { Injectable, computed, signal } from '@angular/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { FeatureCollection, LineString } from 'geojson';
import type { Walk } from '../tracking/model';
import { Tracking } from '../tracking/tracking.plugin';
import { MATCHER_ID, PINK_MIN_RATIO, matchWalk, statusFor, type StreetStatus } from './matcher';
import { parseStreets, type Streets, type StreetsFile } from './streets';

export interface SegmentCoverage {
  /** Statut selon la meilleure marche. */
  status: StreetStatus;
  /** Meilleure couverture atteinte en une seule marche (0 à 1). */
  best: number;
  bestWalkId: string;
  /** Mètres parcourus lors de la meilleure marche (voir matcher.coveredParts). */
  mask: string;
  /** Couverture par marche (marches ayant fait au moins 30 % du tronçon). */
  walks: Record<string, number>;
  /** Marches ayant parcouru au moins 30 % du tronçon. */
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
          ? [{
              type: 'Feature' as const,
              properties: { id, status: cov.status, passages: cov.passages, best: cov.best },
              geometry: { type: 'LineString' as const, coordinates: s.coords },
            }]
          : [];
      }),
    };
  });

  readonly stats = computed(() => {
    const f = this.file();
    const streets = this.segmentsRef;
    const out = { gold: 0, pink: 0, goldKm: 0, pinkKm: 0 };
    if (!f || !streets) return out;
    for (const [id, cov] of Object.entries(f.segments)) {
      const km = (streets.byId.get(id)?.lengthM ?? 0) / 1000;
      if (cov.status === 'gold') { out.gold++; out.goldKm += km; } else { out.pink++; out.pinkKm += km; }
    }
    return out;
  });

  /** Couverture brute et référentiel, pour la sélection d'une rue. */
  readonly coverageData = computed(() => {
    const f = this.file();
    return f && this.segmentsRef ? { streets: this.segmentsRef, segments: f.segments } : null;
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
      for (const { id, ratio, mask } of matchWalk(points, streets.segments)) {
        const prev = segments[id];
        const isBest = !prev || ratio > prev.best;
        const best = isBest ? ratio : prev.best;
        const passage = ratio >= PINK_MIN_RATIO ? 1 : 0;
        segments[id] = {
          status: statusFor(best, streets.byId.get(id)?.lengthM ?? 0) ?? 'pink',
          best,
          bestWalkId: isBest ? walk.id : prev.bestWalkId,
          mask: isBest ? mask : prev.mask,
          walks: { ...(prev?.walks ?? {}), [walk.id]: ratio },
          passages: (prev?.passages ?? 0) + passage,
          firstAt: Math.min(prev?.firstAt ?? at, at),
          lastAt: Math.max(prev?.lastAt ?? at, at),
          lastWalkId: at >= (prev?.lastAt ?? 0) ? walk.id : prev.lastWalkId,
        };
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
