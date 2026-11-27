import { BASEMAPS, basemapById, overlayInsertionPoint } from './basemaps';

describe('basemaps', () => {
  it('propose les 5 fonds, avec des identifiants uniques', () => {
    expect(BASEMAPS.map((b) => b.id)).toEqual(['clair', 'plan', 'sombre', 'ign', 'photo']);
  });

  it('revient au fond clair pour un identifiant inconnu', () => {
    expect(basemapById('inconnu').id).toBe('clair');
    expect(basemapById(null).id).toBe('clair');
  });

  it('construit des tuiles IGN WMTS sans clé', () => {
    const style = basemapById('photo').style;
    expect(typeof style).toBe('object');
    const tiles = (style as unknown as { sources: { ign: { tiles: string[] } } }).sources.ign.tiles[0];
    expect(tiles).toContain('https://data.geopf.fr/wmts?');
    expect(tiles).toContain('LAYER=ORTHOIMAGERY.ORTHOPHOTOS');
    expect(tiles).toContain('TILEMATRIX={z}&TILEROW={y}&TILECOL={x}');
    expect(tiles).not.toMatch(/apikey/i);
  });

  it('insère nos calques après toute la géométrie, même avec des symboles au milieu des routes', () => {
    const layers = [
      { id: 'background', type: 'background' },
      { id: 'road_minor', type: 'line' },
      { id: 'road_oneway_arrow', type: 'symbol' },
      { id: 'road_major', type: 'line' },
      { id: 'building', type: 'fill' },
      { id: 'road_label', type: 'symbol' },
      { id: 'place_label', type: 'symbol' },
    ];
    expect(overlayInsertionPoint(layers)).toBe('road_label');
    expect(overlayInsertionPoint([{ id: 'ign', type: 'raster' }])).toBeUndefined();
  });
});
