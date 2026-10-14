# Atlas VTT architecture

Contributor-facing overview of how Atlas VTT is structured inside Obsidian.
Diagrams use Mermaid (C4 and UML). Deep behavioural rules live in code and in
[`CLAUDE.md`](../../CLAUDE.md); this pack summarises and points there.

## Audience

- Humans and AI agents extending or debugging the plugin.
- Not a player/GM manual — that lives on [atlas-vtt.dev](https://atlas-vtt.dev).

## How these docs relate to the rest of the repo

| Document | Role |
| --- | --- |
| [`CLAUDE.md`](../../CLAUDE.md) | Canonical Memory Notes: invariants, domain rules, what not to break |
| [`CONTRIBUTING.md`](../../CONTRIBUTING.md) | Branching, checks, changelog, CLA, privacy disclosure |
| [`docs/development.md`](../development.md) | `beta` / `main`, CI, lint, releases |
| [`PRIVACY.md`](../../PRIVACY.md) | Offline-first behaviour and network use |
| [`docs/plans/`](../plans/) | Dated pre-implementation specs for upcoming work |
| **This folder** | Living structure maps and extension entry points |

**Source of truth for behaviour:** the TypeScript under `src/app/` and the
matching CLAUDE.md Memory Note. If a diagram and the code disagree, trust the
code and update the diagram.

**Source of truth for process:** CONTRIBUTING and `docs/development.md`.

## Doc map

| File | Contents |
| --- | --- |
| [c4-context.md](c4-context.md) | C4 Level 1 — system context |
| [c4-containers.md](c4-containers.md) | C4 Level 2 — containers inside the plugin |
| [c4-components.md](c4-components.md) | C4 Level 3 — map view, store, render stack |
| [uml-sequences.md](uml-sequences.md) | Critical runtime sequences |
| [uml-classes.md](uml-classes.md) | Package layout and core class relationships |
| [domains.md](domains.md) | Functional domains and where to extend |
| [data-places.md](data-places.md) | Vault vs settings vs device-local data |

## Quick orientation

1. Obsidian loads [`main.ts`](../../main.ts) (`AtlasVTTPlugin`).
2. Each map tab is an [`AtlasView`](../../src/app/atlas-view.ts) with its own
   Zustand store ([`storeFactory.ts`](../../src/app/storeFactory.ts)) and
   [`ServiceManager`](../../src/app/services/ServiceManager.ts).
3. PIXI rendering is owned by
   [`PixiRendererOrchestrator`](../../src/app/PixiRendererOrchestrator.ts);
   React chrome mounts through [`UIOverlay`](../../src/app/services/UIOverlay.ts).
4. Library content lives in vault files under `atlas-vtt/`; the asset index is a
   device cache. See [data-places.md](data-places.md).

Atlas ships its own **PIXI.js v8** imports. Obsidian may expose PIXI v7 globally;
do not use that global for Atlas code.
