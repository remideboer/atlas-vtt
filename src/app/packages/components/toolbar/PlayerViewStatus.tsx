import React, { useId, useSyncExternalStore } from 'react';
import { Monitor, Pause } from 'lucide-react';
import { Toggle } from '../primitives/Toggle';
import { playerWindowStore } from '../../../stores/playerWindowStore';
import { PlayerWindowService } from '../../../services/PlayerWindowService';
import { t } from '../../../i18n';

/** DM toolbar status for the player window: hidden while closed, a pause switch while open. */
export function PlayerViewStatus(): React.ReactElement | null {
  const labelId = useId();
  const { isOpen, isPaused } = useSyncExternalStore(playerWindowStore.subscribe, playerWindowStore.getState);
  if (!isOpen) return null;
  return (
    <>
      <span id={labelId} className="sr-only">{isPaused ? t('player.viewPaused') : t('player.viewLive')}</span>
      <Toggle
        value={isPaused}
        onChange={() => { PlayerWindowService.getInstance()?.togglePlayerPause(); }}
        iconOn={Pause}
        iconOff={Monitor}
        labelledBy={labelId}
        tooltipOn={t('player.viewPaused')}
        tooltipOff={t('player.viewLive')}
      />
    </>
  );
}
