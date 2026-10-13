# UML — Critical sequences

Sequence diagrams for the flows most extenders need to keep intact. Details and
edge cases: [`CLAUDE.md`](../../CLAUDE.md).

## 1. Plugin load → map view open

```mermaid
sequenceDiagram
  participant Obs as Obsidian
  participant Plugin as AtlasVTTPlugin
  participant Settings as SettingsService
  participant VaultSync as vaultSync
  participant View as AtlasView
  participant SM as ServiceManager
  participant Store as ViewAtlasStore

  Obs->>Plugin: onload()
  Plugin->>Plugin: AtlasErrorLog + IssueReporter
  Plugin->>Plugin: initializeAtlasStorage / migrations
  Plugin->>Settings: construct (awaits settingsReady)
  Plugin->>VaultSync: registerVaultSync
  Plugin->>Plugin: registerAtlasViews()
  Obs->>View: open / restore leaf
  View->>Store: createViewAtlasStore(app, viewId, plugin)
  View->>SM: new ServiceManager(app, store, plugin, viewId)
  SM->>SM: RendererService, MapService, ToolController, UIOverlay, …
  Note over View,SM: Later: RendererService.init → UIOverlay.mount → MapService.loadMap
```

Views register early so workspace restore can resolve Atlas tabs before slower
startup finishes (`main.ts`).

## 2. Scene load

```mermaid
sequenceDiagram
  participant View as AtlasView
  participant MapSvc as MapService
  participant Store as ViewAtlasStore
  participant Orch as PixiRendererOrchestrator
  participant MapCtrl as MapController
  participant MapImg as MapImage
  participant Bus as EventEmitter

  View->>MapSvc: load map / scene path
  MapSvc->>Store: hydrate scene state (loading flags)
  MapSvc->>Orch: ensure renderer ready
  Orch->>MapCtrl: follow background / stretch
  MapCtrl->>MapImg: open tiles / worldRect
  MapImg-->>Orch: map-image-updated / ready
  Orch->>Bus: renderer-ready (LayerGraph attaches)
  MapSvc->>Store: clear loading when scene is shown
  Note over Store,Orch: PlayerFrameMirror holds last frame while isMapLoading
```

Persistence round-trip uses `MapPersistence` / scene file writers. New saved
fields need migrate + store + serializer together.

## 3. Undoable gesture

```mermaid
sequenceDiagram
  participant Tool as Tool / Interaction
  participant Hist as history middleware
  participant Store as ViewAtlasStore
  participant Rend as Renderers

  Tool->>Hist: beginHistoryTransaction(store)
  loop while pointer down
    Tool->>Store: write tracked slice (e.g. token positions)
    Store-->>Rend: subscribe / same objects reference rules
  end
  alt commit
    Tool->>Hist: endHistoryTransaction(store)
    Note over Hist: one HistoryStep if tracked state changed
  else cancel
    Tool->>Hist: abandonHistoryTransaction(store)
    Note over Hist: restore draft changes, leave no step
  end
```

Rules of thumb:

- Prefer one store action for bulk edits (`updateTokens`, `setTokenPositions`).
- Non-undoable Atlas maintenance → `runUntracked`.
- Explored-memory brush edits raise `exploredEdits` and use a parallel texel stack
  (`ExploredSteps`); see CLAUDE.md “Editing explored memory”.

## 4. Player frame mirror

```mermaid
sequenceDiagram
  participant Sched as RenderScheduler
  participant Mirror as PlayerFrameMirror
  participant Orch as PixiRendererOrchestrator
  participant Tex as PlayerFrameTexture
  participant Win as Player window canvas

  Sched->>Mirror: before-render hook (≤ PLAYER_MIRROR_FPS)
  Mirror->>Mirror: playerFrame(GM view, window size)
  alt frame valid and scene presentable
    Mirror->>Orch: withPlayerSafeFrame(copy, settings, frame)
    Orch->>Orch: player layers + frame camera
    Orch->>Tex: render stage to frame texture
    Tex->>Win: drawImage pieces from view canvas
    Orch->>Orch: restore GM camera / layers
  else loading / no frame / hidden window
    Note over Mirror,Win: keep last frame; mark stale as needed
  end
  Note over Sched: DM render in same task restores DM picture on the canvas
```

Geometry is pure (`services/playerFrame.ts`). Presentation state (freeze, zoom
lock, rotation when implemented) must not rewrite scene objects.

## 5. Vault reconcile (library sync)

```mermaid
sequenceDiagram
  participant Vault as Obsidian vault
  participant Sync as vaultSync scheduler
  participant Asset as AssetService
  participant Lib as library read/merge
  participant Index as device index cache
  participant Writer as LibraryWriter

  Vault-->>Sync: modify / settle quiet period
  Sync->>Asset: reconcileWithVault
  Asset->>Lib: read changed library files
  Lib->>Index: merge (files win over index)
  Note over Asset,Index: index lock — no half-done transfer interleaved
  Asset->>Writer: write only records that changed since last read/write
  Writer->>Vault: record files then cache
```

Never put library facts only in the index. Moves/copies go through
`transferAssets` (`src/app/services/assetTransfer/`). See [data-places.md](data-places.md)
and CLAUDE.md “Vault files and the asset index”.
