// The live, physical drawing of the workspace's trees (milestones 4–8).
//
// Every node is a body in a d3-force simulation:
//   - links are springs whose rest length matches the tidy layout
//   - nodes repel a little and can't overlap
//   - each node is pulled toward its tidy-layout target (from render.ts),
//     which is what keeps the tree readable
//   - a sibling-order force stops branches from ever swapping sides
//
// The Scene lives as long as the page. setWorkspace() swaps in the current
// trees together with their ids (see ids.ts). Nodes are matched by id, so a
// node that survives a step or an edit keeps its position and travels to its
// new place (even into another tree); new nodes sprout from the node they were
// copied from (or their parent); nodes that vanish fade out. The simulation
// cools down and stops once everything settles.
//
// The camera (camera.ts) is the SVG viewBox. It never moves by itself except
// to fit everything on first show, to bring trees into view when asked
// (`reveal`), or on "fit all"; and then it glides. You pan by dragging empty
// canvas or scrolling, and zoom with ctrl/⌘ + scroll, a trackpad pinch or
// two fingers.
//
// The scene doesn't change any trees itself. It reports clicks, drag starts
// and drops (with the node or tree they're over) to main.ts, which decides
// what they mean and calls setWorkspace() with the result.

import {
  forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY,
  type ForceLink, type ForceManyBody, type ForceX, type ForceY,
  type Simulation, type SimulationLinkDatum, type SimulationNodeDatum,
} from 'd3-force'
import type { Path, Redex, Tree } from './engine'
import type { IdTree } from './ids'
import type { Parts } from './parts'
import {
  fitBounds, lerpCamera, panBy, reveal, unionBounds, viewBox, zoomAt,
  type Bounds, type Camera, type Point, type Size,
} from './camera'
import {
  CHIP_HEIGHT, COMPUTATION_RADIUS, NODE_RADIUS,
  chipLabel, chipWidth, layoutTree, samePath, type ChipsByPath, type NodeKind,
} from './render'

// --- Tuning ----------------------------------------------------------------

export type PhysicsParams = {
  linkStrength: number   // how stiff the branch springs are (0–1)
  pullX: number          // pull toward the tidy x position (0–1)
  pullY: number          // pull toward the tidy depth (0–1)
  repulsion: number      // how hard nearby nodes push apart
  orderStrength: number  // how hard swapped siblings are pushed back (0–1)
  damping: number        // velocity lost per tick (0–1); higher = less bouncy
  speed: number          // animation speed: physics ticks per frame (1 = d3's normal pace)
}

export const DEFAULT_PARAMS: PhysicsParams = {
  linkStrength: 0.7,
  pullX: 0.3,
  pullY: 0.5,
  repulsion: 30,
  orderStrength: 0.6,
  damping: 0.7,
  speed: 0.5,
}

// Nodes closer than this are pushed apart; also the minimum sibling gap.
const COLLIDE_RADIUS = NODE_RADIUS + 3
const MIN_SIBLING_GAP = 2 * NODE_RADIUS + 4
// Siblings are never allowed closer than this while one of them is dragged.
const HARD_SIBLING_GAP = 2
// How long vanishing nodes take to fade out at speed 1 (slower speeds fade
// proportionally slower). style.css reads the actual value from --leave-ms.
const LEAVE_MS = 0   // experiment: vanishing nodes and links go at once (was 350)

// A press that moves less than this (screen pixels) is a click, not a drag.
const CLICK_SLOP = 4
// While carrying a tree, a node of another tree this close (SVG units) is the drop target.
const DROP_RADIUS = 24
// Where a redex's K/S/F badge sits: up and to the right of the node.
const BADGE_OFFSET = 14

// How long the camera takes to glide somewhere (ms).
const GLIDE_MS = 450

// --- Simulation data ---------------------------------------------------------

export type SimNode = SimulationNodeDatum & {
  /** Position before the latest physics tick, for drawing in between ticks. */
  prevX?: number
  prevY?: number
  id: string
  treeKey: string       // which workspace tree the node belongs to
  path: Path
  kind: NodeKind
  /** name, if this node is a collapsed variable (drawn as a chip) */
  chip?: string
  targetX: number
  targetY: number
  children: SimNode[]   // in branch order (first branch first)
}

type SimLink = SimulationLinkDatum<SimNode> & {
  id: string
  source: SimNode
  target: SimNode
}

export function pathId(path: Path): string {
  return 'n' + path.map((i) => '.' + i).join('')
}

/** A custom force: if two neighbouring siblings get too close or swap,
 *  push them back apart so the first branch stays on the left. */
export function forceSiblingOrder(minGap = MIN_SIBLING_GAP) {
  let nodes: SimNode[] = []
  let strength = DEFAULT_PARAMS.orderStrength

  function force(): void {
    for (const parent of nodes) {
      const c = parent.children
      for (let i = 1; i < c.length; i++) {
        const left = c[i - 1]
        const right = c[i]
        // Compare where they are about to be (position + velocity).
        const gap = (right.x! + right.vx!) - (left.x! + left.vx!)
        const shortBy = minGap - gap
        if (shortBy <= 0) continue
        const push = shortBy * strength
        // A pinned (dragged) node can't move, so its sibling takes the whole push.
        if (left.fx != null) right.vx! += push
        else if (right.fx != null) left.vx! -= push
        else {
          left.vx! -= push / 2
          right.vx! += push / 2
        }
      }
    }
    // Hard rule on top of the soft push above, for rows where a node is being
    // dragged: siblings may never cross, even when one is dragged quickly past
    // the other. If they would, move the free one directly. Sweep both ways so
    // a whole row of siblings gets shoved.
    // (Not applied otherwise: after a reduction step, subtrees really are
    // travelling to new places, and shoving them would make them teleport.)
    for (const parent of nodes) {
      const c = parent.children
      if (!c.some((n) => n.fx != null)) continue
      for (let i = 1; i < c.length; i++) keepApart(c[i - 1], c[i], 'right')
      for (let i = c.length - 1; i >= 1; i--) keepApart(c[i - 1], c[i], 'left')
    }
  }

  // Where a node will be after this tick (a dragged node stays at fx).
  const nextX = (n: SimNode) => n.fx ?? n.x! + n.vx!

  function keepApart(left: SimNode, right: SimNode, shove: 'left' | 'right'): void {
    const shortBy = HARD_SIBLING_GAP - (nextX(right) - nextX(left))
    if (shortBy <= 0) return
    if (left.fx != null) right.x! += shortBy
    else if (right.fx != null) left.x! -= shortBy
    else if (shove === 'right') right.x! += shortBy
    else left.x! -= shortBy
  }
  force.initialize = (ns: SimNode[]) => { nodes = ns }
  force.strength = (s: number) => { strength = s; return force }
  return force
}

/** How many sibling pairs are currently out of order (should always be 0). */
export function countOrderViolations(nodes: Iterable<SimNode>): number {
  let count = 0
  for (const parent of nodes) {
    const c = parent.children
    for (let i = 1; i < c.length; i++) if (c[i].x! < c[i - 1].x!) count++
  }
  return count
}

// --- The scene ---------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg'

function svgEl<K extends keyof SVGElementTagNameMap>(
  name: K, attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, name)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  return e
}

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** One tree as the scene needs it. */
export type SceneTree = {
  key: string
  tree: Tree
  ids: IdTree
  x: number              // where its root sits
  y: number
  nextRedex: Path | null // strongly ringed: what Step will reduce
  redexes?: readonly Redex[] // every redex: a clickable K/S/F badge
  chips?: ChipsByPath    // collapsed variables, drawn as labelled chips
  openVars?: ReadonlyMap<string, { readonly name: string }>  // expanded variables (by path key): a tag to collapse them
}

export type NodeHit = { treeKey: string; path: Path; shiftKey: boolean }

/** A node (or empty canvas) under a screen point. */
export type PointHit = { node: { treeKey: string; path: Path; id: string } | null; x: number; y: number }

export type SceneEvents = {
  /** A press and release without moving: a click on a node. */
  onClick?: (hit: NodeHit) => void
  /** The pointer moved onto (or off: null) a redex's K/S/F badge. */
  onRedexHover?: (redex: { treeKey: string; path: Path } | null) => void
  /** A click on a redex's K/S/F badge: reduce that redex. */
  onRedexClick?: (redex: { treeKey: string; path: Path }) => void
  /** A node started being dragged; (x, y) is where it is. The handler may
   *  change the workspace (e.g. tear the node off into its own tree). */
  onDragStart?: (hit: NodeHit & { x: number; y: number }) => void
  /** A whole tree (dragged by its root) was let go at (x, y), over `target`
   *  (a node of another tree) or over empty space (`target` null). */
  onDrop?: (drop: { treeKey: string; x: number; y: number; target: { treeKey: string; path: Path } | null }) => void
  /** A click on an expanded variable's name tag: collapse it. */
  onCollapseClick?: (node: { treeKey: string; path: Path }) => void
  /** A click (press and release without moving) on empty canvas, in world coordinates. */
  onCanvasClick?: (at: { x: number; y: number }) => void
  /** Right-click (or long press) on a node or on empty canvas. */
  onContextMenu?: (hit: PointHit & { clientX: number; clientY: number }) => void
}

export class Scene {
  /** Set by main.ts. */
  events: SceneEvents = {}

  private readonly svg: SVGSVGElement
  private readonly linkLayer = svgEl('g', { class: 'links' })
  private readonly nodeLayer = svgEl('g', { class: 'nodes' })

  private nodes = new Map<string, SimNode>()
  private links = new Map<string, SimLink>()
  private nodeEls = new Map<string, SVGGElement>()
  private linkEls = new Map<string, SVGLineElement>()

  private readonly sim: Simulation<SimNode, SimLink>
  private readonly linkForce: ForceLink<SimNode, SimLink>
  private readonly charge: ForceManyBody<SimNode>
  private readonly pullX: ForceX<SimNode>
  private readonly pullY: ForceY<SimNode>
  private readonly order = forceSiblingOrder()
  private params: PhysicsParams = { ...DEFAULT_PARAMS }

  /** Pressed on a node, not yet moved far enough to count as a drag. */
  private pressed: { node: SimNode; pointerId: number; clientX: number; clientY: number; shiftKey: boolean } | null = null
  /** Being dragged. `carry` is set when a whole tree is carried (dragged by its root):
   *  every node of it, with its offset from the root. */
  private dragging: { node: SimNode; pointerId: number; carry: Map<SimNode, { dx: number; dy: number }> | null } | null = null
  private dropTarget: SimNode | null = null
  private parts: Parts = new Map()
  private warnedAboutOrder = false

  // The camera, and the canvas size in screen pixels.
  private camera: Camera = { x: 0, y: 0, zoom: 1 }
  private cameraReady = false      // fitted to the trees yet?
  private size: Size = { width: 1, height: 1 }
  private glide: { from: Camera; to: Camera; start: number; frame: number } | null = null
  /** Pointers panning (one) or pinch-zooming (two) on empty canvas: last client position. */
  private panPointers = new Map<number, Point>()
  /** A press on empty canvas that may still turn out to be a click. */
  private canvasPress: { id: number; x: number; y: number } | null = null
  /** World-space bounds of each tree's tidy layout, from the last setWorkspace. */
  private treeBounds = new Map<string, Bounds>()

  // Our own animation loop (instead of d3's), so the speed can be changed.
  private frame: number | null = null
  private tickBudget = 0

  constructor(svg: SVGSVGElement) {
    this.svg = svg
    svg.replaceChildren(this.linkLayer, this.nodeLayer)

    // Each spring's rest length is the link's length in the tidy layout,
    // so the springs and the target pulls agree instead of fighting.
    this.linkForce = forceLink<SimNode, SimLink>([])
      .id((n) => n.id)
      .distance((l) => Math.hypot(l.target.targetX - l.source.targetX, l.target.targetY - l.source.targetY))
    this.charge = forceManyBody<SimNode>().distanceMax(90)
    this.pullX = forceX<SimNode>((n) => n.targetX)
    this.pullY = forceY<SimNode>((n) => n.targetY)

    this.sim = forceSimulation<SimNode, SimLink>([])
      .force('link', this.linkForce)
      .force('charge', this.charge)
      .force('collide', forceCollide<SimNode>((n) => (n.chip ? chipWidth(n.chip) / 2 + 3 : COLLIDE_RADIUS)))
      .force('pullX', this.pullX)
      .force('pullY', this.pullY)
      .force('order', this.order)
      .stop()   // d3 would run its own timer; we drive ticks from loop() instead

    this.setParams(this.params)
    this.listenForPointer()
    this.listenForPanZoom()
    this.updateSize()
    new ResizeObserver(() => this.updateSize()).observe(svg)
  }

  getParams(): PhysicsParams {
    return { ...this.params }
  }

  setParams(p: Partial<PhysicsParams>): void {
    this.params = { ...this.params, ...p }
    const q = this.params
    this.linkForce.strength(q.linkStrength)
    this.charge.strength(-q.repulsion)
    this.pullX.strength(q.pullX)
    this.pullY.strength(q.pullY)
    this.order.strength(q.orderStrength)
    this.sim.velocityDecay(q.damping)
    this.svg.style.setProperty('--leave-ms', `${Math.round(this.leaveMs())}ms`)
    this.sim.alpha(Math.max(this.sim.alpha(), 0.3))
    this.wake()
  }

  /** True when nothing is being dragged and motion has mostly died down
   *  (`threshold` is the simulation's "heat", 0–1; lower = calmer). */
  isSettled(threshold = 0.3): boolean {
    return this.dragging === null && this.sim.alpha() < threshold
  }

  /** Fade-out time at the current speed. */
  private leaveMs(): number {
    return LEAVE_MS / Math.max(this.params.speed, 0.05)
  }

  // --- Animation loop ---------------------------------------------------------
  //
  // Each screen frame we add `speed` to a budget and run one physics tick per
  // whole unit, so speed 0.5 = a tick every other frame, speed 2 = two per
  // frame. Between ticks, nodes are drawn part-way from their previous to their
  // current position, so slow motion stays smooth. Dragging always runs at
  // full speed so the node keeps up with the pointer.

  private wake(): void {
    if (this.frame === null && !reducedMotion()) {
      this.frame = requestAnimationFrame(() => this.loop())
    }
  }

  private loop(): void {
    this.frame = null
    this.tickBudget += this.dragging ? 1 : this.params.speed
    while (this.tickBudget >= 1) {
      for (const n of this.nodes.values()) { n.prevX = n.x; n.prevY = n.y }
      this.sim.tick()
      this.tickBudget -= 1
    }
    const stillMoving = this.dragging !== null || this.sim.alpha() >= this.sim.alphaMin()
    // Draw the in-between position; once at rest, draw exactly where nodes are.
    this.renderFrame(stillMoving ? this.tickBudget : 1)
    if (stillMoving) this.wake()
    else this.tickBudget = 0
  }

  // --- Showing the workspace ----------------------------------------------------

  // --- Camera ----------------------------------------------------------------

  private updateSize(): void {
    this.size = { width: Math.max(this.svg.clientWidth, 1), height: Math.max(this.svg.clientHeight, 1) }
    this.applyCamera()
  }

  private applyCamera(): void {
    this.svg.setAttribute('viewBox', viewBox(this.camera, this.size).map((v) => v.toFixed(2)).join(' '))
  }

  private setCamera(c: Camera): void {
    this.camera = c
    this.applyCamera()
  }

  private stopGlide(): void {
    if (this.glide) cancelAnimationFrame(this.glide.frame)
    this.glide = null
  }

  /** Move the camera to `to` smoothly (ease-out). */
  private glideTo(to: Camera): void {
    this.stopGlide()
    if (reducedMotion()) {
      this.setCamera(to)
      return
    }
    const from = this.camera
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / GLIDE_MS, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      this.setCamera(lerpCamera(from, to, eased))
      if (t < 1 && this.glide) this.glide.frame = requestAnimationFrame(tick)
      else this.glide = null
    }
    this.glide = { from, to, start, frame: requestAnimationFrame(tick) }
  }

  /** Glide so every tree is on screen. */
  fitAll(): void {
    const b = unionBounds([...this.treeBounds.values()])
    if (b) this.glideTo(fitBounds(b, this.size))
  }

  /** Zoom in (factor > 1) or out around the middle of the canvas, smoothly. */
  zoomBy(factor: number): void {
    const target = this.glide?.to ?? this.camera
    this.glideTo(zoomAt(target, this.size, { x: this.size.width / 2, y: this.size.height / 2 }, factor))
  }

  /** Glide just enough to bring these trees into view (nothing if they are). */
  revealTrees(keys: readonly string[]): void {
    const b = unionBounds(keys.flatMap((k) => this.treeBounds.get(k) ?? []))
    if (!b) return
    const from = this.glide?.to ?? this.camera
    const to = reveal(from, this.size, b)
    if (to !== from) this.glideTo(to)
  }

  /** Show these trees. Nodes whose id was already on screen keep their
   *  position and glide to their new target (even into another tree). New
   *  nodes sprout from the node they were copied from (`born`: new id ->
   *  origin id), or else from their parent. Nodes whose id is gone fade out. */
  setWorkspace(
    trees: readonly SceneTree[],
    options: {
      selected?: string | null
      born?: ReadonlyMap<string, string>
      /** trees to bring into view if they aren't (the camera glides) */
      reveal?: readonly string[]
      /** vanishing node id -> node it shrinks into (collapsing a variable) */
      absorbed?: ReadonlyMap<string, string>
    } = {},
  ): void {
    const born = options.born ?? new Map<string, string>()
    const dim = trees.length > 1
    const old = this.nodes
    const next = new Map<string, SimNode>()
    const sproutedFromOrigin = new Set<string>()
    this.treeBounds = new Map()

    for (const t of trees) {
      const layout = layoutTree(t.tree, t.chips)
      this.treeBounds.set(t.key, {
        minX: layout.bounds.minX + t.x, maxX: layout.bounds.maxX + t.x,
        minY: layout.bounds.minY + t.y, maxY: layout.bounds.maxY + t.y,
      })

      // The id of every node of this tree, looked up by its path.
      const idByPath = new Map<string, string>()
      const walk = (ids: IdTree, path: Path) => {
        idByPath.set(pathId(path), ids.id)
        ids.children.forEach((c, i) => walk(c, [...path, i]))
      }
      walk(t.ids, [])
      const byPath = new Map<string, SimNode>()
      const otherTree = dim && t.key !== options.selected

      // layout.nodes lists parents before children, and children in branch order.
      for (const ln of layout.nodes) {
        const id = idByPath.get(pathId(ln.path))
        if (id === undefined) throw new Error(`no id for node at [${ln.path.join(', ')}]: ids and tree differ in shape`)
        const parent = ln.path.length ? byPath.get(pathId(ln.path.slice(0, -1)))! : null
        const targetX = ln.x + t.x
        const targetY = ln.y + t.y
        let n = old.get(id)
        if (!n) {
          const origin = old.get(born.get(id) ?? '')
          let fromX: number, fromY: number
          if (origin) {
            // A copy (S rule): sprout out of the node it was copied from.
            fromX = origin.x! + 3
            fromY = origin.y! + 3
            sproutedFromOrigin.add(id)
          } else if (parent) {
            // Otherwise start just below the parent, already in the right order.
            fromX = parent.x! + (targetX - parent.targetX) * 0.2
            fromY = parent.y! + 4
          } else {
            fromX = targetX
            fromY = targetY
          }
          n = { id, treeKey: t.key, path: ln.path, kind: ln.kind, targetX, targetY, children: [], x: fromX, y: fromY, vx: 0, vy: 0 }
          const g = svgEl('g', { class: 'node' })
          g.dataset.id = id
          const badge = svgEl('g', { class: 'badge', transform: `translate(${BADGE_OFFSET},${-BADGE_OFFSET})` })
          badge.append(svgEl('rect', { x: -5.5, y: -6.5, width: 11, height: 13, rx: 3 }), svgEl('text', { 'text-anchor': 'middle', dy: '0.35em' }), svgEl('title'))
          const chip = svgEl('g', { class: 'chip' })
          chip.append(svgEl('rect', { height: CHIP_HEIGHT, y: -CHIP_HEIGHT / 2, rx: CHIP_HEIGHT / 2 }), svgEl('text', { 'text-anchor': 'middle', dy: '0.35em' }))
          const tag = svgEl('g', { class: 'open-tag' })
          tag.append(svgEl('rect', { height: 12, y: -6, rx: 6 }), svgEl('text', { 'text-anchor': 'middle', dy: '0.35em' }), svgEl('title'))
          g.append(svgEl('circle', { class: 'dot' }), chip, svgEl('title'), badge, tag)
          this.nodeEls.set(id, g)
          this.nodeLayer.append(g)
        }
        n.treeKey = t.key
        n.path = ln.path
        n.kind = ln.kind
        n.chip = ln.chip
        n.targetX = targetX
        n.targetY = targetY
        n.children = []
        parent?.children.push(n)
        next.set(id, n)
        byPath.set(pathId(ln.path), n)

        const g = this.nodeEls.get(id)!
        g.dataset.tree = t.key
        g.dataset.path = ln.path.join('.')
        const classes = ['node', ln.kind]
        if (t.nextRedex !== null && samePath(ln.path, t.nextRedex)) classes.push('next-redex')
        const redex = t.redexes?.find((r) => samePath(r.path, ln.path))
        if (redex) {
          classes.push('redex')
          g.querySelector('.badge text')!.textContent = redex.rule
          g.querySelector('.badge title')!.textContent = `Reduce this ${redex.rule} redex`
        }
        if (this.dragging?.node.id === id) classes.push('dragging')
        if (otherTree) classes.push('dim')
        if (ln.path.length === 0) classes.push('root')
        if (ln.chip) {
          classes.push('is-chip')
          const w = chipWidth(ln.chip)
          const rect = g.querySelector('.chip rect')!
          rect.setAttribute('width', String(w))
          rect.setAttribute('x', String(-w / 2))
          g.querySelector('.chip text')!.textContent = chipLabel(ln.chip)
        }
        g.setAttribute('class', classes.join(' '))
        g.querySelector('.dot')!.setAttribute('r', String(ln.kind === 'computation' ? COMPUTATION_RADIUS : NODE_RADIUS))
        // The K/S/F badge sits up and to the right, outside a wide chip too.
        const bx = ln.chip ? chipWidth(ln.chip) / 2 + 6 : BADGE_OFFSET
        g.querySelector('.badge')!.setAttribute('transform', `translate(${bx},${-BADGE_OFFSET})`)
        // An expanded variable gets a hollow tag with its name, up and to the left: click to collapse.
        const open = t.openVars?.get(ln.path.join('.'))
        g.classList.toggle('open-var', !!open)
        if (open) {
          const tw = 8 + chipLabel(open.name).length * 5.6
          const tag = g.querySelector('.open-tag')!
          tag.setAttribute('transform', `translate(${-(BADGE_OFFSET + tw / 2 - 6)},${-BADGE_OFFSET})`)
          const rect = tag.querySelector('rect')!
          rect.setAttribute('width', String(tw))
          rect.setAttribute('x', String(-tw / 2))
          tag.querySelector('text')!.textContent = chipLabel(open.name)
          tag.querySelector('title')!.textContent = `${open.name} is expanded: click to collapse it`
        }
        const where = ln.path.length ? `at [${ln.path.join(', ')}]` : '(root)'
        g.querySelector('title')!.textContent = ln.chip
          ? `variable ${ln.chip} ${where}: right-click to expand`
          : `${ln.kind} ${where}`
      }
    }

    this.placeNewNodesInOrder(next, (id) => old.has(id) || sproutedFromOrigin.has(id))

    // Nodes that are gone: out of the simulation now, off the screen after a fade.
    for (const id of old.keys()) {
      if (next.has(id)) continue
      const el = this.nodeEls.get(id)!
      const into = next.get(options.absorbed?.get(id) ?? '')
      if (into) this.slideTo(el, old.get(id)!, into)
      this.fadeOut(el)
      this.nodeEls.delete(id)
      if (this.dragging?.node.id === id) this.endDrag()
      if (this.pressed?.node.id === id) this.pressed = null
    }
    if (this.dropTarget && !next.has(this.dropTarget.id)) this.dropTarget = null
    this.nodes = next

    // Links: one per non-root node, named after its child end. A link keeps
    // its line when its child survives, even if the child has a new parent.
    const nextLinks = new Map<string, SimLink>()
    for (const n of next.values()) {
      for (const child of n.children) {
        const id = child.id
        const link = this.links.get(id) ?? { id, source: n, target: child }
        link.source = n
        link.target = child
        nextLinks.set(id, link)
        if (!this.linkEls.has(id)) {
          const line = svgEl('line')
          this.linkEls.set(id, line)
          this.linkLayer.append(line)
        }
        this.linkEls.get(id)!.classList.toggle('dim', n.treeKey !== options.selected && dim)
      }
    }
    for (const id of this.links.keys()) {
      if (nextLinks.has(id)) continue
      const line = this.linkEls.get(id)!
      // A link whose node slides into a chip can't follow it: just vanish quickly.
      if (options.absorbed?.has(id)) line.style.transition = 'opacity 120ms ease-out'
      this.fadeOut(line)
      this.linkEls.delete(id)
    }
    this.links = nextLinks
    this.applyParts()

    // The camera stays where it is, except: fit everything the first time
    // there's something to show, and glide to reveal trees when asked (never
    // while something is being dragged).
    if (!this.cameraReady && trees.length) {
      this.cameraReady = true
      this.setCamera(fitBounds(unionBounds([...this.treeBounds.values()])!, this.size))
    } else if (options.reveal?.length && !this.dragging) {
      this.revealTrees(options.reveal)
    }

    // Links first, then nodes: sim.nodes() re-initialises every force
    // (including the links) with the new node list.
    this.linkForce.links([...nextLinks.values()])
    this.sim.nodes([...next.values()])
    this.warnedAboutOrder = false
    if (this.dragging) this.updateCarry()

    if (reducedMotion()) {
      for (const n of next.values()) { n.x = n.targetX; n.y = n.targetY; n.vx = n.vy = 0 }
      this.sim.alpha(0)
      this.renderFrame(1)
    } else {
      this.sim.alpha(Math.max(this.sim.alpha(), 0.7))
      this.wake()
    }
  }

  /** Glide a vanishing node into another one (a variable collapsing). */
  private slideTo(el: SVGElement, from: SimNode, to: SimNode): void {
    if (reducedMotion()) return
    el.style.transform = `translate(${from.x!.toFixed(2)}px, ${from.y!.toFixed(2)}px)`
    el.getBoundingClientRect()   // start the transition from here
    el.style.transition = `transform ${Math.round(this.leaveMs())}ms ease-in, opacity ${Math.round(this.leaveMs())}ms ease-out`
    el.style.transform = `translate(${to.x!.toFixed(2)}px, ${to.y!.toFixed(2)}px)`
  }

  /** Fade an element out where it stands, then remove it. */
  private fadeOut(el: SVGElement): void {
    if (reducedMotion()) {
      el.remove()
      return
    }
    el.classList.add('leaving')
    setTimeout(() => el.remove(), this.leaveMs())
  }

  /** A node that sprouts next to siblings that already exist (and may still
   *  be sitting in their old positions) must start between them, or it would
   *  begin on the wrong side and visibly swap. */
  private placeNewNodesInOrder(nodes: Map<string, SimNode>, isPlaced: (id: string) => boolean): void {
    for (const parent of nodes.values()) {
      const c = parent.children
      for (let i = 0; i < c.length; i++) {
        if (isPlaced(c[i].id)) continue
        const left = i > 0 ? c[i - 1].x! : null           // already placed
        const rightNode = c.slice(i + 1).find((s) => isPlaced(s.id))
        const right = rightNode ? rightNode.x! : null
        let x = c[i].x!
        if (left !== null && right !== null) x = (left + right) / 2
        else if (left !== null) x = Math.max(x, left + MIN_SIBLING_GAP)
        else if (right !== null) x = Math.min(x, right - MIN_SIBLING_GAP)
        c[i].x = x
      }
    }
  }

  /** Draw every node `t` of the way (0–1) from its previous position to its
   *  current one. */
  private renderFrame(t: number): void {
    const drawX = (n: SimNode) => (n.prevX ?? n.x!) + (n.x! - (n.prevX ?? n.x!)) * t
    const drawY = (n: SimNode) => (n.prevY ?? n.y!) + (n.y! - (n.prevY ?? n.y!)) * t
    for (const n of this.nodes.values()) {
      this.nodeEls.get(n.id)!.setAttribute('transform', `translate(${drawX(n).toFixed(2)},${drawY(n).toFixed(2)})`)
    }
    for (const l of this.links.values()) {
      const line = this.linkEls.get(l.id)!
      line.setAttribute('x1', drawX(l.source).toFixed(2))
      line.setAttribute('y1', drawY(l.source).toFixed(2))
      line.setAttribute('x2', drawX(l.target).toFixed(2))
      line.setAttribute('y2', drawY(l.target).toFixed(2))
    }

    // Development check: branches must never swap sides at rest or while
    // dragging. (During the first moments after a reduction step, subtrees
    // are still travelling to their new places, so that's not checked.)
    if (import.meta.env.DEV && (this.dragging !== null || this.sim.alpha() < 0.05)) {
      const bad = countOrderViolations(this.nodes.values())
      this.svg.dataset.orderViolations = String(bad)
      if (bad > 0 && !this.warnedAboutOrder) {
        this.warnedAboutOrder = true
        console.warn(`[scene] ${bad} sibling pair(s) out of order; try raising orderStrength or pullX`)
      }
    }
  }

  // --- Pointer: clicks, drags, carrying whole trees, dropping -----------------

  private toSvgPoint(e: PointerEvent): { x: number; y: number } {
    const m = this.svg.getScreenCTM()
    if (!m) return { x: 0, y: 0 }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return { x: p.x, y: p.y }
  }

  /** Colour nodes as the parts w, x, y, z of a rule (empty map: no colours).
   *  Only changes classes: the physics isn't disturbed. */
  setParts(parts: Parts): void {
    this.parts = parts
    this.applyParts()
  }

  private applyParts(): void {
    const set = (el: Element, part: string | undefined) => {
      for (const c of [...el.classList]) if (c.startsWith('part-')) el.classList.remove(c)
      if (part) el.classList.add(`part-${part}`)
    }
    for (const [id, el] of this.nodeEls) set(el, this.parts.get(id))
    // A link inside one part takes that part's colour.
    for (const [id, link] of this.links) {
      const part = this.parts.get(id)
      set(this.linkEls.get(id)!, part && this.parts.get(link.source.id) === part ? part : undefined)
    }
  }

  /** Highlight the node a dragged Add-menu button would be attached to. */
  showDropTarget(id: string | null): void {
    this.setDropTarget(id ? (this.nodes.get(id) ?? null) : null)
  }

  /** What's under a screen point: a node (if any) and the world position. */
  hitAt(clientX: number, clientY: number): PointHit {
    const m = this.svg.getScreenCTM()
    const p = m ? new DOMPoint(clientX, clientY).matrixTransform(m.inverse()) : { x: 0, y: 0 }
    const g = document.elementFromPoint(clientX, clientY)?.closest<SVGGElement>('g.node')
    const n = g && !g.classList.contains('leaving') && g.dataset.id ? this.nodes.get(g.dataset.id) : undefined
    return { node: n ? { treeKey: n.treeKey, path: n.path, id: n.id } : null, x: p.x, y: p.y }
  }

  private hitOf(node: SimNode, shiftKey: boolean): NodeHit {
    return { treeKey: node.treeKey, path: node.path, shiftKey }
  }

  /** If the dragged node is a tree's root, the whole tree is carried: every
   *  node's target follows the pointer, keeping the tree's shape. */
  private updateCarry(): void {
    const d = this.dragging
    if (!d) return
    if (d.node.path.length !== 0) {
      d.carry = null
      return
    }
    d.carry = new Map()
    for (const n of this.nodes.values()) {
      if (n.treeKey === d.node.treeKey) d.carry.set(n, { dx: n.targetX - d.node.targetX, dy: n.targetY - d.node.targetY })
    }
    this.moveCarried(d.node.fx ?? d.node.x!, d.node.fy ?? d.node.y!)
  }

  private moveCarried(x: number, y: number): void {
    const carry = this.dragging?.carry
    if (!carry) return
    for (const [n, { dx, dy }] of carry) {
      n.targetX = x + dx
      n.targetY = y + dy
    }
    // forceX/forceY read the targets when (re)initialised; refresh them.
    this.pullX.x((n) => n.targetX)
    this.pullY.y((n) => n.targetY)
  }

  /** The nearest node of another tree near (x, y), if any. */
  private findDropTarget(x: number, y: number): SimNode | null {
    const carried = this.dragging?.node.treeKey
    let best: SimNode | null = null
    let bestDist = DROP_RADIUS
    for (const n of this.nodes.values()) {
      if (n.treeKey === carried) continue
      const dist = Math.hypot(n.x! - x, n.y! - y)
      if (dist < bestDist) { best = n; bestDist = dist }
    }
    return best
  }

  private setDropTarget(n: SimNode | null): void {
    if (n === this.dropTarget) return
    if (this.dropTarget) this.nodeEls.get(this.dropTarget.id)?.classList.remove('drop-target')
    this.dropTarget = n
    if (n) this.nodeEls.get(n.id)?.classList.add('drop-target')
  }

  private endDrag(): void {
    const d = this.dragging
    if (!d) return
    d.node.fx = null      // let go: the target pull springs it back
    d.node.fy = null
    this.nodeEls.get(d.node.id)?.classList.remove('dragging')
    this.svg.classList.remove('carrying')
    this.setDropTarget(null)
    this.dragging = null
    this.sim.alphaTarget(0)  // cool down and come to rest
  }

  /** Pan by dragging empty canvas (pinch with two fingers); scroll to pan;
   *  ctrl/⌘ + scroll (which is also what a trackpad pinch sends) to zoom. */
  private listenForPanZoom(): void {
    const local = (e: { clientX: number; clientY: number }): Point => {
      const r = this.svg.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    this.svg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 1) return
      if ((e.target as Element).closest('g.node')) return   // that's a node press
      e.preventDefault()
      this.stopGlide()
      this.panPointers.set(e.pointerId, local(e))
      // A press that doesn't move is a click on empty canvas.
      this.canvasPress = this.panPointers.size === 1 && e.button === 0 ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null
      this.svg.setPointerCapture(e.pointerId)
      this.svg.classList.add('panning')
    })

    this.svg.addEventListener('pointermove', (e) => {
      const last = this.panPointers.get(e.pointerId)
      if (!last) return
      const now = local(e)
      const cp = this.canvasPress
      if (cp && (cp.id !== e.pointerId || Math.hypot(e.clientX - cp.x, e.clientY - cp.y) >= CLICK_SLOP)) this.canvasPress = null
      if (this.panPointers.size === 1) {
        this.setCamera(panBy(this.camera, now.x - last.x, now.y - last.y))
      } else {
        // Two fingers: pan with their midpoint, zoom with their spread.
        const other = [...this.panPointers].find(([id]) => id !== e.pointerId)![1]
        const mid0 = { x: (last.x + other.x) / 2, y: (last.y + other.y) / 2 }
        const mid1 = { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 }
        const spread0 = Math.hypot(last.x - other.x, last.y - other.y)
        const spread1 = Math.hypot(now.x - other.x, now.y - other.y)
        let cam = panBy(this.camera, mid1.x - mid0.x, mid1.y - mid0.y)
        if (spread0 > 0) cam = zoomAt(cam, this.size, mid1, spread1 / spread0)
        this.setCamera(cam)
      }
      this.panPointers.set(e.pointerId, now)
    })

    const release = (e: PointerEvent) => {
      if (!this.panPointers.delete(e.pointerId)) return
      if (this.panPointers.size === 0) this.svg.classList.remove('panning')
      const cp = this.canvasPress
      this.canvasPress = null
      if (cp?.id === e.pointerId && e.type === 'pointerup') {
        const m = this.svg.getScreenCTM()
        if (m) {
          const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
          this.events.onCanvasClick?.({ x: p.x, y: p.y })
        }
      }
    }
    this.svg.addEventListener('pointerup', release)
    this.svg.addEventListener('pointercancel', release)

    this.svg.addEventListener('wheel', (e) => {
      e.preventDefault()
      this.stopGlide()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.size.height : 1   // lines / pages -> pixels
      if (e.ctrlKey || e.metaKey) {
        // Trackpad pinches send small deltas; a mouse wheel notch sends ~100.
        // Cap each event so one notch zooms by at most ~28%.
        const delta = Math.max(-25, Math.min(25, e.deltaY * unit))
        this.setCamera(zoomAt(this.camera, this.size, local(e), Math.exp(-delta * 0.01)))
      } else {
        this.setCamera(panBy(this.camera, -e.deltaX * unit, -e.deltaY * unit))
      }
    }, { passive: false })
  }

  private listenForPointer(): void {
    // Badges: a plain click reduces that redex. They sit on top of their node,
    // so stop the press from also starting a node click or drag.
    this.svg.addEventListener('pointerdown', (e) => {
      if ((e.target as Element).closest('.badge, .open-tag')) e.stopImmediatePropagation()
    }, { capture: true })
    let hovered: Element | null = null
    this.svg.addEventListener('pointerover', (e) => {
      const badge = (e.target as Element).closest('.badge')
      if (badge === hovered) return
      hovered = badge
      const g = badge?.closest<SVGGElement>('g.node')
      const node = g?.dataset.id ? this.nodes.get(g.dataset.id) : undefined
      this.events.onRedexHover?.(node && g!.classList.contains('redex') ? { treeKey: node.treeKey, path: node.path } : null)
    })
    this.svg.addEventListener('click', (e) => {
      const tag = (e.target as Element).closest('.open-tag')
      const tg = tag?.closest<SVGGElement>('g.node')
      const tn = tg?.dataset.id ? this.nodes.get(tg.dataset.id) : undefined
      if (tn && tg!.classList.contains('open-var') && !tg!.classList.contains('leaving')) {
        this.events.onCollapseClick?.({ treeKey: tn.treeKey, path: tn.path })
      }
    })
    this.svg.addEventListener('click', (e) => {
      const badge = (e.target as Element).closest('.badge')
      const g = badge?.closest<SVGGElement>('g.node')
      const node = g?.dataset.id ? this.nodes.get(g.dataset.id) : undefined
      if (!node || !g!.classList.contains('redex') || g!.classList.contains('leaving')) return
      this.events.onRedexClick?.({ treeKey: node.treeKey, path: node.path })
    })

    this.svg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      const g = (e.target as Element).closest<SVGGElement>('g.node')
      const node = g?.dataset.id ? this.nodes.get(g.dataset.id) : undefined
      if (!node || g!.classList.contains('leaving')) return
      e.preventDefault()
      this.pressed = { node, pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey }
      this.svg.setPointerCapture(e.pointerId)
    })

    this.svg.addEventListener('pointermove', (e) => {
      const pr = this.pressed
      if (pr && e.pointerId === pr.pointerId) {
        if (Math.hypot(e.clientX - pr.clientX, e.clientY - pr.clientY) < CLICK_SLOP) return
        // It's a drag, not a click.
        this.pressed = null
        const p = this.toSvgPoint(e)
        const node = pr.node
        this.dragging = { node, pointerId: e.pointerId, carry: null }
        node.fx = p.x
        node.fy = p.y
        this.nodeEls.get(node.id)?.classList.add('dragging')
        // main.ts may change the workspace here (tear the node off); the node
        // keeps its id, so we carry on dragging the same node.
        this.events.onDragStart?.({ ...this.hitOf(node, pr.shiftKey), x: node.x!, y: node.y! })
        if (this.dragging) {
          this.updateCarry()
          this.svg.classList.toggle('carrying', this.dragging.carry !== null)
        }
        this.sim.alphaTarget(0.3)
        this.wake()
        return
      }
      const d = this.dragging
      if (!d || e.pointerId !== d.pointerId) return
      const p = this.toSvgPoint(e)
      d.node.fx = p.x
      d.node.fy = p.y
      if (d.carry) {
        this.moveCarried(p.x, p.y)
        this.setDropTarget(this.findDropTarget(p.x, p.y))
      }
    })

    const release = (e: PointerEvent) => {
      const pr = this.pressed
      if (pr && e.pointerId === pr.pointerId) {
        this.pressed = null
        if (e.type === 'pointerup') this.events.onClick?.(this.hitOf(pr.node, pr.shiftKey))
        return
      }
      const d = this.dragging
      if (!d || e.pointerId !== d.pointerId) return
      const carried = d.carry !== null
      const x = d.node.fx ?? d.node.x!
      const y = d.node.fy ?? d.node.y!
      const target = this.dropTarget
      const treeKey = d.node.treeKey
      this.endDrag()
      if (carried && e.type === 'pointerup') {
        this.events.onDrop?.({ treeKey, x, y, target: target ? { treeKey: target.treeKey, path: target.path } : null })
      }
    }
    this.svg.addEventListener('pointerup', release)
    this.svg.addEventListener('pointercancel', release)

    this.svg.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      this.pressed = null
      this.events.onContextMenu?.({ ...this.hitAt(e.clientX, e.clientY), clientX: e.clientX, clientY: e.clientY })
    })
  }
}
