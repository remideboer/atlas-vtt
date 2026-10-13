import { Notice, type App } from 'obsidian';
import { t } from '../i18n';
import type { Size } from '../types/playerFrame';
import { presentActiveTab } from '../services/PlayerWindowPresenter';
import { PlayerWindowService } from '../services/PlayerWindowService';

function isCellSize(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Present the current map and show it at actual size, or turn actual size off when it is
 * already on. The GM's own zoom is left as it is.
 */
export async function sendMapAtActualSize(app: App, cellPixels: number | undefined, map: Size | null): Promise<void> {
  const players = PlayerWindowService.getInstance();
  if (!players) return;
  if (players.playerPresentation().isActualSize()) {
    await players.enableActualSize(cellPixels ?? 0, map);
    return;
  }
  if (!isCellSize(cellPixels)) {
    new Notice(t('player.actualSizeNoGrid'));
    return;
  }
  const wasOpen = players.isWindowOpen();
  if (!wasOpen) {
    await presentActiveTab(app, { openWindow: true });
    if (!players.isWindowOpen()) {
      new Notice(t('player.notOpen'));
      return;
    }
  }
  // The dialog belongs on the GM window. A player window opened just now would cover it.
  window.focus();
  if (!wasOpen) await new Promise<void>((resolve) => { window.setTimeout(resolve, 0); });
  const on = await players.enableActualSize(cellPixels, map);
  if (on && wasOpen) await presentActiveTab(app, { openWindow: true });
}

/** Ask for this device's player screen. Opens the player window first when it is closed. */
export async function openPlayerScreenSetup(app: App): Promise<void> {
  const players = PlayerWindowService.getInstance();
  if (!players) return;
  if (!players.isWindowOpen()) await presentActiveTab(app, { openWindow: true });
  if (!players.isWindowOpen()) return;
  await players.editPlayerScreen();
}
