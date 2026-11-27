import type { StyleSpecification } from 'maplibre-gl';

/** Fonds de carte gratuits, sans clé d'API. */
export type BasemapId = 'clair' | 'plan' | 'sombre' | 'ign' | 'photo';

export interface Basemap {
  id: BasemapId;
  label: string;
  /** Aperçu dans le sélecteur (dégradé CSS). */
  preview: string;
  style: string | StyleSpecification;
  /** Fond sombre ou photo : la position et les traits ont besoin de plus de contraste. */
  dark: boolean;
}

const OPENFREEMAP = 'https://tiles.openfreemap.org/styles';

/** Tuiles raster de la Géoplateforme IGN (WMTS, sans clé, Licence Ouverte Etalab). */
function ignRaster(layer: string, format: 'image/png' | 'image/jpeg', maxzoom: number): StyleSpecification {
  const url =
    'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
    `&LAYER=${layer}&STYLE=normal&TILEMATRIXSET=PM&FORMAT=${encodeURIComponent(format)}` +
    '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
  return {
    version: 8,
    sources: {
      ign: {
        type: 'raster',
        tiles: [url],
        tileSize: 256,
        maxzoom,
        attribution: '© <a href="https://www.ign.fr/">IGN</a> – Géoplateforme',
      },
    },
    layers: [{ id: 'ign', type: 'raster', source: 'ign' }],
  };
}

export const BASEMAPS: readonly Basemap[] = [
  { id: 'clair', label: 'Clair', preview: 'linear-gradient(135deg,#f5f5f3,#dcdcd8)', style: `${OPENFREEMAP}/positron`, dark: false },
  { id: 'plan', label: 'Plan', preview: 'linear-gradient(135deg,#f2efe9,#cfe3c4 55%,#a9d3f0)', style: `${OPENFREEMAP}/liberty`, dark: false },
  { id: 'sombre', label: 'Sombre', preview: 'linear-gradient(135deg,#3a3f47,#15181c)', style: `${OPENFREEMAP}/dark`, dark: true },
  { id: 'ign', label: 'Plan IGN', preview: 'linear-gradient(135deg,#fff7e6,#f6c9a0 50%,#b7d7a8)', style: ignRaster('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png', 19), dark: false },
  { id: 'photo', label: 'Photo aérienne', preview: 'linear-gradient(135deg,#6d7a52,#a9876a 50%,#3f4a3a)', style: ignRaster('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg', 19), dark: true },
];

export const DEFAULT_BASEMAP: BasemapId = 'clair';

const STORAGE_KEY = 'run-tolosa.basemap';

export function basemapById(id: string | null | undefined): Basemap {
  return BASEMAPS.find((b) => b.id === id) ?? BASEMAPS.find((b) => b.id === DEFAULT_BASEMAP)!;
}

/** Choix mémorisé sur le téléphone (simple confort : sans lui, on revient au fond clair). */
export function loadBasemapChoice(): BasemapId {
  try {
    return basemapById(localStorage.getItem(STORAGE_KEY)).id;
  } catch {
    return DEFAULT_BASEMAP;
  }
}

export function saveBasemapChoice(id: BasemapId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // stockage indisponible : le choix ne sera simplement pas retenu
  }
}

/**
 * Où insérer les calques de l'appli dans un style : au-dessus de toute la
 * géométrie du fond (routes, bâtiments…) mais sous les textes qui suivent.
 * Prendre simplement le premier calque « symbol » ne suffit pas : certains
 * styles (Plan) ont des symboles au milieu des routes (flèches de sens unique),
 * et nos traits se retrouvaient alors recouverts par les routes.
 */
export function overlayInsertionPoint(layers: readonly { id: string; type: string }[]): string | undefined {
  let lastGeometry = -1;
  layers.forEach((l, i) => {
    if (l.type !== 'symbol') lastGeometry = i;
  });
  return layers.slice(lastGeometry + 1).find((l) => l.type === 'symbol')?.id;
}
