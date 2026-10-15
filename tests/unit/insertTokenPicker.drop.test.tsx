import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtlasView } from '../../src/app/atlas-view';
import type { App } from 'obsidian';
import { writePickerTokenDrag, type PickerTokenPayload } from '../../src/app/clipboard/pickerMapDrop';
import type { FiveEMonster } from '../../src/app/fiveETools/types';
import type { TokenAsset as ServiceTokenAsset } from '../../src/app/services/AssetService';

const { spawnTokenAsset, ensureTokenForMonster, getAssetById, getCatalog } = vi.hoisted(() => ({
  spawnTokenAsset: vi.fn(async () => ['tok_1']),
  ensureTokenForMonster: vi.fn(async () => ({
    id: 'fivee-goblin',
    name: 'Goblin',
    type: 'token' as const,
    imagePath: 'tokens/goblin.png',
    modifiedAt: 0,
    collection: 'dungeon',
    createdAt: 0,
  })),
  getAssetById: vi.fn(),
  getCatalog: vi.fn(),
}));

vi.mock('../../src/app/packages/components/asset-manager/utils/tokenSpawnService', () => ({
  spawnTokenAsset,
}));

vi.mock('../../src/app/fiveETools/FiveEToolsBestiary', () => ({
  FiveEToolsBestiary: {
    forApp: () => ({
      getCatalog,
      ensureTokenForMonster,
      configuredPath: () => 'D:/5etools',
    }),
  },
}));

vi.mock('../../src/app/services/AssetService', () => ({
  AssetService: {
    getInstance: () => ({
      getCollectionForMap: () => 'dungeon',
      getCollectionSettings: () => ({ conditions: [] }),
      getAssetById,
    }),
    defaultCollectionId: () => 'dungeon',
  },
}));

vi.mock('../../src/app/packages/components/token-picker/TokenLibraryPickerContent', () => ({
  TokenLibraryPickerContent: () => <div data-testid="library-picker" />,
}));

const monster: FiveEMonster = {
  name: 'Goblin',
  source: 'MM',
  uid: 'goblin|MM',
  cr: '1/4',
  size: 'Small',
  type: 'humanoid',
  alignment: 'neutral evil',
  ac: '15',
  hp: '7',
  hasToken: true,
};

vi.mock('../../src/app/packages/components/token-picker/FiveEToolsPickerContent', () => ({
  FiveEToolsPickerContent: ({
    onSelectionChange,
  }: {
    onSelectionChange: (next: FiveEMonster | null) => void;
  }) => {
    React.useEffect(() => {
      onSelectionChange(monster);
    }, [onSelectionChange]);
    return <div data-testid="fivee-picker" />;
  },
}));

vi.mock('../../src/app/services/currentFantasyStatblock', () => ({
  currentFantasyStatblock: () => null,
}));

vi.mock('../../src/app/packages/components/asset-manager/token-creator/TokenCreatorModal', () => ({
  TokenCreatorModal: class {},
}));

vi.mock('../../src/app/stores/playerWindowStore', () => ({
  playerWindowStore: { getState: () => ({ isOpen: false, shownTabId: null }) },
}));

import { InsertTokenPickerContent } from '../../src/app/packages/components/token-picker/InsertTokenPickerModal';

const goblin: ServiceTokenAsset = {
  id: 'goblin',
  name: 'Goblin',
  type: 'token',
  imagePath: 'tokens/goblin.png',
  collection: 'dungeon',
  createdAt: 0,
  modifiedAt: 0,
};

function setBox(el: HTMLElement, left: number, top: number, width: number, height: number): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  });
}

function transfer(): DataTransfer {
  const data: Record<string, string> = {};
  return {
    setData: (type: string, value: string) => { data[type] = value; },
    getData: (type: string) => data[type] ?? '',
    types: data,
    effectAllowed: 'all',
    dropEffect: 'none',
  } as unknown as DataTransfer;
}

function dropOn(clientX: number, clientY: number, payload: PickerTokenPayload): void {
  const dataTransfer = transfer();
  writePickerTokenDrag(dataTransfer, payload);
  const event = new MouseEvent('drop', { bubbles: true, cancelable: true, clientX, clientY });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  window.dispatchEvent(event);
}

function pickerView(lastSource: 'library' | 'fiveETools', canvas: HTMLCanvasElement): AtlasView {
  const viewport = { toWorld: (x: number, y: number) => ({ x, y }) };
  return {
    serviceManager: {
      getSettingsService: () => ({
        getSetting: () => ({ lastSource, recentFiveEUids: [] }),
        setSetting: vi.fn(),
      }),
      getRendererService: () => ({
        getApp: () => ({ canvas }),
        getRenderer: () => ({ getCanvasElement: () => canvas }),
        getViewport: () => viewport,
      }),
    },
    getStore: () => ({
      getState: () => ({
        isGMView: true,
        mapPath: 'maps/cave.atlasmap',
        isMapLoading: false,
        mapLoaded: true,
        objects: { tokens: {} },
        addToInitiative: vi.fn(),
      }),
    }),
    tabMetaStore: { getState: () => ({ activeTabId: 'tab-1' }) },
  } as unknown as AtlasView;
}

describe('Insert token picker map drop', () => {
  let canvas: HTMLCanvasElement;
  let modalEl: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = document.createElement('canvas');
    modalEl = document.createElement('div');
    document.body.appendChild(canvas);
    document.body.appendChild(modalEl);
    setBox(canvas, 0, 0, 400, 300);
    setBox(modalEl, 500, 400, 80, 40);
    getAssetById.mockResolvedValue(goblin);
    getCatalog.mockResolvedValue([monster]);
  });

  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('spawns a library token at the drop and keeps the picker open', async () => {
    const onClose = vi.fn();
    render(
      <InsertTokenPickerContent
        app={{} as App}
        view={pickerView('library', canvas)}
        at={null}
        onClose={onClose}
        modalEl={modalEl}
      />,
    );

    await act(async () => {
      dropOn(80, 60, { kind: 'library', id: 'goblin' });
    });

    await waitFor(() => expect(spawnTokenAsset).toHaveBeenCalledOnce());
    expect(spawnTokenAsset.mock.calls[0]?.[0]).toMatchObject({ at: { x: 80, y: 60 } });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('spawns a 5e.tools creature at the drop and does not close', async () => {
    const onClose = vi.fn();
    render(
      <InsertTokenPickerContent
        app={{} as App}
        view={pickerView('fiveETools', canvas)}
        at={null}
        onClose={onClose}
        modalEl={modalEl}
      />,
    );

    await act(async () => {
      dropOn(40, 20, { kind: 'fiveE', uid: 'goblin|MM' });
    });

    await waitFor(() => expect(spawnTokenAsset).toHaveBeenCalledOnce());
    expect(ensureTokenForMonster).toHaveBeenCalledWith(monster, 'dungeon');
    expect(spawnTokenAsset.mock.calls[0]?.[0]).toMatchObject({ at: { x: 40, y: 20 } });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Done without placing the selected 5e.tools creature', async () => {
    const onClose = vi.fn();
    render(
      <InsertTokenPickerContent
        app={{} as App}
        view={pickerView('fiveETools', canvas)}
        at={null}
        onClose={onClose}
        modalEl={modalEl}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(spawnTokenAsset).not.toHaveBeenCalled();
  });
});
