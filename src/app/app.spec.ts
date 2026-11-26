import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  it('se crée et contient la carte', async () => {
    // La carte MapLibre (WebGL) n'est pas instanciée dans jsdom : on remplace le composant.
    await TestBed.configureTestingModule({ imports: [App] })
      .overrideComponent(App, { set: { imports: [], schemas: [NO_ERRORS_SCHEMA] } })
      .compileComponents();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-map')).toBeTruthy();
  });
});
