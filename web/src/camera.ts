// The camera (milestone 8): which part of the world is on screen.
//
// Pure functions. The world is where the simulation lives (SVG units); the
// screen is pixels in the canvas. The camera says which world point is at the
// centre of the screen and how many screen pixels one world unit takes.
// The scene turns it into the SVG viewBox, so pointer maths (getScreenCTM),
// dragging and drop targets keep working in world coordinates.

export type Camera = { x: number; y: number; zoom: number }
export type Size = { width: number; height: number }
export type Point = { x: number; y: number }
export type Bounds = { minX: number; maxX: number; minY: number; maxY: number }

export const MIN_ZOOM = 0.15
export const MAX_ZOOM = 4
/** "Fit" never zooms in further than this, so a single leaf isn't drawn huge. */
export const FIT_MAX_ZOOM = 1.6
/** Space kept around trees when fitting or revealing them (screen pixels). */
export const FIT_PADDING = 60

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export function screenToWorld(cam: Camera, size: Size, p: Point): Point {
  return { x: cam.x + (p.x - size.width / 2) / cam.zoom, y: cam.y + (p.y - size.height / 2) / cam.zoom }
}

export function worldToScreen(cam: Camera, size: Size, p: Point): Point {
  return { x: (p.x - cam.x) * cam.zoom + size.width / 2, y: (p.y - cam.y) * cam.zoom + size.height / 2 }
}

/** Move the view by a drag of (dx, dy) screen pixels: the world follows the pointer. */
export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { ...cam, x: cam.x - dx / cam.zoom, y: cam.y - dy / cam.zoom }
}

/** Zoom by `factor` around a screen point, which stays over the same world point. */
export function zoomAt(cam: Camera, size: Size, p: Point, factor: number): Camera {
  const zoom = clampZoom(cam.zoom * factor)
  const w = screenToWorld(cam, size, p)
  return { zoom, x: w.x - (p.x - size.width / 2) / zoom, y: w.y - (p.y - size.height / 2) / zoom }
}

/** A camera that shows all of `b`. */
export function fitBounds(b: Bounds, size: Size, padding = FIT_PADDING): Camera {
  const w = Math.max(b.maxX - b.minX, 1)
  const h = Math.max(b.maxY - b.minY, 1)
  const zoom = clampZoom(Math.min(
    (size.width - 2 * padding) / w,
    (size.height - 2 * padding) / h,
    FIT_MAX_ZOOM,
  ))
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, zoom }
}

/** The smallest change that brings all of `b` into view: nothing if it's
 *  already visible, a pan if it fits at this zoom, otherwise zoom out to fit. */
export function reveal(cam: Camera, size: Size, b: Bounds, padding = FIT_PADDING): Camera {
  const halfW = (size.width / 2 - padding) / cam.zoom
  const halfH = (size.height / 2 - padding) / cam.zoom
  if (b.maxX - b.minX > 2 * halfW || b.maxY - b.minY > 2 * halfH) {
    const fit = fitBounds(b, size, padding)
    return fit.zoom < cam.zoom ? fit : { ...fit, zoom: cam.zoom }
  }
  let { x, y } = cam
  if (b.minX < x - halfW) x = b.minX + halfW
  else if (b.maxX > x + halfW) x = b.maxX - halfW
  if (b.minY < y - halfH) y = b.minY + halfH
  else if (b.maxY > y + halfH) y = b.maxY - halfH
  return x === cam.x && y === cam.y ? cam : { ...cam, x, y }
}

/** In-between camera, t from 0 to 1. Zoom changes evenly in ratio, so zooming
 *  in and out feel the same speed. */
export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    zoom: a.zoom * Math.pow(b.zoom / a.zoom, t),
  }
}

/** The SVG viewBox for this camera: [x, y, width, height] in world units. */
export function viewBox(cam: Camera, size: Size): [number, number, number, number] {
  const w = size.width / cam.zoom
  const h = size.height / cam.zoom
  return [cam.x - w / 2, cam.y - h / 2, w, h]
}

export function unionBounds(list: readonly Bounds[]): Bounds | null {
  if (list.length === 0) return null
  return {
    minX: Math.min(...list.map((b) => b.minX)),
    maxX: Math.max(...list.map((b) => b.maxX)),
    minY: Math.min(...list.map((b) => b.minY)),
    maxY: Math.max(...list.map((b) => b.maxY)),
  }
}
