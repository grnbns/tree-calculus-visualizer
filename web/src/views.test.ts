import { describe, it, expect } from 'vitest'
import rawCases from '../../tests/cases.json'
import type { Tree } from './engine'
import { BUILTIN_TEXT, parse } from './parser'
import { chipWidth, layoutTree } from './render'
import {
  BADGE_MARGIN, BOOK_EDGE, CHILD_ORDER, VIEWS, badgeOffset, findClashes, halfSize, isView, laterward, layoutFor, nextView,
  orderAngle, segmentsCross, tagOffset, turnBetween, widestGap, type View, type ViewLayout,
} from './views'

const cases = rawCases as unknown as { name: string; input: Tree; steps: { tree: Tree }[] }[]
/** Every tree in the reference cases (each step too), and every built-in. */
const TREES: Tree[] = [
  ...cases.flatMap((c) => [c.input, ...c.steps.map((s) => s.tree)]),
  ...Object.values(BUILTIN_TEXT).map((t) => parse(t)),
]
const ALL: View[] = ['tidy', 'organic']

const childrenOf = (l: ViewLayout) => {
  const m = new Map(l.nodes.map((n) => [n, [] as ViewLayout['nodes']]))
  for (const { source, target } of l.links) m.get(source)!.push(target)
  return m
}
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

describe('views', () => {
  it('lists the views, switches between them, and recognises their names', () => {
    expect(VIEWS.map((v) => v.id)).toEqual(ALL)
    expect(nextView('tidy')).toBe('organic')
    expect(nextView('organic')).toBe('tidy')
    expect(isView('organic')).toBe(true)
    expect(isView('radial')).toBe(false)   // Spiderweb was dropped: a saved choice of it falls back to Tidy
    expect(isView(null)).toBe(false)
  })

  it('Tidy is exactly the tidy layout, with the badges in their usual place', () => {
    for (const t of TREES.slice(0, 40)) {
      const a = layoutFor('tidy', t)
      const b = layoutTree(t)
      expect(a.nodes.map((n) => [n.x, n.y])).toEqual(b.nodes.map((n) => [n.x, n.y]))
      expect(a.nodes.every((n) => n.badgeDir === null)).toBe(true)
    }
  })

  it('is the same every time for the same tree (no randomness)', () => {
    const t = parse(BUILTIN_TEXT.isLeaf)
    for (const v of ALL) expect(layoutFor(v, t)).toEqual(layoutFor(v, t))
  })

  for (const v of ALL) {
    it(`${v}: keeps every node clear of the others, on every reference tree`, () => {
      for (const t of TREES) {
        const { nodes } = layoutFor(v, t)
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) expect(dist(nodes[i], nodes[j])).toBeGreaterThan(20)
        }
      }
    })

    it(`${v}: keeps branch order readable, on every reference tree`, () => {
      const o = CHILD_ORDER[v]
      for (const t of TREES) {
        const l = layoutFor(v, t)
        for (const [n, kids] of childrenOf(l)) {
          const p = n
          // By x, or by angle going round (cyclic, as the physics keeps it).
          const key = (c: { x: number; y: number }) => (o ? orderAngle(p.x, p.y, c.x, c.y, o) : c.x)
          for (let i = 1; i < kids.length; i++) {
            if (o) expect(turnBetween(key(kids[i - 1]), key(kids[i]))).toBeGreaterThan(0)
            else expect(key(kids[i])).toBeGreaterThan(key(kids[i - 1]))
          }
        }
      }
    })

    it(`${v}: the footprint covers every node, chip and badge`, () => {
      const t = parse('K(△ △)(D △)')
      const chips = new Map([['', { name: 'Swap1', arity: 1 }]])
      const l = layoutFor(v, t, chips)
      for (const n of l.nodes) {
        const { hx, hy } = halfSize(n)
        expect(n.x - hx - BADGE_MARGIN).toBeGreaterThanOrEqual(l.box.minX - 1e-9)
        expect(n.x + hx + BADGE_MARGIN).toBeLessThanOrEqual(l.box.maxX + 1e-9)
        expect(n.y - hy - BADGE_MARGIN).toBeGreaterThanOrEqual(l.box.minY - 1e-9)
        expect(n.y + hy + BADGE_MARGIN).toBeLessThanOrEqual(l.box.maxY + 1e-9)
        const b = badgeOffset(n)
        expect(Math.abs(b.x) - 5.5 >= hx || Math.abs(b.y) - 6.5 >= hy).toBe(true)   // clear of its node
      }
    })
  }

  it('switching from Tidy never reverses a row (no branch has to pass another)', () => {
    const o = CHILD_ORDER.organic!
    const tidy = layoutTree(parse('△ △ △ △'))
    // Tidy's positions, measured the way Organic orders them, are already in order.
    const [, a, b, c] = tidy.nodes.map((n) => orderAngle(0, 0, n.x, n.y, o))
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
  })

  // The book's drawing rules (see the figures of and, or, implies, not, iff in §3.5).
  const angleOf = (a: { x: number; y: number }, b: { x: number; y: number }) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
  const at = (l: ViewLayout, path: string) => l.nodes.find((n) => n.path.join('.') === path)!

  /** Brute force, independent of the layout's own grid search. */
  const crossings = (l: ViewLayout) => {
    let count = 0
    for (let i = 0; i < l.links.length; i++) {
      for (let j = i + 1; j < l.links.length; j++) {
        const e = l.links[i], f = l.links[j]
        const ends = [e.source, e.target]
        if (ends.includes(f.source) || ends.includes(f.target)) continue
        if (segmentsCross(e.source, e.target, f.source, f.target)) count++
      }
    }
    return count
  }

  it('Organic: no edges cross, and no node sits on an edge, on every reference tree (and every step of every reduction)', () => {
    for (const t of TREES) {
      const l = layoutFor('organic', t)
      expect(crossings(l)).toBe(0)
      expect(findClashes(l.nodes, l.links)).toEqual([])
    }
  })

  it('segmentsCross: crossing, touching and apart', () => {
    const p = (x: number, y: number) => ({ x, y })
    expect(segmentsCross(p(0, 0), p(2, 2), p(0, 2), p(2, 0))).toBe(true)
    expect(segmentsCross(p(0, 0), p(2, 2), p(2, 2), p(3, 0))).toBe(false)   // only touch at an end
    expect(segmentsCross(p(0, 0), p(1, 0), p(0, 1), p(1, 1))).toBe(false)
  })

  it('Organic: the root is at the top, and edges keep the book length unless they had to grow', () => {
    let exact = 0, all = 0
    for (const t of TREES) {
      const l = layoutFor('organic', t)
      for (const n of l.nodes) expect(n.y).toBeGreaterThanOrEqual(-1e-9)
      for (const { source, target } of l.links) {
        if (source.chip || target.chip) continue
        all++
        const d = dist(source, target)
        expect(d).toBeGreaterThan(BOOK_EDGE - 1e-6)
        if (Math.abs(d - BOOK_EDGE) < 1e-6) exact++
      }
    }
    expect(exact / all).toBeGreaterThan(0.5)
    // The book's own trees need no help: every edge is the book length.
    for (const name of ['and', 'or', 'implies', 'not', 'iff']) {
      const l = layoutFor('organic', parse(BUILTIN_TEXT[name]))
      for (const { source, target } of l.links) expect(dist(source, target)).toBeCloseTo(BOOK_EDGE, 6)
    }
  })

  it('Organic: a stem carries straight on, as in the book’s implies', () => {
    const l = layoutFor('organic', parse(BUILTIN_TEXT.implies))   // △(△(K K)): two stems, then a fork
    expect(angleOf(at(l, ''), at(l, '0'))).toBeCloseTo(90, 0)          // straight down
    expect(angleOf(at(l, '0'), at(l, '0.0'))).toBeCloseTo(90, 0)
    // the fork's second branch is a stem: its leaf carries on the same way
    expect(Math.abs(angleOf(at(l, '0.0'), at(l, '0.0.1')) - angleOf(at(l, '0.0.1'), at(l, '0.0.1.0')))).toBeLessThan(12)
  })

  it('Organic: a fork balances its branches: equal ones ±30°, a leaf swings out beside a big subtree', () => {
    const i = layoutFor('organic', parse(BUILTIN_TEXT.I))   // I = △(△△)(△△): two equal branches
    expect(angleOf(at(i, ''), at(i, '0'))).toBeCloseTo(120, -1)
    expect(angleOf(at(i, ''), at(i, '1'))).toBeCloseTo(60, -1)
    const and = layoutFor('organic', parse(BUILTIN_TEXT.and))   // its fork: a leaf, then K I
    const fork = at(and, '0.0')
    const leafTurn = angleOf(fork, at(and, '0.0.0')) - 90
    const bigTurn = 90 - angleOf(fork, at(and, '0.0.1'))
    expect(leafTurn).toBeGreaterThan(35)    // the book: about 50°
    expect(bigTurn).toBeLessThan(15)        // the book: about 7°
    expect(bigTurn).toBeGreaterThan(-5)
  })

  it('Organic: layouts are kept, so the work is done once per tree', () => {
    const t = parse(BUILTIN_TEXT.iff)
    expect(layoutFor('organic', t)).toBe(layoutFor('organic', t))
    expect(layoutFor('organic', t, new Map([['0', { name: 'x', arity: 2 }]]))).not.toBe(layoutFor('organic', t))
  })
})

describe('badges and tags', () => {
  it('Tidy: badge up and to the right (outside a chip), tag up and to the left', () => {
    const dot = { kind: 'fork', badgeDir: null, freeArc: 0, tagSide: -1 } as const
    expect(badgeOffset(dot)).toEqual({ x: 14, y: -14 })
    expect(badgeOffset({ ...dot, chip: 'Swap1' })).toEqual({ x: chipWidth('Swap1') / 2 + 6, y: -14 })
    expect(tagOffset(dot, 20)).toEqual({ x: -18, y: -14 })
  })

  it('Organic: the badge goes into the widest free angle, the tag beside it', () => {
    // A leaf whose parent is straight above it: free space is straight down.
    const l = layoutFor('organic', parse('△(△ △)'))
    const leaf = l.nodes[2]
    expect(leaf.badgeDir).toBeCloseTo(Math.PI / 2, 6)
    const b = badgeOffset(leaf)
    const tag = tagOffset(leaf, 30)
    expect(b.y).toBeGreaterThan(0)
    expect(tag.y).toBeGreaterThan(0)
    expect(Math.sign(b.x)).toBe(-Math.sign(tag.x))   // one either side of "down"
  })

  it('a tag never covers its own badge, and keeps away from the parent link', () => {
    for (const t of TREES.slice(-20)) {
      const l = layoutFor('organic', t)
      for (const n of l.nodes) {
        const b = badgeOffset(n)
        const tag = tagOffset(n, 40)
        const apart = Math.abs(tag.x - b.x) >= 20 + 5.5 || Math.abs(tag.y - b.y) >= 6 + 6.5
        expect(apart).toBe(true)
      }
    }
    // A node whose free angle starts at its parent link: the tag takes the far half.
    const l = layoutFor('organic', parse('△ (△ △ △) △'))
    const n = l.nodes.find((x) => x.path.join() === '0')!
    const parent = l.nodes[0]
    const tag = tagOffset(n, 30)
    const b = badgeOffset(n)
    expect(Math.hypot(n.x + tag.x - parent.x, n.y + tag.y - parent.y)).toBeGreaterThan(Math.hypot(n.x + b.x - parent.x, n.y + b.y - parent.y))
  })

  it('widestGap finds the middle of the biggest gap between directions', () => {
    expect(widestGap([])).toBeNull()
    expect(widestGap([0])!.mid).toBeCloseTo(Math.PI)
    const g = widestGap([0, Math.PI / 2])!   // right and down: the free side is up-left
    expect(g.width).toBeCloseTo(1.5 * Math.PI)
    expect(g.mid).toBeCloseTo(1.25 * Math.PI)
  })
})

describe('order by angle', () => {
  const o = { seam: -Math.PI / 2, spin: 1 as const }
  it('measures clockwise from the seam', () => {
    expect(orderAngle(0, 0, 1, 0, o)).toBeCloseTo(Math.PI / 2)        // right: a quarter turn
    expect(orderAngle(0, 0, 0, 1, o)).toBeCloseTo(Math.PI)            // down: half a turn
    expect(orderAngle(0, 0, -1, 0, o)).toBeCloseTo(1.5 * Math.PI)     // left
    expect(orderAngle(0, 0, 0, 1, { ...o, spin: -1 })).toBeCloseTo(Math.PI)
    expect(orderAngle(0, 0, -1, 0, { ...o, spin: -1 })).toBeCloseTo(Math.PI / 2)   // anticlockwise: left comes first
  })
  it('is cyclic: only a sibling just behind the one before it counts as swapped', () => {
    expect(turnBetween(0.5, 1)).toBeCloseTo(0.5)
    expect(turnBetween(1, 0.5)).toBeCloseTo(-0.5)                       // just behind: swapped
    expect(turnBetween(6, 0.2)).toBeCloseTo(0.2 + 2 * Math.PI - 6)     // over the seam, still in order
    expect(turnBetween(0, Math.PI)).toBeCloseTo(Math.PI)               // opposite: in order, far apart
    expect(turnBetween(Math.PI, 0)).toBeCloseTo(Math.PI)
  })
  it('laterward points the way the angle grows', () => {
    expect(laterward(0, 0, 1, 0, 1).y).toBeCloseTo(1)      // at 3 o'clock, clockwise is down
    expect(laterward(0, 0, 0, 1, -1).x).toBeCloseTo(1)     // below, anticlockwise is to the right
  })
})
