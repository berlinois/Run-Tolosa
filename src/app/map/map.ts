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
import { Map as MlMap, type GeoJSONSource } from 'maplibre-gl';
import { LocationService } from '../core/location.service';
import { CoverageStore } from '../streets/coverage.store';
import { TrackingStore } from '../tracking/tracking.store';

const TOULOUSE_CENTER: [number, number] = [1.4442, 43.6045];
/** Fond de carte gratuit, sans clé. Phase 3 : PMTiles de Toulouse embarqué (hors ligne). */
const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
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

    <button class="locate" type="button" (click)="locate()" [disabled]="locating()" aria-label="Me localiser">
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
    .locate {
      position: absolute; right: 12px; bottom: calc(env(safe-area-inset-bottom) + 20px);
      width: 56px; height: 56px; border: 0; border-radius: 50%; font-size: 22px;
      background: #fff; box-shadow: 0 2px 6px #0004;
    }
    .status {
      position: absolute; left: 12px; right: 12px; bottom: calc(env(safe-area-inset-bottom) + 140px);
      margin: 0; padding: 8px 10px; background: #000c; color: #fff; border-radius: 8px; font-size: 13px;
    }
  `,
})
export class MapView implements OnDestroy {
  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  private readonly location = inject(LocationService);
  private readonly tracking = inject(TrackingStore);
  private map?: MlMap;
  private readonly mapLoaded = signal(false);

  protected readonly coverage = inject(CoverageStore);
  protected readonly locating = signal(false);
  protected readonly status = signal<string | null>(null);
  protected readonly version = signal<string | null>(null);

  constructor() {
    afterNextRender(() => this.initMap());
    this.tracking.init();
    if (Capacitor.isNativePlatform()) {
      void App.getInfo().then((info) => this.version.set(info.version));
    }

    // Rues validées (doré épais) et marche en cours (bleu fin).
    effect(() => {
      if (!this.mapLoaded()) return;
      (this.map?.getSource('streets') as GeoJSONSource | undefined)?.setData(this.coverage.coveredLines());
    });
    effect(() => {
      if (!this.mapLoaded()) return;
      (this.map?.getSource('live') as GeoJSONSource | undefined)?.setData(this.tracking.liveLine());
    });
  }

  private initMap(): void {
    const map = new MlMap({
      container: this.mapEl().nativeElement,
      style: BASEMAP_STYLE,
      center: TOULOUSE_CENTER,
      zoom: 15,
      attributionControl: { compact: true },
    });
    this.map = map;

    map.on('load', () => {
      const empty = { type: 'FeatureCollection' as const, features: [] };
      // Rues validées : liseré foncé + trait doré épais.
      map.addSource('streets', { type: 'geojson', data: empty });
      const width = (base: number) =>
        ['interpolate', ['exponential', 1.6], ['zoom'], 12, base * 0.4, 15, base, 18, base * 2.6] as never;
      map.addLayer({
        id: 'streets-casing',
        type: 'line',
        source: 'streets',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': STREET_CASING, 'line-width': width(8), 'line-opacity': 0.5 },
      });
      map.addLayer({
        id: 'streets',
        type: 'line',
        source: 'streets',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': STREET_COLOR, 'line-width': width(6) },
      });
      map.addSource('live', { type: 'geojson', data: empty });
      map.addLayer({
        id: 'live',
        type: 'line',
        source: 'live',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': LIVE_COLOR, 'line-width': 3.5 },
      });

      map.addSource('me', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
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
      this.mapLoaded.set(true);
    });
  }

  protected km(): string {
    return `${this.coverage.stats().km.toFixed(1).replace('.', ',')} km`;
  }

  protected async locate(): Promise<void> {
    this.locating.set(true);
    this.status.set(null);
    try {
      const { coords } = await this.location.currentPosition();
      const lngLat: [number, number] = [coords.longitude, coords.latitude];
      (this.map?.getSource('me') as GeoJSONSource | undefined)?.setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: lngLat },
      });
      this.map?.flyTo({ center: lngLat, zoom: 16 });
      this.status.set(`Précision : ±${Math.round(coords.accuracy)} m`);
    } catch (e) {
      this.status.set(`Localisation impossible : ${(e as Error).message}`);
    } finally {
      this.locating.set(false);
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }
}
