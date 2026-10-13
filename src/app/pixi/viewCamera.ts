/** A view's camera: the world point at the centre of its screen and its zoom. */
export interface ViewCamera {
  centerX: number;
  centerY: number;
  scale: number;
}

/** Puts the viewport's camera at `camera`. */
export function showCamera(viewport: { setZoom(scale: number, center?: boolean): unknown; moveCenter(x: number, y: number): unknown }, camera: ViewCamera): void {
  // Keep the centre through the zoom: moveCenter then places the picture's centre at the scale just set.
  viewport.setZoom(camera.scale, true);
  viewport.moveCenter(camera.centerX, camera.centerY);
}
