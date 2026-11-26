import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ExportButton } from './export/export-button';
import { MapView } from './map/map';
import { WalkControls } from './tracking/walk-controls';

@Component({
  selector: 'app-root',
  imports: [MapView, WalkControls, ExportButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-map /><app-walk-controls /><app-export-button />`,
  styles: `:host { position: relative; display: block; height: 100dvh; }`,
})
export class App {}
