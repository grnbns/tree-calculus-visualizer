// Tidy layout of a tree: where every node *should* sit.
//
// layoutTree(tree) returns plain data (testable without a browser).
// scene.ts uses these positions as targets that the physics pulls nodes toward.

import { hierarchy, tree as d3Tree } from 'd3-hierarchy'
import type { Path, Tree } from './engine'

export type NodeKind = 'leaf' | 'stem' | 'fork' | 'computation'

export type LaidOutNode = {
  path: Path        // branch indices from the root; doubles as a node id for now
  x: number
  y: number
  kind: NodeKind
  /** set if this node is a collapsed variable: drawn as a labelled chip */
  chip?: string
}

/** Collapsed variables, by path key ('0.1'; '' = root): the chip hides the
 *  node's first `arity` branches (see marks.ts). */
export type ChipsByPath = ReadonlyMap<string, { readonly name: string; readonly arity: number }>

export type LaidOutLink = { source: LaidOutNode; target: LaidOutNode }

export type Layout = {
  nodes: LaidOutNode[]
  links: LaidOutLink[]
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
}

// Spacing between neighbouring nodes (x) and between levels (y), in SVG units.
export const NODE_GAP_X = 26
export const LEVEL_GAP_Y = 56

// Node sizes (circle radii), in the same SVG units.
export const NODE_RADIUS = 6           // leaf, stem, fork
export const COMPUTATION_RADIUS = 7.5  // nodes with 3+ branches (drawn orange)

// Chips (collapsed variables): a rounded box around the name.
export const CHIP_HEIGHT = 18
const CHIP_CHAR_WIDTH = 7.5
export const chipWidth = (name: string) => Math.max(CHIP_HEIGHT, 10 + name.length * CHIP_CHAR_WIDTH)

export function kindOf(t: Tree): NodeKind {
  switch (t.length) {
    case 0: return 'leaf'
    case 1: return 'stem'
    case 2: return 'fork'
    default: return 'computation'
  }
}

type Item = { t: Tree; path: Path; chip?: { name: string; arity: number } }

/** Where each node goes. The root is at (0, 0); children are below their
 *  parent, in branch order, so the first branch is always on the left.
 *  A collapsed variable (`chips`) is one node: only its arguments hang below. */
export function layoutTree(t: Tree, chips?: ChipsByPath): Layout {
  const item = (t: Tree, path: Path): Item => ({ t, path, chip: chips?.get(path.join('.')) })
  const root = hierarchy<Item>(item(t, []), (n) => {
    const from = n.chip?.arity ?? 0
    const kids: Item[] = []
    for (let i = from; i < n.t.length; i++) kids.push(item(n.t[i], [...n.path, i]))
    return kids.length ? kids : null
  })
  // Wide chips push their neighbours apart.
  const extra = (n: { data: Item }) => (n.data.chip ? Math.max(0, chipWidth(n.data.chip.name) - 2 * NODE_RADIUS) / 2 : 0)
  d3Tree<Item>()
    .nodeSize([NODE_GAP_X, LEVEL_GAP_Y])
    .separation((a, b) => (a.parent === b.parent ? 1 : 2) + (extra(a) + extra(b)) / NODE_GAP_X)(root)

  const byD3Node = new Map<unknown, LaidOutNode>()
  const nodes: LaidOutNode[] = []
  for (const d of root.descendants()) {
    const node: LaidOutNode = {
      path: d.data.path,
      x: d.x!,
      y: d.y!,
      kind: kindOf(d.data.t),
    }
    if (d.data.chip) node.chip = d.data.chip.name
    byD3Node.set(d, node)
    nodes.push(node)
  }

  const links = root.links().map((l) => ({
    source: byD3Node.get(l.source)!,
    target: byD3Node.get(l.target)!,
  }))

  const xs = nodes.map((n) => n.x)
  const ys = nodes.map((n) => n.y)
  return {
    nodes,
    links,
    bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
  }
}

export function samePath(a: Path, b: Path): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}
