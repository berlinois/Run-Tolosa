import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { LngLatBounds, Map as MlMap, Marker, type GeoJSONSource } from 'maplibre-gl';
import type { Feature, FeatureCollection, MultiLineString, MultiPolygon, Point, Polygon } from 'geojson';
import { LocationService } from '../core/location.service';
import { BASEMAPS, basemapById, loadBasemapChoice, saveBasemapChoice, type Basemap, type BasemapId } from './basemaps';
import { CoverageStore } from '../streets/coverage.store';
import { TrackingStore } from '../tracking/tracking.store';

const TOULOUSE_CENTER: [number, number] = [1.4442, 43.6045];
const STREET_COLOR = '#F2B705';
const STREET_CASING = '#9A6B00';
const LIVE_COLOR = '#1E88E5';

@Component({
  selector: 'app-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #mapEl class="map"></div>

    <aside class="legend">
      <div><span class="swatch street"></span>Rue parcourue</div>
      <div><span class="swatch live"></span>Marche en cours</div>
      @if (coverage.stats().segments > 0) {
        <div class="stats">{{ km() }} de rues · {{ coverage.stats().segments }} tronçons</div>
      }
      @if (coverage.error(); as err) {
        <div class="err">{{ err }}</div>
      }
      @if (version(); as v) {
        <div class="version">v{{ v }}</div>
      }
    </aside>

    <button class="districts-pill" type="button" [class.active]="districtMode()" (click)="toggleDistrictMode()"
      [attr.aria-pressed]="districtMode()">
      🗺 Quartiers
    </button>

    <button class="fab layers" type="button" (click)="layersOpen.set(true)" aria-label="Fonds de carte">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <path d="M12 3 2 8.5 12 14l10-5.5L12 3Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
        <path d="m2 12.5 10 5.5 10-5.5M2 16.5 12 22l10-5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
      </svg>
    </button>

    @if (layersOpen()) {
      <div class="backdrop" (click)="layersOpen.set(false)"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="layers-title">
        <h2 id="layers-title">Fond de carte</h2>
        <div class="choices">
          @for (b of basemaps; track b.id) {
            <button type="button" class="choice" [class.selected]="b.id === basemap().id" (click)="selectBasemap(b.id)">
              <span class="thumb" [style.background]="b.preview"></span>
              <span>{{ b.label }}</span>
            </button>
          }
        </div>
      </div>
    }

    <button class="fab locate" type="button" (click)="locate()" [disabled]="locating()" aria-label="Me localiser">
      {{ locating() ? '…' : '📍' }}
    </button>

    @if (status(); as msg) {
      <p class="status">{{ msg }}</p>
    }
  `,
  styles: `
    :host { position: relative; display: block; height: 100%; }
    .map { position: absolute; inset: 0; }
    .legend {
      position: absolute; top: calc(env(safe-area-inset-top) + 8px); left: 8px;
      background: #fffe; border-radius: 8px; padding: 6px 10px; font-size: 12px;
      box-shadow: 0 1px 4px #0003;
    }
    .version { margin-top: 4px; color: #757575; font-size: 11px; }
    .swatch { display: inline-block; width: 18px; margin-right: 6px; vertical-align: middle; border-radius: 3px; }
    .swatch.street { height: 6px; background: #F2B705; box-shadow: 0 0 0 1px #9A6B00; }
    .swatch.live { height: 3px; background: #1E88E5; }
    .stats { margin-top: 4px; font-weight: 600; color: #6d4c00; }
    .err { margin-top: 4px; color: #c62828; max-width: 220px; }
    .fab {
      position: absolute; z-index: 5; right: 12px;
      width: 56px; height: 56px; border: 0; border-radius: 50%; font-size: 22px;
      display: grid; place-items: center;
      background: #fff; color: #37474f; box-shadow: 0 2px 6px #0004;
    }
    .locate { bottom: calc(env(safe-area-inset-bottom) + 20px); }
    .layers { bottom: calc(env(safe-area-inset-bottom) + 156px); }
    .districts-pill {
      position: absolute; z-index: 5; right: 8px; top: calc(env(safe-area-inset-top) + 8px);
      border: 0; border-radius: 18px; padding: 9px 14px; font-size: 14px; font-weight: 600;
      background: #fff; color: #37474f; box-shadow: 0 1px 4px #0003;
    }
    .districts-pill.active { background: #B8505E; color: #fff; }
    .backdrop { position: fixed; inset: 0; z-index: 20; background: #0006; }
    .sheet {
      position: fixed; z-index: 21; left: 0; right: 0; bottom: 0;
      padding: 18px 16px calc(env(safe-area-inset-bottom) + 18px);
      border-radius: 18px 18px 0 0; background: #fff; box-shadow: 0 -4px 16px #0003;
    }
    .sheet h2 { margin: 0 0 14px; font-size: 17px; }
    .choices { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 12px; }
    .choice {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      border: 0; background: none; padding: 0; font-size: 13px; color: #37474f;
    }
    .thumb { width: 72px; height: 72px; border-radius: 14px; border: 3px solid transparent; box-shadow: 0 1px 4px #0003; }
    .choice.selected .thumb { border-color: #B8505E; }
    .choice.selected { color: #B8505E; font-weight: 600; }
    .status {
      position: absolute; left: 12px; right: 84px; bottom: calc(env(safe-area-inset-bottom) + 140px);
      margin: 0; padding: 8px 10px; background: #000c; color: #fff; border-radius: 8px; font-size: 13px;
    }
  `,
})
export class MapView implements OnDestroy {
  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  private readonly location = inject(LocationService);
  private readonly tracking = inject(TrackingStore);
  private map?: MlMap;
  /** Incrémenté à chaque (re)chargement de style : les calques de l'appli sont alors prêts. */
  private readonly styleReady = signal(0);
  private readonly myPosition = signal<Feature<Point> | null>(null);
  private statusTimer?: ReturnType<typeof setTimeout>;
  /** Grands quartiers (20) et petits quartiers (IRIS renommés), affichage de test. */
  private readonly bigDistricts = signal<FeatureCollection<MultiLineString> | null>(null);
  private readonly districts = signal<FeatureCollection<MultiLineString> | null>(null);
  private districtMarkers: Marker[] = [];
  /** Zones teintées du mode Quartiers (IRIS, couleur par petit quartier). */
  private readonly districtFill = signal<FeatureCollection<Polygon | MultiPolygon> | null>(null);
  /** Vue à restaurer en sortant du mode Quartiers. */
  private savedCamera?: { center: [number, number]; zoom: number; bearing: number; pitch: number };
  protected readonly districtMode = signal(false);

  protected readonly coverage = inject(CoverageStore);
  protected readonly basemaps = BASEMAPS;
  protected readonly basemap = signal<Basemap>(basemapById(loadBasemapChoice()));
  protected readonly layersOpen = signal(false);
  protected readonly locating = signal(false);
  protected readonly status = signal<string | null>(null);
  protected readonly version = signal<string | null>(null);

  constructor() {
    afterNextRender(() => this.initMap());
    this.tracking.init();
    if (Capacitor.isNativePlatform()) {
      void App.getInfo().then((info) => this.version.set(info.version));
    }

    // Rues validées (doré épais), marche en cours (bleu fin), position.
    effect(() => {
      if (!this.styleReady()) return;
      this.source('streets')?.setData(this.coverage.coveredLines());
    });
    effect(() => {
      if (!this.styleReady()) return;
      this.source('live')?.setData(this.tracking.liveLine());
    });
    effect(() => {
      if (!this.styleReady()) return;
      const d = this.districts();
      if (d) this.source('districts')?.setData(d);
      const b = this.bigDistricts();
      if (b) this.source('districts-big')?.setData(b);
      const fill = this.districtFill();
      if (fill) this.source('districts-fill')?.setData(fill);
    });
    // Mode Quartiers : contours plus marqués, zones teintées, tous les noms.
    effect(() => {
      if (!this.styleReady()) return;
      this.applyDistrictModeStyle(this.districtMode());
    });
    effect(() => {
      if (!this.styleReady()) return;
      this.source('me')?.setData(this.myPosition() ?? { type: 'FeatureCollection', features: [] });
    });
  }

  private source(id: string): GeoJSONSource | undefined {
    return this.map?.getSource(id) as GeoJSONSource | undefined;
  }

  private initMap(): void {
    const map = new MlMap({
      container: this.mapEl().nativeElement,
      style: this.basemap().style,
      center: TOULOUSE_CENTER,
      zoom: 15,
      attributionControl: { compact: true },
    });
    this.map = map;
    // À chaque changement de fond, MapLibre repart d'un style vierge : on remet nos calques.
    map.on('style.load', () => {
      this.addOverlays(map);
      this.styleReady.update((n) => n + 1);
    });
    void this.loadDistricts(map);
    // À l'ouverture : centrer sur ma position (sans message ; Toulouse par défaut si échec).
    if (Capacitor.isNativePlatform()) {
      map.once('load', () => void this.locate(true));
    }
  }

  protected selectBasemap(id: BasemapId): void {
    this.layersOpen.set(false);
    if (id === this.basemap().id) return;
    const next = basemapById(id);
    this.basemap.set(next);
    saveBasemapChoice(id);
    this.map?.setStyle(next.style);
  }

  private addOverlays(map: MlMap): void {
    const empty = { type: 'FeatureCollection' as const, features: [] };
    // Sous les noms de rues du fond de carte (premier calque de texte), pour qu'ils restent lisibles.
    const beforeLabels = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    const dark = this.basemap().dark;
    const width = (base: number) =>
      ['interpolate', ['exponential', 1.6], ['zoom'], 12, base * 0.4, 15, base, 18, base * 2.6] as never;

    // Grands quartiers : trait épais et discret. Petits quartiers : pointillés rose brique.
    map.addSource('districts-fill', { type: 'geojson', data: empty });
    map.addLayer(
      {
        id: 'districts-fill',
        type: 'fill',
        source: 'districts-fill',
        layout: { visibility: 'none' },
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': dark ? 0.28 : 0.22 },
      },
      beforeLabels,
    );
    map.addSource('streets', { type: 'geojson', data: empty });
    map.addLayer(
      {
        id: 'streets-casing',
        type: 'line',
        source: 'streets',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': dark ? '#000000' : STREET_CASING, 'line-width': width(8), 'line-opacity': dark ? 0.6 : 0.5 },
      },
      beforeLabels,
    );
    map.addLayer(
      {
        id: 'streets',
        type: 'line',
        source: 'streets',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': STREET_COLOR, 'line-width': width(6), 'line-opacity': 0.92 },
      },
      beforeLabels,
    );

    // Contours des quartiers au-dessus des rues dorées (sinon le doré les cache).
    map.addSource('districts-big', { type: 'geojson', data: empty });
    map.addLayer(
      {
        id: 'districts-big',
        type: 'line',
        source: 'districts-big',
        paint: { 'line-color': dark ? '#F48FB1' : '#B8505E', 'line-width': 4, 'line-opacity': 0.25 },
      },
      beforeLabels,
    );
    map.addSource('districts', { type: 'geojson', data: empty });
    map.addLayer(
      {
        id: 'districts-halo',
        type: 'line',
        source: 'districts',
        paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': dark ? 0.15 : 0.6 },
      },
      beforeLabels,
    );
    map.addLayer(
      {
        id: 'districts',
        type: 'line',
        source: 'districts',
        paint: { 'line-color': dark ? '#F48FB1' : '#B8505E', 'line-width': 1.8, 'line-dasharray': [3, 2] },
      },
      beforeLabels,
    );

    map.addSource('live', { type: 'geojson', data: empty });
    map.addLayer({
      id: 'live',
      type: 'line',
      source: 'live',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': dark ? '#4FC3F7' : LIVE_COLOR, 'line-width': 3.5 },
    });

    map.addSource('me', { type: 'geojson', data: empty });
    map.addLayer({
      id: 'me',
      type: 'circle',
      source: 'me',
      paint: {
        'circle-radius': 7,
        'circle-color': '#e53935',
        'circle-stroke-width': 3,
        'circle-stroke-color': '#fff',
      },
    });
  }

  private async loadDistricts(map: MlMap): Promise<void> {
    try {
      const [big, small, iris] = await Promise.all(
        ['streets/quartiers.geojson', 'streets/petits-quartiers.geojson', 'streets/iris.geojson'].map((url) =>
          fetch(url).then((r) => (r.ok ? r.json() : null)),
        ),
      ) as [FeatureCollection<MultiLineString> | null, FeatureCollection<MultiLineString> | null, FeatureCollection<Polygon | MultiPolygon> | null];
      if (big) this.bigDistricts.set(big);
      if (!small) return;
      this.districts.set(small);
      if (iris) this.districtFill.set(colorIrisByDistrict(iris, small));
      // Noms des petits quartiers : marqueurs HTML (indépendants des polices du fond de carte).
      this.districtMarkers = small.features.map((f) => {
        const el = document.createElement('div');
        el.className = 'district-label';
        el.textContent = String(f.properties?.['name'] ?? '');
        const { labelLon, labelLat } = f.properties as { labelLon: number; labelLat: number };
        return new Marker({ element: el }).setLngLat([labelLon, labelLat]).addTo(map);
      });
      // Noms masqués quand on dézoome trop : ils se chevaucheraient.
      map.on('zoom', () => this.updateDistrictLabels());
      this.updateDistrictLabels();
    } catch {
      // affichage de test : sans contours, la carte fonctionne normalement
    }
  }

  private updateDistrictLabels(): void {
    const map = this.map;
    if (!map) return;
    const mode = this.districtMode();
    map.getContainer().classList.toggle('district-mode', mode);
    map.getContainer().classList.toggle('district-labels-hidden', !mode && map.getZoom() < 13.5);
  }

  private applyDistrictModeStyle(mode: boolean): void {
    const map = this.map;
    if (!map?.getLayer('districts')) return;
    map.setLayoutProperty('districts-fill', 'visibility', mode ? 'visible' : 'none');
    map.setPaintProperty('districts', 'line-width', mode ? 2.6 : 1.8);
    map.setPaintProperty('districts-big', 'line-opacity', mode ? 0.45 : 0.25);
    this.updateDistrictLabels();
  }

  /** Bouton « Quartiers » : vue de tout Toulouse, puis retour à la vue précédente. */
  protected toggleDistrictMode(): void {
    const map = this.map;
    if (!map) return;
    if (this.districtMode()) {
      this.districtMode.set(false);
      if (this.savedCamera) map.easeTo({ ...this.savedCamera, duration: 800 });
      return;
    }
    const c = map.getCenter();
    this.savedCamera = { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
    this.districtMode.set(true);
    const big = this.bigDistricts();
    const bounds = new LngLatBounds();
    for (const f of big?.features ?? []) for (const line of f.geometry.coordinates) for (const [lon, lat] of line) bounds.extend([lon, lat]);
    if (bounds.isEmpty()) bounds.extend([1.35, 43.53]).extend([1.52, 43.67]); // commune de Toulouse, à défaut
    map.fitBounds(bounds, { padding: { top: 64, bottom: 96, left: 8, right: 8 }, bearing: 0, pitch: 0, duration: 900 });
  }

  protected km(): string {
    return `${this.coverage.stats().km.toFixed(1).replace('.', ',')} km`;
  }

  /** Message temporaire en bas de l'écran. */
  private flash(message: string, ms = 4000): void {
    clearTimeout(this.statusTimer);
    this.status.set(message);
    this.statusTimer = setTimeout(() => this.status.set(null), ms);
  }

  protected async locate(silent = false): Promise<void> {
    this.locating.set(true);
    if (!silent) this.status.set(null);
    try {
      const { coords } = await this.location.currentPosition();
      const lngLat: [number, number] = [coords.longitude, coords.latitude];
      this.myPosition.set({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: lngLat } });
      this.map?.flyTo({ center: lngLat, zoom: 16 });
      if (!silent) this.flash(`Précision : ±${Math.round(coords.accuracy)} m`);
    } catch (e) {
      if (!silent) this.flash(`Localisation impossible : ${(e as Error).message}`, 6000);
    } finally {
      this.locating.set(false);
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.statusTimer);
    this.districtMarkers.forEach((m) => m.remove());
    this.map?.remove();
  }
}

/** Palette douce : une couleur par petit quartier (stable d'une ouverture à l'autre). */
const DISTRICT_COLORS = ['#E57373', '#F06292', '#BA68C8', '#7986CB', '#4FC3F7', '#4DB6AC', '#AED581', '#FFD54F', '#FF8A65', '#A1887F'];

function colorIrisByDistrict(
  iris: FeatureCollection<Polygon | MultiPolygon>,
  districts: FeatureCollection<MultiLineString>,
): FeatureCollection<Polygon | MultiPolygon> {
  const nameByIris = new Map<string, string>();
  for (const d of districts.features) {
    for (const code of (d.properties?.['iris'] as string[] | undefined) ?? []) nameByIris.set(code, String(d.properties?.['name']));
  }
  const color = (name: string) => {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return DISTRICT_COLORS[h % DISTRICT_COLORS.length];
  };
  return {
    type: 'FeatureCollection',
    features: iris.features.map((f) => {
      const name = nameByIris.get(String(f.properties?.['code'])) ?? '';
      return { ...f, properties: { name, color: color(name) } };
    }),
  };
}
