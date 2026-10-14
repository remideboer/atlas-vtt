import type { App } from 'obsidian';
import type { AtlasView } from '../atlas-view';
import { mapPasteTarget } from '../clipboard/mapPasteTarget';
import type { Point } from '../clipboard/mapObjectContent';
import { placementVision } from '../creatures/placementVision';
import { mapVisionDefaults } from '../gameSystems/visionDefaults';
import { openEditTokenModal } from '../pixi/token-renderer/EditTokenModal';
import { mapResources } from '../resources/collectionResources';
import { AssetService } from '../services/AssetService';
import { systemPresetsOf } from '../services/mapCollectionRules';
import type { TokenInput } from '../types/viewState';
import { t } from '../i18n';

/**
 * Places a blank, player-hidden token at `at` (or the last map pointer / view centre),
 * selects it, and opens Edit Token so the GM can name it and set visibility.
 */
export function insertBlankToken(app: App, view: AtlasView | null, at?: Point | null): void {
  if (!view || view.getStore().getState().isPlayerView) return;
  const store = view.getStore();
  const { mapPath, isMapLoading, mapLoaded } = store.getState();
  if (!mapPath || isMapLoading || !mapLoaded) return;

  const origin = at ?? mapPasteTarget(view);
  if (!origin) return;

  const renderer = view.serviceManager.getRendererService();
  const gridSystem = renderer.getGridSystem();
  const size = 1;
  const snapped = gridSystem?.snapTokenCenter(origin.x, origin.y, size) ?? origin;
  const assets = AssetService.getInstance(app);
  const vision = placementVision(
    mapVisionDefaults(assets, mapPath, systemPresetsOf(app)),
    false,
  );

  // TokenInput is an Omit of the token union, so character-only fields need a cast (same as spawn).
  const blank: TokenInput = {
    x: snapped.x,
    y: snapped.y,
    imagePath: '',
    kind: 'character',
    name: t('editToken.namePlaceholder'),
    size,
    isHidden: true,
    ...(vision && { vision }),
  } as TokenInput;
  const ids = store.getState().addTokens([blank]);
  const id = ids[0];
  if (!id) return;
  store.getState().setSelection([id]);

  const token = store.getState().objects.tokens[id];
  if (!token) return;
  openEditTokenModal(token, store, app, mapResources(assets, mapPath));
}
