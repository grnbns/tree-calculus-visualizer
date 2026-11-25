// The live, physical drawing of the workspace's trees (milestones 4–6).
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
// The scene doesn't change any trees itself. It reports clicks, drag starts
// and drops (with the node or tree they're over) to main.ts, which decides
// what they mean and calls setWorkspace() with the result.

import {
  forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY,
  type ForceLink, type ForceManyBody, type ForceX, type ForceY,
  type Simulation, type SimulationLinkDatum, type SimulationNodeDatum,
} from 'd3-force'
import type { Path, Tree } from './engine'
import type { IdTree } from './ids'
import {
  COMPUTATION_RADIUS, HALO_RADIUS, NODE_RADIUS,
  layoutTree, samePath, type NodeKind,
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
const LEAVE_MS = 350

// A press that moves less than this (screen pixels) is a click, not a drag.
const CLICK_SLOP = 4
// While carrying a tree, a node of another tree this close (SVG units) is the drop target.
const DROP_RADIUS = 24

// Smallest area the view will zoom to, so a single leaf isn't drawn huge.
const MIN_VIEW_W = 360
const MIN_VIEW_H = 240
const PADDING = 28

// --- Simulation data ---------------------------------------------------------

export type SimNode = SimulationNodeDatum & {
  /** Position before the latest physics tick, for drawing in between ticks. */
  prevX?: number
  prevY?: number
  id: string
  treeKey: string       // which workspace tree the node belongs to
  path: Path
  kind: NodeKind
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
  nextRedex: Path | null // ringed
}

export type NodeHit = { treeKey: string; path: Path; shiftKey: boolean }

export type SceneEvents = {
  /** A press and release without moving: a click on a node. */
  onClick?: (hit: NodeHit) => void
  /** A node started being dragged; (x, y) is where it is. The handler may
   *  change the workspace (e.g. tear the node off into its own tree). */
  onDragStart?: (hit: NodeHit & { x: number; y: number }) => void
  /** A whole tree (dragged by its root) was let go at (x, y), over `target`
   *  (a node of another tree) or over empty space (`target` null). */
  onDrop?: (drop: { treeKey: string; x: number; y: number; target: { treeKey: string; path: Path } | null }) => void
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
  private warnedAboutOrder = false

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
      .force('collide', forceCollide<SimNode>(COLLIDE_RADIUS))
      .force('pullX', this.pullX)
      .force('pullY', this.pullY)
      .force('order', this.order)
      .stop()   // d3 would run its own timer; we drive ticks from loop() instead

    this.setParams(this.params)
    this.listenForPointer()
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

  /** Show these trees. Nodes whose id was already on screen keep their
   *  position and glide to their new target (even into another tree). New
   *  nodes sprout from the node they were copied from (`born`: new id ->
   *  origin id), or else from their parent. Nodes whose id is gone fade out. */
  setWorkspace(
    trees: readonly SceneTree[],
    options: { selected?: string | null; born?: ReadonlyMap<string, string> } = {},
  ): void {
    const born = options.born ?? new Map<string, string>()
    const dim = trees.length > 1
    const old = this.nodes
    const next = new Map<string, SimNode>()
    const sproutedFromOrigin = new Set<string>()
    const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }

    for (const t of trees) {
      const layout = layoutTree(t.tree)
      bounds.minX = Math.min(bounds.minX, layout.bounds.minX + t.x)
      bounds.maxX = Math.max(bounds.maxX, layout.bounds.maxX + t.x)
      bounds.minY = Math.min(bounds.minY, layout.bounds.minY + t.y)
      bounds.maxY = Math.max(bounds.maxY, layout.bounds.maxY + t.y)

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
          g.append(svgEl('circle', { class: 'halo', r: HALO_RADIUS }), svgEl('circle', { class: 'dot' }), svgEl('title'))
          this.nodeEls.set(id, g)
          this.nodeLayer.append(g)
        }
        n.treeKey = t.key
        n.path = ln.path
        n.kind = ln.kind
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
        if (this.dragging?.node.id === id) classes.push('dragging')
        if (otherTree) classes.push('dim')
        if (ln.path.length === 0) classes.push('root')
        g.setAttribute('class', classes.join(' '))
        g.querySelector('.dot')!.setAttribute('r', String(ln.kind === 'computation' ? COMPUTATION_RADIUS : NODE_RADIUS))
        g.querySelector('title')!.textContent =
          ln.path.length ? `${ln.kind} at [${ln.path.join(', ')}]` : `${ln.kind} (root)`
      }
    }

    this.placeNewNodesInOrder(next, (id) => old.has(id) || sproutedFromOrigin.has(id))

    // Nodes that are gone: out of the simulation now, off the screen after a fade.
    for (const id of old.keys()) {
      if (next.has(id)) continue
      this.fadeOut(this.nodeEls.get(id)!)
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
      this.fadeOut(this.linkEls.get(id)!)
      this.linkEls.delete(id)
    }
    this.links = nextLinks

    // Don't move the camera while something is being dragged.
    if (!this.dragging) this.fitView(trees.length ? bounds : { minX: 0, maxX: 0, minY: 0, maxY: 0 })

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

  /** Fit the view to the tidy layout. Done only when the trees change, never
   *  per tick, so the camera stays still while nodes move. */
  private fitView(b: { minX: number; maxX: number; minY: number; maxY: number }): void {
    const w = Math.max(b.maxX - b.minX + 2 * PADDING, MIN_VIEW_W)
    const h = Math.max(b.maxY - b.minY + 2 * PADDING, MIN_VIEW_H)
    const cx = (b.minX + b.maxX) / 2
    this.svg.setAttribute('viewBox', `${cx - w / 2} ${b.minY - PADDING} ${w} ${h}`)
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

  private listenForPointer(): void {
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
  }
}
