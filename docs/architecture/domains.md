# Functional domains and extension points

Each domain lists primary folders, key modules, a one-line data flow, and where
to add something new. Behavioural detail belongs in code and
[`CLAUDE.md`](../../CLAUDE.md) Memory Notes — link there instead of duplicating.

## Library / assets

| | |
| --- | --- |
| **Folders** | `src/app/services/AssetService.ts`, `services/library/`, `services/vault-sync/`, `services/assetTransfer/`, `services/collectionBundle/`, `packages/components/asset-manager/` |
| **Key modules** | `AssetService`, `LibraryWriter`, `readLibraryChanges` / `mergeLibraryChanges`, `transferAssets`, `assetFiles.ts` |
| **Data flow** | Vault library files + device index are reconciled into `AssetMetadata`; UI and maps read/write through `AssetService` / `LibraryWriter`. |
| **Extend** | New asset type: record schema + `recordFile.ts` / `assetFiles.ts`; asset-manager hooks; moves via `assetTransfer/`; bundles via `collectionBundle/`. |
| **CLAUDE** | Vault files and the asset index |

## Scenes / maps

| | |
| --- | --- |
| **Folders** | `services/MapPersistence.ts`, `services/MapService.ts`, `MapController.ts`, `pixi/mapImage/`, `snapshots/`, `atlas-view.ts` |
| **Key modules** | `MapPersistence` / `ATLAS_VERSION`, `MapService`, `MapController`, `MapImage`, snapshot storage |
| **Data flow** | `.atlasmap` loads into `ViewAtlasStore`; `MapController` drives tiled image + stretch; persistence writes on debounced store changes. |
| **Extend** | New persisted fields: migrate in `MapPersistence` + store slice + serializer; load path in `MapService` / `MapController`. |

## Tokens

| | |
| --- | --- |
| **Folders** | `pixi/token-renderer/`, `stores/tokenStacking.ts`, `resources/`, `services/TokenStatblockLinkService.ts` |
| **Key modules** | `TokenRenderer`, `InteractionController`, `resourceValues` / `collectionResources`, `placeTokens` / `raiseTokens`, `tokenToFile` / `tokenFromFile` |
| **Data flow** | Store `objects.tokens` drives sprites and UI; statblocks resolve through `CreatureIndex`; disk format via persistence serializers. |
| **Extend** | Canvas: token-renderer; store: `updateTokens` / map objects slice; Edit Token sections; spawn: `tokenSpawnService`; disk: `resourceFileFormat.ts`. |
| **CLAUDE** | Token resources, Token stacking |

## Grid

| | |
| --- | --- |
| **Folders** | `grid/`, `services/GridManager.ts`, `pixi/gridDetection/`, grid alignment React UI |
| **Key modules** | `GridSystem`, hex/square lattices, `cellNumbering`, `mapStretch`, detection (`latticeFit`, `detectGridInImage`) |
| **Data flow** | `GridState` defines the lattice; `GridSystem` draws; alignment proposes size/stretch then `alignGrid` moves map-linked objects. |
| **Extend** | New lattice/drawer under `grid/`; detection under `pixi/gridDetection/`; lit scenes use `UnlitGrid`. |
| **CLAUDE** | Hexagonal Grids, Cell Numbering, Map stretch, Auto-detect |

## Dynamic lighting

| | |
| --- | --- |
| **Folders** | `vision/`, `lighting/`, `pixi/lighting/`, `pixi/lighting/engine/` |
| **Key modules** | `LightingFeature`, `LightingController`, `SceneModelBuilder`, `LightingEngine`, `CanvasLightingFallback` |
| **Data flow** | Walls/lights/zones/scene options → CPU model → GPU world textures → composite; gated by experimental `dynamicLighting`. |
| **Extend** | Rules in `vision/` / `lighting/`; shaders only via `engine/engineShaders.ts`; tools/popovers; presets in `gameSystems/`. |
| **CLAUDE** | Dynamic lighting, Experimental features |

## Fog

| | |
| --- | --- |
| **Folders** | `fog/`, `pixi/fog/`, `tools/FogTool.ts` |
| **Key modules** | `fogCoverage`, `FogCoverageCache`, `FogOfWarRenderer`, `FogCanvasCompositor`, `FogTool` |
| **Data flow** | Undo-tracked ops replay into coverage; compositor paints; player sight composes fog with lighting in `PlayerSightTokens`. |
| **Extend** | Op types in fog types + coverage replay; gestures in `FogTool` with history transactions. |
| **CLAUDE** | Fog coverage / Fog and visible tokens |

## Player view

| | |
| --- | --- |
| **Folders** | `services/playerFrame.ts`, `PlayerWindowService.ts`, `PlayerFrameMirror.ts`, `pixi/PlayerFrameTexture.ts`, `pixi/playerSafeFrame.ts`, `presentedScene.ts` |
| **Key modules** | `playerFrame`, `PlayerFrameMirror`, `withPlayerSafeFrame`, presented-scene store |
| **Data flow** | GM viewport defines frame geometry; extra render of player-safe layers copies to the player canvas at capped FPS. |
| **Extend** | Layer policy: `playerLightingLayers` / `GmOverlays`; token/door visibility via TokenRenderer providers; freeze/camera in player-window session state. |
| **CLAUDE** | Rendering — Player window; Player frame and session view |

## Initiative

| | |
| --- | --- |
| **Folders** | `stores/initiativeSlice.ts`, `initiative/`, `gameSystems/initiativeRules.ts`, React initiative components, `PlayerInitiativePanel` |
| **Key modules** | `createInitiativeActions`, `turns.ts`, `sides.ts`, `collectionInitiativeRules` |
| **Data flow** | Collection rules choose turn-order vs sides; GM adds entries; player panel lists non-hidden tokens only. |
| **Extend** | Rules types + `initiativeRules.ts` + preset; UI card menus; rolls via collection dice rules. |
| **CLAUDE** | Initiative |

## Dice

| | |
| --- | --- |
| **Folders** | `tools/DiceTool.ts`, `tools/parseFormula.ts`, `dice3d/`, `react/components/dice/`, `gameSystems/diceRules.ts` |
| **Key modules** | `DiceTool`, `parseFormula` / `rollFormula`, `DiceRollDisplay` / `DiceRenderer`, `mapDiceRules` |
| **Data flow** | Validated formula → roll on view bus → 3D stage or toast → history hook; player window receives routed `diceEvents`. |
| **Extend** | Collection `SystemRules.dice`; display settings; never re-derive crits outside `result.crit`. |
| **CLAUDE** | 3D dice, Game system presets (dice rules) |

## Widgets

| | |
| --- | --- |
| **Folders** | `services/WidgetSyncService.ts`, `utils/collectionWidgets.ts`, `utils/widgetActivation.ts`, widget bar React |
| **Key modules** | `WidgetSyncService`, `withCollectionWidgets` / `withoutCollectionWidgets`, `isWidgetOn` |
| **Data flow** | Library definitions in collection settings; scene copies/values in scene file; sync on load and across views. |
| **Extend** | Type + renderer + library edit path; presets via `SystemRules.widgets`. |
| **CLAUDE** | Widgets |

## Toolbar / tools

| | |
| --- | --- |
| **Folders** | `toolbar/`, `packages/components/toolbar/`, `services/ToolController.ts`, `tools/`, `keyboard/` |
| **Key modules** | `toolbarCatalog.ts`, `toolbarControls.tsx`, `MainToolbar` / editor, `ToolController` |
| **Data flow** | Catalog defines controls and gates; toolbar sets modes; tools write store / PIXI; layout in `AtlasSettings.toolbar`. |
| **Extend** | Catalog id + `toolbarControls` + screenshot in `toolbarScreenshots.ts` + hotkey; tool class under `tools/`. |
| **CLAUDE** | Main toolbar, Toolbar editor, UI Design Principles |

## Undo / history

| | |
| --- | --- |
| **Folders** | `stores/history.ts`, `stores/history/`, `stores/exploredEditHistory.ts`, `lighting/exploredEdits.ts` |
| **Key modules** | `withHistory`, `runHistoryTransaction`, tracked slice, `ExploredSteps` |
| **Data flow** | Tracked store writes become `HistoryStep`s; undo/redo restores entity snapshots. |
| **Extend** | Add fields only to the tracked set when they must undo; gestures must open/close transactions. |
| **CLAUDE** | Undo/Redo History |

## Vault sync

| | |
| --- | --- |
| **Folders** | `plugin/vaultSync.ts`, `services/vault-sync/`, `FileReferenceService.ts`, library readers |
| **Key modules** | `reconcileWithVault`, adoption/relink helpers, `FileReferenceService` |
| **Data flow** | Startup + quiet debounce reconcile; disk wins; renames follow through `FileReferenceService`. |
| **Extend** | On-disk patterns in `assetFiles.ts` + reconcile adoption; never library-only-in-index. |
| **CLAUDE** | Vault files and the asset index |

## UVTT import

| | |
| --- | --- |
| **Folders** | `import/uvtt/`, asset-manager `useUvttImport`, `imageProcessing/` |
| **Key modules** | `parseUvtt`, `uvttToScene`, `importUvttFile`, `runUvttImport` |
| **Data flow** | Drop/pick → validate → image workers + exclusive `writeImport` → optional scene open. |
| **Extend** | Mappers in `uvttToScene`; limits in UVTT helpers; tests under `tests/unit/uvtt*` and GPU import test. |
| **CLAUDE** | Universal VTT import |

## Command palette / settings / presets

| | |
| --- | --- |
| **Folders** | `plugin/registerCommands.ts`, `react/components/command-palette/`, `services/SettingsService.ts`, `settings/`, `gameSystems/` |
| **Key modules** | `registerCommands`, palette panels, `AtlasSettings`, `SystemPresetService`, `builtInPresets.ts` |
| **Data flow** | Commands open panels or toggle store/settings; collection rules come from presets or stored edits. |
| **Extend** | Command + locale key; settings field in `atlasSettings.ts`; preset validation; experimental gate via `experimentalFeatures.ts`. |
| **CLAUDE** | Game system presets, Experimental features, Translations |

## Cross-cutting

| Concern | Where | Extend by |
| --- | --- | --- |
| **i18n** | `src/app/i18n/` | English key first in `locales/en/<segment>.ts`; `t('segment.key')`. |
| **Experimental** | `experimental/experimentalFeatures.ts` | New id + settings panel + gate every entry point. |
| **SCSS / theme** | `styles/`, colocated `*.scss` | Scope under `.atlas-vtt-plugin`; Obsidian CSS variables; `atlas-*` mixins; no new Tailwind; no native `title` tooltips. |
| **Testing** | `tests/unit`, `tests/gpu`, `tests/oracles` | Pure → unit; WebGL/layout → `*.gpu.test.ts`. |

## Typical change checklist

1. Domain module (+ types if needed).
2. Store action / persistence if scene or library data changes.
3. Toolbar catalog, command, or settings UI if the GM must reach it.
4. Locale keys in English (and other languages if present).
5. Unit or GPU test matching the layer.
6. Update CLAUDE.md Memory Notes when a lasting invariant changes.
7. Player-facing behaviour → `changelog/Unreleased.md` (not this architecture pack).
