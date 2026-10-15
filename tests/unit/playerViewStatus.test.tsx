import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';

const togglePlayerPause = vi.fn();
vi.mock('../../src/app/services/PlayerWindowService', () => ({
  PlayerWindowService: { getInstance: () => ({ togglePlayerPause }) },
}));

import { PlayerViewStatus } from '../../src/app/packages/components/toolbar/PlayerViewStatus';
import { playerWindowStore, resetPlayerWindowStore } from '../../src/app/stores/playerWindowStore';

function renderStatus(): void {
  render(
    <TooltipProvider>
      <PlayerViewStatus />
    </TooltipProvider>,
  );
}

afterEach(() => {
  cleanup();
  resetPlayerWindowStore();
  togglePlayerPause.mockClear();
});

describe('player view status', () => {
  it('shows nothing while the player window is closed', () => {
    renderStatus();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('names a live player view, then a paused one, and toggles pause', () => {
    playerWindowStore.setState({ isOpen: true, isPaused: false });
    renderStatus();
    expect(screen.getByRole('switch', { name: 'Player view live' })).toBeTruthy();

    act(() => { playerWindowStore.setState({ isPaused: true }); });
    const paused = screen.getByRole('switch', { name: 'Player view paused' });
    fireEvent.click(paused);
    expect(togglePlayerPause).toHaveBeenCalledOnce();
  });
});
