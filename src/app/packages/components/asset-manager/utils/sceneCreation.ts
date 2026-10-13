import type { MapAsset } from '../types';
import type { CreateScenePrefill } from '../hooks/useAssetCrud';

/** Background, name and paper size of a new scene built on a map. */
export function scenePrefillFromMap(map: MapAsset): CreateScenePrefill {
  return {
    backgroundPath: map.mapFilePath,
    defaultName: map.name,
    ...(map.paperWidthInches !== undefined && { paperWidthInches: map.paperWidthInches }),
    ...(map.paperHeightInches !== undefined && { paperHeightInches: map.paperHeightInches }),
  };
}
