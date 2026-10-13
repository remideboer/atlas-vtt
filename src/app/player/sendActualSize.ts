import { Notice, type App } from 'obsidian';
import { t } from '../i18n';
import type { Size } from '../types/playerFrame';
import { paperSpan, type PaperSize } from './paperSize';
import { presentActiveTab } from '../services/PlayerWindowPresenter';
import { PlayerWindowService } from '../services/PlayerWindowService';

function isCellSize(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Open the player window when it is closed, present the current map, and show it at actual size
 * in a window that fills its screen. When actual size is already on in an open window, turn it
 * off. The GM's own zoom is left as it is. A paper size stands in for a grid that was never found.
 */
export async function sendMapAtActualSize(app: App, cellPixels: number | undefined, map: Size | null, paper?: PaperSize | null): Promise<void> {
  const open = PlayerWindowService.getInstance();
  if (open?.isWindowOpen() && open.playerPresentation().isActualSize()) {
    await open.enableActualSize(cellPixels ?? 0, map);
    return;
  }
  if (!isCellSize(cellPixels) && !paperSpan(paper, map)) {
    new Notice(t('player.actualSizeNoGrid'));
    return;
  }
  let players = open;
  const wasOpen = players?.isWindowOpen() ?? false;
  if (!wasOpen) {
    await presentActiveTab(app, { openWindow: true });
    players = PlayerWindowService.getInstance();
    if (!players?.isWindowOpen()) {
      new Notice(t('player.notOpen'));
      return;
    }
  }
  if (!players) return;
  await players.maximizeWindow();
  // The dialog belongs on the GM window. A player window opened just now would cover it.
  window.focus();
  if (!wasOpen) await new Promise<void>((resolve) => { window.setTimeout(resolve, 0); });
  const on = await players.enableActualSize(isCellSize(cellPixels) ? cellPixels : 0, map);
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
