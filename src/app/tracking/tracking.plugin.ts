import { registerPlugin, type PermissionState, type PluginListenerHandle } from '@capacitor/core';
import type { TrackPoint, TrackingStatus, Walk } from './model';

export interface TrackingPermissions {
  location: PermissionState;
  notifications: PermissionState;
  /** Podomètre (« activité physique »). */
  activity: PermissionState;
}

/** Pont vers android/.../tracking/TrackingPlugin.java */
export interface TrackingPlugin {
  checkPermissions(): Promise<TrackingPermissions>;
  requestPermissions(options?: { permissions: (keyof TrackingPermissions)[] }): Promise<TrackingPermissions>;
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): Promise<TrackingStatus>;
  listWalks(): Promise<{ walks: Walk[] }>;
  getTrack(options: { walkId: string }): Promise<{ points: TrackPoint[] }>;
  deleteWalk(options: { walkId: string }): Promise<void>;
  markProcessed(options: { walkId: string; processedWith: string }): Promise<void>;
  addListener(event: 'point', cb: (e: { point: TrackPoint; walk: Walk }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'state', cb: (s: TrackingStatus) => void): Promise<PluginListenerHandle>;
}

export const Tracking = registerPlugin<TrackingPlugin>('Tracking');
