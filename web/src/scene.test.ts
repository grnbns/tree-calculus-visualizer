import { describe, it, expect } from 'vitest'
import { countOrderViolations, forceSiblingOrder, pathId, type SimNode } from './scene'

function node(id: string, x: number, children: SimNode[] = []): SimNode {
  return { id, path: [], kind: 'leaf', targetX: x, targetY: 0, children, x, y: 0, vx: 0, vy: 0 }
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
