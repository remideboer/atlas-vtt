import React, { useId, useState } from 'react';
import { Modal, Notice, type App } from 'obsidian';
import type { Root } from 'react-dom/client';
import type { AtlasView } from '../../../atlas-view';
import type { Point } from '../../../clipboard/mapObjectContent';
import { FiveEToolsBestiary } from '../../../fiveETools/FiveEToolsBestiary';
import { insertFailureOf } from '../../../fiveETools/insertErrors';
import { withRecentFiveEUid } from '../../../fiveETools/libraryStatus';
import { monsterResources } from '../../../fiveETools/monsterResources';
import type { FiveEMonster } from '../../../fiveETools/types';
import { mapResources } from '../../../resources/collectionResources';
import { AssetService, type TokenAsset as ServiceTokenAsset } from '../../../services/AssetService';
import { tokenForCreature } from '../../../services/creatureNote';
import { currentFantasyStatblock } from '../../../services/currentFantasyStatblock';
import { initiativeEntryForToken } from '../../../stores/initiativeEntries';
import { playerWindowStore } from '../../../stores/playerWindowStore';
import { insertBlankToken } from '../../../tools/insertBlankToken';
import { attachModalDrag } from '../../../ui/modalDrag';
import { ATLAS_NATIVE_MODAL_CLASSES } from '../../../ui/nativeModal';
import { t } from '../../../i18n';
import { Button } from '../primitives/button';
import { SegmentedControl } from '../primitives/SegmentedControl';
import { ToggleSwitch } from '../primitives/Toggle';
import { TokenCreatorModal } from '../asset-manager/token-creator/TokenCreatorModal';
import { spawnTokenAsset, type SpawnContext } from '../asset-manager/utils/tokenSpawnService';
import type { TokenAsset as SpawnTokenAsset } from '../asset-manager/types';
import { FiveEToolsPickerContent } from './FiveEToolsPickerContent';
import { TokenLibraryPickerContent, type PickableLibraryToken } from './TokenLibraryPickerContent';
import './token-picker.scss';

type InsertSource = 'library' | 'fiveETools';

interface InsertTokenPickerContentProps {
  app: App;
  view: AtlasView;
  at: Point | null;
  onClose: () => void;
}

/** Session View, or the player window open on this scene tab. */
function playersWatchingInsert(view: AtlasView): boolean {
  if (!view.getStore().getState().isGMView) return true;
  const { isOpen, shownTabId } = playerWindowStore.getState();
  if (!isOpen || !shownTabId) return false;
  return view.tabMetaStore.getState().activeTabId === shownTabId;
}

/** Opens a picker to place a library token or a blank disc at `at` (or the last map pointer). */
export function openInsertTokenPicker(app: App, view: AtlasView | null, at?: Point | null): void {
  if (!view || view.getStore().getState().isPlayerView) return;
  const { mapPath, isMapLoading, mapLoaded } = view.getStore().getState();
  if (!mapPath || isMapLoading || !mapLoaded) return;
  new InsertTokenPickerModal(app, view, at ?? null).open();
}

class InsertTokenPickerModal extends Modal {
  private root: Root | null = null;
  private disposeDrag: (() => void) | null = null;
  private readonly view: AtlasView;
  private readonly at: Point | null;

  constructor(app: App, view: AtlasView, at: Point | null) {
    super(app);
    this.view = view;
    this.at = at;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.containerEl.addClass('token-picker-modal-layer');
    this.modalEl.addClass(...ATLAS_NATIVE_MODAL_CLASSES, 'token-picker-modal-wrapper');
    this.titleEl.setText(t('picker.insert.title'));
    const handle = this.titleEl.closest('.modal-header') ?? this.titleEl;
    this.disposeDrag = attachModalDrag(this.modalEl, handle);
    const container = contentEl.createDiv({ cls: 'token-picker-root' });
    import('react-dom/client').then(({ createRoot }) => {
      this.root = createRoot(container);
      this.root.render(
        React.createElement(InsertTokenPickerContent, {
          app: this.app,
          view: this.view,
          at: this.at,
          onClose: () => this.close(),
        }),
      );
    }).catch((error) => {
      console.error('[InsertTokenPicker] Failed to create React root:', error);
      contentEl.setText(t('picker.insert.failed'));
    });
  }

  onClose(): void {
    this.disposeDrag?.();
    this.disposeDrag = null;
    this.root?.unmount();
    this.root = null;
  }
}

function spawnAssetOf(token: ServiceTokenAsset): SpawnTokenAsset {
  return {
    id: token.id,
    name: token.name,
    type: 'tokens',
    imagePath: token.imagePath,
    imageUrl: token.imagePath,
    modifiedAt: token.modifiedAt,
    ...(token.tags !== undefined && { tags: token.tags }),
    ...(token.showRing !== undefined && { showRing: token.showRing }),
    ...(token.size !== undefined && { size: token.size }),
    ...(token.statblockPath !== undefined && { statblockPath: token.statblockPath }),
  };
}

function noticeForFiveEFailure(error: unknown): string {
  switch (insertFailureOf(error)) {
    case 'path':
      return error instanceof Error ? error.message : t('picker.fiveETools.loadFailed');
    case 'art':
      return t('picker.fiveETools.artFailed');
    case 'vault':
      return t('picker.fiveETools.vaultFailed');
    default:
      return t('picker.fiveETools.insertFailed');
  }
}

const InsertTokenPickerContent: React.FC<InsertTokenPickerContentProps> = ({ app, view, at, onClose }) => {
  const settings = view.serviceManager.getSettingsService();
  const savedPicker = settings.getSetting('insertTokenPicker');
  const [insertHidden, setInsertHidden] = useState(
    () => playersWatchingInsert(view),
  );
  const [addInitiative, setAddInitiative] = useState(false);
  const [showBars, setShowBars] = useState(false);
  const [source, setSource] = useState<InsertSource>(savedPicker.lastSource);
  const [recentUids, setRecentUids] = useState<string[]>(() => [...savedPicker.recentFiveEUids]);
  const [busy, setBusy] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [statusRevision, setStatusRevision] = useState(0);
  const [selectedFiveE, setSelectedFiveE] = useState<FiveEMonster | null>(null);
  const hiddenLabelId = useId();
  const hiddenHintId = useId();
  const initiativeLabelId = useId();
  const initiativeHintId = useId();
  const barsLabelId = useId();
  const barsHintId = useId();

  const spawnCtx = (): SpawnContext => ({
    app,
    view,
    assetService: AssetService.getInstance(app),
    ...(at && { at }),
  });

  const collectionId = (): string => {
    const assets = AssetService.getInstance(app);
    const mapPath = view.getStore().getState().mapPath;
    return (mapPath ? assets.getCollectionForMap(mapPath) : null) ?? AssetService.defaultCollectionId();
  };

  const changeSource = (next: InsertSource): void => {
    setSource(next);
    settings.setSetting('insertTokenPicker', {
      ...settings.getSetting('insertTokenPicker'),
      lastSource: next,
    });
  };

  const afterSpawn = (ids: string[]): void => {
    if (!addInitiative || ids.length === 0) return;
    const { objects, addToInitiative } = view.getStore().getState();
    for (const id of ids) {
      const token = objects.tokens[id];
      if (token) addToInitiative(initiativeEntryForToken(token));
    }
  };

  const hideFromPlayers = (): boolean => insertHidden || playersWatchingInsert(view);

  const spawnOptions = (): { isHidden?: boolean; hideBarsFromPlayers?: boolean } => ({
    ...(hideFromPlayers() && { isHidden: true }),
    ...(showBars && { hideBarsFromPlayers: false }),
  });

  const onPick = (pick: PickableLibraryToken | 'blank'): void => {
    if (busy) return;
    if (pick === 'blank') {
      insertBlankToken(app, view, at, { isHidden: hideFromPlayers() });
      return;
    }
    setBusy(true);
    void spawnTokenAsset(spawnCtx(), spawnAssetOf(pick), 1, spawnOptions())
      .then((ids) => {
        afterSpawn(ids);
        setBusy(false);
      })
      .catch((error) => {
        console.error('[InsertTokenPicker] Failed to spawn token:', error);
        new Notice(t('picker.insert.spawnFailed'));
        setBusy(false);
      });
  };

  const insertSelectedFiveEThenClose = (): void => {
    if (busy) return;
    const monster = selectedFiveE;
    if (!monster) {
      onClose();
      return;
    }
    setBusy(true);
    setBusyUid(monster.uid);
    const assets = AssetService.getInstance(app);
    const resources = monsterResources(monster, mapResources(assets, view.getStore().getState().mapPath));
    void FiveEToolsBestiary.forApp(app)
      .ensureTokenForMonster(monster, collectionId())
      .then((token) => spawnTokenAsset(spawnCtx(), spawnAssetOf(token), 1, {
        ...spawnOptions(),
        resources,
      }))
      .then((ids) => {
        afterSpawn(ids);
        const nextRecents = withRecentFiveEUid(settings.getSetting('insertTokenPicker').recentFiveEUids, monster.uid);
        settings.setSetting('insertTokenPicker', {
          ...settings.getSetting('insertTokenPicker'),
          recentFiveEUids: nextRecents,
        });
        setRecentUids(nextRecents);
        setStatusRevision((n) => n + 1);
        setBusy(false);
        setBusyUid(null);
        onClose();
      })
      .catch((error) => {
        console.error('[InsertTokenPicker] Failed to insert 5e.tools creature:', error);
        new Notice(noticeForFiveEFailure(error));
        setBusy(false);
        setBusyUid(null);
      });
  };

  const onDone = (): void => {
    if (source === 'fiveETools') {
      insertSelectedFiveEThenClose();
      return;
    }
    onClose();
  };

  const openCreateToken = (): void => {
    new TokenCreatorModal(app, { selectedCollection: collectionId(), initialSource: 'images' }).open();
  };

  const currentStatblock = currentFantasyStatblock(app);

  const insertCurrentStatblock = (): void => {
    if (busy) return;
    const creature = currentFantasyStatblock(app);
    if (!creature) {
      new Notice(t('picker.insert.currentNone'));
      return;
    }
    setBusy(true);
    void tokenForCreature(app, creature, collectionId())
      .then((token) => {
        if (!token) {
          setBusy(false);
          return;
        }
        return spawnTokenAsset(spawnCtx(), spawnAssetOf(token), 1, spawnOptions()).then((ids) => {
          afterSpawn(ids);
          setBusy(false);
          onClose();
        });
      })
      .catch((error) => {
        console.error('[InsertTokenPicker] Failed to insert the current statblock:', error);
        new Notice(t('picker.insert.currentImportFailed'));
        setBusy(false);
      });
  };

  return (
    <div className="token-picker-insert">
      <div className="token-picker-insert-toolbar">
        <div className="token-picker-insert-toolbar__row">
          <SegmentedControl<InsertSource>
            value={source}
            ariaLabel={t('picker.insert.source')}
            options={[
              { value: 'library', label: t('picker.insert.sourceLibrary') },
              { value: 'fiveETools', label: t('picker.insert.sourceFiveETools') },
            ]}
            onChange={changeSource}
            disabled={busy}
          />
          {source === 'library' && (
            <Button variant="outline" size="sm" onClick={openCreateToken} disabled={busy}>
              {t('picker.insert.createToken')}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={insertCurrentStatblock}
            disabled={busy || currentStatblock === null}
          >
            {t('picker.insert.currentStatblock')}
          </Button>
          <Button variant="default" size="sm" onClick={onDone} disabled={busy}>
            {t('picker.insert.done')}
          </Button>
        </div>
        <div className="token-picker-insert-option">
          <div className="token-picker-insert-option__text">
            <span id={hiddenLabelId} className="token-picker-insert-option__label">
              {t('picker.insert.hidden')}
            </span>
            <span id={hiddenHintId} className="token-picker-insert-option__hint">
              {t('picker.insert.hiddenHint')}
            </span>
          </div>
          <ToggleSwitch
            labelledBy={hiddenLabelId}
            aria-describedby={hiddenHintId}
            value={insertHidden}
            onChange={() => setInsertHidden((current) => !current)}
          />
        </div>
        <div className="token-picker-insert-option">
          <div className="token-picker-insert-option__text">
            <span id={initiativeLabelId} className="token-picker-insert-option__label">
              {t('picker.insert.addInitiative')}
            </span>
            <span id={initiativeHintId} className="token-picker-insert-option__hint">
              {t('picker.insert.addInitiativeHint')}
            </span>
          </div>
          <ToggleSwitch
            labelledBy={initiativeLabelId}
            aria-describedby={initiativeHintId}
            value={addInitiative}
            onChange={() => setAddInitiative((current) => !current)}
          />
        </div>
        <div className="token-picker-insert-option">
          <div className="token-picker-insert-option__text">
            <span id={barsLabelId} className="token-picker-insert-option__label">
              {t('picker.insert.showBars')}
            </span>
            <span id={barsHintId} className="token-picker-insert-option__hint">
              {t('picker.insert.showBarsHint')}
            </span>
          </div>
          <ToggleSwitch
            labelledBy={barsLabelId}
            aria-describedby={barsHintId}
            value={showBars}
            onChange={() => setShowBars((current) => !current)}
          />
        </div>
      </div>
      {source === 'library' ? (
        <TokenLibraryPickerContent
          app={app}
          selectLabel={t('picker.insert.select')}
          blankLabel={t('picker.insert.blank')}
          onPick={onPick}
        />
      ) : (
        <FiveEToolsPickerContent
          app={app}
          onSelectionChange={setSelectedFiveE}
          onConfirm={insertSelectedFiveEThenClose}
          busy={busy}
          busyUid={busyUid}
          recentUids={recentUids}
          statusRevision={statusRevision}
        />
      )}
    </div>
  );
};
