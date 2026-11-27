import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { LngLatBounds, Map as MlMap, Marker, type GeoJSONSource } from 'maplibre-gl';
import type { Feature, FeatureCollection, MultiLineString, MultiPolygon, Point, Polygon } from 'geojson';
import { LocationService } from '../core/location.service';
import { SplashService } from '../core/splash.service';
import { BASEMAPS, basemapById, overlayInsertionPoint, loadBasemapChoice, saveBasemapChoice, type Basemap, type BasemapId } from './basemaps';
import { CoverageStore } from '../streets/coverage.store';
import { DistrictCard } from '../streets/district-card';
import { districtStats, type DistrictKind, type DistrictStats } from '../streets/district-stats';
import { StreetCard } from '../streets/street-card';
import { selectStreet, type StreetSelection } from '../streets/street-selection';
import { TrackingStore } from '../tracking/tracking.store';

const TOULOUSE_CENTER: [number, number] = [1.4442, 43.6045];
const STREET_COLOR = '#F2B705';
const STREET_CASING = '#9A6B00';
/** Rue parcourue (≥ 30 %) mais pas validée. */
const PINK_COLOR = '#EC6A9C';
const PINK_CASING = '#8E2450';
const LIVE_COLOR = '#1E88E5';

@Component({
  selector: 'app-map',
  imports: [StreetCard, DistrictCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #mapEl class="map"></div>

    <aside class="legend">
      <div><span class="swatch street"></span>Rue validée</div>
      <div><span class="swatch pink"></span>Rue parcourue</div>
      <div><span class="swatch live"></span>Marche en cours</div>
      @if (coverage.stats(); as st) {
        @if (st.gold + st.pink > 0) {
          <div class="stats">{{ km(st.goldKm) }} validés · {{ km(st.pinkKm) }} parcourus</div>
        }
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

    @if (selection(); as sel) {
      <app-street-card [selection]="sel" (closed)="selection.set(null)" />
    }
    @if (districtSelection(); as d) {
      <app-district-card [stats]="d.stats" (closed)="districtSelection.set(null)" />
    }

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
    .swatch.pink { height: 6px; background: #EC6A9C; box-shadow: 0 0 0 1px #8E2450; }
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
  private readonly injector = inject(Injector);
  private readonly splash = inject(SplashService);
  private map?: MlMap;
  /** Incrémenté à chaque (re)chargement de style : les calques de l'appli sont alors prêts. */
  private readonly styleReady = signal(0);
  private readonly myPosition = signal<Feature<Point> | null>(null);
  private statusTimer?: ReturnType<typeof setTimeout>;
  /** Grands quartiers (20) et petits quartiers (IRIS renommés), affichage de test. */
  private readonly bigDistricts = signal<FeatureCollection<Polygon | MultiPolygon> | null>(null);
  /** Réseaux de frontières (chaque frontière une seule fois, pour des pointillés réguliers). */
  private readonly smallBorders = signal<FeatureCollection<MultiLineString> | null>(null);
  private readonly bigBorders = signal<FeatureCollection<MultiLineString> | null>(null);
  private districtMarkers: Marker[] = [];
  /** Mini-barres des étiquettes de quartiers, mises à jour quand la couverture change. */
  private labelBars: { name: string; kind: DistrictKind; feature: Feature; gold: HTMLElement; pink: HTMLElement }[] = [];
  private readonly labelsReady = signal(false);
  /** Mode « grands quartiers » (interrupteur en haut à droite). */
  protected readonly districtMode = signal(false);
  /** Rue sélectionnée par un tap (feature « détail d'une rue »). */
  protected readonly selection = signal<StreetSelection | null>(null);
  /** Quartier dont on a tapé le nom (feature « stats d'un quartier »). */
  protected readonly districtSelection = signal<{ stats: DistrictStats; outline: Feature<MultiLineString> } | null>(null);
  /** Tronçons de chaque petit quartier (petits-quartiers-troncons.json). */
  private smallSegments?: Record<string, string[]>;
  private smallOutlines = new Map<string, Feature<MultiLineString>>();

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
      const d = this.smallBorders();
      if (d) this.source('districts')?.setData(d);
      const bb = this.bigBorders();
      if (bb) this.source('districts-big-lines')?.setData(bb);
      const b = this.bigDistricts();
      if (b) this.source('districts-big')?.setData(b);
    });
    // Rue sélectionnée : halo bleu sur toute la rue, couleur seulement sur les mètres parcourus.
    effect(() => {
      if (!this.styleReady()) return;
      const sel = this.selection();
      const empty = { type: 'FeatureCollection' as const, features: [] };
      this.source('selection-halo')?.setData(sel ? sel.halo : empty);
      this.source('selection-parts')?.setData(sel ? sel.parts : empty);
      const filter = sel ? (['!', ['in', ['get', 'id'], ['literal', sel.segmentIds]]] as never) : null;
      for (const id of ['streets', 'streets-casing']) if (this.map?.getLayer(id)) this.map.setFilter(id, filter);
    });
    // Avancement de chaque quartier dans sa mini-barre (recalculé à chaque nouvelle marche).
    effect(() => {
      const ctx = this.coverage.context();
      if (!this.labelsReady() || !ctx) return;
      const bigIds = new Map<string, string[]>();
      for (const s of ctx.streets.segments) {
        if (s.district) (bigIds.get(s.district) ?? bigIds.set(s.district, []).get(s.district)!).push(s.id);
      }
      for (const l of this.labelBars) {
        const ids = l.kind === 'small' ? this.smallSegments?.[l.name] ?? [] : bigIds.get(l.name) ?? [];
        const st = districtStats(l.name, l.kind, ids, ctx);
        const pct = (m: number) => (st.totalM > 0 ? Math.max(0, (m / st.totalM) * 100) : 0);
        // Un minimum visible dès qu'on a commencé, sinon 0,5 % ne se verrait pas.
        const shown = (v: number) => (v > 0 ? Math.max(v, 4) : 0);
        l.gold.style.width = `${shown(pct(st.goldM))}%`;
        l.pink.style.width = `${shown(pct(st.doneM - st.goldM))}%`;
      }
    });
    // Quartier sélectionné : contour en halo bleu.
    effect(() => {
      if (!this.styleReady()) return;
      const d = this.districtSelection();
      this.source('district-selection')?.setData(d ? d.outline : { type: 'FeatureCollection', features: [] });
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
    map.on('click', (e) => this.onMapClick(e.point.x, e.point.y));
    // À l'ouverture : centrer sur ma position (sans message ; Toulouse par défaut si échec),
    // puis faire glisser l'écran d'accueil une fois la carte arrivée à destination.
    map.once('load', async () => {
      if (Capacitor.isNativePlatform()) await this.locate(true, false);
      // Attendre que les tuiles du bon endroit soient dessinées (2 s maximum).
      await Promise.race([new Promise((r) => map.once('idle', r)), new Promise((r) => setTimeout(r, 2000))]);
      this.splash.ready();
    });
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
    // Au-dessus de toute la géométrie du fond, sous ses textes (noms de rues lisibles).
    const beforeLabels = overlayInsertionPoint(map.getStyle().layers);
    const dark = this.basemap().dark;
    const width = (base: number) =>
      ['interpolate', ['exponential', 1.6], ['zoom'], 12, base * 0.4, 15, base, 18, base * 2.6] as never;

    const mode = this.districtMode();
    const vis = (on: boolean) => (on ? 'visible' : 'none') as 'visible' | 'none';
    // Frontières : bordeaux très foncé (contraste avec les rues roses et dorées) ; rose clair sur fond sombre.
    const border = dark ? '#F8BBD0' : '#4A1420';

    // Grands quartiers (mode « Quartiers ») : zones teintées, sous les rues dorées.
    map.addSource('districts-big', { type: 'geojson', data: empty });
    map.addLayer(
      {
        id: 'districts-big-fill',
        type: 'fill',
        source: 'districts-big',
        layout: { visibility: vis(mode) },
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
        paint: {
          'line-color': dark ? '#000000' : ['match', ['get', 'status'], 'gold', STREET_CASING, PINK_CASING],
          'line-width': width(8),
          'line-opacity': dark ? 0.6 : 0.5,
        },
      },
      beforeLabels,
    );
    map.addLayer(
      {
        id: 'streets',
        type: 'line',
        source: 'streets',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['match', ['get', 'status'], 'gold', STREET_COLOR, PINK_COLOR],
          'line-width': width(6),
          'line-opacity': 0.92,
        },
      },
      beforeLabels,
    );

    // Contours des quartiers au-dessus des rues dorées (sinon le doré les cache).
    // Tous les contours en pointillés : petits quartiers par défaut, grands en mode « Quartiers ».
    map.addSource('districts', { type: 'geojson', data: empty });
    map.addSource('districts-big-lines', { type: 'geojson', data: empty });
    const dashed = (id: string, source: string, on: boolean, w: number) => {
      map.addLayer(
        { id: `${id}-halo`, type: 'line', source, layout: { visibility: vis(on) }, paint: { 'line-color': '#ffffff', 'line-width': w + 3, 'line-opacity': dark ? 0.15 : 0.6 } },
        beforeLabels,
      );
      map.addLayer(
        { id, type: 'line', source, layout: { visibility: vis(on) }, paint: { 'line-color': border, 'line-width': w, 'line-dasharray': [3, 2] } },
        beforeLabels,
      );
    };
    dashed('districts', 'districts', !mode, 2.2);
    dashed('districts-big', 'districts-big-lines', mode, 2.8);
    map.addSource('district-selection', { type: 'geojson', data: empty });
    map.addLayer(
      {
        id: 'district-selection',
        type: 'line',
        source: 'district-selection',
        layout: { 'line-join': 'round' },
        paint: { 'line-color': '#1E88E5', 'line-width': 5, 'line-opacity': 0.7, 'line-blur': 1 },
      },
      beforeLabels,
    );

    // Rue sélectionnée : AU-DESSUS des frontières de quartiers (le halo, presque
    // opaque, ne laisse deviner qu'une trace de frontière sous la rue sélectionnée).
    map.addSource('selection-halo', { type: 'geojson', data: empty });
    map.addLayer(
      {
        id: 'selection-halo',
        type: 'line',
        source: 'selection-halo',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        // Bleu clair presque opaque : frontière à peine visible dessous, et quasiment
        // pas d'assombrissement là où des morceaux du halo se superposent.
        paint: { 'line-color': '#A9D2F5', 'line-width': width(18), 'line-blur': 1.5, 'line-opacity': 0.9 },
      },
      beforeLabels,
    );
    map.addSource('selection-parts', { type: 'geojson', data: empty });
    map.addLayer(
      {
        id: 'selection-parts',
        type: 'line',
        source: 'selection-parts',
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: { 'line-color': ['match', ['get', 'status'], 'gold', STREET_COLOR, PINK_COLOR], 'line-width': width(6) },
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
      const [big, small, smallBorders, bigBorders, smallSegs] = (await Promise.all(
        [
          'streets/grands-quartiers.geojson',
          'streets/petits-quartiers.geojson',
          'streets/petits-quartiers-contours.geojson',
          'streets/grands-quartiers-contours.geojson',
          'streets/petits-quartiers-troncons.json',
        ].map((url) => fetch(url).then((r) => (r.ok ? r.json() : null))),
      )) as [
        FeatureCollection<Polygon | MultiPolygon> | null,
        FeatureCollection<MultiLineString> | null,
        FeatureCollection<MultiLineString> | null,
        FeatureCollection<MultiLineString> | null,
        { quartiers: Record<string, string[]> } | null,
      ];
      if (big) this.bigDistricts.set(withColors(big));
      if (smallBorders) this.smallBorders.set(smallBorders);
      if (bigBorders) this.bigBorders.set(bigBorders);
      this.smallSegments = smallSegs?.quartiers;
      for (const f of small?.features ?? []) this.smallOutlines.set(String(f.properties?.['name']), f);
      // Noms : marqueurs HTML (indépendants des polices du fond de carte), au centre visuel.
      const label = (f: Feature, kind: DistrictKind) => {
        const el = document.createElement('div');
        el.className = `district-label ${kind}`;
        const name = String(f.properties?.['name'] ?? '');
        // Nom + mini-barre de progression (doré = validé, rose = parcouru).
        const nm = document.createElement('span');
        nm.className = 'nm';
        nm.textContent = name;
        const bar = document.createElement('span');
        bar.className = 'mini';
        const gold = document.createElement('i');
        const pink = document.createElement('b');
        bar.append(gold, pink);
        el.append(nm, bar);
        this.labelBars.push({ name, kind, feature: f, gold, pink });
        // Tap sur le nom → stats du quartier (le tap ne descend pas jusqu'à la carte).
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.selectDistrict(name, kind, f);
        });
        const { labelLon, labelLat } = f.properties as { labelLon: number; labelLat: number };
        return new Marker({ element: el }).setLngLat([labelLon, labelLat]).addTo(map);
      };
      this.districtMarkers = [
        ...(small?.features ?? []).map((f) => label(f, 'small')),
        ...(big?.features ?? []).map((f) => label(f, 'big')),
      ];
      map.on('zoom', () => this.updateDistrictLabels());
      this.updateDistrictLabels();
      this.labelsReady.set(true);
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
    for (const id of ['districts', 'districts-halo']) map.setLayoutProperty(id, 'visibility', mode ? 'none' : 'visible');
    for (const id of ['districts-big', 'districts-big-halo', 'districts-big-fill']) map.setLayoutProperty(id, 'visibility', mode ? 'visible' : 'none');
    this.updateDistrictLabels();
  }

  /**
   * Interrupteur « Quartiers » : activé, on dézoome sur tout Toulouse et on affiche
   * les 20 grands quartiers (on peut ensuite zoomer librement) ; désactivé, on revient
   * aux petits quartiers en restant à l'endroit où l'on est.
   */
  protected toggleDistrictMode(): void {
    const map = this.map;
    if (!map) return;
    const on = !this.districtMode();
    this.districtMode.set(on);
    if (!on) return;
    const bounds = new LngLatBounds();
    for (const f of this.bigDistricts()?.features ?? []) {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const poly of polys) for (const [lon, lat] of poly[0]) bounds.extend([lon, lat]);
    }
    if (bounds.isEmpty()) bounds.extend([1.35, 43.53]).extend([1.52, 43.67]); // commune de Toulouse, à défaut
    map.fitBounds(bounds, { padding: { top: 64, bottom: 96, left: 8, right: 8 }, bearing: 0, pitch: 0, duration: 900 });
  }

  private selectDistrict(name: string, kind: DistrictKind, feature: Feature): void {
    const ctx = this.coverage.context();
    if (!ctx) return;
    const ids = kind === 'small'
      ? this.smallSegments?.[name] ?? []
      : ctx.streets.segments.filter((s) => s.district === name).map((s) => s.id);
    const stats = districtStats(name, kind, ids, ctx);
    let outline: Feature<MultiLineString>;
    if (kind === 'small') {
      outline = this.smallOutlines.get(name) ?? { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: [] } };
    } else {
      const g = feature.geometry as Polygon | MultiPolygon;
      const rings = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
      outline = { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: rings } };
    }
    this.selection.set(null);
    this.districtSelection.set({ stats, outline });
    this.fitToSelection(outline.geometry.coordinates, 'app-district-card', 16);
  }

  /**
   * Cadre la forme sélectionnée dans la partie VISIBLE de la carte : sous la
   * légende, au-dessus de la carte de stats (mesurée une fois affichée) et à
   * gauche de la colonne de boutons.
   */
  private fitToSelection(lines: number[][][], cardSelector: string, maxZoom: number): void {
    const map = this.map;
    if (!map) return;
    const bounds = new LngLatBounds();
    for (const line of lines) for (const [lon, lat] of line) bounds.extend([lon, lat]);
    if (bounds.isEmpty()) return;
    // Après le prochain rendu : la carte de stats est alors dans le DOM et mesurable.
    afterNextRender(() => {
      const container = map.getContainer().getBoundingClientRect();
      const card = document.querySelector(`${cardSelector} .card`)?.getBoundingClientRect();
      const legend = document.querySelector('app-map .legend')?.getBoundingClientRect();
      const top = Math.max(24, (legend?.bottom ?? 0) - container.top) + 16;
      const bottom = Math.max(110, card ? container.bottom - card.top : 0) + 16;
      // Si l'écran est trop petit pour ces marges, on se contente de marges minimales.
      const tooTall = top + bottom > container.height - 80;
      map.fitBounds(bounds, {
        padding: tooTall ? { top: 24, bottom: 24, left: 16, right: 16 } : { top, bottom, left: 20, right: 80 },
        maxZoom,
        duration: 700,
      });
    }, { injector: this.injector });
  }

  /** Tap : une rue rose ou dorée sous le doigt → sélection ; ailleurs → on désélectionne. */
  private onMapClick(x: number, y: number): void {
    const map = this.map;
    this.districtSelection.set(null); // tout tap sur la carte ferme les stats du quartier
    const ctx = this.coverage.context();
    if (!map || !ctx || !map.getLayer('streets')) return;
    const r = 14; // zone de tap élargie autour du trait
    const box: [[number, number], [number, number]] = [[x - r, y - r], [x + r, y + r]];
    // Tap sur la rue déjà sélectionnée : on la garde.
    if (this.selection() && map.queryRenderedFeatures(box, { layers: ['selection-halo'] }).length) return;
    const hit = map.queryRenderedFeatures(box, { layers: ['streets'] })[0];
    const id = hit?.properties?.['id'] as string | undefined;
    if (!id) {
      this.selection.set(null);
      return;
    }
    const sel = selectStreet(id, ctx);
    this.selection.set(sel);
    if (sel) this.fitToSelection(sel.halo.geometry.coordinates, 'app-street-card', 17.5);
  }

  protected km(value: number): string {
    return `${value.toFixed(1).replace('.', ',')} km`;
  }

  /** Message temporaire en bas de l'écran. */
  private flash(message: string, ms = 4000): void {
    clearTimeout(this.statusTimer);
    this.status.set(message);
    this.statusTimer = setTimeout(() => this.status.set(null), ms);
  }

  protected async locate(silent = false, animate = true): Promise<void> {
    this.locating.set(true);
    if (!silent) this.status.set(null);
    try {
      const { coords } = await this.location.currentPosition();
      const lngLat: [number, number] = [coords.longitude, coords.latitude];
      this.myPosition.set({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: lngLat } });
      // À l'ouverture, pas d'animation : la carte est déjà au bon endroit quand l'accueil glisse.
      if (animate) this.map?.flyTo({ center: lngLat, zoom: 16 });
      else this.map?.jumpTo({ center: lngLat, zoom: 16 });
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

/** Ajoute une couleur à chaque quartier (propriété `color`, utilisée par la teinte). */
function withColors(fc: FeatureCollection<Polygon | MultiPolygon>): FeatureCollection<Polygon | MultiPolygon> {
  const color = (name: string) => {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return DISTRICT_COLORS[h % DISTRICT_COLORS.length];
  };
  return {
    ...fc,
    features: fc.features.map((f) => ({ ...f, properties: { ...f.properties, color: color(String(f.properties?.['name'] ?? '')) } })),
  };
}
