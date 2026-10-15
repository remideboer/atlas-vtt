import React, { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { AssetService, type TokenAsset as ServiceTokenAsset } from '../../../services/AssetService';
import { t } from '../../../i18n';
import { resourceUrl } from '../asset-manager/utils/assetFormatters';
import './token-picker.scss';

/** A library token whose image exists in the vault, with a preview URL. */
export interface PickableLibraryToken extends ServiceTokenAsset {
  imageUrl: string;
}

export type TokenLibraryPick = PickableLibraryToken | 'blank';

interface TokenLibraryPickerContentProps {
  app: App;
  /** Section label above the grid (insert vs choose-art copy). */
  selectLabel: string;
  /** Shown on the blank disc option. */
  blankLabel: string;
  onPick: (pick: TokenLibraryPick) => void;
  onTokenDragStart?: (token: PickableLibraryToken, event: React.DragEvent<HTMLElement>) => void;
  onTokenDragEnd?: () => void;
}

/** Searchable grid of library tokens plus a blank disc; hosts own the modal chrome. */
export function TokenLibraryPickerContent({
  app,
  selectLabel,
  blankLabel,
  onPick,
  onTokenDragStart,
  onTokenDragEnd,
}: TokenLibraryPickerContentProps): React.ReactElement {
  const [dragged, setDragged] = useState(false);
  const [tokens, setTokens] = useState<PickableLibraryToken[]>([]);
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
      const pickable: PickableLibraryToken[] = [];
      for (const asset of await assetService.getTokenAssets()) {
        const imageUrl = resourceUrl(app, asset.imagePath);
        if (imageUrl) {
          pickable.push({ ...asset, imageUrl: resourceUrl(app, asset.thumbnailPath) || imageUrl });
        }
      }
      setTokens(pickable);
    } catch (error) {
      console.error('[TokenLibraryPicker] Failed to load tokens:', error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = tokens.filter((token) =>
    token.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const showBlank = !searchTerm || blankLabel.toLowerCase().includes(searchTerm.toLowerCase());

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
            <div className="token-picker-section-label">{selectLabel}</div>
            <div className="token-picker-grid">
              {showBlank && (
                <div className="token-picker-item" onClick={() => onPick('blank')}>
                  <div className="token-picker-image token-picker-image--blank" aria-hidden="true" />
                  <div className="token-picker-name">{blankLabel}</div>
                </div>
              )}
              {filtered.map((token) => (
                <div
                  key={token.id}
                  className="token-picker-item"
                  draggable={Boolean(onTokenDragStart)}
                  onDragStart={(event) => {
                    setDragged(true);
                    onTokenDragStart?.(token, event);
                  }}
                  onDragEnd={() => {
                    onTokenDragEnd?.();
                  }}
                  onClick={() => {
                    if (dragged) {
                      setDragged(false);
                      return;
                    }
                    onPick(token);
                  }}
                >
                  <div className="token-picker-image">
                    <img
                      src={token.imageUrl}
                      alt={token.name}
                      draggable={false}
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
}
