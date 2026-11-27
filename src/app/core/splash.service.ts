import { Injectable } from '@angular/core';

/** Durée minimale d'affichage : laisser la marche dorée se dessiner. */
const MIN_MS = 3200;
/** Au-delà, on bascule sur la carte même sans position (GPS lent, refus…). */
const MAX_MS = 6000;

/**
 * Écran d'accueil (div #splash de index.html, image public/splash.svg).
 * Il glisse vers le haut quand la carte est prête ET centrée sur la position.
 */
@Injectable({ providedIn: 'root' })
export class SplashService {
  private readonly start = performance.now();
  private done = false;

  constructor() {
    setTimeout(() => this.hide(), MAX_MS);
  }

  /** La carte est chargée et (si possible) centrée sur la position. */
  ready(): void {
    const wait = Math.max(0, MIN_MS - (performance.now() - this.start));
    setTimeout(() => this.hide(), wait);
  }

  private hide(): void {
    if (this.done) return;
    this.done = true;
    const el = document.getElementById('splash');
    if (!el) return;
    el.classList.add('leaving');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 1000); // au cas où la transition ne se terminerait pas
  }
}
