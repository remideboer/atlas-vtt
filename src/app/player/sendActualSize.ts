import { Notice, type App } from 'obsidian';
import { t } from '../i18n';
import { AtlasView } from '../atlas-view';
import type { Size } from '../types/playerFrame';
import { paperSpan, type PaperSize } from './paperSize';
import { presentActiveTab } from '../services/PlayerWindowPresenter';
import { PlayerWindowService } from '../services/PlayerWindowService';
import { playerWindowStore } from '../stores/playerWindowStore';

function isCellSize(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function activeTabIdOf(app: App): string | null {
  return app.workspace.getActiveViewOfType(AtlasView)?.tabMetaStore.getState().activeTabId ?? null;
}

function windowShowsTab(tabId: string | null): boolean {
  return tabId !== null && playerWindowStore.getState().shownTabId === tabId;
}

/**
 * Open the player window when it is closed, present the current map, and show it at actual size
 * in a window that fills its screen. When actual size is already on for the map the window is
 * showing, turn it off. Sending another scene replaces the held picture instead of toggling.
 * The GM's own zoom is left as it is. A paper size stands in for a grid that was never found.
 */
export async function sendMapAtActualSize(app: App, cellPixels: number | undefined, map: Size | null, paper?: PaperSize | null): Promise<void> {
  const open = PlayerWindowService.getInstance();
  if (open?.isWindowOpen() && open.playerPresentation().isActualSize() && windowShowsTab(activeTabIdOf(app))) {
    await open.enableActualSize(cellPixels ?? 0, map);
    return;
  }
  if (!isCellSize(cellPixels) && !paperSpan(paper, map)) {
    new Notice(t('player.actualSizeNoGrid'));
    return;
  }
  await presentActiveTab(app, { openWindow: true });
  const players = PlayerWindowService.getInstance();
  if (!players?.isWindowOpen()) {
    new Notice(t('player.notOpen'));
    return;
  }
  await players.maximizeWindow();
  // The dialog belongs on the GM window. A player window opened just now would cover it.
  window.focus();
  if (players.playerPresentation().isActualSize()) return;
  await players.enableActualSize(isCellSize(cellPixels) ? cellPixels : 0, map);
}

/** Ask for this device's player screen. Opens the player window first when it is closed. */
export async function openPlayerScreenSetup(app: App): Promise<void> {
  const players = PlayerWindowService.getInstance();
  if (!players) return;
  if (!players.isWindowOpen()) await presentActiveTab(app, { openWindow: true });
  if (!players.isWindowOpen()) return;
  await players.editPlayerScreen();
}
