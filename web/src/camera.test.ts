import { describe, it, expect } from 'vitest'
import {
  fitBounds, lerpCamera, panBy, reveal, screenToWorld, unionBounds, viewBox,
  worldToScreen, zoomAt, FIT_MAX_ZOOM, MAX_ZOOM, MIN_ZOOM, type Camera,
} from './camera'

const size = { width: 800, height: 600 }
const cam: Camera = { x: 10, y: 20, zoom: 2 }

describe('camera', () => {
  it('screen and world conversions are inverses', () => {
    const p = { x: 123, y: 456 }
    const back = worldToScreen(cam, size, screenToWorld(cam, size, p))
    expect(back.x).toBeCloseTo(p.x)
    expect(back.y).toBeCloseTo(p.y)
    expect(screenToWorld(cam, size, { x: 400, y: 300 })).toEqual({ x: 10, y: 20 })   // centre
  })

  it('panning moves the world with the pointer', () => {
    const w = { x: 50, y: 50 }
    const before = worldToScreen(cam, size, w)
    const after = worldToScreen(panBy(cam, 30, -10), size, w)
    expect(after.x - before.x).toBeCloseTo(30)
    expect(after.y - before.y).toBeCloseTo(-10)
  })

  it('zooming keeps the world point under the pointer fixed', () => {
    const p = { x: 650, y: 120 }
    const w = screenToWorld(cam, size, p)
    const zoomed = zoomAt(cam, size, p, 1.7)
    const w2 = screenToWorld(zoomed, size, p)
    expect(zoomed.zoom).toBeCloseTo(3.4)
    expect(w2.x).toBeCloseTo(w.x)
    expect(w2.y).toBeCloseTo(w.y)
  })

  it('zoom in then out returns to the same camera', () => {
    const p = { x: 200, y: 500 }
    const there = zoomAt(zoomAt(cam, size, p, 1.5), size, p, 1 / 1.5)
    expect(there.x).toBeCloseTo(cam.x)
    expect(there.y).toBeCloseTo(cam.y)
    expect(there.zoom).toBeCloseTo(cam.zoom)
  })

  it('zoom is clamped', () => {
    expect(zoomAt(cam, size, { x: 0, y: 0 }, 1000).zoom).toBe(MAX_ZOOM)
    expect(zoomAt(cam, size, { x: 0, y: 0 }, 0.0001).zoom).toBe(MIN_ZOOM)
  })

  it('fit shows the whole box, but never zooms in past the cap', () => {
    const b = { minX: -500, maxX: 500, minY: 0, maxY: 200 }
    const f = fitBounds(b, size, 50)
    const [vx, vy, vw, vh] = viewBox(f, size)
    expect(vx).toBeLessThanOrEqual(b.minX)
    expect(vx + vw).toBeGreaterThanOrEqual(b.maxX)
    expect(vy).toBeLessThanOrEqual(b.minY)
    expect(vy + vh).toBeGreaterThanOrEqual(b.maxY)
    expect(fitBounds({ minX: 0, maxX: 0, minY: 0, maxY: 0 }, size).zoom).toBe(FIT_MAX_ZOOM)
  })

  it('reveal does nothing when the box is already visible', () => {
    const c: Camera = { x: 0, y: 0, zoom: 1 }
    expect(reveal(c, size, { minX: -10, maxX: 10, minY: -10, maxY: 10 })).toBe(c)
  })

  it('reveal pans (same zoom) when the box fits but is off screen', () => {
    const c: Camera = { x: 0, y: 0, zoom: 1 }
    const r = reveal(c, size, { minX: 600, maxX: 700, minY: 0, maxY: 50 }, 40)
    expect(r.zoom).toBe(1)
    const [vx, , vw] = viewBox(r, size)
    expect(vx + vw).toBeGreaterThanOrEqual(700 + 40 - 1e-9)
  })

  it('reveal zooms out when the box is too big, never in', () => {
    const c: Camera = { x: 0, y: 0, zoom: 1 }
    const r = reveal(c, size, { minX: -2000, maxX: 2000, minY: 0, maxY: 100 })
    expect(r.zoom).toBeLessThan(1)
    const far: Camera = { x: 0, y: 0, zoom: 0.2 }
    expect(reveal(far, size, { minX: -50, maxX: 50, minY: 0, maxY: 50 }).zoom).toBe(0.2)
  })

  it('lerp goes from a to b', () => {
    const a: Camera = { x: 0, y: 0, zoom: 1 }
    const b: Camera = { x: 100, y: -50, zoom: 4 }
    expect(lerpCamera(a, b, 0)).toEqual(a)
    expect(lerpCamera(a, b, 1).zoom).toBeCloseTo(4)
    expect(lerpCamera(a, b, 0.5).zoom).toBeCloseTo(2)   // halfway in ratio
  })

  it('unionBounds', () => {
    expect(unionBounds([])).toBeNull()
    expect(unionBounds([{ minX: 0, maxX: 1, minY: 0, maxY: 1 }, { minX: -5, maxX: 0, minY: 2, maxY: 3 }]))
      .toEqual({ minX: -5, maxX: 1, minY: 0, maxY: 3 })
  })
})
