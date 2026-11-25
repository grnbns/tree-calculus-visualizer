// Editing trees by hand (milestone 6). Pure functions: each takes a tree and
// its ids (same shape) and returns new ones, so the scene can animate the
// change. Paths are branch indices from the root, as everywhere else.

import type { Path, Tree } from './engine'
import { allIds, idsAt, type IdSource, type IdTree } from './ids'

export type Edited = { tree: Tree; ids: IdTree }

/** Replace the subtree at `path` with f(subtree). */
function mapTree(t: Tree, path: Path, f: (t: Tree) => Tree): Tree {
  if (path.length === 0) return f(t)
  const [i, ...rest] = path
  if (i < 0 || i >= t.length) throw new Error(`no branch ${i} here`)
  return t.with(i, mapTree(t[i], rest, f))
}

function mapIds(t: IdTree, path: Path, f: (t: IdTree) => IdTree): IdTree {
  if (path.length === 0) return f(t)
  const [i, ...rest] = path
  const children = t.children.slice()
  children[i] = mapIds(children[i], rest, f)
  return { id: t.id, children }
}

export function subtreeAt(t: Tree, path: Path): Tree {
  let node = t
  for (const i of path) node = node[i]
  return node
}

/** Give the node at `path` one more branch: a leaf. This is the same as
 *  applying that node to △, so a fork that gains a branch becomes a
 *  computation. */
export function addLeaf(tree: Tree, ids: IdTree, path: Path, newId: IdSource): Edited {
  return {
    tree: mapTree(tree, path, (n) => [...n, []]),
    ids: mapIds(ids, path, (n) => ({ id: n.id, children: [...n.children, { id: newId(), children: [] }] })),
  }
}

/** Remove the branch at `path` (and everything under it). Later siblings
 *  move one place left. Returns the ids that disappeared. */
export function removeBranch(tree: Tree, ids: IdTree, path: Path): Edited & { died: Set<string> } {
  if (path.length === 0) throw new Error('cannot remove the root as a branch')
  const parentPath = path.slice(0, -1)
  const i = path[path.length - 1]
  return {
    tree: mapTree(tree, parentPath, (n) => n.filter((_, j) => j !== i)),
    ids: mapIds(ids, parentPath, (n) => ({ id: n.id, children: n.children.filter((_, j) => j !== i) })),
    died: new Set(allIds(idsAt(ids, path))),
  }
}

/** Attach `sub` as a new last branch of the node at `path`: that node is
 *  applied to `sub`. `sub` keeps its ids, so on screen it travels there. */
export function attach(tree: Tree, ids: IdTree, path: Path, sub: Tree, subIds: IdTree): Edited {
  return {
    tree: mapTree(tree, path, (n) => [...n, sub]),
    ids: mapIds(ids, path, (n) => ({ id: n.id, children: [...n.children, subIds] })),
  }
}

/** Cut the branch at `path` off into a tree of its own (ids unchanged). */
export function detach(tree: Tree, ids: IdTree, path: Path): Edited & { sub: Tree; subIds: IdTree } {
  const { tree: rest, ids: restIds } = removeBranch(tree, ids, path)
  return { tree: rest, ids: restIds, sub: subtreeAt(tree, path), subIds: idsAt(ids, path) }
}
