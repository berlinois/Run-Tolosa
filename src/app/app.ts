import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MapView } from './map/map';
import { WalkControls } from './tracking/walk-controls';

@Component({
  selector: 'app-root',
  imports: [MapView, WalkControls],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-map /><app-walk-controls />`,
  styles: `:host { position: relative; display: block; height: 100dvh; }`,
})
export class App {}
