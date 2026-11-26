// Views (milestone 12): different ways to lay a tree out.
//
// A view is only a different set of target positions (plus how hard the
// physics pulls toward them and how siblings are kept in order), so dragging,
// the camera, drop targets and the animation work the same in every view.
//
//   - Tidy: every level on its own row, siblings evenly spaced (render.ts).
//   - Organic: drawn the way the book draws trees: equal edges, a stem
//     carrying straight on, a fork's branches balanced by weight, and no
//     edges crossing (see below). No randomness: the same tree always looks
//     the same.
// (A third view, Spiderweb, was tried and dropped: after a few reduction
// steps most nodes have just two branches, so the web never looked like one.)
//
// Everything here is pure (no DOM), so it can be tested.

import type { Tree } from './engine'
import {
  CHIP_HEIGHT, COMPUTATION_RADIUS, NODE_RADIUS,
  chipWidth, layoutTree, type ChipsByPath, type LaidOutNode,
} from './render'

export type View = 'tidy' | 'organic'

export const VIEWS: readonly { id: View; label: string; hint: string }[] = [
  { id: 'tidy', label: 'Tidy', hint: 'Every level on its own row, branches straight down' },
  { id: 'organic', label: 'Organic', hint: 'As the book draws trees: equal edges, a stem carries straight on, and the heavier branch of a fork bends less' },
]

export const isView = (s: unknown): s is View => VIEWS.some((v) => v.id === s)

/** The view after `v` (for the V key). */
export const nextView = (v: View): View => VIEWS[(VIEWS.findIndex((x) => x.id === v) + 1) % VIEWS.length].id

/** How a node's children are kept in order. `null`: by x, left to right.
 *  Otherwise by angle around the node, measured from `seam` turning
 *  clockwise on screen (`spin` 1) or anticlockwise (-1). */
export type ChildOrder = { seam: number; spin: 1 | -1 }

const UP = -Math.PI / 2   // screen coordinates: y grows downward

export const CHILD_ORDER: Record<View, ChildOrder | null> = {
  tidy: null,
  // Anticlockwise from "up": below a node that's left to right, as in Tidy.
  organic: { seam: UP, spin: -1 },
}

/** How hard the physics pulls toward the targets, relative to Tidy. (The
 *  same in both: Organic's targets are free of crossings, so the drawing
 *  should come to rest close to them.) */
export const PULL_SCALE: Record<View, number> = { tidy: 1, organic: 1 }

export type ViewNode = LaidOutNode & {
  /** Where the redex badge goes: the middle of the widest free angle around
   *  the node (null: Tidy's fixed "up and to the right"). */
  badgeDir: number | null
  /** How wide that free angle is (radians). */
  freeArc: number
  /** Which half of the free angle the name tag takes (the badge takes the
   *  other): +1 the later half, -1 the earlier. Away from the parent link,
   *  where the parent's own badge and tag may be. */
  tagSide: 1 | -1
}

export type Bounds = { minX: number; maxX: number; minY: number; maxY: number }

export type ViewLayout = {
  nodes: ViewNode[]
  links: { source: ViewNode; target: ViewNode }[]
  /** Node centres only. */
  bounds: Bounds
  /** The whole footprint: chips, dots and a margin for badges and tags.
   *  Used to keep trees apart and to fit the camera. */
  box: Bounds
}

/** Room around the drawn nodes for badges and name tags. */
export const BADGE_MARGIN = 14

/** Lay a tree out in a view. The root is at (0, 0). */
export function layoutFor(view: View, t: Tree, chips?: ChipsByPath): ViewLayout {
  if (view === 'organic') {
    const key = chipsKey(chips)
    let perTree = bookCache.get(t)
    if (!perTree) bookCache.set(t, (perTree = new Map()))
    const cached = perTree.get(key)
    if (cached) return cached
    const made = makeLayout(view, t, chips)
    perTree.set(key, made)
    return made
  }
  return makeLayout(view, t, chips)
}

function makeLayout(view: View, t: Tree, chips?: ChipsByPath): ViewLayout {
  const base = layoutTree(t, chips)
  const nodes: ViewNode[] = base.nodes.map((n) => ({ ...n, badgeDir: null, freeArc: 2 * Math.PI, tagSide: -1 }))
  const byNode = new Map(base.nodes.map((n, i) => [n, nodes[i]]))
  const links = base.links.map((l) => ({ source: byNode.get(l.source)!, target: byNode.get(l.target)! }))
  if (view === 'organic') toBook(nodes, links)
  if (view !== 'tidy') placeBadges(nodes, links)

  const xs = nodes.map((n) => n.x)
  const ys = nodes.map((n) => n.y)
  const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  for (const n of nodes) {
    const { hx, hy } = halfSize(n)
    box.minX = Math.min(box.minX, n.x - hx - BADGE_MARGIN)
    box.maxX = Math.max(box.maxX, n.x + hx + BADGE_MARGIN)
    box.minY = Math.min(box.minY, n.y - hy - BADGE_MARGIN)
    box.maxY = Math.max(box.maxY, n.y + hy + BADGE_MARGIN)
  }
  return { nodes, links, bounds, box }
}

/** Half the drawn width and height of a node (a dot or a chip). */
export function halfSize(n: { kind: LaidOutNode['kind']; chip?: string }): { hx: number; hy: number } {
  if (n.chip) return { hx: chipWidth(n.chip) / 2, hy: CHIP_HEIGHT / 2 }
  const r = n.kind === 'computation' ? COMPUTATION_RADIUS : NODE_RADIUS
  return { hx: r, hy: r }
}

// --- Organic (as the book draws trees) ---------------------------------------
//
// The figures in *Reflective Programs in Tree Calculus* follow a few simple
// rules: every edge is the same length; a stem's one branch carries straight
// on in the direction it came from; and a fork's branches open about 60°
// apart, balanced like a mobile, so the heavier branch bends less and the
// lighter one more (a leaf beside a big subtree swings well out to the side,
// the big subtree carries almost straight on). In the book's big trees the
// side branches hug their stem and the stems meander, sideways or even
// upward, wherever there's room; edges are never stretched.
//
// So the layout is built bottom-up. Each subtree is laid out first, as a
// fixed shape (its own branches already clear of each other). A node then
// places its branches' shapes at the book's angles; only if two of them
// would clash (edges crossing, a node on an edge, nodes too close), or one
// would hit the node or the edge coming into it, does it open the angle
// between them, a little at a time, as far as needed. Only if even the
// widest fan doesn't fit are that node's own edges made longer. Every edge
// is checked against everything it could meet at some level, so the whole
// tree comes out with no crossings.

/** Every edge is this long (between two dots; chips add their extra width). */
export const BOOK_EDGE = 36
/** Angle between neighbouring branches of one node, narrower for many (all
 *  of them within BOOK_FAN), before any opening up. */
const BRANCH_GAP = Math.PI / 3
const BOOK_FAN = (150 * Math.PI) / 180
/** A crowded node's branches may open this far in all, round toward the
 *  back (the root, with no edge coming in, a little further). */
const MAX_FAN = (150 * Math.PI) / 180
const MAX_ROOT_FAN = (330 * Math.PI) / 180
/** How much a crowded fan opens per try, and how much the edges grow when
 *  even the widest fan doesn't fit. */
const OPEN_STEP = (5 * Math.PI) / 180
const LENGTHEN = 1.15
/** Room kept between two nodes, and between a node and an edge it isn't on. */
const NODE_CLEARANCE = 12
const EDGE_CLEARANCE = 6

/** How far behind a node its incoming edge is kept clear (longer than any edge). */
const BEHIND = 1e5

/** A laid-out subtree in its own frame: its root at (0, 0), and the edge
 *  coming into it from above (+y is "onward", the way that edge points).
 *  pts[i] belongs to nodes[i]; edges are index pairs. */
type Shape = { nodes: ViewNode[]; x: number[]; y: number[]; edges: [number, number][] }

function toBook(nodes: ViewNode[], links: ViewLayout['links']): void {
  const kids = new Map<ViewNode, ViewNode[]>(nodes.map((n) => [n, []]))
  for (const l of links) kids.get(l.source)!.push(l.target)
  // How heavy each subtree is (its node count). `nodes` lists parents first.
  const weight = new Map<ViewNode, number>()
  for (let i = nodes.length - 1; i >= 0; i--) {
    weight.set(nodes[i], 1 + kids.get(nodes[i])!.reduce((sum, c) => sum + weight.get(c)!, 0))
  }
  // Children before parents, so every child's shape is ready.
  const shapes = new Map<ViewNode, Shape>()
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i]
    shapes.set(n, shapeOf(n, kids.get(n)!.map((c) => shapes.get(c)!), kids.get(n)!.map((c) => weight.get(c)!), i === 0))
    for (const c of kids.get(n)!) shapes.delete(c)   // no longer needed
  }
  // The root's shape points down from (0, 0): that's the layout.
  const root = shapes.get(nodes[0])!
  root.nodes.forEach((n, i) => { n.x = root.x[i]; n.y = root.y[i] })
}

/** Lay out node n with its children's shapes, by the book's rules. Where
 *  two branches clash, the gaps between them open a little (only those
 *  gaps, so big branches get more room and small ones keep theirs); if the
 *  whole fan is as wide as it may go, the edges grow instead. */
function shapeOf(n: ViewNode, children: Shape[], weights: number[], isRoot: boolean): Shape {
  const k = children.length
  if (k === 0) return { nodes: [n], x: [0], y: [0], edges: [] }
  const total = weights.reduce((a, b) => a + b, 0)
  const maxFan = isRoot ? MAX_ROOT_FAN : MAX_FAN
  const gaps = Array.from({ length: k - 1 }, () => Math.min(BRANCH_GAP, BOOK_FAN / Math.max(k - 1, 1)))
  // How much longer than the book each branch's edge is (only the branches
  // that have to be pushed out grow, so small ones stay close).
  const stretch = children.map(() => 1)
  const lay = () => {
    // Where each branch points: first on the left (seen going onward), gaps
    // between them, turned so that their weights balance on "onward".
    const offsets = [0]
    for (const g of gaps) offsets.push(offsets[offsets.length - 1] + g)
    const first = Math.PI / 2 + weights.reduce((sum, w, i) => sum + w * offsets[i], 0) / total
    return children.map((c, i) => place(c, first - offsets[i], edgeLength(n, c.nodes[0]) * stretch[i]))
  }
  for (let tries = 0; tries < 400; tries++) {
    const placed = lay()
    const clash = clashAt(n, placed, isRoot, weights)
    if (!clash) return join(n, placed)
    const fan = gaps.reduce((a, b) => a + b, 0)
    if (clash.length === 2 && fan + OPEN_STEP <= maxFan) {
      // Open the gaps between the two clashing branches, shared out.
      const [i, j] = clash
      for (let m = i; m < j; m++) gaps[m] += OPEN_STEP / (j - i)
    } else {
      // Push a branch further out: the one that hit the node; or, of the
      // two, the one pushed out less so far (the heavier one first: further
      // out, it takes less angle). So small branches stay close unless they
      // too are in the way.
      const [p, q] = clash.length === 1 ? [clash[0], clash[0]] : clash
      const i = stretch[p] !== stretch[q] ? (stretch[p] < stretch[q] ? p : q) : (weights[p] >= weights[q] ? p : q)
      stretch[i] *= LENGTHEN
    }
  }
  return join(n, lay())   // gave up (a very crowded node): the last try
}

function edgeLength(a: ViewNode, b: ViewNode): number {
  return BOOK_EDGE + Math.max(0, halfSize(a).hx - NODE_RADIUS) + Math.max(0, halfSize(b).hx - NODE_RADIUS)
}

/** A child's shape turned to point at angle `dir` and moved out to `len`
 *  from the parent (at the origin). The parent's point is added as index
 *  -1's stand-in: the edge to it is [parentIndex, 0] with parentIndex = len. */
type Placed = Shape & { len: number }
function place(c: Shape, dir: number, len: number): Placed {
  const turn = dir - Math.PI / 2
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  const ox = len * Math.cos(dir)
  const oy = len * Math.sin(dir)
  const x = c.x.map((px, i) => ox + px * cos - c.y[i] * sin)
  const y = c.x.map((px, i) => oy + px * sin + c.y[i] * cos)
  return { nodes: c.nodes, x, y, edges: c.edges, len }
}

/** The node itself at the origin, its branches' shapes around it. */
function join(n: ViewNode, placed: Placed[]): Shape {
  const out: Shape = { nodes: [n], x: [0], y: [0], edges: [] }
  for (const p of placed) {
    const offset = out.nodes.length
    out.edges.push([0, offset])
    out.nodes.push(...p.nodes)
    out.x.push(...p.x)
    out.y.push(...p.y)
    for (const [a, b] of p.edges) out.edges.push([a + offset, b + offset])
  }
  return out
}

const radiusOf = (n: ViewNode) => halfSize(n).hx

/** Which branches (placed around node n at the origin) clash: two of them
 *  ([i, j], i < j; the heaviest such pair, so big branches get the room
 *  first and small ones are the ones pushed out), or one with n or with the
 *  edge coming into n from behind ([i]); null if none. */
function clashAt(n: ViewNode, placed: Placed[], isRoot: boolean, weights: readonly number[]): number[] | null {
  const origin = { x: 0, y: 0 }
  // The edge into n comes from straight "behind". Its parent may yet push n
  // further out, so the whole line behind n is kept clear, not just BOOK_EDGE.
  const above = isRoot ? origin : { x: 0, y: -BEHIND }
  for (let pi = 0; pi < placed.length; pi++) {
    const p = placed[pi]
    const hit = () => [pi]
    // the branch against n itself and the edge into n
    for (let i = 0; i < p.nodes.length; i++) {
      const pt = { x: p.x[i], y: p.y[i] }
      if (i > 0 && Math.hypot(pt.x, pt.y) < radiusOf(p.nodes[i]) + radiusOf(n) + NODE_CLEARANCE) return hit()
      if (!isRoot && pointToSegment(pt, origin, above) < radiusOf(p.nodes[i]) + EDGE_CLEARANCE) return hit()
    }
    for (const [a, b] of p.edges) {
      const pa = { x: p.x[a], y: p.y[a] }, pb = { x: p.x[b], y: p.y[b] }
      if (!isRoot && segmentsCross(pa, pb, origin, above)) return hit()
      if (pointToSegment(origin, pa, pb) < radiusOf(n) + EDGE_CLEARANCE) return hit()
    }
  }
  const pairs: [number, number][] = []
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) pairs.push([i, j])
  pairs.sort((a, b) => weights[b[0]] + weights[b[1]] - (weights[a[0]] + weights[a[1]]))
  for (const [i, j] of pairs) if (shapesClash(placed[i], placed[j])) return [i, j]
  return null
}

/** Do two branches of the same node clash? Each includes the edge from the
 *  node (at the origin) to its own root. */
function shapesClash(A: Placed, B: Placed): boolean {
  // Quick reject: far apart boxes can't clash.
  const box = (P: Placed) => ({ minX: Math.min(0, ...P.x), maxX: Math.max(0, ...P.x), minY: Math.min(0, ...P.y), maxY: Math.max(0, ...P.y) })
  const a = box(A), b = box(B)
  const pad = 2 * BOOK_EDGE
  if (a.maxX + pad < b.minX || b.maxX + pad < a.minX || a.maxY + pad < b.minY || b.maxY + pad < a.minY) return false

  // A grid of A's nodes and edges (its edge from the origin included).
  const CELL = BOOK_EDGE * 1.5
  const grid = new Map<string, { nodes: number[]; edges: [Pt, Pt][] }>()
  const cell = (i: number, j: number) => {
    const key = i + ',' + j
    let c = grid.get(key)
    if (!c) grid.set(key, (c = { nodes: [], edges: [] }))
    return c
  }
  const cellsOf = (x0: number, x1: number, y0: number, y1: number, f: (i: number, j: number) => void) => {
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++) f(i, j)
  }
  const edgesOf = (P: Placed): [Pt, Pt][] => [
    [{ x: 0, y: 0 }, { x: P.x[0], y: P.y[0] }],
    ...P.edges.map(([u, v]): [Pt, Pt] => [{ x: P.x[u], y: P.y[u] }, { x: P.x[v], y: P.y[v] }]),
  ]
  const R = NODE_CLEARANCE + 30   // more than any node's reach (chips included)
  A.nodes.forEach((_, i) => cellsOf(A.x[i] - R, A.x[i] + R, A.y[i] - R, A.y[i] + R, (u, v) => cell(u, v).nodes.push(i)))
  for (const e of edgesOf(A)) {
    cellsOf(Math.min(e[0].x, e[1].x) - R, Math.max(e[0].x, e[1].x) + R, Math.min(e[0].y, e[1].y) - R, Math.max(e[0].y, e[1].y) + R, (u, v) => cell(u, v).edges.push(e))
  }
  const at = (x: number, y: number) => grid.get(Math.floor(x / CELL) + ',' + Math.floor(y / CELL))
  const atOrigin = (p: Pt) => Math.abs(p.x) < 1e-9 && Math.abs(p.y) < 1e-9

  // B's nodes against A's nodes and edges.
  for (let i = 0; i < B.nodes.length; i++) {
    const c = at(B.x[i], B.y[i])
    if (!c) continue
    const p = { x: B.x[i], y: B.y[i] }
    const rb = radiusOf(B.nodes[i])
    for (const j of c.nodes) if (Math.hypot(p.x - A.x[j], p.y - A.y[j]) < rb + radiusOf(A.nodes[j]) + NODE_CLEARANCE) return true
    for (const [u, v] of c.edges) if (pointToSegment(p, u, v) < rb + EDGE_CLEARANCE) return true
  }
  // B's edges against A's nodes and edges.
  for (const [u, v] of edgesOf(B)) {
    const seen = new Set<object>()
    let hit = false
    cellsOf(Math.min(u.x, v.x), Math.max(u.x, v.x), Math.min(u.y, v.y), Math.max(u.y, v.y), (i, j) => {
      if (hit) return
      const c = grid.get(i + ',' + j)
      if (!c) return
      for (const k of c.nodes) {
        if (pointToSegment({ x: A.x[k], y: A.y[k] }, u, v) < radiusOf(A.nodes[k]) + EDGE_CLEARANCE) { hit = true; return }
      }
      for (const e of c.edges) {
        if (seen.has(e)) continue
        seen.add(e)
        // The two edges from the shared node only touch there: fine.
        if (atOrigin(u) && atOrigin(e[0])) continue
        if (segmentsCross(u, v, e[0], e[1])) { hit = true; return }
      }
    })
    if (hit) return true
  }
  return false
}

/** Pairs of nodes that clash: two nodes too close, a node too close to an
 *  edge it isn't on, or two edges that cross (an edge is named by the node
 *  at its lower end). Found with a grid, so big trees stay quick. */
export function findClashes(nodes: readonly ViewNode[], links: ViewLayout['links']): [ViewNode, ViewNode][] {
  const radius = (n: ViewNode) => halfSize(n).hx
  const CELL = BOOK_EDGE * 1.5
  const grid = new Map<string, { nodes: ViewNode[]; edges: ViewLayout['links'] }>()
  const cell = (i: number, j: number) => {
    const key = i + ',' + j
    let c = grid.get(key)
    if (!c) grid.set(key, (c = { nodes: [], edges: [] }))
    return c
  }
  const range = (lo: number, hi: number) => [Math.floor(lo / CELL), Math.floor(hi / CELL)]
  for (const n of nodes) {
    const r = radius(n) + NODE_CLEARANCE
    const [i0, i1] = range(n.x - r, n.x + r)
    const [j0, j1] = range(n.y - r, n.y + r)
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) cell(i, j).nodes.push(n)
  }
  for (const l of links) {
    const [i0, i1] = range(Math.min(l.source.x, l.target.x), Math.max(l.source.x, l.target.x))
    const [j0, j1] = range(Math.min(l.source.y, l.target.y), Math.max(l.source.y, l.target.y))
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) cell(i, j).edges.push(l)
  }

  const seen = new Set<string>()
  const ids = new Map(nodes.map((n, i) => [n, i]))
  const clashes: [ViewNode, ViewNode][] = []
  const add = (a: ViewNode, b: ViewNode) => {
    const [x, y] = [ids.get(a)!, ids.get(b)!].sort((p, q) => p - q)
    const key = x + ':' + y
    if (x === y || seen.has(key)) return
    seen.add(key)
    clashes.push([a, b])
  }
  for (const { nodes: ns, edges } of grid.values()) {
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const a = ns[i], b = ns[j]
        if (Math.hypot(a.x - b.x, a.y - b.y) < radius(a) + radius(b) + NODE_CLEARANCE) add(a, b)
      }
      for (const e of edges) {
        const n = ns[i]
        if (e.source === n || e.target === n) continue
        if (pointToSegment(n, e.source, e.target) < radius(n) + EDGE_CLEARANCE) add(n, e.target)
      }
    }
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const e = edges[i], f = edges[j]
        if (e.source === f.source || e.source === f.target || e.target === f.source || e.target === f.target) continue
        if (segmentsCross(e.source, e.target, f.source, f.target)) add(e.target, f.target)
      }
    }
  }
  return clashes
}

type Pt = { x: number; y: number }

function pointToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Do segments ab and cd cross (properly, not just touch at an end)? */
export function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const side = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const d1 = side(c, d, a), d2 = side(c, d, b), d3 = side(a, b, c), d4 = side(a, b, d)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/** Organic layouts take a little work (the checking), so each is kept per
 *  tree (trees never change) and per set of chips. */
const bookCache = new WeakMap<Tree, Map<string, ViewLayout>>()
const chipsKey = (chips?: ChipsByPath) => (chips ? JSON.stringify([...chips]) : '')

// --- Badges --------------------------------------------------------------------

/** For each node, the middle of the widest free angle between its links
 *  (to its parent and its children): that's where its badge goes. */
function placeBadges(nodes: ViewNode[], links: ViewLayout['links']): void {
  const dirs = new Map<ViewNode, number[]>(nodes.map((n) => [n, []]))
  const up = new Map<ViewNode, number>()   // direction to the parent
  for (const { source: s, target: c } of links) {
    dirs.get(s)!.push(Math.atan2(c.y - s.y, c.x - s.x))
    const toParent = Math.atan2(s.y - c.y, s.x - c.x)
    dirs.get(c)!.push(toParent)
    up.set(c, toParent)
  }
  for (const n of nodes) {
    const free = widestGap(dirs.get(n)!)
    if (free) {
      n.badgeDir = free.mid
      n.freeArc = free.width
      // If the gap starts at the parent link, the tag takes the later half.
      const p = up.get(n)
      if (p !== undefined && Math.abs(turnBetween(norm(p), norm(free.mid - free.width / 2))) < 1e-6) n.tagSide = 1
    } else {
      n.badgeDir = -Math.PI / 4   // a lone node: up and to the right, as in Tidy
    }
  }
  keepBadgesApart(nodes, links)
}

/** A badge needs this much room around its centre: from other nodes, from
 *  edges, and from other badges. */
const BADGE_ROOM = 13

/** Two nodes close together can both pick the space between them for their
 *  badges. So, node by node, the badge tries angles within the node's free
 *  space (the middle first, then further out on either side) and takes the
 *  first spot that's clear of other nodes, edges and the badges already
 *  placed (or else the roomiest). Nodes with room keep their spot. */
function keepBadgesApart(nodes: ViewNode[], links: ViewLayout['links']): void {
  const placed: Pt[] = []
  // Only what's near matters (anything further than FAR is room enough).
  const FAR = 60
  const near = (at: Pt, x: number, y: number, pad = 0) => Math.abs(at.x - x) < FAR + pad && Math.abs(at.y - y) < FAR + pad
  const room = (n: ViewNode, at: Pt) => {
    let r = FAR
    for (const m of nodes) if (m !== n && near(at, m.x, m.y, halfSize(m).hx)) r = Math.min(r, Math.hypot(at.x - m.x, at.y - m.y) - halfSize(m).hx)
    for (const l of links) {
      if (Math.min(l.source.x, l.target.x) > at.x + FAR || Math.max(l.source.x, l.target.x) < at.x - FAR) continue
      if (Math.min(l.source.y, l.target.y) > at.y + FAR || Math.max(l.source.y, l.target.y) < at.y - FAR) continue
      r = Math.min(r, pointToSegment(at, l.source, l.target))
    }
    for (const b of placed) if (near(at, b.x, b.y)) r = Math.min(r, Math.hypot(at.x - b.x, at.y - b.y) - BADGE_ROOM)
    return r
  }
  const STEP = Math.PI / 12
  for (const n of nodes) {
    const turn = n.tagSide * spread(n)
    const preferred = n.badgeDir! - turn          // where badgeOffset puts it
    let best = { dir: n.badgeDir!, room: -Infinity }
    for (let k = 0; k <= 12; k++) {
      // 0, +15°, -15°, +30°, … (within the free angle while it lasts, then anywhere)
      const at = preferred + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * STEP
      const dir = at + turn
      const o = badgeOffset({ ...n, badgeDir: dir })
      const r = room(n, { x: n.x + o.x, y: n.y + o.y })
      if (r > best.room) best = { dir, room: r }
      if (r >= BADGE_ROOM) break
    }
    n.badgeDir = best.dir
    const o = badgeOffset(n)
    placed.push({ x: n.x + o.x, y: n.y + o.y })
  }
}

/** The widest gap between some directions (radians): its middle and width. */
export function widestGap(angles: readonly number[]): { mid: number; width: number } | null {
  if (angles.length === 0) return null
  const a = angles.map(norm).sort((x, y) => x - y)
  let best = { mid: a[0] + Math.PI, width: 2 * Math.PI }   // one direction: straight opposite
  if (a.length > 1) {
    best = { mid: 0, width: -1 }
    for (let i = 0; i < a.length; i++) {
      const from = a[i]
      const to = i + 1 < a.length ? a[i + 1] : a[0] + 2 * Math.PI
      if (to - from > best.width) best = { mid: (from + to) / 2, width: to - from }
    }
  }
  return { mid: norm(best.mid), width: best.width }
}

const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)

/** Where a node's redex badge goes, relative to the node. */
type BadgeSpot = Pick<ViewNode, 'kind' | 'chip' | 'badgeDir' | 'freeArc' | 'tagSide'>
const BADGE_HALF = { w: 5.5, h: 6.5 }
const TAG_HALF_H = 6

export function badgeOffset(n: BadgeSpot): { x: number; y: number } {
  if (n.badgeDir === null) {
    // Tidy: up and to the right, outside a wide chip too.
    return { x: n.chip ? chipWidth(n.chip) / 2 + 6 : BADGE_OFFSET, y: -BADGE_OFFSET }
  }
  return outside(n, n.badgeDir - n.tagSide * spread(n), BADGE_HALF.w, BADGE_HALF.h)
}

/** Where an expanded variable's name tag (`width` wide) goes, relative to the
 *  node: beside the badge, never on top of it. */
export function tagOffset(n: BadgeSpot, width: number): { x: number; y: number } {
  if (n.badgeDir === null) return { x: -(BADGE_OFFSET + width / 2 - 6), y: -BADGE_OFFSET }   // Tidy: up and to the left
  const at = outside(n, n.badgeDir + n.tagSide * spread(n), width / 2, TAG_HALF_H)
  const b = badgeOffset(n)
  const gapX = width / 2 + BADGE_HALF.w + 2
  if (Math.abs(at.x - b.x) < gapX && Math.abs(at.y - b.y) < TAG_HALF_H + BADGE_HALF.h + 1) {
    // Slide it sideways, away from the badge.
    at.x = b.x + (at.x < b.x || (at.x === b.x && n.tagSide < 0) ? -gapX : gapX)
  }
  return at
}

const BADGE_OFFSET = 14

/** Where each expanded variable's name tag goes (relative to its node), in
 *  a layout: `tags` maps a node's path key ('0.1') to the tag's width;
 *  `badges` lists the nodes that show a badge. In Tidy each tag is up and
 *  to the left. In Organic each tag tries angles round its node (starting
 *  beside the badge, 15° at a time) and takes the first spot clear of other
 *  nodes, edges, badges and the tags already placed (or else the roomiest). */
export function placeTags(layout: ViewLayout, tags: ReadonlyMap<string, number>, badges: ReadonlySet<string>): Map<string, Pt> {
  const out = new Map<string, Pt>()
  const key = (n: ViewNode) => n.path.join('.')
  type Box = { x0: number; y0: number; x1: number; y1: number }
  const boxAt = (c: Pt, hw: number, hh: number): Box => ({ x0: c.x - hw, y0: c.y - hh, x1: c.x + hw, y1: c.y + hh })
  const taken: Box[] = []
  for (const n of layout.nodes) {
    if (!badges.has(key(n))) continue
    const o = badgeOffset(n)
    taken.push(boxAt({ x: n.x + o.x, y: n.y + o.y }, BADGE_HALF.w, BADGE_HALF.h))
  }
  // How much room a box has: the smallest gap to a node, an edge or a taken box (negative: overlapping).
  const room = (b: Box, own: ViewNode) => {
    let r = Infinity
    const near = (x: number, y: number) => x > b.x0 - 60 && x < b.x1 + 60 && y > b.y0 - 60 && y < b.y1 + 60
    for (const m of layout.nodes) if (m !== own && near(m.x, m.y)) r = Math.min(r, boxToPoint(b, m) - halfSize(m).hx)
    for (const l of layout.links) {
      if (Math.max(l.source.x, l.target.x) < b.x0 - 60 || Math.min(l.source.x, l.target.x) > b.x1 + 60) continue
      if (Math.max(l.source.y, l.target.y) < b.y0 - 60 || Math.min(l.source.y, l.target.y) > b.y1 + 60) continue
      r = Math.min(r, boxToSegment(b, l.source, l.target))
    }
    for (const t of taken) r = Math.min(r, boxToBox(b, t))
    return r
  }
  for (const n of layout.nodes) {
    const width = tags.get(key(n))
    if (width === undefined) continue
    let at = tagOffset(n, width)
    if (n.badgeDir !== null) {
      const start = Math.atan2(at.y, at.x)
      let best = { at, room: -Infinity }
      // Right beside the node first, then a little further out.
      search: for (const extra of [0, 8, 16]) {
        for (let k = 0; k <= 24; k++) {
          const dir = start + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 12)
          const o0 = outside(n, dir, width / 2, TAG_HALF_H)
          const o = { x: o0.x + extra * Math.cos(dir), y: o0.y + extra * Math.sin(dir) }
          const r = room(boxAt({ x: n.x + o.x, y: n.y + o.y }, width / 2, TAG_HALF_H), n)
          if (r > best.room) best = { at: o, room: r }
          if (r >= 2) break search
        }
      }
      at = best.at
    }
    out.set(key(n), at)
    taken.push(boxAt({ x: n.x + at.x, y: n.y + at.y }, width / 2, TAG_HALF_H))
  }
  return out
}

/** Gaps between a box and a point, a segment or another box (negative or 0: touching). */
function boxToPoint(b: { x0: number; y0: number; x1: number; y1: number }, p: Pt): number {
  const dx = Math.max(b.x0 - p.x, 0, p.x - b.x1)
  const dy = Math.max(b.y0 - p.y, 0, p.y - b.y1)
  return Math.hypot(dx, dy)
}
function boxToBox(a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }): number {
  const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1)
  const dy = Math.max(a.y0 - b.y1, b.y0 - a.y1)
  return dx > 0 || dy > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) : Math.max(dx, dy)
}
function boxToSegment(b: { x0: number; y0: number; x1: number; y1: number }, p: Pt, q: Pt): number {
  const corners = [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }]
  for (let i = 0; i < 4; i++) if (segmentsCross(p, q, corners[i], corners[(i + 1) % 4])) return -1
  if (boxToPoint(b, p) === 0) return -1   // an end inside the box
  return Math.min(boxToPoint(b, p), boxToPoint(b, q), ...corners.map((c) => pointToSegment(c, p, q)))
}

/** The badge and the tag share the free angle: the badge on one side of its
 *  middle, the tag on the other. */
const spread = (n: { freeArc: number }) => Math.min(n.freeArc / 4, (35 * Math.PI) / 180)

/** A point in direction `dir` from the node, just clear of it (a dot or a
 *  chip), for something `hw` by `hh` (half sizes) to sit at. */
function outside(n: { kind: LaidOutNode['kind']; chip?: string }, dir: number, hw: number, hh: number): { x: number; y: number } {
  const { hx, hy } = halfSize(n)
  const c = Math.cos(dir)
  const s = Math.sin(dir)
  // Grow a ray from the centre until the item's box clears the node's box (plus a little).
  const w = hx + hw + 3
  const h = hy + hh + 3
  const t = 1 / Math.max(Math.abs(c) / w, Math.abs(s) / h, 1e-9)
  return { x: c * t, y: s * t }
}

// --- Keeping siblings in order by angle ------------------------------------------

/** How far round from the seam a point is, seen from the pivot (0 to 2π). */
export function orderAngle(px: number, py: number, x: number, y: number, o: { seam: number; spin: 1 | -1 }): number {
  return norm(o.spin * (Math.atan2(y - py, x - px) - o.seam))
}

/** By angle, order is cyclic: going round, the siblings come in the same
 *  order wherever the seam is (so a branch dragged over the top, or a row
 *  measured from another view's seam, isn't "swapped"). Two neighbours are
 *  swapped only when the later one is just behind the earlier one, by less
 *  than this. */
export const SWAP_WINDOW = Math.PI / 2

/** How far round (radians) from one sibling to the next: positive when in
 *  order, negative (down to -SWAP_WINDOW) when the later one has slipped
 *  just behind the earlier one. */
export function turnBetween(from: number, to: number): number {
  const d = norm(to - from)
  return d > 2 * Math.PI - SWAP_WINDOW ? d - 2 * Math.PI : d
}

/** The unit vector at a point that turns it the "later" way around the pivot. */
export function laterward(px: number, py: number, x: number, y: number, spin: 1 | -1): { x: number; y: number } {
  const a = Math.atan2(y - py, x - px)
  return { x: -spin * Math.sin(a), y: spin * Math.cos(a) }
}
