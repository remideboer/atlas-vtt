import { vi } from 'vitest';
import type { LocalPlayerView } from '../../src/app/local-player-view';
import type { PlayerFrameSource } from '../../src/app/services/PlayerFrameMirror';
import type { PlayerWindowService } from '../../src/app/services/PlayerWindowService';

/** Attaches `service` to a loaded fake popout, as `openPlayerWindow` does with a real one. */
export function attachFakePlayerWindow(service: PlayerWindowService, source: PlayerFrameSource, tabId = 'scene-a'): Document {
  const doc = document.implementation.createHTMLDocument();
  Object.defineProperty(doc, 'readyState', { value: 'complete' });
  const fakeWin = {
    document: doc,
    closed: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn(),
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
  };
  Object.defineProperty(doc.body, 'win', { value: fakeWin });

  const fakeView = {
    contentEl: doc.body,
    updateSession: vi.fn(),
    // attachToView calls view.getState(); presentation.restore expects at least tabId/filePath.
    getState: vi.fn(() => ({ tabId, filePath: `${tabId}.atlasmap`, camera: undefined, frozen: false })),
  } as unknown as LocalPlayerView;
  service.attachToView(fakeView, source, { tabId, filePath: `${tabId}.atlasmap` });
  return doc;
}
