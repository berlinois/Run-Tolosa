import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Geolocation, type Position } from '@capacitor/geolocation';

/**
 * Phase 0 : position ponctuelle, appli au premier plan.
 * Phase 1 : le suivi écran éteint passera par le plugin Java
 * `TrackingPlugin` (foreground service) qui écrit les points dans un fichier.
 */
@Injectable({ providedIn: 'root' })
export class LocationService {
  async currentPosition(): Promise<Position> {
    if (Capacitor.isNativePlatform()) {
      const perm = await Geolocation.requestPermissions({ permissions: ['location'] });
      if (perm.location !== 'granted') {
        throw new Error('Permission de localisation refusée');
      }
    }
    return Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
  }
}
