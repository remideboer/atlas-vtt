import { MAP_ORIENTATIONS, type MapOrientation } from '../grid/mapOrientation';
import { t } from '../i18n';
import type { ContextMenuEntry } from '../react/root/ContextMenuContext';
import { PLAYER_ROTATIONS, type PlayerRotation } from '../services/playerPresentation';

/** Actions the blank-canvas menu can run. Each is an existing Atlas action, not an Obsidian command id. */
export interface CanvasMenuActions {
  rotation: PlayerRotation;
  mapOrientation: MapOrientation;
  zoomLocked: boolean;
  paused: boolean;
  actualSize: boolean;
  insertToken(): void;
  sendMap(): void;
  sendActualSize(): void;
  openScreenSetup(): void;
  openPlayerWindow(): void;
  togglePause(): void;
  toggleZoomLock(): void;
  setRotation(rotation: PlayerRotation): void;
  setMapOrientation(orientation: MapOrientation): void;
  toggleInitiative(): void;
}

function angleLabel(rotation: PlayerRotation): string {
  if (rotation === 0) return t('player.rotation0');
  if (rotation === 90) return t('player.rotation90');
  if (rotation === 180) return t('player.rotation180');
  return t('player.rotation270');
}

/** The blank-map menu: insert token, player commands, the player-view angles, and the map's own quarter-turns. */
export function canvasMenuEntries(actions: CanvasMenuActions): ContextMenuEntry[] {
  const insertToken: ContextMenuEntry = {
    type: 'item',
    label: t('palette.insertBlankToken'),
    icon: 'circle-user',
    onClick: () => actions.insertToken(),
  };
  const commands: ContextMenuEntry = {
    type: 'submenu',
    label: t('player.commands'),
    icon: 'terminal',
    children: [
      { type: 'item', label: t('command.sendMapToPlayerView'), icon: 'monitor', onClick: () => actions.sendMap() },
      {
        type: 'item',
        label: t('player.sendActualSize'),
        icon: 'ruler',
        checked: actions.actualSize,
        onClick: () => actions.sendActualSize(),
      },
      { type: 'item', label: t('player.screenSetup'), icon: 'monitor', onClick: () => actions.openScreenSetup() },
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
  const map: ContextMenuEntry = {
    type: 'submenu',
    label: t('player.rotateMap'),
    icon: 'rotate-cw',
    children: MAP_ORIENTATIONS.map((angle) => ({
      type: 'item' as const,
      label: angleLabel(angle),
      checked: actions.mapOrientation === angle,
      onClick: () => actions.setMapOrientation(angle),
    })),
  };
  return [insertToken, commands, rotation, map];
}
