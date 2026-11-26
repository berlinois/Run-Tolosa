import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Map as MlMap, type GeoJSONSource } from 'maplibre-gl';
import { COVERAGE_LEVELS, coverageColorExpression } from '../core/coverage-style';
import { DEMO_STREETS } from '../core/demo-streets';
import { LocationService } from '../core/location.service';

const TOULOUSE_CENTER: [number, number] = [1.4442, 43.6045];
/** Fond de carte gratuit, sans clé. Phase 2 : PMTiles de Toulouse embarqué (hors ligne). */
const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

@Component({
  selector: 'app-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #mapEl class="map"></div>

    <aside class="legend">
      @for (level of levels; track level.minPassages) {
        <div><span class="swatch" [style.background]="level.color"></span>{{ level.label }}</div>
      }
    </aside>

    <button class="locate" type="button" (click)="locate()" [disabled]="locating()">
      {{ locating() ? '…' : '📍 Me localiser' }}
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
    .swatch { display: inline-block; width: 18px; height: 4px; margin-right: 6px; vertical-align: middle; border-radius: 2px; }
    .locate {
      position: absolute; right: 12px; bottom: calc(env(safe-area-inset-bottom) + 24px);
      padding: 12px 16px; border: 0; border-radius: 24px; font-size: 15px;
      background: #1e88e5; color: #fff; box-shadow: 0 2px 6px #0004;
    }
    .status {
      position: absolute; left: 12px; right: 12px; bottom: calc(env(safe-area-inset-bottom) + 80px);
      margin: 0; padding: 8px 10px; background: #000c; color: #fff; border-radius: 8px; font-size: 13px;
    }
  `,
})
export class MapView implements OnDestroy {
  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  private readonly location = inject(LocationService);
  private map?: MlMap;

  protected readonly levels = COVERAGE_LEVELS;
  protected readonly locating = signal(false);
  protected readonly status = signal<string | null>(null);

  constructor() {
    afterNextRender(() => this.initMap());
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
      // Calque des rues, colorié selon `passages` (data-driven styling).
      map.addSource('streets', { type: 'geojson', data: DEMO_STREETS });
      map.addLayer({
        id: 'streets-coverage',
        type: 'line',
        source: 'streets',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': coverageColorExpression(),
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 17, 8],
          'line-opacity': 0.85,
        },
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
    });
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
