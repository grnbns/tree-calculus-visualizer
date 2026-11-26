import { describe, it, expect } from 'vitest'
import { countOrderViolations, forceSiblingOrder, pathId, type SimNode } from './scene'

function node(id: string, x: number, children: SimNode[] = []): SimNode {
  return { id, treeKey: 't', path: [], kind: 'leaf', targetX: x, targetY: 0, children, x, y: 0, vx: 0, vy: 0 }
}

describe('pathId', () => {
  it('gives each path a distinct id', () => {
    expect(pathId([])).toBe('n')
    expect(pathId([0])).toBe('n.0')
    expect(pathId([1, 0])).toBe('n.1.0')
    expect(pathId([10])).not.toBe(pathId([1, 0]))
  })
})

describe('countOrderViolations', () => {
  it('is 0 when children are left to right', () => {
    const a = node('a', -10), b = node('b', 10)
    expect(countOrderViolations([node('p', 0, [a, b]), a, b])).toBe(0)
  })
  it('counts swapped siblings', () => {
    const a = node('a', 10), b = node('b', -10)
    expect(countOrderViolations([node('p', 0, [a, b]), a, b])).toBe(1)
  })
})

describe('forceSiblingOrder', () => {
  it('pushes swapped siblings back into order', () => {
    const a = node('a', 5), b = node('b', -5)   // first branch is on the RIGHT
    const parent = node('p', 0, [a, b])
    const nodes = [parent, a, b]
    const force = forceSiblingOrder(16).strength(1)
    force.initialize(nodes)
    // a few simulation ticks: apply force, then move by velocity
    for (let t = 0; t < 5; t++) {
      force()
      for (const n of nodes) { n.x! += n.vx!; n.vx = 0 }
    }
    expect(a.x!).toBeLessThan(b.x!)
    expect(b.x! - a.x!).toBeGreaterThanOrEqual(15.9)
  })

  it('leaves well-spaced siblings alone', () => {
    const a = node('a', -20), b = node('b', 20)
    const force = forceSiblingOrder(16)
    force.initialize([node('p', 0, [a, b]), a, b])
    force()
    expect(a.vx).toBe(0)
    expect(b.vx).toBe(0)
  })

  it('never lets a dragged node cross its siblings, even in one big jump', () => {
    const a = node('a', -40), b = node('b', 0), c = node('c', 40)
    const force = forceSiblingOrder(16).strength(0)   // soft push off: hard rule only
    force.initialize([node('p', 0, [a, b, c]), a, b, c])
    c.fx = -100                                       // drag the last child far left
    force()
    const after = (n: SimNode) => n.fx ?? n.x! + n.vx!
    expect(after(a)).toBeLessThan(after(b))
    expect(after(b)).toBeLessThan(after(c))
  })

  it('moves only the free sibling when the other is being dragged', () => {
    const a = node('a', 0), b = node('b', 0)
    a.fx = 0
    const force = forceSiblingOrder(16).strength(1)
    force.initialize([node('p', 0, [a, b]), a, b])
    force()
    expect(a.vx).toBe(0)
    expect(b.vx).toBe(16)
  })
})

describe('forceSiblingOrder by angle (Spiderweb, Organic)', () => {
  // Children of p ordered clockwise from 12 o'clock around p itself.
  const around = (p: SimNode) => { p.order = { pivot: p, seam: -Math.PI / 2, spin: 1 } }
  const at = (id: string, x: number, y: number): SimNode => ({ ...node(id, x), y, targetY: y })

  it('counts siblings that are round the wrong way', () => {
    const a = at('a', 30, 0), b = at('b', 20, 20)   // a at 3 o'clock, b at half past 4: in order
    const p = node('p', 0, [a, b]); around(p)
    expect(countOrderViolations([p, a, b])).toBe(0)
    p.children = [b, a]
    expect(countOrderViolations([p, b, a])).toBe(1)
  })

  it('pushes swapped siblings back round into order', () => {
    const a = at('a', 0, 30), b = at('b', 30, 0)   // first branch at 6 o'clock, second at 3: swapped
    const p = node('p', 0, [a, b]); around(p)
    const nodes = [p, a, b]
    const force = forceSiblingOrder(16).strength(1)
    force.initialize(nodes)
    for (let t = 0; t < 40; t++) {
      force()
      for (const n of nodes) { n.x! += n.vx!; n.y! += n.vy!; n.vx = n.vy = 0 }
    }
    expect(countOrderViolations(nodes)).toBe(0)
  })

  it('is cyclic: a first branch dragged back over the top is not swapped with the others', () => {
    const a = at('a', 25, -25), b = at('b', 30, 0), c = at('c', 0, 30)   // a dragged clockwise past 12 o'clock
    const p = node('p', 0, [a, b, c]); around(p)
    expect(countOrderViolations([p, a, b, c])).toBe(0)
  })

  it('never lets a dragged node cross its siblings', () => {
    const a = at('a', 30, 0), b = at('b', 0, 30), c = at('c', -30, 0)   // 3, 6 and 9 o'clock
    const p = node('p', 0, [a, b, c]); around(p)
    const force = forceSiblingOrder(16).strength(0)
    force.initialize([p, a, b, c])
    a.fx = -10; a.fy = 28          // drag the first branch past the second
    force()
    const next = (n: SimNode) => ({ ...n, x: n.fx ?? n.x! + n.vx!, y: n.fy ?? n.y! + n.vy! })
    const [na, nb, nc] = [next(a), next(b), next(c)]
    expect(countOrderViolations([{ ...p, children: [na, nb, nc] }])).toBe(0)
  })
})
