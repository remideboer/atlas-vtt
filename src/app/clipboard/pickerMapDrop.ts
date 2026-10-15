import type { Point } from './mapObjectContent';

/** Custom MIME so a picker drag is not treated as text or a file. */
export const PICKER_TOKEN_MIME = 'application/x-atlas-picker-token';
/** Chromium hides custom getData until drop; text/plain stays listed in `types`. */
const PICKER_TOKEN_TEXT_PREFIX = 'atlas-picker-token:';

export type PickerTokenPayload =
  | { kind: 'library'; id: string }
  | { kind: 'fiveE'; uid: string };

export interface MapDropViewport {
  toWorld(x: number, y: number): Point;
}

export interface PickerMapDropHost {
  getCanvas: () => HTMLCanvasElement | null;
  getViewport: () => MapDropViewport | null;
  modalEl: HTMLElement;
  onPlace: (point: Point, payload: PickerTokenPayload) => void;
}

function containsPoint(el: Element, clientX: number, clientY: number): boolean {
  const rect = el.getBoundingClientRect();
  return clientX >= rect.left && clientX < rect.right && clientY >= rect.top && clientY < rect.bottom;
}

function typesOf(data: DataTransfer): string[] {
  return Array.from(data.types as unknown as ArrayLike<string>);
}

/** True during dragover, when getData is still empty. */
export function isPickerTokenDrag(data: DataTransfer | null | undefined): boolean {
  if (!data) return false;
  const types = typesOf(data);
  return types.includes(PICKER_TOKEN_MIME) || types.includes('text/plain');
}

export function writePickerTokenDrag(data: DataTransfer, payload: PickerTokenPayload): void {
  const raw = JSON.stringify(payload);
  data.setData(PICKER_TOKEN_MIME, raw);
  data.setData('text/plain', `${PICKER_TOKEN_TEXT_PREFIX}${raw}`);
}

function payloadFromJson(raw: string): PickerTokenPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as { kind?: unknown; id?: unknown; uid?: unknown };
    if (record.kind === 'library' && typeof record.id === 'string') return { kind: 'library', id: record.id };
    if (record.kind === 'fiveE' && typeof record.uid === 'string') return { kind: 'fiveE', uid: record.uid };
    return null;
  } catch {
    return null;
  }
}

export function readPickerTokenDrag(data: DataTransfer | null | undefined): PickerTokenPayload | null {
  if (!data) return null;
  const custom = data.getData(PICKER_TOKEN_MIME);
  if (custom) return payloadFromJson(custom);
  const plain = data.getData('text/plain');
  if (plain.startsWith(PICKER_TOKEN_TEXT_PREFIX)) {
    return payloadFromJson(plain.slice(PICKER_TOKEN_TEXT_PREFIX.length));
  }
  return null;
}

/** World point under a picker drop, or null when it is not on the map. */
export function worldPointFromPickerDrop(
  canvas: HTMLCanvasElement | null,
  viewport: MapDropViewport | null,
  modalEl: Element | null,
  clientX: number,
  clientY: number,
): Point | null {
  if (!canvas || !viewport) return null;
  if (modalEl && containsPoint(modalEl, clientX, clientY)) return null;
  if (!containsPoint(canvas, clientX, clientY)) return null;
  const rect = canvas.getBoundingClientRect();
  return viewport.toWorld(clientX - rect.left, clientY - rect.top);
}

/** Lets drops reach the map while a picker item is dragged over Obsidian's modal backdrop. */
export function setModalBackdropPassThrough(modalEl: HTMLElement, pass: boolean): void {
  const container = modalEl.closest('.modal-container');
  if (container instanceof HTMLElement) {
    container.style.pointerEvents = pass ? 'none' : '';
  }
  modalEl.style.pointerEvents = pass ? 'auto' : '';
  const backdrop = container?.querySelector('.modal-bg');
  if (backdrop instanceof HTMLElement) {
    backdrop.style.pointerEvents = pass ? 'none' : '';
  }
}

export function beginPickerTokenDrag(
  data: DataTransfer | null,
  payload: PickerTokenPayload,
  modalEl: HTMLElement | undefined,
): void {
  if (!data) return;
  data.effectAllowed = 'copy';
  writePickerTokenDrag(data, payload);
  if (modalEl) setModalBackdropPassThrough(modalEl, true);
}

export function endPickerTokenDrag(modalEl: HTMLElement | undefined): void {
  if (modalEl) setModalBackdropPassThrough(modalEl, false);
}

export function attachPickerMapDrop(host: PickerMapDropHost): () => void {
  const onDragOver = (event: DragEvent): void => {
    if (!isPickerTokenDrag(event.dataTransfer)) return;
    if (containsPoint(host.modalEl, event.clientX, event.clientY)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  };
  let lastDrop: DragEvent | null = null;
  const onDrop = (event: DragEvent): void => {
    if (lastDrop === event) return;
    lastDrop = event;
    const payload = readPickerTokenDrag(event.dataTransfer);
    if (!payload) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const point = worldPointFromPickerDrop(
      host.getCanvas(),
      host.getViewport(),
      host.modalEl,
      event.clientX,
      event.clientY,
    );
    if (!point) return;
    host.onPlace(point, payload);
  };
  const options = { capture: true };
  window.addEventListener('dragover', onDragOver, options);
  window.addEventListener('drop', onDrop, options);
  document.addEventListener('dragover', onDragOver, options);
  document.addEventListener('drop', onDrop, options);
  return (): void => {
    window.removeEventListener('dragover', onDragOver, options);
    window.removeEventListener('drop', onDrop, options);
    document.removeEventListener('dragover', onDragOver, options);
    document.removeEventListener('drop', onDrop, options);
  };
}
