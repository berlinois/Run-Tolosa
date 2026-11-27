import { Injectable, computed, inject, signal } from '@angular/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { FeatureCollection, LineString } from 'geojson';
import type { Walk } from '../tracking/model';
import { Tracking } from '../tracking/tracking.plugin';
import { buildRecap } from '../recap/recap-builder';
import { RecapStore } from '../recap/recap.store';
import { MATCHER_ID, matchWalk } from './matcher';
import { computeStreetCoverage, type RawCoverage, type StreetCoverage } from './street-coverage';
import { buildStreetIndex, type StreetIndex } from './street-index';
import { parseStreets, type Streets, type StreetsFile } from './streets';

/** coverage.json : données DÉRIVÉES des traces, recalculables à tout moment. */
interface CoverageFile extends RawCoverage {
  /** Algo + version des rues : s'il change, tout est recalculé depuis les traces. */
  processedWith: string;
  /** Marches déjà comptées (source de vérité pour ne pas compter deux fois). */
  walkIds: string[];
}

const COVERAGE_PATH = 'coverage.json';

/** Tout ce qu'il faut pour afficher et interroger la couverture. */
export interface CoverageContext {
  streets: Streets;
  index: StreetIndex;
  raw: RawCoverage;
  /** Couverture par rue (indice de rue → couverture). */
  byStreet: Map<number, StreetCoverage>;
}

@Injectable({ providedIn: 'root' })
export class CoverageStore {
  private streetsPromise?: Promise<Streets>;
  private readonly streets = signal<Streets | null>(null);
  private readonly file = signal<CoverageFile | null>(null);
  private running: Promise<void> = Promise.resolve();
  private readonly recaps = inject(RecapStore);
  private quartierOf?: Promise<Map<string, string>>;

  readonly error = signal<string | null>(null);

  private readonly index = computed(() => {
    const streets = this.streets();
    return streets ? buildStreetIndex(streets) : null;
  });

  /** Couverture complète, recalculée quand les marches ou les rues changent. */
  readonly context = computed<CoverageContext | null>(() => {
    const streets = this.streets(), index = this.index(), raw = this.file();
    if (!streets || !index || !raw) return null;
    return { streets, index, raw, byStreet: computeStreetCoverage(raw, index, streets) };
  });

  /** Tronçons des rues roses ou dorées, colorés selon le statut de LEUR RUE. */
  readonly coveredLines = computed<FeatureCollection<LineString>>(() => {
    const ctx = this.context();
    const features: FeatureCollection<LineString>['features'] = [];
    for (const cov of ctx?.byStreet.values() ?? []) {
      if (!cov.status) continue;
      for (const id of ctx!.index.streets[cov.street].segmentIds) {
        const s = ctx!.streets.byId.get(id);
        if (s) features.push({ type: 'Feature', properties: { id, status: cov.status }, geometry: { type: 'LineString', coordinates: s.coords } });
      }
    }
    return { type: 'FeatureCollection', features };
  });

  readonly stats = computed(() => {
    const out = { gold: 0, pink: 0, goldKm: 0, pinkKm: 0 };
    for (const cov of this.context()?.byStreet.values() ?? []) {
      if (cov.status === 'gold') { out.gold++; out.goldKm += cov.lengthM / 1000; }
      else if (cov.status === 'pink') { out.pink++; out.pinkKm += cov.lengthM / 1000; }
    }
    return out;
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
      cov = { processedWith, walkIds: [], walkDates: {}, segments: {} }; // algo ou rues changés : on repart des traces
    }
    this.file.set(cov);

    const todo = walks
      .filter((w) => w.status !== 'recording' && !cov!.walkIds.includes(w.id))
      .sort((a, b) => a.startedAt - b.startedAt);
    if (todo.length === 0) return;

    for (const walk of todo) {
      const { points } = await Tracking.getTrack({ walkId: walk.id });
      const at = walk.endedAt ?? walk.startedAt;
      const before = cov;
      const segments: RawCoverage['segments'] = { ...cov.segments };
      for (const { id, ratio, mask } of matchWalk(points, streets.segments)) {
        segments[id] = { ...(segments[id] ?? {}), [walk.id]: [ratio, mask] };
      }
      cov = { processedWith, walkIds: [...cov.walkIds, walk.id], walkDates: { ...cov.walkDates, [walk.id]: at }, segments };
      // Récap de fin de marche : seulement pour une marche qui vient de se terminer
      // (pas pour les anciennes marches recalculées), et une seule fois.
      if (Date.now() - at < 24 * 3_600_000 && !(await this.recaps.has(walk.id))) {
        const index = this.index();
        if (index) {
          try {
            await this.recaps.add(buildRecap({
              walk, points, before, after: cov, streets, index,
              quartierOf: await this.loadQuartiers(),
              walks, history: await this.recaps.history(),
            }));
          } catch (e) {
            console.warn('Récap impossible', e);
          }
        }
      }
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

  /** Tronçon → petit quartier (pour les quartiers traversés du récap). */
  private loadQuartiers(): Promise<Map<string, string>> {
    this.quartierOf ??= fetch('streets/petits-quartiers-troncons.json')
      .then((r) => (r.ok ? r.json() : { quartiers: {} }))
      .then((f: { quartiers: Record<string, string[]> }) => {
        const m = new Map<string, string>();
        for (const [q, ids] of Object.entries(f.quartiers ?? {})) for (const id of ids) m.set(id, q);
        return m;
      })
      .catch(() => new Map());
    return this.quartierOf;
  }

  private loadStreets(): Promise<Streets> {
    this.streetsPromise ??= fetch('streets/toulouse.json')
      .then((r) => {
        if (!r.ok) throw new Error(`rues introuvables (HTTP ${r.status})`);
        return r.json() as Promise<StreetsFile>;
      })
      .then((f) => {
        const streets = parseStreets(f);
        this.streets.set(streets);
        return streets;
      });
    return this.streetsPromise;
  }

  private async readFile(): Promise<CoverageFile | null> {
    try {
      const { data } = await Filesystem.readFile({ path: COVERAGE_PATH, directory: Directory.Data, encoding: Encoding.UTF8 });
      const f = JSON.parse(data as string) as CoverageFile;
      return f.walkDates ? f : null; // ancien format : on recalcule
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
