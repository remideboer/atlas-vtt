import { App, Notice } from 'obsidian';
import type { ViewAtlasState } from '../storeFactory';
import type { StoreApi } from 'zustand';
import type { SettingsService } from './SettingsService';
import { playerWindowStore, resetPlayerWindowStore } from '../stores/playerWindowStore';
import './player-window.scss';
import { PlayerInitiativePanel } from './PlayerInitiativePanel';
import type { PlayerOverlay } from './PlayerSceneOverlay';
import { PlayerDiceRolls } from './PlayerDiceRolls';
import { PlayerWidgetBar } from './PlayerWidgetBar';
import { LocalPlayerView, LOCAL_PLAYER_VIEW_TYPE, type PlayerCameraState } from '../local-player-view';
import { freezeCanvasFrame, type SceneTransition } from '../pixi/sceneTransition';
import { t } from '../i18n';
import { cannotRender, PlayerFrameMirror, type PlayerFrameSource } from './PlayerFrameMirror';
import { cameraFramingPicture, framedCamera } from './playerFrame';
import { cellsAlong, pixelsPerInch } from '../player/actualSize';
import { promptPlayerScreen } from '../player/PlayerScreenModal';
import { maximizeDesktopWindow, RESTORE_WAIT_MS, whenWindowPlaced } from '../player/desktopWindow';
import { displayMatching, prepareDesktopScreen, watchDisplayMetrics, workAreaMatching, type PlayerDisplay } from '../player/playerDisplays';
import {
  actualScaleFor,
  draftOf,
  hasPhysicalSize,
  loadPlayerScreens,
  MANUAL_DISPLAY_ID,
  profileFor,
  savePlayerScreen,
  screenPixels,
  screenSetupNeeded,
  type PlayerScreenDraft,
  type PlayerScreenProfile,
  type PlayerScreenSettings,
} from '../player/playerScreens';
import { cameraHeldForFreeze, playerViewOf, presentedPlayerFrame } from './playerPresentation';
import { PlayerPresentationController } from './playerPresentationController';
import type { Screen, Size } from '../types/playerFrame';
import type { PresentedScene } from './presentedScene';

/** Scopes the rules in `player-window.scss` to the popout document. */
const PLAYER_WINDOW_BODY_CLASS = 'atlas-player-window';
/** Set once frames are being mirrored: swaps the loading message for the canvas. */
const PLAYER_WINDOW_LIVE_CLASS = 'atlas-player-window--live';
/** Hard edges on the player canvas, for a picture scaled up from fewer pixels. */
const PLAYER_WINDOW_CRISP_CLASS = 'atlas-player-window--crisp';

/** Identifies a stylesheet node so the same sheet is not added to the popout twice. */
function getStyleNodeKey(node: Element): string {
  return node.instanceOf(HTMLLinkElement) ? `link:${node.href}` : `style:${node.textContent ?? ''}`;
}

/** What stands in for a map view that closed: it renders nothing, and players keep the frame they hold. */
const CLOSED_SOURCE: PlayerFrameSource = { withPlayerSafeFrame: () => undefined };

/**
 * Shows a DM map view's scene in a popout window for players.
 *
 * The window shows one scene tab at a time, the presented scene (see `presentedScene.ts`).
 * While the DM works on another tab the last frame is held so players never see
 * the DM's navigation; `PlayerWindowPresenter` drives that hold/release cycle.
 * A camera freeze only pins the camera: the scene keeps updating (tokens, fog)
 * while the DM pans and zooms their own view.
 */
export class PlayerWindowService {
  private playerWindow: Window | null = null;
  private playerView: LocalPlayerView | null = null;
  private app: App;
  private store: StoreApi<ViewAtlasState>;
  private settingsService: SettingsService;
  private streamSource: PlayerFrameSource | null = null;
  private animationFrame: number | null = null;
  /** Camera the DM froze players on; the presented scene is still rendered live through it. */
  private frozenCamera: PlayerCameraState | null = null;
  /** Rotation the held snapshot was rendered at, so a later turn can rotate that still. */
  private heldRotation = 0;
  private readonly presentation: PlayerPresentationController;
  /** The camera of the last frame players were shown of the presented scene; none until a frame of that scene came. */
  private shownCamera: PlayerCameraState | null = null;
  /** Last player frame, shown unchanged while the DM works on another scene tab. */
  private heldFrame: HTMLCanvasElement | null = null;
  /** The picture Pause is holding, so resuming can put the GM map back on it. */
  private pausedPicture: PlayerCameraState | null = null;
  /** Pause was chosen from the menu. A still taken only to leave the scene is not one. */
  private userPaused = false;
  /** Crossfade from the previous map, still playing after the DM presented another scene. */
  private mapTransition: SceneTransition | null = null;
  private static instance: PlayerWindowService | null = null;
  private settingsUnsubscribe: (() => void) | null = null;
  /** Widget bar, initiative panel and dice rolls, drawn over the presented scene. */
  private sceneOverlays: PlayerOverlay[] = [];
  private readonly boundHandleBeforeUnload = (): void => {
    this.cleanup(false);
  };
  private isCleaningUp = false;
  /** Brings frames of the presented scene into the window; exists while frames are being mirrored. */
  private mirror: PlayerFrameMirror | null = null;
  /** Identifies the running frame loop; a newer loop ends older ones. */
  private mirrorLoopId = 0;
  /** Player screens remembered on this device, read again when the GM saves one. */
  private screens: PlayerScreenSettings = { cellInches: 1, screens: {} };
  /** The last place the player window was read at, so a still window does not ask Electron again. */
  private displayKey = '';
  private cachedDisplay: PlayerDisplay | null = null;
  private stopDisplayWatch: (() => void) | null = null;
  /** The square shown on the player screen while the GM measures it. */
  private sizeSquare: HTMLElement | null = null;

  constructor(app: App, store: StoreApi<ViewAtlasState>, settingsService: SettingsService) {
    this.app = app;
    this.store = store;
    this.settingsService = settingsService;
    this.presentation = new PlayerPresentationController(app, () => this.onPresentationChange());
    this.screens = loadPlayerScreens(app);
    PlayerWindowService.instance = this;
  }

  /** The device rotation and this window's zoom lock. */
  public playerPresentation(): PlayerPresentationController {
    return this.presentation;
  }

  /**
   * Pin the scale players are shown now, or release it. Full camera freeze still wins while it
   * is on; turning that off returns to this lock when it stays enabled.
   */
  public togglePlayerZoomLock(): boolean {
    if (this.presentation.isZoomLocked()) {
      this.presentation.toggleZoomLock(null);
      new Notice(t('player.zoomUnlocked'));
      return false;
    }
    const scale = this.scalePlayersSee();
    if (scale === null) {
      new Notice(t('player.nothingToFreeze'));
      return false;
    }
    this.presentation.toggleZoomLock(scale);
    new Notice(t('player.zoomLocked'));
    return true;
  }

  public setPlayerRotation(rotation: Parameters<PlayerPresentationController['setRotation']>[0]): void {
    this.presentation.setRotation(rotation);
  }

  /**
   * Show the map at actual size, or turn that off when it is already on. The GM view is not
   * moved. False when the GM dismisses the screen setup.
   */
  public async enableActualSize(cellPixels: number, map: Size | null): Promise<boolean> {
    if (this.presentation.isActualSize()) {
      this.presentation.setActualSize(false);
      this.showSizeSquare(null);
      new Notice(t('player.actualSizeOff'));
      return false;
    }
    await prepareDesktopScreen();
    this.displayKey = '';
    const display = this.currentDisplay();
    let profile = profileFor(this.screens, display);
    if (screenSetupNeeded(this.screens, display)) {
      const draft = await this.askForScreen(display, profile);
      if (!draft) return false;
      profile = profileFor(this.screens, display);
      if (screenSetupNeeded(this.screens, display)) return false;
    } else if (display && profile && !hasPhysicalSize(this.screens.screens[display.id] ?? null)) {
      this.rememberScreen(display.id, draftOf(profile, this.screens.cellInches, display.label));
    }
    this.presentation.setActualSize(true);
    this.syncCrisp();
    this.noticeActualSize(cellPixels, map, display, profile);
    return true;
  }

  /** Open the screen setup for the screen the player window is on. */
  public async editPlayerScreen(): Promise<void> {
    await prepareDesktopScreen();
    this.displayKey = '';
    const display = this.currentDisplay();
    const draft = await this.askForScreen(display, profileFor(this.screens, display));
    if (!draft) return;
    this.syncCrisp();
    this.mirror?.markStale();
  }

  /**
   * One arrow-key step of the player frame. False when zoom lock is off, the window is closed,
   * or a full camera freeze is holding the centre.
   */
  public nudgePlayerFrame(key: string): boolean {
    if (!this.isWindowOpen() || this.frozenCamera || !this.presentation.holdsPan()) return false;
    const extent = this.screenExtent();
    if (!extent) return false;
    return this.presentation.nudgeKey(key, extent);
  }

  public static getInstance(): PlayerWindowService | null {
    return PlayerWindowService.instance;
  }

  /**
   * Toggle the DM's camera freeze and return the new frozen state. Where players are not shown
   * the presented scene yet there is nothing to freeze them on, and the DM is told so.
   */
  public toggleCameraFreeze(show: (camera: PlayerCameraState) => void = () => undefined): boolean {
    if (this.frozenCamera) {
      this.unfreezeCamera(show);
      return false;
    }
    this.freezeCamera();
    new Notice(this.isFrozen() ? t('player.frozen') : t('player.nothingToFreeze'));
    return this.isFrozen();
  }

  /**
   * The presented scene places its own viewport when the freeze ends, and asks for the render
   * itself. A caller then leaves that render alone.
   */
  public presentsCamera(): boolean {
    return this.streamSource?.showCamera !== undefined;
  }

  /**
   * Put the DM's view on the frozen player picture, then let the cameras follow each other again.
   * Players stay where they are. False when nothing is frozen.
   */
  public unfreezeCamera(show: (camera: PlayerCameraState) => void): boolean {
    const frozen = this.frozenCamera;
    if (!frozen) return false;
    const camera = cameraFramingPicture(frozen, this.streamSource?.getScreen?.());
    this.streamSource?.showCamera?.(camera);
    show(camera);
    if (this.presentation.holdsPan()) this.presentation.adoptDmCamera(this.streamSource?.getCamera?.() ?? camera);
    this.setFrozenCamera(null);
    new Notice(t('player.unfrozen'));
    return true;
  }

  /**
   * Keep players on `camera`, by default the camera they currently see, and on the world
   * rectangle it frames: map changes stay visible; the DM's panning and zooming, and the size
   * of the DM's pane, no longer reach them.
   */
  public freezeCamera(camera?: PlayerCameraState): void {
    this.setFrozenCamera(camera ?? this.cameraOfPicture() ?? this.cameraPlayersSee());
  }

  /**
   * The world the player window is painting: its centre and the rectangle that fills the window.
   * None while a still is already up, or the scene cannot be shown.
   */
  private pictureOnScreen(): PlayerCameraState | null {
    const source = this.streamSource;
    const canvas = this.playerCanvas();
    const window = canvas ? this.windowScreen(canvas) : null;
    const camera = this.frozenCamera ?? source?.getCamera?.();
    if (!source || !window || !camera || this.heldFrame || cannotRender(source)) return null;
    const screen = source.getScreen?.();
    const frame = presentedPlayerFrame({
      window,
      pane: screen,
      camera,
      gmScreen: screen,
      rotation: this.presentation.rotation,
      zoomLock: this.frameLock(),
      frozen: this.frozenCamera !== null,
    });
    if (!frame || !(frame.scale > 0)) return null;
    const width = frame.width / frame.resolution / frame.scale;
    const height = frame.height / frame.resolution / frame.scale;
    if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
    return { centerX: frame.centerX, centerY: frame.centerY, scale: frame.scale, width, height };
  }

  /**
   * The camera that freezes the picture players are shown now: actual size, zoom lock and
   * rotation, the same framing the window is rendering. The GM camera alone is a different picture.
   */
  private cameraOfPicture(): PlayerCameraState | null {
    const source = this.streamSource;
    const canvas = this.playerCanvas();
    const window = canvas ? this.windowScreen(canvas) : null;
    const camera = source?.getCamera?.();
    if (!source || !window || !camera || this.heldFrame || cannotRender(source)) return null;
    const screen = source.getScreen?.();
    const rotation = this.presentation.rotation;
    const view = playerViewOf({
      window,
      camera,
      gmScreen: screen,
      rotation,
      zoomLock: this.frameLock(),
      frozen: false,
    });
    return view ? cameraHeldForFreeze(view, rotation, camera.scale) : null;
  }

  /**
   * The camera players see the presented scene through now: that of its last frame, else the
   * DM's own. Never a camera of another scene: the one players saw before this scene was
   * presented frames a rectangle of that scene's map; while a frame is held the view shows the
   * scene the DM browses, through its camera; and while the scene loads the view's camera is
   * not the scene's yet. With none of its own, there is nothing to freeze on yet.
   */
  private cameraPlayersSee(): PlayerCameraState | null {
    if (this.shownCamera) return this.shownCamera;
    const source = this.streamSource;
    if (!source || this.heldFrame || cannotRender(source)) return null;
    return source.getCamera?.() ?? null;
  }

  public isFrozen(): boolean {
    return this.frozenCamera !== null;
  }

  public isWindowOpen(): boolean {
    return this.playerWindow !== null && !this.playerWindow.closed;
  }

  /** True while Pause is holding the picture, including a camera freeze restored from an older session. */
  public isPlayerPaused(): boolean {
    return this.userPaused || this.frozenCamera !== null;
  }

  /**
   * Hold the picture players see, or put the GM map on that picture and follow it again.
   * Resuming while this view shows another scene leaves the hold in place.
   */
  public togglePlayerPause(): boolean {
    if (!this.isWindowOpen()) {
      new Notice(t('player.notOpen'));
      return false;
    }
    if (this.userPaused || this.frozenCamera) {
      const source = this.resumableSource();
      if (!source) {
        new Notice(t('player.resumeOnScene'));
        return true;
      }
      this.resumeOnPicture(source);
      new Notice(t('player.viewResumed'));
      return false;
    }
    const picture = this.pictureOnScreen();
    if (!picture) {
      new Notice(t('player.nothingToFreeze'));
      return false;
    }
    this.pausedPicture = picture;
    this.userPaused = true;
    this.holdCurrentFrame();
    if (!this.heldFrame) {
      this.userPaused = false;
      this.pausedPicture = null;
      new Notice(t('player.nothingToFreeze'));
      return false;
    }
    new Notice(t('player.viewPaused'));
    return true;
  }

  /** Move the GM viewport onto the held picture, then let the live scene show again. */
  private resumeOnPicture(source: PlayerFrameSource): void {
    const picture = this.pausedPicture ?? this.frozenCamera;
    if (picture) {
      const camera = cameraFramingPicture(picture, source.getScreen?.());
      source.showCamera?.(camera);
      if (this.presentation.holdsPan()) this.presentation.adoptDmCamera(source.getCamera?.() ?? camera);
    }
    this.userPaused = false;
    this.pausedPicture = null;
    if (this.frozenCamera) this.setFrozenCamera(null);
    if (this.heldFrame) this.releaseHeldFrame(source);
  }

  /** The live source of the scene players are watching, when this view is showing that scene. */
  private resumableSource(): PlayerFrameSource | null {
    const source = this.streamSource;
    if (!source || source === CLOSED_SOURCE) return null;
    const state = source.store?.getState();
    if (!state?.mapLoaded || state.isMapLoading) return null;
    const filePath = this.playerView?.getState().filePath;
    if (filePath && state.mapPath !== filePath) return null;
    return source;
  }

  /** The open popout window, or null when there is none. */
  public getWindow(): Window | null {
    return this.isWindowOpen() ? this.playerWindow : null;
  }

  /**
   * Maximize the player window on the screen it is on. Nothing when the window is closed.
   * A popout's saved size arrives after it opens, so the maximize is asked for again once that settles.
   */
  public async maximizeWindow(): Promise<void> {
    const win = this.getWindow();
    if (!win) return;
    await whenWindowPlaced(win);
    await this.applyMaximized(win);
    await new Promise<void>((resolve) => { win.setTimeout(resolve, RESTORE_WAIT_MS); });
    if (!this.isWindowOpen() || this.playerWindow !== win) return;
    await this.applyMaximized(win);
  }

  private async applyMaximized(win: Window): Promise<void> {
    if (win.closed) return;
    if (maximizeDesktopWindow(win)) return;
    await prepareDesktopScreen();
    const frame = workAreaMatching(win);
    if (!frame) return;
    win.moveTo(frame.x, frame.y);
    win.resizeTo(frame.width, frame.height);
  }

  /** Keep players on the current frame while the DM works on another scene tab. */
  public holdCurrentFrame(): void {
    if (!this.isWindowOpen()) return;
    this.sceneOverlays.forEach((overlay) => overlay.hold());
    if (this.heldFrame) return;
    this.heldRotation = this.presentation.rotation;
    this.heldFrame = this.snapshotPlayerFrame();
    this.updateFreezeIndicator();
  }

  /**
   * Keep players on the last frame and let go of the map view that owns `store`,
   * which is closing. Presenting another scene resumes live mirroring.
   */
  public releaseSource(store: StoreApi<ViewAtlasState>): void {
    if (!this.streamSource || this.streamSource.store !== store) return;
    this.holdCurrentFrame();
    this.sceneOverlays.forEach((overlay) => overlay.releaseSource?.());
    this.streamSource = CLOSED_SOURCE;
    this.followSource();
  }

  /**
   * Point the mirror at the new `streamSource` now. The window's next display frame, which
   * would do it, never comes while the window is hidden, and the previous view would stay referenced.
   */
  private followSource(): void {
    this.mirror?.frame();
  }

  /**
   * Resume live mirroring from `source` once the presented scene is rendered again.
   * A camera freeze stays in place, so players return to the same framing.
   */
  public releaseHeldFrame(source: PlayerFrameSource): void {
    if (!this.isWindowOpen()) return;
    this.streamSource = source;
    this.pinFrozenCamera();
    this.mirror?.markStale();
    this.presentScene();
    // A chosen pause stays until the GM resumes it. Coming back to the scene only drops a still
    // that was taken so players would not see another tab.
    if (this.userPaused) {
      this.followSource();
      return;
    }
    this.heldFrame = null;
    this.syncHeldTransform();
    this.updateFreezeIndicator();
    this.followSource();
  }

  /**
   * Show the scene tab `tabId`, already rendered into `source`, to players.
   * Any freeze is lifted because the DM explicitly chose what players see.
   */
  public presentCanvas(source: PlayerFrameSource, tabId: string, filePath?: string): void {
    if (!this.isWindowOpen()) {
      new Notice(t('player.notOpen'));
      return;
    }
    const anotherScene = playerWindowStore.getState().shownTabId !== tabId;
    if (anotherScene) this.crossfadeToNextMap();
    this.streamSource = source;
    this.mirror?.markStale();
    this.presentScene();
    this.heldFrame = null;
    this.syncHeldTransform();
    this.setFrozenCamera(null);
    // The camera players saw the scene before through says nothing about this one
    if (anotherScene) this.shownCamera = null;
    playerWindowStore.setState({ shownTabId: tabId });
    this.playerView?.updateSession({ tabId, ...(filePath ? { filePath } : {}), frozen: false, ...(anotherScene ? { camera: null } : {}) });
    this.followSource();
  }

  /** The player window's view when its leaf is open, attached or not; null when there is none. */
  public static openPlayerView(app: App): LocalPlayerView | null {
    const view = app.workspace.getLeavesOfType(LOCAL_PLAYER_VIEW_TYPE)[0]?.view;
    return view instanceof LocalPlayerView && !view.isClosed ? view : null;
  }

  /**
   * Opens the player window's leaf in a popout (or reuses the one there is) on `scene`; the
   * presenter then attaches it to the view that holds the scene. Null when Obsidian gave no player view.
   */
  public static async openLeaf(app: App, scene: PresentedScene): Promise<LocalPlayerView | null> {
    const leaf = app.workspace.getLeavesOfType(LOCAL_PLAYER_VIEW_TYPE)[0] ?? app.workspace.openPopoutLeaf();
    await leaf.setViewState({ type: LOCAL_PLAYER_VIEW_TYPE, state: { tabId: scene.tabId, filePath: scene.filePath, frozen: false } });
    return leaf.view instanceof LocalPlayerView ? leaf.view : null;
  }

  public ownsView(view: LocalPlayerView): boolean {
    return this.playerView === view;
  }

  public attachToView(view: LocalPlayerView, source: PlayerFrameSource, scene: PresentedScene): void {
    this.playerView = view;
    this.playerWindow = view.contentEl.win;
    this.streamSource = source;
    this.shownCamera = null;
    this.presentation.restore(view.getState());
    this.pinFrozenCamera();
    this.mirror?.markStale();
    playerWindowStore.setState({ shownTabId: scene.tabId });
    view.updateSession({ tabId: scene.tabId, filePath: scene.filePath });
    // Bind now: the popout may still be loading, and the DM can switch tabs before it has
    this.destroySceneOverlays();
    this.sceneOverlays = [
      new PlayerWidgetBar(this.settingsService),
      new PlayerInitiativePanel(this.app, this.settingsService),
      new PlayerDiceRolls(this.app, this.settingsService),
    ];
    this.presentScene();
    this.setupPlayerWindow();
  }

  private setFrozenCamera(camera: PlayerCameraState | null): void {
    this.frozenCamera = camera ? framedCamera({ ...camera }, this.streamSource?.getScreen?.()) : null;
    this.mirror?.markStale();
    this.updateFreezeIndicator();
    playerWindowStore.setState({ isFrozen: this.isFrozen() });
    this.playerView?.updateSession({
      frozen: this.isFrozen(),
      ...(this.frozenCamera ? { camera: { ...this.frozenCamera } } : {}),
      ...this.presentation.sessionFields(),
    });
  }

  /**
   * A frozen camera that came without the world rectangle it frames (one an older Atlas saved,
   * or one frozen before a scene was attached) takes what the DM's screen shows through it now,
   * and keeps that.
   */
  private pinFrozenCamera(): void {
    if (!this.frozenCamera) return;
    const pinned = framedCamera(this.frozenCamera, this.streamSource?.getScreen?.());
    if (pinned === this.frozenCamera) return;
    this.frozenCamera = pinned;
    this.playerView?.updateSession({ camera: { ...pinned } });
  }

  private updateFreezeIndicator(): void {
    if (!this.playerWindow || this.playerWindow.closed) return;
    const indicator = this.playerWindow.document.getElementById('atlas-player-freeze-indicator');
    if (indicator) {
      indicator.style.display = this.frozenCamera || this.heldFrame ? 'flex' : 'none';
    }
  }

  /** Fades the frame players see into the next scene, the same transition the DM view plays. */
  private crossfadeToNextMap(): void {
    const targetCanvas = this.playerWindow?.document.getElementById('atlas-player-canvas');
    if (!targetCanvas?.instanceOf(HTMLCanvasElement)) return;
    // A 2D canvas keeps its pixels, so the frame on screen can be copied at any time.
    // Players get the crossfade without the scale settle, which would resample a frame of the window's own pixels at every step.
    this.mapTransition = freezeCanvasFrame(
      targetCanvas, (context) => context.drawImage(targetCanvas, 0, 0), this.mapTransition, { settle: false },
    );
    this.mapTransition?.play();
  }

  /** Copy the frame players currently see so it can be held while the DM is elsewhere. */
  private snapshotPlayerFrame(): HTMLCanvasElement | null {
    if (!this.streamSource || !this.playerWindow || this.playerWindow.closed) return null;

    const targetCanvas = this.playerWindow.document.getElementById('atlas-player-canvas') as HTMLCanvasElement | null;
    if (!targetCanvas) return null;

    // Never attached to a document: it is only a pixel buffer, so it can live in the
    // main window. drawImage works across windows, as the live mirroring relies on.
    const snapshot = createEl('canvas');
    snapshot.width = targetCanvas.width;
    snapshot.height = targetCanvas.height;
    snapshot.getContext('2d')?.drawImage(targetCanvas, 0, 0);
    return snapshot;
  }

  /**
   * Mirrors the main window's stylesheets into the popout by cloning the existing
   * `<link>`/`<style>` nodes, skipping the ones Obsidian already placed there.
   */
  private copyMainWindowStyles(doc: Document): void {
    const existing = new Set(
      Array.from(doc.head.querySelectorAll('link[rel="stylesheet"], style')).map(getStyleNodeKey),
    );
    document.head.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
      if (existing.has(getStyleNodeKey(node))) return;
      doc.head.appendChild(doc.importNode(node, true));
    });
  }

  /**
   * Sets up the player window after it's been opened
   */
  private setupPlayerWindow(): void {
    if (!this.playerWindow) return;

    try {
      const doc = this.playerWindow.document;
      
      // Wait for the popout window to be fully loaded
      if (doc.readyState !== 'complete') {
        this.playerWindow.addEventListener('load', () => {
          this.setupPlayerWindow();
        }, { once: true });
        return;
      }
      
      // Hide all Obsidian UI elements
      const body = doc.body;
      
      // Double-check we have the right window
      if (this.playerWindow === window) {
        console.error('[PlayerWindowService] ERROR: Player window is the same as main window!');
        new Notice(t('player.isMain'));
        return;
      }
      
      const content = this.playerView?.contentEl ?? body;
      content.empty();
      
      this.copyMainWindowStyles(doc);
      body.classList.add(PLAYER_WINDOW_BODY_CLASS);
      body.classList.remove(PLAYER_WINDOW_LIVE_CLASS);

      // Create our UI elements
      const loading = content.createDiv();
      loading.id = 'atlas-player-loading';
      loading.textContent = t('player.connecting');

      const canvas = content.createEl('canvas');
      canvas.id = 'atlas-player-canvas';

      this.sceneOverlays.forEach((overlay) => overlay.mount(content));
      this.settingsUnsubscribe?.();
      // Player view settings decide which layers players see
      // So do the collection's settings: which resources they see
      const collectionChanged = this.app.workspace.on('atlas-vtt:collection-settings-changed', () => {
        this.mirror?.markStale();
        this.sceneOverlays.forEach((overlay) => overlay.refresh?.());
      });
      const unsubscribeSettings = this.settingsService.onChange(() => this.mirror?.markStale());
      this.settingsUnsubscribe = () => {
        unsubscribeSettings();
        this.app.workspace.offref(collectionChanged);
      };

      // Create freeze indicator
      const freezeIndicator = content.createDiv();
      freezeIndicator.id = 'atlas-player-freeze-indicator';
      const freezeIcon = freezeIndicator.createSvg('svg', { attr: {
        width: 16,
        height: 16,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      } });
      freezeIcon.createSvg('line', { attr: { x1: 2, y1: 12, x2: 22, y2: 12 } });
      freezeIcon.createSvg('line', { attr: { x1: 12, y1: 2, x2: 12, y2: 22 } });
      freezeIcon.createSvg('path', { attr: { d: 'M20 16l-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4' } });
      freezeIndicator.createSpan({ text: t('player.paused') });
      freezeIndicator.style.display = this.frozenCamera || this.heldFrame ? 'flex' : 'none';
      
      // Create title bar container
      const titleBarContainer = content.createDiv();
      titleBarContainer.id = 'atlas-player-titlebar-container';
      
      // Create title bar for dragging
      const titleBar = titleBarContainer.createDiv();
      titleBar.id = 'atlas-player-titlebar';
      const titleBarText = titleBar.createDiv();
      titleBarText.id = 'atlas-player-titlebar-text';
      titleBarText.textContent = t('player.title');
      

      // Set window title
      doc.title = t('player.title');

      this.watchDisplays();
      this.syncCrisp();
      // Start mirroring
      this.startMirroring();
      playerWindowStore.setState({ isOpen: true });

      // Cleanup on close
      this.playerWindow.addEventListener('beforeunload', this.boundHandleBeforeUnload);

    } catch (error) {
      console.error('[PlayerWindowService] Error setting up player window:', error);
      new Notice(t('player.setupFailed'));
    }
  }

  /** Bind the overlays to the view store that now holds the presented scene. */
  private presentScene(): void {
    const store = this.streamSource?.store ?? this.store;
    const source = this.streamSource;
    this.sceneOverlays.forEach((overlay) => overlay.present(store, source?.diceEvents, source?.rollSources));
  }

  private destroySceneOverlays(): void {
    this.sceneOverlays.forEach((overlay) => overlay.destroy());
    this.sceneOverlays = [];
  }

  /** Starts the loop that brings frames of the presented scene onto the window's canvas, one check per display frame. */
  private startMirroring(): void {
    if (!this.playerWindow || !this.streamSource) return;

    const targetCanvas = this.playerWindow.document.getElementById('atlas-player-canvas') as HTMLCanvasElement;
    
    if (!targetCanvas) return;

    const targetCtx = targetCanvas.getContext('2d');
    if (!targetCtx) return;

    this.playerWindow.document.body.classList.add(PLAYER_WINDOW_LIVE_CLASS);

    const loopId = ++this.mirrorLoopId;
    this.mirror?.stop();
    const mirror = new PlayerFrameMirror(targetCanvas, targetCtx, {
      source: () => this.streamSource,
      window: () => this.windowScreen(targetCanvas),
      heldFrame: () => this.heldFrame,
      frozenCamera: () => this.frozenCamera,
      rotation: () => this.presentation.rotation,
      zoomLock: () => this.frameLock(),
      settings: () => this.settingsService.getLocalPlayerViewSettings(),
      onFrame: (camera) => this.recordPlayerCamera(camera),
    });
    this.mirror = mirror;

    const mirrorFrame = (): void => {
      if (loopId !== this.mirrorLoopId) return;
      if (!this.playerWindow || this.playerWindow.closed || !this.streamSource) {
        this.cleanup();
        return;
      }

      this.animationFrame = this.playerWindow.requestAnimationFrame(mirrorFrame);
      mirror.frame();
    };

    mirrorFrame();
  }

  /**
   * The player window as the frames are rendered for it: the canvas fills it, so the canvas'
   * size is the window's, and the pixel ratio is that of the screen the window is on now.
   */
  private windowScreen(canvas: HTMLCanvasElement): Screen | null {
    if (!this.playerWindow || this.playerWindow.closed) return null;
    return { width: canvas.clientWidth, height: canvas.clientHeight, resolution: this.playerWindow.devicePixelRatio || 1 };
  }

  /** Persist the camera players see so a restored window reopens on the same framing. */
  private recordPlayerCamera(camera: PlayerCameraState | undefined): void {
    if (!camera) return;
    this.shownCamera = camera;
    const previous = this.playerView?.getState().camera;
    const changed = camera.centerX !== previous?.centerX || camera.centerY !== previous.centerY || camera.scale !== previous.scale
      || camera.width !== previous.width || camera.height !== previous.height;
    if (changed) this.playerView?.updateSession({ camera, ...this.presentation.sessionFields() });
  }

  /** The scale of the frame players are shown now, before a zoom lock is applied on top. */
  private scalePlayersSee(): number | null {
    const canvas = this.playerCanvas();
    const window = canvas ? this.windowScreen(canvas) : null;
    const camera = this.frozenCamera ?? this.streamSource?.getCamera?.();
    if (!window || !camera) return null;
    const screen = this.streamSource?.getScreen?.();
    return presentedPlayerFrame({
      window,
      pane: screen,
      camera,
      gmScreen: screen,
      rotation: this.presentation.rotation,
      zoomLock: null,
      frozen: this.frozenCamera !== null,
    })?.scale ?? null;
  }

  /** World size visible along the player window's screen axes at the pinned scale. */
  private screenExtent(): Size | null {
    const lock = this.frameLock();
    const canvas = this.playerCanvas();
    const window = canvas ? this.windowScreen(canvas) : null;
    if (!lock || !window) return null;
    return { width: window.width / lock.scale, height: window.height / lock.scale };
  }

  /**
   * The scale and centre offset the player frame uses. Actual size wins over zoom lock, and a
   * frozen camera keeps the lock the freeze already ignores. A DM zoom is absorbed first, so
   * the centre stays.
   */
  private frameLock(): ReturnType<PlayerPresentationController['zoomLock']> {
    if (this.frozenCamera === null) {
      const camera = this.streamSource?.getCamera?.();
      if (camera) this.presentation.noteDmCamera(camera);
    }
    if (this.frozenCamera === null && this.presentation.isActualSize()) {
      const scale = this.actualScaleNow();
      if (scale !== null) {
        const pan = this.presentation.pan();
        return { scale, offsetX: pan.x, offsetY: pan.y };
      }
    }
    return this.presentation.zoomLock();
  }

  private actualScaleNow(): number | null {
    const win = this.playerWindow;
    if (!win) return null;
    return actualScaleFor({
      cellPixels: this.streamSource?.store?.getState().grid?.size,
      settings: this.screens,
      display: this.currentDisplay(),
      devicePixelRatio: win.devicePixelRatio || 1,
    });
  }

  private currentDisplay(): PlayerDisplay | null {
    const win = this.playerWindow;
    if (!win || win.closed) return null;
    const key = `${win.screenX}:${win.screenY}:${win.outerWidth}:${win.outerHeight}:${win.devicePixelRatio}`;
    if (key !== this.displayKey) {
      this.displayKey = key;
      this.cachedDisplay = displayMatching(win);
    }
    return this.cachedDisplay;
  }

  private async askForScreen(display: PlayerDisplay | null, profile: PlayerScreenProfile | null): Promise<PlayerScreenDraft | null> {
    const draft = await promptPlayerScreen(this.app, {
      display,
      profile,
      cellInches: this.screens.cellInches,
      devicePixelRatio: this.playerWindow?.devicePixelRatio || 1,
      showSquare: (cssPixels) => this.showSizeSquare(cssPixels),
    });
    if (!draft) return null;
    this.rememberScreen(display?.id ?? MANUAL_DISPLAY_ID, draft);
    return draft;
  }

  private rememberScreen(id: string, draft: PlayerScreenDraft): void {
    this.screens = savePlayerScreen(this.app, id, draft);
  }

  private noticeActualSize(cellPixels: number, map: Size | null, display: PlayerDisplay | null, profile: PlayerScreenProfile | null): void {
    const pixels = screenPixels(display, profile);
    const ppi = pixels && profile ? pixelsPerInch({
      widthPx: pixels.width,
      heightPx: pixels.height,
      ...(profile.diagonalInches !== undefined ? { diagonalInches: profile.diagonalInches } : {}),
      ...(profile.widthMm !== undefined ? { widthMm: profile.widthMm } : {}),
      ...(profile.heightMm !== undefined ? { heightMm: profile.heightMm } : {}),
      ...(profile.calibration !== undefined ? { calibration: profile.calibration } : {}),
    }) : null;
    const across = pixels && ppi ? cellsAlong(pixels.width, this.screens.cellInches, ppi) : null;
    const down = pixels && ppi ? cellsAlong(pixels.height, this.screens.cellInches, ppi) : null;
    if (map && across !== null && down !== null && (map.width / cellPixels > across || map.height / cellPixels > down)) {
      new Notice(t('player.actualSizeLarger', { across: Math.floor(across), down: Math.floor(down) }));
      return;
    }
    new Notice(t('player.actualSizeOn'));
  }

  private syncCrisp(): void {
    const body = this.playerWindow?.document.body;
    if (!body) return;
    const profile = profileFor(this.screens, this.currentDisplay());
    body.classList.toggle(PLAYER_WINDOW_CRISP_CLASS, profile?.crisp === true);
  }

  private showSizeSquare(cssPixels: number | null): void {
    if (cssPixels === null) {
      this.sizeSquare?.remove();
      this.sizeSquare = null;
      return;
    }
    const parent = this.playerCanvas()?.parentElement;
    if (!parent) return;
    if (!this.sizeSquare) this.sizeSquare = parent.createDiv({ cls: 'atlas-player-size-square' });
    this.sizeSquare.style.width = `${cssPixels}px`;
    this.sizeSquare.style.height = `${cssPixels}px`;
  }

  private watchDisplays(): void {
    this.stopDisplayWatch?.();
    const win = this.playerWindow;
    if (!win) {
      this.stopDisplayWatch = null;
      return;
    }
    const invalidate = (): void => {
      this.displayKey = '';
      this.mirror?.markStale();
    };
    win.addEventListener('move', invalidate);
    let stopMetrics: (() => void) | null = null;
    let stopped = false;
    void prepareDesktopScreen().then(() => {
      if (stopped || this.playerWindow !== win) return;
      stopMetrics = watchDisplayMetrics(invalidate);
      invalidate();
    });
    this.stopDisplayWatch = (): void => {
      stopped = true;
      win.removeEventListener('move', invalidate);
      stopMetrics?.();
    };
  }

  private playerCanvas(): HTMLCanvasElement | null {
    const canvas = this.playerWindow?.document.getElementById('atlas-player-canvas');
    return canvas instanceof HTMLCanvasElement ? canvas : null;
  }

  private onPresentationChange(): void {
    this.mirror?.markStale();
    this.syncHeldTransform();
    this.playerView?.updateSession({ ...this.presentation.sessionFields() });
  }

  /**
   * A held frame is a bitmap of the angle it was taken at. A later rotation turns that bitmap
   * in one style write, and the window's DOM overlays stay outside the canvas so they stay upright.
   */
  private syncHeldTransform(): void {
    const canvas = this.playerCanvas();
    if (!canvas) return;
    const upright = '';
    if (!this.heldFrame) {
      canvas.style.transform = upright;
      return;
    }
    const delta = (this.presentation.rotation - this.heldRotation + 360) % 360;
    if (delta === 0) {
      canvas.style.transform = upright;
      return;
    }
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    const fit = delta === 90 || delta === 270 ? Math.min(width / height, height / width) : 1;
    const origin = 'center center';
    canvas.style.transformOrigin = origin;
    canvas.style.transform = `rotate(${delta}deg) scale(${fit})`;
  }

  /**
   * Cleanup resources
   */
  private cleanup(closeWindow = true): void {
    if (this.isCleaningUp) {
      return;
    }

    this.isCleaningUp = true;
    this.mirrorLoopId++;
    this.mirror?.stop();
    this.mirror = null;

    if (this.animationFrame) {
      this.playerWindow?.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    this.settingsUnsubscribe?.();
    this.settingsUnsubscribe = null;
    this.destroySceneOverlays();
    this.mapTransition?.cancel();
    this.mapTransition = null;

    this.stopDisplayWatch?.();
    this.stopDisplayWatch = null;
    this.showSizeSquare(null);
    this.playerWindow?.removeEventListener('beforeunload', this.boundHandleBeforeUnload);
    
    if (closeWindow && this.playerWindow && !this.playerWindow.closed) {
      this.playerWindow.close();
    }
    
    this.playerWindow = null;
    this.playerView = null;
    this.streamSource = null;
    this.heldFrame = null;
    this.pausedPicture = null;
    this.userPaused = false;
    this.syncHeldTransform();
    this.frozenCamera = null;
    this.shownCamera = null;
    resetPlayerWindowStore();
    // The window is gone: drop the singleton so the next present binds to the presenting view's store.
    if (PlayerWindowService.instance === this) {
      PlayerWindowService.instance = null;
    }
    this.isCleaningUp = false;
  }

  /**
   * Destroy the service
   */
  public destroy(closeWindow = true): void {
    this.cleanup(closeWindow);
  }
}
