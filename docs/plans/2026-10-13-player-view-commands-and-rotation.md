# Player View Commands and Rotation

## Goal

Add a right-click menu to the blank map canvas in the DM's view. The menu exposes a curated set of useful Atlas map/player-view commands and lets the DM rotate the picture shown to players by 90-degree increments. Also allow the player view's zoom to be locked independently of the DM camera. Rotation and zoom lock are presentation settings: they must not rotate or rewrite the scene, map image, grid, tokens, lighting, fog, or the DM's editing view.

## Current Design

- `PixiAppManager` installs a `contextmenu` listener on the map canvas that only calls `preventDefault()`. The viewport already uses the right mouse button for panning, so the menu must not interfere with right-drag.
- Object-specific right-click menus already use `openContextMenuGlobal` and `ContextMenuEntry`. They are dispatched by the map's viewport interactions and should retain precedence when the pointer is over an object.
- `captureBeforeRender` and `frameCamera` in `pixi/playerSafeFrame.ts` temporarily apply a camera and player-safe layer visibility for one render, then restore the DM's camera. `PixiRendererOrchestrator.withPlayerSafeFrame` owns the capture call.
- `PlayerFrameMirror` computes the player frame from the player window and the view the DM is showing. It also supports frozen cameras and held frames; setting changes need to make the mirror refresh without changing scene state.
- The existing camera freeze pins the player camera's center and world rectangle, but continues rendering the scene live. A zoom-only lock must be a separate mode: it pins player scale while allowing the view center to follow the DM, unless the full camera freeze is active.
- Device-only preferences already use `app.loadLocalStorage` / `app.saveLocalStorage` through `services/deviceSettings.ts`. These are not synced through the vault.
- The context-menu renderer supports localized item labels, icons, submenus, and checked items. The current plugin commands are registered in `plugin/registerCommands.ts`, but there is no existing generic command-menu integration.

## Recommended Behavior

1. Right-clicking blank canvas in a loaded DM map opens an Atlas context menu at the pointer. It suppresses the browser menu as it does today. Right-drag continues to pan; a right-click over a token, pin, door, drawing, or another existing target continues to open that target's current menu instead.
2. The menu contains a `Commands` submenu with a curated set of applicable Atlas map/player-view actions. Availability is checked when the menu is built. Do not enumerate every Obsidian command: that would mix unrelated commands into a map operation and may invoke commands with hidden preconditions. Reuse the existing action/service logic rather than triggering commands by undocumented IDs.
3. The menu contains a `Rotate player view` submenu with 0°, 90°, 180°, and 270° choices, showing the current choice as checked. The default is 0°. Angles are clockwise in screen coordinates; selecting the active angle is a no-op.
4. Rotation applies to the map canvas in the player presentation only. Map content rotates together, while player-window DOM overlays (initiative, dice, and widgets) remain screen-aligned. The DM canvas remains unchanged.
5. `Freeze player zoom` is independent of `Freeze camera`. When enabled, capture the current player-frame scale and keep it fixed while following the DM's current view center. The DM can continue to pan normally, including with the existing right-drag gesture, and the player frame follows that pan without changing scale. This keeps token/minis' apparent size stable while the player frame continues rendering live scene state. The visible world extent may therefore differ from the DM's current viewport when the DM zooms. When full camera freeze is active, its pinned center and scale take precedence; turning it off returns to the zoom-lock behavior if that is still enabled.
6. While zoom lock is active and the player view is available, the DM can nudge the player frame with the arrow keys. These steps adjust only the player frame's center offset; they do not move the DM camera or alter the locked zoom. Use a fixed fraction of the player frame's visible world width/height per key press so steps work consistently with and without a grid. Key-repeat may repeat the step. Disable these shortcuts outside zoom-lock mode and avoid intercepting keys while an editable control or menu owns keyboard input.
7. Rotation is device-local and survives plugin reloads and scene changes. It does not sync through vault data. Changing it refreshes the live player frame; the behavior for an already held frame should be included so the player's picture does not remain at the old angle.
8. Zoom-lock state and its captured scale belong to the player-window session, not to a scene file. Persist/restore them alongside the existing player-window session state so a reload does not unexpectedly change minis' apparent size. Persist/restore the player pan offset with that session as well. Disabling zoom lock returns to the normal player-frame scale and center derived from the DM view.

## Implementation Plan

### 1. Define rotation state and frame geometry

- Add a small pure rotation model/helper for the four supported quarter-turns, including validation of loaded values and a default of 0°.
- Store the preference with the existing device-local settings helpers. Provide a single setter/read path and ensure setting a new value marks the player mirror stale.
- Extend the player-frame/camera calculation to account for rotation while continuing to show the whole DM camera rectangle. At 90° and 270°, fit against the swapped projected width/height; keep the frame centered on the same world point.
- Add an independent zoom-lock state and pinned player-frame scale. Resolve the effective camera in this order: full camera freeze (existing behavior), zoom lock (current DM center plus pinned player scale), normal follow (current DM center and derived scale). Toggling zoom lock on captures the scale currently shown to players; toggling it off resumes the normal derived scale.
- With zoom lock on, compute the world rectangle represented by the player window from its dimensions, orientation, current DM center, and pinned scale. Do not pin the center or disable the DM viewport's pan plugin; document that zoom lock prioritizes stable mini size over matching the DM's current visible extent.
- Add a player-frame pan offset separate from the DM camera. In zoom-lock mode, arrow-key steps change this offset; the effective center is the DM's current center plus the offset, so DM panning still moves the player frame while preserving its deliberate adjustment. Keep the step calculation in a pure helper, based on a fixed fraction of the visible world extent after rotation.
- Route arrow keys through the existing map keyboard ownership rules, but update only player presentation state. Handle only unmodified arrow keys when the player window is open, zoom lock is active, and no editable field or menu owns focus; prevent their default scrolling only when Atlas consumes them. Do not change normal DM viewport keyboard behavior.
- Apply rotation only while the player-safe frame is rendered. Save and restore every modified viewport transform property (including pivot/rotation if used) in `finally`, as the current camera application does for position and scale.
- Keep rendering the current scene under zoom lock: token movement, visibility, lighting, fog, grid, and other player-safe display state must continue to update. Do not implement zoom lock by holding or snapshotting the canvas.
- Persist/restore zoom-lock enabled state, pinned scale, and player pan offset through the existing player-window session lifecycle, while persisting the rotation preference as device-local. They must remain separate from the existing full camera freeze state.
- Decide and implement the held-frame path: rotation or zoom-lock changes must update a held presentation without exposing a partially transformed frame. Keep the player window's fixed DOM overlays upright.

### 2. Add the blank-canvas DM context menu

- Replace the prevent-only callback in `PixiAppManager` with a context-menu callback path while retaining `preventDefault()`.
- Wire the owning map view's callback from the renderer/view setup. Require a loaded scene and GM mode; do not open it from a player view or while the canvas is being torn down.
- Use the canvas event's client coordinates with the existing global context-menu provider, preserving document/popout behavior.
- Leave object-specific right-click handling unchanged. Verify the context-menu event occurs for a right-click but not after a right-drag; if browser/PIXI event ordering requires explicit gesture discrimination, keep it local to the canvas interaction boundary.
- Build the menu from explicit Atlas actions and the rotation submenu. Gate unavailable actions at menu construction and close the menu after a command or rotation choice.

### 3. Localize and connect actions

- Add English source strings and matching keys to every locale for the menu labels, command labels, angle choices, and any notices.
- Reuse existing services/actions for player-window operations and map commands. Keep command execution independent of the active Obsidian leaf where the current map view is the intended target.
- Ensure the context menu is scoped to the provider/document of the map view, including a map in an Obsidian popout.

### 4. Verify behavior and regressions

- Pure unit tests: rotation validation/defaulting; projected fit for all four angles; center preservation; zoom-lock scale capture, stable scale across DM zoom changes, player-center updates when the DM pans, pan-offset step direction/size under every rotation, full-freeze precedence, and resume-normal behavior; camera transform restoration after render/capture failure; stored preference/session-state read/write and stale-frame notification.
- Context-menu tests: blank-canvas menu entries and action availability, global provider behavior, no menu in player mode/unloaded view, and existing object menus remain unaffected.
- Interaction tests: right-click opens the menu; right-drag still pans and does not open it, including with zoom lock enabled; normal left-button tools and token menus remain unchanged.
- Keyboard tests: arrow keys nudge only the player frame in zoom-lock mode, do not move the DM viewport, follow key-repeat, and are ignored when zoom lock/player view is unavailable or an input/menu owns focus.
- GPU tests: render an asymmetric scene at 0°, 90°, 180°, and 270° and verify orientation, expected fit, no unintended clipping/blank edges, and that the DM frame is restored exactly after each capture. Cover portrait/landscape player windows, full camera freeze, and zoom-only lock.
- With zoom lock enabled, change the DM zoom and move tokens, alter visibility, and update fog/lighting; verify the minis remain the same apparent size while all live map display changes reach players. Verify zoom-lock and rotation changes update a held presentation and leave player overlays screen-aligned.
- Verify rotation and zoom lock do not alter saved map/scene data.
- Run focused unit tests for the touched menu, player-frame, and device-settings paths, followed by the relevant GPU player-frame tests and the repository's unit suite.

## Acceptance Criteria

- A blank-map right-click in DM view opens the Atlas menu at the pointer; the browser menu does not appear.
- Existing context menus on map objects continue to work, and right-drag continues to pan without opening the blank-map menu.
- The menu exposes the agreed curated Atlas commands and four mutually exclusive rotation choices.
- Selecting 90°, 180°, or 270° changes only the player-facing map picture, immediately and across scene changes/reload; 0° restores the normal orientation.
- With zoom lock off, the player frame remains centered and shows the full DM camera view at every orientation and player-window aspect ratio. With zoom lock on, the player frame follows DM panning while player scale remains fixed; the player frame's world extent is allowed to differ from the DM's.
- With zoom lock on, arrow keys pan the player frame in discrete steps without changing its scale or the DM's camera. Outside zoom-lock mode, these keys do not control the player frame.
- Zoom lock changes only framing scale: the player scene remains live, including token/minis movement, fog, lighting, visibility, and other player-safe layers. Full camera freeze retains its current semantics and takes precedence while enabled.
- The DM's current view and all persisted scene/map objects are unchanged by rotation. Capture failure always restores the DM's render state.
- Player-window overlays stay upright, and the menu/rotation controls are localized and usable in popout documents.

## Scope Decision Before Coding

Confirm which actions belong in the `Commands` submenu. This plan assumes a short, curated list of map/player-view actions rather than all Atlas commands or the full Obsidian command registry. Rotation and zoom lock are scoped to the player map canvas; rotating the entire player-window UI is out of scope unless requested. Zoom lock intentionally follows the DM's center but not the DM's zoom; full camera freeze remains the separate option that pins both center and scale.