import React, { useEffect, useState } from 'react';
import { Modal, type App } from 'obsidian';
import type { Root } from 'react-dom/client';
import type { AtlasView } from '../../../atlas-view';
import type { Point } from '../../../clipboard/mapObjectContent';
import { AssetService, type TokenAsset as ServiceTokenAsset } from '../../../services/AssetService';
import { insertBlankToken } from '../../../tools/insertBlankToken';
import { ATLAS_NATIVE_MODAL_CLASSES } from '../../../ui/nativeModal';
import { t } from '../../../i18n';
import { resourceUrl } from '../asset-manager/utils/assetFormatters';
import { spawnTokenAsset, type SpawnContext } from '../asset-manager/utils/tokenSpawnService';
import type { TokenAsset as SpawnTokenAsset } from '../asset-manager/types';
import './token-picker.scss';

/** A library token whose image exists in the vault, with a preview URL. */
interface PickableToken extends ServiceTokenAsset {
  imageUrl: string;
}

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
  const [tokens, setTokens] = useState<PickableToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    void loadTokens();
    const refreshRef = app.workspace.on('atlas-vtt:refresh-assets', () => {
      void loadTokens();
    });
    return () => {
      app.workspace.offref(refreshRef);
    };
  }, [app]);

  const loadTokens = async (): Promise<void> => {
    try {
      const assetService = AssetService.getInstance(app);
      await assetService.initialize();
      const pickable: PickableToken[] = [];
      for (const asset of await assetService.getTokenAssets()) {
        const imageUrl = resourceUrl(app, asset.imagePath);
        if (imageUrl) {
          pickable.push({ ...asset, imageUrl: resourceUrl(app, asset.thumbnailPath) || imageUrl });
        }
      }
      setTokens(pickable);
    } catch (error) {
      console.error('[InsertTokenPicker] Failed to load tokens:', error);
    } finally {
      setLoading(false);
    }
  };

  const spawnCtx = (): SpawnContext => ({
    app,
    view,
    assetService: AssetService.getInstance(app),
    ...(at && { at }),
  });

  const placeBlank = (): void => {
    insertBlankToken(app, view, at);
    onClose();
  };

  const placeLibrary = async (token: PickableToken): Promise<void> => {
    try {
      await spawnTokenAsset(spawnCtx(), spawnAssetOf(token), 1);
      onClose();
    } catch (error) {
      console.error('[InsertTokenPicker] Failed to spawn token:', error);
    }
  };

  const filtered = tokens.filter((token) =>
    token.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const showBlank = !searchTerm || t('picker.insert.blank').toLowerCase().includes(searchTerm.toLowerCase());

  return (
    <div className="token-picker-container">
      <div className="token-picker-search">
        <input
          type="text"
          placeholder={t('picker.token.search')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="token-picker-search-input"
        />
      </div>
      <div className="token-picker-content">
        {loading ? (
          <div className="token-picker-loading">{t('picker.token.loading')}</div>
        ) : !showBlank && filtered.length === 0 ? (
          <div className="token-picker-empty">{t('picker.token.noMatch')}</div>
        ) : (
          <>
            <div className="token-picker-section-label">{t('picker.insert.select')}</div>
            <div className="token-picker-grid">
              {showBlank && (
                <div className="token-picker-item" onClick={placeBlank}>
                  <div className="token-picker-image token-picker-image--blank" aria-hidden="true" />
                  <div className="token-picker-name">{t('picker.insert.blank')}</div>
                </div>
              )}
              {filtered.map((token) => (
                <div
                  key={token.id}
                  className="token-picker-item"
                  onClick={() => { void placeLibrary(token); }}
                >
                  <div className="token-picker-image">
                    <img
                      src={token.imageUrl}
                      alt={token.name}
                      onError={(e) => { e.currentTarget.hide(); }}
                    />
                  </div>
                  <div className="token-picker-name">{token.name}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
