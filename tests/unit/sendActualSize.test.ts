import type { App } from 'obsidian';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Notice } from 'obsidian';
import type { Size } from '../../src/app/types/playerFrame';
import { playerWindowStore, resetPlayerWindowStore } from '../../src/app/stores/playerWindowStore';

interface Players {
  isWindowOpen(): boolean;
  playerPresentation(): { isActualSize(): boolean };
  enableActualSize: ReturnType<typeof vi.fn>;
  maximizeWindow: ReturnType<typeof vi.fn>;
}

const held = vi.hoisted(() => ({ current: null as Players | null }));

vi.mock('obsidian', async (importOriginal) => ({
  ...(await importOriginal<typeof import('obsidian')>()),
  Notice: vi.fn(),
}));

vi.mock('../../src/app/atlas-view', () => ({
  AtlasView: class AtlasView {},
  ATLAS_VIEW_TYPE: 'atlas-vtt',
}));

vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({
  presentActiveTab: vi.fn(),
  closePlayerWindow: vi.fn(),
}));

vi.mock('../../src/app/services/PlayerWindowService', () => ({
  PlayerWindowService: {
    getInstance: (): Players | null => held.current,
  },
}));

import { presentActiveTab } from '../../src/app/services/PlayerWindowPresenter';
import { sendMapAtActualSize } from '../../src/app/player/sendActualSize';

const map: Size = { width: 800, height: 600 };

function appOnTab(tabId: string): App {
  return {
    workspace: {
      getActiveViewOfType: () => ({
        tabMetaStore: { getState: () => ({ activeTabId: tabId }) },
      }),
    },
  } as unknown as App;
}

function players(open: boolean, actual: boolean, turnsOn = true): Players {
  return {
    isWindowOpen: () => open,
    playerPresentation: () => ({ isActualSize: () => actual }),
    enableActualSize: vi.fn(async () => turnsOn),
    maximizeWindow: vi.fn(async () => undefined),
  };
}

describe('send map at actual size', () => {
  beforeEach(() => {
    held.current = null;
    resetPlayerWindowStore();
    vi.mocked(presentActiveTab).mockReset();
    vi.mocked(Notice).mockClear();
    vi.spyOn(window, 'focus').mockImplementation(() => undefined);
  });

  test('opens the window, then maximizes it and shows the map at actual size', async () => {
    const opened = players(true, false);
    vi.mocked(presentActiveTab).mockImplementation(async () => {
      held.current = opened;
    });

    await sendMapAtActualSize(appOnTab('tab-a'), 70, map);

    expect(presentActiveTab).toHaveBeenCalledTimes(1);
    expect(presentActiveTab).toHaveBeenCalledWith(expect.anything(), { openWindow: true });
    expect(opened.maximizeWindow).toHaveBeenCalledTimes(1);
    expect(opened.enableActualSize).toHaveBeenCalledWith(70, map);
    expect(vi.mocked(presentActiveTab).mock.invocationCallOrder[0]).toBeLessThan(opened.maximizeWindow.mock.invocationCallOrder[0]);
    expect(opened.maximizeWindow.mock.invocationCallOrder[0]).toBeLessThan(opened.enableActualSize.mock.invocationCallOrder[0]);
  });

  test('turns actual size off without presenting when the open window already shows this map at actual size', async () => {
    const open = players(true, true);
    held.current = open;
    playerWindowStore.setState({ shownTabId: 'tab-a' });

    await sendMapAtActualSize(appOnTab('tab-a'), 70, map);

    expect(open.enableActualSize).toHaveBeenCalledWith(70, map);
    expect(open.maximizeWindow).not.toHaveBeenCalled();
    expect(presentActiveTab).not.toHaveBeenCalled();
  });

  test('presents the current map and keeps actual size when the window still shows another scene', async () => {
    const open = players(true, true);
    held.current = open;
    playerWindowStore.setState({ shownTabId: 'tab-a' });

    await sendMapAtActualSize(appOnTab('tab-b'), 70, map);

    expect(presentActiveTab).toHaveBeenCalledTimes(1);
    expect(presentActiveTab).toHaveBeenCalledWith(expect.anything(), { openWindow: true });
    expect(open.maximizeWindow).toHaveBeenCalledTimes(1);
    expect(open.enableActualSize).not.toHaveBeenCalled();
  });

  test('presents the current map, then turns actual size on, when the window still shows another scene', async () => {
    const open = players(true, false);
    held.current = open;
    playerWindowStore.setState({ shownTabId: 'tab-a' });

    await sendMapAtActualSize(appOnTab('tab-b'), 70, map);

    expect(presentActiveTab).toHaveBeenCalledTimes(1);
    expect(presentActiveTab).toHaveBeenCalledWith(expect.anything(), { openWindow: true });
    expect(open.maximizeWindow).toHaveBeenCalledTimes(1);
    expect(open.enableActualSize).toHaveBeenCalledWith(70, map);
    expect(vi.mocked(presentActiveTab).mock.invocationCallOrder[0]).toBeLessThan(open.enableActualSize.mock.invocationCallOrder[0]);
  });

  test('does not open a window when the grid has no size', async () => {
    await sendMapAtActualSize(appOnTab('tab-a'), undefined, map);

    expect(presentActiveTab).not.toHaveBeenCalled();
    expect(Notice).toHaveBeenCalledWith('Set the grid size before sending the map at actual size');
  });

  test('opens the window when a paper size stands in for a missing grid', async () => {
    const opened = players(true, false);
    vi.mocked(presentActiveTab).mockImplementation(async () => {
      held.current = opened;
    });

    await sendMapAtActualSize(appOnTab('tab-a'), undefined, map, { widthInches: 36 });

    expect(presentActiveTab).toHaveBeenCalledWith(expect.anything(), { openWindow: true });
    expect(opened.maximizeWindow).toHaveBeenCalledTimes(1);
    expect(opened.enableActualSize).toHaveBeenCalledWith(0, map);
    expect(Notice).not.toHaveBeenCalled();
  });

  test('says the window is not open when presenting it does not open one', async () => {
    vi.mocked(presentActiveTab).mockResolvedValue(undefined);

    await sendMapAtActualSize(appOnTab('tab-a'), 70, map);

    expect(presentActiveTab).toHaveBeenCalledWith(expect.anything(), { openWindow: true });
    expect(Notice).toHaveBeenCalledWith('Player window is not open');
  });
});
