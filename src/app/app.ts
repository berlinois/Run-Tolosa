import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MapView } from './map/map';

@Component({
  selector: 'app-root',
  imports: [MapView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-map />`,
  styles: `:host { display: block; height: 100dvh; }`,
})
export class App {}
