import { registerPlugin } from '@capacitor/core';

export interface ExportResult {
  fileName: string;
  location: string;
  walkCount: number;
}

/** Pont vers android/.../export/ExportPlugin.java */
export interface ExportPlugin {
  suggestedFileName(): Promise<{ fileName: string }>;
  exportToDownloads(): Promise<ExportResult>;
  exportToPicker(): Promise<ExportResult>;
}

export const Export = registerPlugin<ExportPlugin>('Export');
