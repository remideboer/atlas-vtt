import { t } from '../i18n';
import type { ContextMenuEntry } from '../react/root/ContextMenuContext';
import { PLAYER_ROTATIONS, type PlayerRotation } from '../services/playerPresentation';

/** Actions the blank-canvas menu can run. Each is an existing Atlas action, not an Obsidian command id. */
export interface CanvasMenuActions {
  rotation: PlayerRotation;
  zoomLocked: boolean;
  frozen: boolean;
  paused: boolean;
  sendMap(): void;
  openPlayerWindow(): void;
  togglePause(): void;
  toggleFreeze(): void;
  unfreezeCamera(): void;
  toggleZoomLock(): void;
  setRotation(rotation: PlayerRotation): void;
  toggleInitiative(): void;
}

function angleLabel(rotation: PlayerRotation): string {
  if (rotation === 0) return t('player.rotation0');
  if (rotation === 90) return t('player.rotation90');
  if (rotation === 180) return t('player.rotation180');
  return t('player.rotation270');
}

/** The blank-map menu: a short command list and the four player-view angles. */
export function canvasMenuEntries(actions: CanvasMenuActions): ContextMenuEntry[] {
  const commands: ContextMenuEntry = {
    type: 'submenu',
    label: t('player.commands'),
    icon: 'terminal',
    children: [
      { type: 'item', label: t('command.sendMapToPlayerView'), icon: 'monitor', onClick: () => actions.sendMap() },
      { type: 'item', label: t('command.openPlayerWindow'), icon: 'popup-open', onClick: () => actions.openPlayerWindow() },
      {
        type: 'item',
        label: t('player.pauseView'),
        icon: 'pause',
        checked: actions.paused,
        onClick: () => actions.togglePause(),
      },
      {
        type: 'item',
        label: t('player.freezeCamera'),
        icon: 'lock',
        checked: actions.frozen,
        onClick: () => actions.toggleFreeze(),
      },
      {
        type: 'item',
        label: t('player.unfreezeCamera'),
        icon: 'unlock',
        disabled: !actions.frozen,
        onClick: () => actions.unfreezeCamera(),
      },
      {
        type: 'item',
        label: t('player.freezeZoom'),
        icon: 'zoom-in',
        checked: actions.zoomLocked,
        onClick: () => actions.toggleZoomLock(),
      },
      { type: 'item', label: t('command.toggleInitiativeTracker'), icon: 'swords', onClick: () => actions.toggleInitiative() },
    ],
  };
  const rotation: ContextMenuEntry = {
    type: 'submenu',
    label: t('player.rotate'),
    icon: 'rotate-cw',
    children: PLAYER_ROTATIONS.map((angle) => ({
      type: 'item' as const,
      label: angleLabel(angle),
      checked: actions.rotation === angle,
      onClick: () => actions.setRotation(angle),
    })),
  };
  return [commands, rotation];
}
