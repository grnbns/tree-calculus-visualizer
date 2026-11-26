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
// rules: every edge is the same length; the root is at the top; a stem's one
// branch carries straight on in the direction it came from; and a fork's
// branches open about 60° apart, balanced like a mobile, so the heavier
// branch bends less and the lighter one more (a leaf beside a big subtree
// swings well out to the side, the big subtree carries almost straight on).
//
// Bigger trees (reductions grow them) can then cross themselves. So the
// layout is checked: wherever two edges cross, or a node sits on an edge or
// too close to another node, the fork where those two branches part is
// opened wider (or, once it's as wide as it goes, its branches are made
// longer), and the tree is laid out again, until nothing crosses. Trees
// that don't crowd come out exactly as the book draws them.

/** Every edge is this long (between two dots; chips add their extra width). */
export const BOOK_EDGE = 36
/** Angle between neighbouring branches of one node (narrower for many). */
const BRANCH_GAP = Math.PI / 3
const MAX_FAN = (150 * Math.PI) / 180
/** Branches point at least this far below the horizontal (they never grow upward). */
const LOWEST = (15 * Math.PI) / 180
/** Room kept between two nodes, and between a node and an edge it isn't on. */
const NODE_CLEARANCE = 12
const EDGE_CLEARANCE = 6
/** How much a crowded fork opens, or its branches grow, per round. */
const WIDEN = 1.2
const LENGTHEN = 1.15
const MAX_ROUNDS = 80

type Book = {
  kids: Map<ViewNode, ViewNode[]>
  parent: Map<ViewNode, ViewNode>
  weight: Map<ViewNode, number>
  /** per node: how much wider than the book its branches open (1 = as the book) */
  widen: Map<ViewNode, number>
  /** per node: how much longer than the book its branches are */
  lengthen: Map<ViewNode, number>
}

function toBook(nodes: ViewNode[], links: ViewLayout['links']): void {
  const kids = new Map<ViewNode, ViewNode[]>(nodes.map((n) => [n, []]))
  const parent = new Map<ViewNode, ViewNode>()
  for (const l of links) {
    kids.get(l.source)!.push(l.target)
    parent.set(l.target, l.source)
  }
  // How heavy each subtree is (its node count). `nodes` lists parents first.
  const weight = new Map<ViewNode, number>()
  for (let i = nodes.length - 1; i >= 0; i--) {
    weight.set(nodes[i], 1 + kids.get(nodes[i])!.reduce((sum, c) => sum + weight.get(c)!, 0))
  }
  const book: Book = { kids, parent, weight, widen: new Map(), lengthen: new Map() }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    placeBook(nodes[0], book)
    const clashes = findClashes(nodes, links)
    if (clashes.length === 0) return
    // Fix each fork at most once per round: its whole subtree moves anyway.
    const fixed = new Set<ViewNode>()
    for (const [a, b] of clashes) {
      const { fork, aSide, bSide } = whereTheyPart(a, b, book)
      if (fixed.has(fork)) continue
      fixed.add(fork)
      const k = kids.get(fork)!.length
      if (aSide && bSide && k > 1 && gapOf(fork, book) * (k - 1) < MAX_FAN - 1e-9) {
        book.widen.set(fork, (book.widen.get(fork) ?? 1) * WIDEN)
      } else {
        book.lengthen.set(fork, (book.lengthen.get(fork) ?? 1) * LENGTHEN)
      }
    }
  }
  placeBook(nodes[0], book)   // gave up: keep the last try (very crowded trees only)
}

/** The angle between neighbouring branches of a node. */
function gapOf(n: ViewNode, book: Book): number {
  const k = book.kids.get(n)!.length
  if (k < 2) return 0
  return Math.min(BRANCH_GAP * (book.widen.get(n) ?? 1), MAX_FAN / (k - 1))
}

/** Lay the tree out by the book's rules, from the root down. (A loop, not
 *  recursion: chains can be long.) */
function placeBook(root: ViewNode, book: Book): void {
  const edge = (a: ViewNode, b: ViewNode) =>
    (BOOK_EDGE + Math.max(0, halfSize(a).hx - NODE_RADIUS) + Math.max(0, halfSize(b).hx - NODE_RADIUS))
    * (book.lengthen.get(a) ?? 1)
  root.x = 0
  root.y = 0
  const todo: [ViewNode, number][] = [[root, Math.PI / 2]]
  while (todo.length) {
    const [n, dir] = todo.pop()!
    const c = book.kids.get(n)!
    if (c.length === 0) continue
    // Branches `gap` apart, first branch on the left (as seen going along
    // `dir`), turned so that their weights balance on `dir`.
    const gap = gapOf(n, book)
    const total = c.reduce((sum, k) => sum + book.weight.get(k)!, 0)
    let first = dir + (gap * c.reduce((sum, k, i) => sum + book.weight.get(k)! * i, 0)) / total
    // Never grow upward: turn the whole fan back below the horizontal.
    const last = first - gap * (c.length - 1)
    if (first > Math.PI - LOWEST) first = Math.PI - LOWEST
    else if (last < LOWEST) first += LOWEST - last
    c.forEach((k, i) => {
      const a = first - gap * i
      const len = edge(n, k)
      k.x = n.x + len * Math.cos(a)
      k.y = n.y + len * Math.sin(a)
      todo.push([k, a])
    })
  }
}

/** Where two clashing nodes' branches part: the fork (their lowest common
 *  ancestor) and, for each, the branch of the fork it's in (null if it is
 *  the fork itself). */
function whereTheyPart(a: ViewNode, b: ViewNode, book: Book): { fork: ViewNode; aSide: ViewNode | null; bSide: ViewNode | null } {
  const chain = (n: ViewNode) => {
    const up: ViewNode[] = [n]
    for (let p = book.parent.get(n); p; p = book.parent.get(p)) up.push(p)
    return up.reverse()   // root first
  }
  const ca = chain(a)
  const cb = chain(b)
  let i = 0
  while (i + 1 < ca.length && i + 1 < cb.length && ca[i + 1] === cb[i + 1]) i++
  return { fork: ca[i], aSide: ca[i + 1] ?? null, bSide: cb[i + 1] ?? null }
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
