import type { FunFact, WalkRecap } from './recap.model';

/** Tout ce qu'il faut savoir pour fabriquer les stats rigolotes d'une marche. */
export interface FunContext {
  walkId: string;
  startedAt: number;
  durationMs: number;
  distanceM: number;
  /** Rues touchées par la marche (noms), et longueurs des rues devenues dorées. */
  streetNames: string[];
  newGoldLengths: { name: string; lengthM: number }[];
  /** Progression : part de Toulouse après la marche, rues dorées au total. */
  toulouseAfter: number;
  goldStreetsTotal: number;
  /** Quartier principal du jour et nombre de rues qu'il y reste à faire (non dorées). */
  mainQuartier: { name: string; remaining: number } | null;
  /** Cumuls depuis la première marche (celle-ci comprise). */
  totalDistanceM: number;
  totalDurationMs: number;
  walkCount: number;
  /** Marches précédentes (pour les records). */
  previous: { distanceM: number; startedAt: number; goldGained: number; streetsGained: number }[];
  goldGained: number;
  streetsGained: number;
}

const nf = (v: number, d = 0) => v.toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d });
const km = (m: number) => nf(m / 1000, m < 10_000 ? 1 : 0);
const plural = (n: number, one: string, many: string) => (n >= 2 ? many : one);

type Candidate = Omit<FunFact, 'family'> & { family: FunFact['family'] };

/** Le catalogue : chaque entrée renvoie une stat, ou null si elle ne s'applique pas à cette marche. */
const CATALOG: ((c: FunContext) => Candidate | null)[] = [
  // ---- 🏛️ Équivalences toulousaines
  (c) => c.distanceM >= 300 ? { id: 'pont-neuf', family: 'equivalence', icon: '🌉', text: `Tu as marché ${nf(c.distanceM / 220)} Pont-Neuf bout à bout.` } : null,
  (c) => c.distanceM >= 200 ? { id: 'sernin', family: 'equivalence', icon: '⛪', text: `${nf(c.distanceM / 67)} fois la hauteur du clocher de Saint-Sernin.` } : null,
  (c) => c.distanceM >= 800 ? { id: 'grand-rond', family: 'equivalence', icon: '⭕', text: `L'équivalent de ${nf(c.distanceM / 760, 1)} tours du Grand Rond.` } : null,
  (c) => c.distanceM >= 600 ? { id: 'jean-jaures', family: 'equivalence', icon: '🌳', text: `${nf(c.distanceM / 650, 1)} fois les allées Jean-Jaurès.` } : null,
  (c) => c.distanceM >= 1000 ? { id: 'chocolatine', family: 'equivalence', icon: '🥐', text: `Environ ${nf((c.distanceM / 1000) * 50 / 280, 1)} chocolatine brûlée. Méritée.` } : null,
  (c) => c.distanceM >= 300 ? { id: 'pas', family: 'equivalence', icon: '👣', text: `À peu près ${nf(Math.round(c.distanceM / 0.72 / 10) * 10)} pas dans les rues de Toulouse.` } : null,
  (c) => c.distanceM >= 300 ? { id: 'capitole', family: 'equivalence', icon: '🏛️', text: `${nf(c.distanceM / 135, 1)} fois la façade du Capitole.` } : null,
  (c) => c.distanceM >= 500 ? { id: 'rugby', family: 'equivalence', icon: '🏉', text: `${nf(c.distanceM / 100)} terrains d'Ernest-Wallon, en-but compris (ou presque).` } : null,
  (c) => c.durationMs >= 10 * 60_000 ? { id: 'nougaro', family: 'equivalence', icon: '🎶', text: `Le temps d'écouter ${nf(c.durationMs / 200_000)} fois « Ô Toulouse » de Nougaro.` } : null,
  (c) => c.durationMs >= 15 * 60_000 ? { id: 'match', family: 'equivalence', icon: '⏱️', text: `${nf((c.durationMs / (80 * 60_000)) * 100)} % d'un match de rugby, sans les arrêts de jeu.` } : null,
  (c) => c.distanceM >= 1500 ? { id: 'metro-a', family: 'equivalence', icon: '🚇', text: `${nf((c.distanceM / 12_500) * 100)} % de la ligne A du métro, à pied.` } : null,
  // ---- 🎯 Défis et progression
  (c) => {
    const pct = c.toulouseAfter * 100;
    const next = Math.floor(pct) + 1;
    const left = next - pct;
    return pct > 0 && left < 0.6 ? { id: 'next-percent', family: 'defi', icon: '🎯', text: `Encore ${nf(left, 2)} % et tu passes la barre des ${next} % de Toulouse.` } : null;
  },
  (c) => c.mainQuartier && c.mainQuartier.remaining > 0 && c.mainQuartier.remaining <= 60
    ? { id: 'finish-quartier', family: 'defi', icon: '🧩', text: `Il te reste ${c.mainQuartier.remaining} ${plural(c.mainQuartier.remaining, 'rue', 'rues')} à valider pour finir ${c.mainQuartier.name}.` } : null,
  (c) => {
    const next = Math.ceil((c.goldStreetsTotal + 1) / 25) * 25;
    const left = next - c.goldStreetsTotal;
    return c.goldStreetsTotal > 0 && left <= 8 ? { id: 'next-gold', family: 'defi', icon: '🥇', text: `Plus que ${left} ${plural(left, 'rue dorée', 'rues dorées')} avant la ${next}e.` } : null;
  },
  (c) => c.goldStreetsTotal > 0 ? { id: 'gold-total', family: 'defi', icon: '✨', text: `${c.goldStreetsTotal} ${plural(c.goldStreetsTotal, 'rue dorée', 'rues dorées')} au compteur. Toulouse en compte environ 3 500.` } : null,
  // ---- 🗺️ Cumuls depuis le début
  (c) => {
    const trips: [number, string][] = [[50_000, 'Toulouse → Montauban'], [77_000, 'Toulouse → Albi'], [95_000, 'Toulouse → Carcassonne'], [245_000, 'Toulouse → Bordeaux'], [680_000, 'Toulouse → Paris']];
    const t = trips.find(([d]) => c.totalDistanceM < d);
    return t && c.walkCount >= 2 ? { id: 'trip', family: 'cumul', icon: '🧭', text: `Depuis le début : ${km(c.totalDistanceM)} km, soit ${nf((c.totalDistanceM / t[0]) * 100)} % d'un ${t[1]} à pied.` } : null;
  },
  (c) => c.walkCount >= 2 ? { id: 'canal', family: 'cumul', icon: '🛶', text: `En cumulé, ${nf((c.totalDistanceM / 240_000) * 100, 1)} % de la longueur du canal du Midi.` } : null,
  (c) => c.walkCount >= 3 ? { id: 'hours', family: 'cumul', icon: '⌛', text: `${nf(c.totalDurationMs / 3_600_000, 1)} h de marche dans Toulouse en ${c.walkCount} sorties.` } : null,
  (c) => c.walkCount >= 2 ? { id: 'walk-count', family: 'cumul', icon: '📅', text: `C'était ta ${c.walkCount}e marche. Et ce n'est que le début.` } : null,
  // ---- 🔤 Clins d'œil aux rues du jour
  (c) => {
    const longest = [...c.streetNames].sort((a, b) => b.length - a.length)[0];
    return longest && longest.length >= 18 ? { id: 'long-name', family: 'rues', icon: '🔤', text: `Nom de rue le plus long du jour : ${longest}.` } : null;
  },
  (c) => {
    const g = [...c.newGoldLengths].sort((a, b) => a.lengthM - b.lengthM)[0];
    return g ? { id: 'short-gold', family: 'rues', icon: '📏', text: `Ta rue dorée la plus courte du jour : ${g.name}, ${nf(g.lengthM)} m.` } : null;
  },
  (c) => {
    const g = [...c.newGoldLengths].sort((a, b) => b.lengthM - a.lengthM)[0];
    return g && g.lengthM >= 150 ? { id: 'long-gold', family: 'rues', icon: '🏁', text: `Plus belle prise du jour : ${g.name}, ${nf(g.lengthM)} m validés d'un coup.` } : null;
  },
  (c) => {
    const kinds = new Map<string, number>();
    for (const n of new Set(c.streetNames)) {
      const k = n.split(' ')[0];
      if (['Rue', 'Avenue', 'Boulevard', 'Allée', 'Allées', 'Place', 'Impasse', 'Chemin', 'Quai'].includes(k)) kinds.set(k, (kinds.get(k) ?? 0) + 1);
    }
    const parts = [...kinds].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${n} ${k.toLowerCase()}${n > 1 && !k.endsWith('s') ? 's' : ''}`);
    return parts.length >= 2 ? { id: 'street-kinds', family: 'rues', icon: '🧭', text: `Au menu du jour : ${parts.join(', ')}.` } : null;
  },
];

/** Records personnels : renvoie le plus marquant, ou null. Toujours affiché en plus de la stat rigolote. */
export function pickRecord(c: FunContext): FunFact | null {
  const prev = c.previous;
  if (prev.length === 0) return { id: 'record-first', family: 'record', icon: '🎉', text: 'Ta toute première marche Run Tolosa !' };
  if (c.distanceM > Math.max(...prev.map((p) => p.distanceM)) && c.distanceM >= 1000) {
    return { id: 'record-longest', family: 'record', icon: '🏆', text: `Ta plus longue marche jusqu'ici : ${km(c.distanceM)} km.` };
  }
  if (c.goldGained >= 2 && c.goldGained > Math.max(0, ...prev.map((p) => p.goldGained))) {
    return { id: 'record-gold', family: 'record', icon: '🏆', text: `Record de rues dorées en une marche : ${c.goldGained} !` };
  }
  if (c.streetsGained >= 3 && c.streetsGained > Math.max(0, ...prev.map((p) => p.streetsGained))) {
    return { id: 'record-streets', family: 'record', icon: '🏆', text: `Record de rues ajoutées en une marche : ${c.streetsGained} !` };
  }
  const minutes = (t: number) => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); };
  if (prev.length >= 3 && minutes(c.startedAt) < Math.min(...prev.map((p) => minutes(p.startedAt)))) {
    const d = new Date(c.startedAt);
    return { id: 'record-earliest', family: 'record', icon: '🌅', text: `Ta sortie la plus matinale : départ à ${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}.` };
  }
  return null;
}

/** Petit hachage stable : le tirage d'une marche est toujours le même. */
function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/**
 * Tire une stat rigolote FORCÉMENT différente des précédentes : parmi celles qui
 * s'appliquent à cette marche, on écarte toutes celles déjà vues dans le tour en
 * cours (un tour = tout le catalogue applicable) ; à défaut, on écarte au moins
 * les 10 dernières, et jamais la même que la marche précédente.
 */
export function pickFunFact(c: FunContext, history: readonly Pick<WalkRecap, 'fun'>[]): FunFact {
  const candidates = CATALOG.map((f) => f(c)).filter((f): f is FunFact => f !== null);
  if (candidates.length === 0) {
    return { id: 'fallback', family: 'equivalence', icon: '🚶', text: `${km(c.distanceM)} km de plus dans les rues de Toulouse.` };
  }
  const past = history.map((h) => h.fun.id); // du plus ancien au plus récent
  const ids = new Set(candidates.map((f) => f.id));
  // Début du tour en cours : on remonte tant que les stats vues ne couvrent pas tout le catalogue applicable.
  const seenThisRound = new Set<string>();
  for (let i = past.length - 1; i >= 0; i--) {
    if (!ids.has(past[i])) continue;
    if (seenThisRound.has(past[i]) || seenThisRound.size === ids.size - 1) break;
    seenThisRound.add(past[i]);
  }
  let pool = candidates.filter((f) => !seenThisRound.has(f.id));
  if (pool.length === 0) {
    const recent = new Set(past.slice(-Math.min(10, candidates.length - 1)));
    pool = candidates.filter((f) => !recent.has(f.id));
  }
  if (pool.length === 0) pool = candidates.filter((f) => f.id !== past.at(-1));
  if (pool.length === 0) pool = candidates;
  return pool[hash(c.walkId) % pool.length];
}
