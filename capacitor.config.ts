import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.runtolosa.app',
  appName: 'Run Tolosa',
  webDir: 'dist/run-tolosa/browser',
  // Fond de la WebView avant le premier rendu : le bordeaux de l'écran d'accueil.
  backgroundColor: '#7E2A3B',
};

export default config;
