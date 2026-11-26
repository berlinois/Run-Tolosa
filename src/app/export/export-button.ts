import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TrackingStore } from '../tracking/tracking.store';
import { Export, type ExportResult } from './export.plugin';

type Destination = 'downloads' | 'picker';

@Component({
  selector: 'app-export-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tracking.available) {
      <button type="button" class="fab" (click)="open()" aria-label="Exporter mes marches">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <path d="M12 3v11m0 0-4.5-4.5M12 14l4.5-4.5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    }

    @if (dialogOpen()) {
      <div class="backdrop" (click)="close()"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <h2 id="export-title">Voulez-vous extraire vos marches ?</h2>
        <p class="muted">
          {{ walkCount() }} marche{{ walkCount() > 1 ? 's' : '' }} · traces GPS brutes, dans un fichier zip.
        </p>

        <fieldset [disabled]="exporting()">
          <label>
            <input type="radio" name="dest" [checked]="destination() === 'downloads'" (change)="destination.set('downloads')" />
            <span>
              <strong>Téléchargements</strong>
              <small>{{ fileName() }}</small>
            </span>
          </label>
          <label>
            <input type="radio" name="dest" [checked]="destination() === 'picker'" (change)="destination.set('picker')" />
            <span>
              <strong>Choisir un autre emplacement…</strong>
              <small>Drive, carte SD, autre dossier</small>
            </span>
          </label>
        </fieldset>

        @if (error(); as err) {
          <p class="error">{{ err }}</p>
        }

        <div class="actions">
          <button type="button" class="secondary" (click)="close()" [disabled]="exporting()">Annuler</button>
          <button type="button" class="primary" (click)="confirm()" [disabled]="exporting()">
            {{ exporting() ? 'Extraction…' : 'Extraire' }}
          </button>
        </div>
      </div>
    }

    @if (done(); as d) {
      <div class="toast" (click)="done.set(null)">
        ✓ {{ d.walkCount }} marche{{ d.walkCount > 1 ? 's' : '' }} extraite{{ d.walkCount > 1 ? 's' : '' }}
        dans {{ d.location }} : {{ d.fileName }}
      </div>
    }
  `,
  styles: `
    .fab {
      position: absolute; z-index: 5; right: 12px;
      bottom: calc(env(safe-area-inset-bottom) + 88px);
      width: 56px; height: 56px; border: 0; border-radius: 50%;
      display: grid; place-items: center;
      background: #fff; color: #37474f; box-shadow: 0 2px 6px #0004;
    }
    .backdrop { position: fixed; inset: 0; z-index: 20; background: #0007; }
    .dialog {
      position: fixed; z-index: 21; left: 16px; right: 16px; top: 50%; transform: translateY(-50%);
      max-width: 420px; margin: 0 auto; padding: 20px; border-radius: 16px;
      background: #fff; color: #212121; box-shadow: 0 8px 24px #0005;
    }
    h2 { margin: 0 0 4px; font-size: 18px; }
    .muted { margin: 0 0 14px; color: #757575; font-size: 14px; }
    fieldset { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    label {
      display: flex; gap: 12px; align-items: center; padding: 10px 12px;
      border: 1px solid #e0e0e0; border-radius: 10px;
    }
    label:has(input:checked) { border-color: #1e88e5; background: #e3f2fd; }
    label span { display: flex; flex-direction: column; min-width: 0; }
    small { color: #757575; font-size: 12px; overflow-wrap: anywhere; }
    input { width: 18px; height: 18px; accent-color: #1e88e5; flex: none; }
    .error { margin: 12px 0 0; color: #c62828; font-size: 14px; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
    .actions button { border: 0; border-radius: 20px; padding: 10px 18px; font-size: 15px; font-weight: 600; }
    .secondary { background: transparent; color: #1e88e5; }
    .primary { background: #1e88e5; color: #fff; }
    .toast {
      position: absolute; z-index: 15; left: 12px; right: 12px;
      top: calc(env(safe-area-inset-top) + 100px);
      padding: 10px 12px; border-radius: 10px; font-size: 14px;
      background: #2e7d32; color: #fff; box-shadow: 0 2px 8px #0004; overflow-wrap: anywhere;
    }
  `,
})
export class ExportButton {
  protected readonly tracking = inject(TrackingStore);

  protected readonly dialogOpen = signal(false);
  protected readonly destination = signal<Destination>('downloads');
  protected readonly fileName = signal('');
  protected readonly exporting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal<ExportResult | null>(null);

  protected walkCount(): number {
    return this.tracking.walks().length;
  }

  protected async open(): Promise<void> {
    this.destination.set('downloads');
    this.error.set(null);
    this.done.set(null);
    this.dialogOpen.set(true);
    try {
      this.fileName.set((await Export.suggestedFileName()).fileName);
    } catch {
      this.fileName.set('run-tolosa-marches.zip');
    }
  }

  protected close(): void {
    if (!this.exporting()) this.dialogOpen.set(false);
  }

  protected async confirm(): Promise<void> {
    this.exporting.set(true);
    this.error.set(null);
    try {
      const result =
        this.destination() === 'downloads' ? await Export.exportToDownloads() : await Export.exportToPicker();
      this.dialogOpen.set(false);
      this.done.set(result);
      setTimeout(() => this.done.set(null), 6000);
    } catch (e) {
      const err = e as { code?: string; message: string };
      if (err.code === 'CANCELLED') {
        // sélecteur fermé sans choisir : on reste sur la popup
      } else if (err.code === 'UNSUPPORTED') {
        this.destination.set('picker');
        this.error.set(err.message);
      } else {
        this.error.set(err.message);
      }
    } finally {
      this.exporting.set(false);
    }
  }
}
