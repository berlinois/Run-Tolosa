import { BASEMAPS, basemapById } from './basemaps';

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
});
