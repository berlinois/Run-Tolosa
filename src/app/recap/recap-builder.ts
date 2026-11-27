import type { TrackPoint, Walk } from '../tracking/model';
import { computeStreetCoverage, type RawCoverage } from '../streets/street-coverage';
import type { StreetIndex } from '../streets/street-index';
import type { Streets } from '../streets/streets';
import { pickFunFact, pickRecord, type FunContext } from './fun-facts';
import type { WalkRecap } from './recap.model';

export interface RecapInputs {
  walk: Walk;
  points: readonly TrackPoint[];
  before: RawCoverage;
  after: RawCoverage;
  streets: Streets;
  index: StreetIndex;
  /** Tronçon → petit quartier. */
  quartierOf: Map<string, string>;
  /** Toutes les marches terminées (pour les cumuls et les records). */
  walks: readonly Walk[];
  /** Récaps déjà calculés, du plus ancien au plus récent. */
  history: readonly WalkRecap[];
}

/** Part de Toulouse parcourue : mètres faits (meilleure marche) des rues colorées / longueur totale du réseau. */
function toulouseShare(raw: RawCoverage, streets: Streets, index: StreetIndex, totalM: number): number {
  let done = 0;
  for (const cov of computeStreetCoverage(raw, index, streets).values()) if (cov.status) done += cov.bestM;
  return totalM > 0 ? done / totalM : 0;
}

/** Trace allégée (≤ 160 points précis) pour le dessin du récap. */
function simplify(points: readonly TrackPoint[]): [number, number][] {
  const good = points.filter((p) => p.acc <= 25);
  const step = Math.max(1, Math.ceil(good.length / 160));
  const out = good.filter((_, i) => i % step === 0).map((p) => [p.lon, p.lat] as [number, number]);
  const last = good.at(-1);
  if (last && out.at(-1) !== undefined && (out.at(-1)![0] !== last.lon || out.at(-1)![1] !== last.lat)) out.push([last.lon, last.lat]);
  return out;
}

export function buildRecap(i: RecapInputs): WalkRecap {
  const { walk, streets, index } = i;
  const before = computeStreetCoverage(i.before, index, streets);
  const after = computeStreetCoverage(i.after, index, streets);

  let noneToPink = 0, noneToGold = 0, pinkToGold = 0, goldTotal = 0;
  const newGoldLengths: { name: string; lengthM: number }[] = [];
  for (const [street, cov] of after) {
    if (cov.status === 'gold') goldTotal++;
    const was = before.get(street)?.status ?? null;
    const name = index.streets[street].name;
    if (!was && cov.status === 'pink') noneToPink++;
    if (!was && cov.status === 'gold') noneToGold++;
    if (was === 'pink' && cov.status === 'gold') pinkToGold++;
    if (cov.status === 'gold' && was !== 'gold' && name) newGoldLengths.push({ name, lengthM: index.streets[street].lengthM });
  }

  // Rues et quartiers touchés par cette marche (au moins 30 % d'un tronçon : on ignore les rues seulement croisées).
  const streetNames = new Set<string>();
  const quartierHits = new Map<string, number>();
  for (const [segId, walks] of Object.entries(i.after.segments)) {
    const r = walks[walk.id]?.[0];
    if (r === undefined || r < 0.3) continue;
    const name = streets.byId.get(segId)?.name;
    if (name) streetNames.add(name);
    const q = i.quartierOf.get(segId);
    if (q) quartierHits.set(q, (quartierHits.get(q) ?? 0) + 1);
  }
  const quartiersBefore = new Set<string>();
  for (const segId of Object.keys(i.before.segments)) {
    const q = i.quartierOf.get(segId);
    if (q) quartiersBefore.add(q);
  }
  const quartiers = [...quartierHits].sort((a, b) => b[1] - a[1]).map(([q]) => q);
  const newQuartiers = quartiers.filter((q) => !quartiersBefore.has(q));

  // Rues restant à valider dans le quartier principal du jour.
  let mainQuartier: FunContext['mainQuartier'] = null;
  if (quartiers[0]) {
    const inQuartier = new Set<number>();
    for (const s of streets.segments) {
      if (i.quartierOf.get(s.id) !== quartiers[0] || !s.name) continue;
      const st = index.streetOf.get(s.id);
      if (st !== undefined) inQuartier.add(st);
    }
    let remaining = 0;
    for (const st of inQuartier) if (after.get(st)?.status !== 'gold') remaining++;
    mainQuartier = { name: quartiers[0], remaining };
  }

  const totalM = streets.segments.reduce((s, x) => s + x.lengthM, 0);
  const toulouseBefore = toulouseShare(i.before, streets, index, totalM);
  const toulouseAfter = toulouseShare(i.after, streets, index, totalM);

  const endedAt = walk.endedAt ?? walk.startedAt;
  const durationMs = endedAt - walk.startedAt;
  const finished = i.walks.filter((w) => w.status !== 'recording' && w.startedAt <= walk.startedAt);
  const recapOf = new Map(i.history.map((r) => [r.walkId, r]));
  const previous = finished
    .filter((w) => w.id !== walk.id)
    .map((w) => {
      const r = recapOf.get(w.id);
      return {
        distanceM: w.distanceM,
        startedAt: w.startedAt,
        goldGained: r ? r.noneToGold + r.pinkToGold : 0,
        streetsGained: r ? r.noneToPink + r.noneToGold + r.pinkToGold : 0,
      };
    });

  const fc: FunContext = {
    walkId: walk.id,
    startedAt: walk.startedAt,
    durationMs,
    distanceM: walk.distanceM,
    streetNames: [...streetNames],
    newGoldLengths,
    toulouseAfter,
    goldStreetsTotal: goldTotal,
    mainQuartier,
    totalDistanceM: finished.reduce((s, w) => s + w.distanceM, 0),
    totalDurationMs: finished.reduce((s, w) => s + ((w.endedAt ?? w.startedAt) - w.startedAt), 0),
    walkCount: finished.length,
    previous,
    goldGained: noneToGold + pinkToGold,
    streetsGained: noneToPink + noneToGold + pinkToGold,
  };

  return {
    walkId: walk.id,
    startedAt: walk.startedAt,
    endedAt,
    durationMs,
    distanceM: walk.distanceM,
    noneToPink,
    noneToGold,
    pinkToGold,
    quartiers,
    newQuartiers,
    toulouseBefore,
    toulouseAfter,
    trace: simplify(i.points),
    record: pickRecord(fc),
    fun: pickFunFact(fc, i.history),
    shown: false,
  };
}
