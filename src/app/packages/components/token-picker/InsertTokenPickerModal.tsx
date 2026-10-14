import React, { useId, useState } from 'react';
import { Modal, type App } from 'obsidian';
import type { Root } from 'react-dom/client';
import type { AtlasView } from '../../../atlas-view';
import type { Point } from '../../../clipboard/mapObjectContent';
import { AssetService, type TokenAsset as ServiceTokenAsset } from '../../../services/AssetService';
import { insertBlankToken } from '../../../tools/insertBlankToken';
import { ATLAS_NATIVE_MODAL_CLASSES } from '../../../ui/nativeModal';
import { t } from '../../../i18n';
import { Button } from '../primitives/button';
import { ToggleSwitch } from '../primitives/Toggle';
import { TokenCreatorModal } from '../asset-manager/token-creator/TokenCreatorModal';
import { spawnTokenAsset, type SpawnContext } from '../asset-manager/utils/tokenSpawnService';
import type { TokenAsset as SpawnTokenAsset } from '../asset-manager/types';
import { TokenLibraryPickerContent, type PickableLibraryToken } from './TokenLibraryPickerContent';
import './token-picker.scss';

interface InsertTokenPickerContentProps {
  app: App;
  view: AtlasView;
  at: Point | null;
  onClose: () => void;
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

const InsertTokenPickerContent: React.FC<InsertTokenPickerContentProps> = ({ app, view, at, onClose }) => {
  const [insertHidden, setInsertHidden] = useState(false);
  const hiddenLabelId = useId();
  const hiddenHintId = useId();

  const spawnCtx = (): SpawnContext => ({
    app,
    view,
    assetService: AssetService.getInstance(app),
    ...(at && { at }),
  });

  const onPick = (pick: PickableLibraryToken | 'blank'): void => {
    if (pick === 'blank') {
      insertBlankToken(app, view, at, { isHidden: insertHidden });
      onClose();
      return;
    }
    void spawnTokenAsset(spawnCtx(), spawnAssetOf(pick), 1, { isHidden: insertHidden })
      .then(() => onClose())
      .catch((error) => {
        console.error('[InsertTokenPicker] Failed to spawn token:', error);
      });
  };

  const openCreateToken = (): void => {
    const assets = AssetService.getInstance(app);
    const mapPath = view.getStore().getState().mapPath;
    const selectedCollection =
      (mapPath ? assets.getCollectionForMap(mapPath) : null) ?? AssetService.defaultCollectionId();
    // Keep the insert picker open; save triggers atlas-vtt:refresh-assets and the grid reloads.
    new TokenCreatorModal(app, { selectedCollection, initialSource: 'images' }).open();
  };

  return (
    <div className="token-picker-insert">
      <div className="token-picker-insert-toolbar">
        <Button variant="outline" size="sm" onClick={openCreateToken}>
          {t('picker.insert.createToken')}
        </Button>
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
      </div>
      <TokenLibraryPickerContent
        app={app}
        selectLabel={t('picker.insert.select')}
        blankLabel={t('picker.insert.blank')}
        onPick={onPick}
      />
    </div>
  );
};
