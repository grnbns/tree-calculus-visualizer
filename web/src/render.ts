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
}

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
export const HALO_RADIUS = 12          // ring around the next redex

export function kindOf(t: Tree): NodeKind {
  switch (t.length) {
    case 0: return 'leaf'
    case 1: return 'stem'
    case 2: return 'fork'
    default: return 'computation'
  }
}

/** Where each node goes. The root is at (0, 0); children are below their
 *  parent, in branch order, so the first branch is always on the left. */
export function layoutTree(t: Tree): Layout {
  // A tree is already "a list of children", which is what d3 wants.
  const root = hierarchy<Tree>(t, (node) => (node.length > 0 ? [...node] : null))
  d3Tree<Tree>().nodeSize([NODE_GAP_X, LEVEL_GAP_Y])(root)

  const byD3Node = new Map<unknown, LaidOutNode>()
  const nodes: LaidOutNode[] = []
  for (const d of root.descendants()) {
    const parentPath = d.parent ? byD3Node.get(d.parent)!.path : []
    const index = d.parent ? d.parent.children!.indexOf(d) : -1
    const node: LaidOutNode = {
      path: d.parent ? [...parentPath, index] : [],
      x: d.x!,
      y: d.y!,
      kind: kindOf(d.data),
    }
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
