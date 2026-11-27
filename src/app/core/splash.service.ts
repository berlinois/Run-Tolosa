import { Injectable } from '@angular/core';

/**
 * Durée de l'animation d'accueil (marche dorée + monuments). Pendant ce temps,
 * l'appli ne lance AUCUN travail lourd (carte, lecture des rues, couverture) :
 * sur téléphone, ces tâches bloquaient l'animation jusqu'à une seconde.
 */
const ANIMATION_MS = 3400;
/** Au-delà, on bascule sur la carte même si elle n'est pas prête (GPS lent, refus…). */
const MAX_MS = 9000;

/**
 * Écran d'accueil (div #splash de index.html, image public/splash.svg).
 * Il glisse vers le haut quand la carte est prête ET centrée sur la position.
 */
@Injectable({ providedIn: 'root' })
export class SplashService {
  private done = false;
  private readonly present = !!document.getElementById('splash');

  /** Résolue quand l'animation est terminée : le travail lourd peut commencer. */
  readonly animationDone: Promise<void> = new Promise((resolve) =>
    setTimeout(resolve, this.present ? ANIMATION_MS : 0),
  );

  constructor() {
    setTimeout(() => this.hide(), MAX_MS);
  }

  /** La carte est chargée et (si possible) centrée sur la position. */
  ready(): void {
    void this.animationDone.then(() => this.hide());
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
