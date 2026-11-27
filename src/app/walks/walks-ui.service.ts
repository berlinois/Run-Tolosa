import { Injectable, signal } from '@angular/core';

/** État partagé de la feature « Mes marches » (page ouverte, marche affichée seule sur la carte). */
@Injectable({ providedIn: 'root' })
export class WalksUiService {
  readonly pageOpen = signal(false);
  /** Trace d'une marche à montrer seule sur la carte (« Voir sur la carte »). */
  readonly focus = signal<{ walkId: string; trace: [number, number][] } | null>(null);
}
