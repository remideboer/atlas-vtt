# UML — Packages and core classes

Focused views only. For exhaustive domain rules, use [`CLAUDE.md`](../../CLAUDE.md)
and the folders listed in [domains.md](domains.md).

## Package layout (`src/app/`)

```mermaid
flowchart TB
  subgraph entry ["Entry"]
    main["main.ts"]
    views["atlas-view · dashboard-view · local-player-view"]
  end

  subgraph runtime ["Per-view runtime"]
    services["services/"]
    stores["stores/ · storeFactory"]
    pixi["pixi/"]
    react["react/"]
    tools["tools/"]
    toolbar["toolbar/ · packages/components/toolbar/"]
  end

  subgraph domains ["Domain modules"]
    grid["grid/"]
    vision["vision/ · lighting/"]
    fog["fog/"]
    dice["dice3d/"]
    creatures["creatures/"]
    gameSystems["gameSystems/"]
    initiative["initiative/"]
    importUvtt["import/uvtt/"]
    links["links/"]
  end

  subgraph cross ["Cross-cutting"]
    i18n["i18n/"]
    experimental["experimental/"]
    types["types/"]
    utils["utils/"]
  end

  main --> views
  views --> services
  services --> stores
  services --> pixi
  services --> react
  tools --> stores
  pixi --> grid
  pixi --> vision
  pixi --> fog
  react --> toolbar
```

| Package | Responsibility |
| --- | --- |
| `services/` | Plugin and per-view services (map, renderer, assets, player window, widgets, …). |
| `stores/` | Zustand slices, history middleware, UI slice. |
| `pixi/` | PIXI v8 rendering: map tiles, tokens, fog, lighting engine, helpers. |
| `react/` | Map chrome (`UIRoot`), command palette, initiative, dice display, settings panels. |
| `packages/components/` | Shared UI (toolbar, asset manager, primitives) — lives under the app tree, not a separate npm package. |
| `tools/` | Tool classes (measure, fog, dice, walls, …) driven by `ToolController`. |
| `grid/` | Lattice, numbering, hex geometry, stretch helpers. |
| `vision/` + `lighting/` | Pure sight/light rules; PIXI lighting lives under `pixi/lighting/`. |
| `gameSystems/` | Built-in presets, senses, light presets, dice/initiative rules readers. |
| `creatures/` | Statblock resolution, filters, `CreatureIndex`. |
| `i18n/` | `t()` + locale files; English is the source of keys. |

Repo root also holds `styles/` (SCSS → `styles.css`), `tests/` (unit + gpu), and
`docs/`.

## Core class relationships

```mermaid
classDiagram
  class AtlasVTTPlugin {
    +settingsService
    +widgetSyncService
    +globalAssetManager
    +presentedScene
    +onload()
    +onunload()
  }

  class AtlasView {
    -store ViewAtlasStore
    -services ServiceManager
  }

  class ServiceManager {
    -eventBus EventEmitter
    -rendererService RendererService
    -mapService MapService
    -toolController ToolController
    -uiOverlay UIOverlay
    +getRendererService()
    +getEventBus()
  }

  class ViewAtlasStore {
    <<Zustand>>
    +objects
    +grid
    +background
    +temporal HistoryAPI
  }

  class RendererService {
    -orchestrator PixiRendererOrchestrator
    +init(container)
  }

  class PixiRendererOrchestrator {
    -tokenRenderer TokenRenderer
    -fogRenderer FogOfWarRenderer
    -lightingFeature LightingFeature
    +withPlayerSafeFrame()
  }

  class SettingsService {
    <<singleton per App>>
  }

  class AssetService {
    <<singleton per App>>
  }

  class PlayerWindowService {
    <<singleton>>
  }

  AtlasVTTPlugin "1" --> "*" AtlasView : registers views
  AtlasVTTPlugin "1" --> "1" SettingsService
  AtlasView "1" --> "1" ViewAtlasStore
  AtlasView "1" --> "1" ServiceManager
  ServiceManager --> ViewAtlasStore
  ServiceManager --> RendererService
  ServiceManager --> SettingsService : shared
  ServiceManager --> AssetService : shared
  RendererService --> PixiRendererOrchestrator
  AtlasVTTPlugin --> PlayerWindowService : presents scene
  PlayerWindowService --> PixiRendererOrchestrator : captures frame
```

### Boundaries to keep

| Boundary | Rule |
| --- | --- |
| Store ↔ PIXI / React | Renderers and UI subscribe to the store; avoid duplicating scene state in local component state for persisted facts. |
| ServiceManager ↔ shared services | Settings and AssetService are app-wide; do not construct a second `SettingsService` that would overwrite `forApp`. |
| History ↔ UI slice | Pointer/UI flags are not undo steps; tracked slices only. |
| Lighting rules ↔ GPU | Pure model in `vision/` / `lighting/`; engine in `pixi/lighting/engine/`. |
| Library ↔ index | Vault record files are authoritative; the index is a cache. |

### History surface

```mermaid
classDiagram
  class HistoryHost {
    +temporal
  }
  class HistoryAPI {
    +pastStates
    +futureStates
    +undo()
    +redo()
    +pause()
    +resume()
  }
  class HistoryHelpers {
    <<module history.ts>>
    +beginHistoryTransaction()
    +endHistoryTransaction()
    +runHistoryTransaction()
    +abandonHistoryTransaction()
    +runUntracked()
  }

  ViewAtlasStore --|> HistoryHost
  HistoryHost --> HistoryAPI : temporal
  HistoryHelpers ..> HistoryHost : operates on
```

## Tests layout (for extenders)

| Project | Location | Use |
| --- | --- | --- |
| Unit | `tests/unit/`, colocated `__tests__` | Pure logic, jsdom, Obsidian mocks |
| GPU | `tests/gpu/`, `*.gpu.test.ts` | Browser + Chromium; lighting, layout, map seams |
| Oracles | `tests/oracles/` | Parity baselines (history, visibility, …) |

CI runs the unit project; GPU suites are local (`npm run test:gpu`).
