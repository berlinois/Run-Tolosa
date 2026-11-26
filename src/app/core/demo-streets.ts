import type { FeatureCollection, LineString } from 'geojson';

export interface StreetProps {
  id: string;
  name: string;
  passages: number;
}

/**
 * Phase 0 : quelques rues du centre de Toulouse, tracés APPROXIMATIFS,
 * juste pour valider le coloriage. Remplacé en phase 2 par l'extrait
 * OpenStreetMap complet (assets/streets/toulouse.geojson).
 */
export const DEMO_STREETS: FeatureCollection<LineString, StreetProps> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 'demo-1', name: "Rue d'Alsace-Lorraine", passages: 6 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [1.4462, 43.6008],
          [1.4461, 43.6035],
          [1.446, 43.6062],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'demo-2', name: 'Rue de Metz', passages: 2 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [1.4405, 43.6003],
          [1.4435, 43.6005],
          [1.4462, 43.6008],
          [1.4495, 43.6011],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'demo-3', name: 'Rue du Taur', passages: 0 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [1.4432, 43.6048],
          [1.4425, 43.6066],
          [1.4419, 43.6083],
        ],
      },
    },
  ],
};
