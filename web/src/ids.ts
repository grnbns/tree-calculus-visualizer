// Stable node identity (milestone 5).
//
// The engine works on plain trees and knows nothing about ids. Here we keep a
// second tree of the SAME SHAPE that holds an id at every node, and update it
// alongside each reduction step. The scene matches nodes by id, so a subtree
// that a rule moves keeps its circles, which then visibly travel.
//
// Inside a redex  R = △ b0 y z rest…  (b0 = first branch):
//
//   rule  result               keeps its id              vanishes          born
//   K     y rest…              y, rest                   R, b0, all of z   –
//   S     y z (x z) rest…      y, x, z (original), rest  R, b0             a copy of z
//   F     z w x rest…          z, w, x, rest             R, b0, all of y   –
//
// The result's root takes over y's id (K, S) or z's id (F), not R's, so that
// subtree is seen rising into the redex's place. Everything outside the
// redex keeps its ids unchanged.

import type { Path, Rule, Tree } from './engine'

export type IdTree = { readonly id: string; readonly children: readonly IdTree[] }

export type IdStep = {
  ids: IdTree
  /** id of each new node -> id of the node it was copied from */
  born: Map<string, string>
  /** ids that no longer exist */
  died: Set<string>
}

export type IdSource = () => string

/** Makes ids 'a1', 'a2', … (or with another prefix). */
export function idSource(prefix = 'a'): IdSource {
  let n = 0
  return () => `${prefix}${++n}`
}

const defaultIds = idSource()

/** Give every node of `tree` a new id. */
export function freshIds(tree: Tree, newId: IdSource = defaultIds): IdTree {
  return { id: newId(), children: tree.map((child) => freshIds(child, newId)) }
}

/** Every id in a subtree. */
export function allIds(t: IdTree, out: string[] = []): string[] {
  out.push(t.id)
  for (const c of t.children) allIds(c, out)
  return out
}

/** True if `ids` has exactly the shape of `tree`. */
export function sameShape(tree: Tree, ids: IdTree): boolean {
  return tree.length === ids.children.length && tree.every((c, i) => sameShape(c, ids.children[i]))
}

/** The id subtree at `path`. */
export function idsAt(ids: IdTree, path: Path): IdTree {
  let node = ids
  for (const i of path) node = node.children[i]
  return node
}

/** Copy a subtree with fresh ids, recording where each copy came from. */
function copyWithFreshIds(t: IdTree, born: Map<string, string>, newId: IdSource): IdTree {
  const id = newId()
  born.set(id, t.id)
  return { id, children: t.children.map((c) => copyWithFreshIds(c, born, newId)) }
}

/** Replace the subtree at `path`, keeping every ancestor's id. */
function replaceAt(ids: IdTree, path: Path, replacement: IdTree): IdTree {
  if (path.length === 0) return replacement
  const [i, ...rest] = path
  const children = ids.children.slice()
  children[i] = replaceAt(children[i], rest, replacement)
  return { id: ids.id, children }
}

/** Update the ids for one reduction step (`rule` fired at `path`). */
export function stepIds(ids: IdTree, step: { rule: Rule; path: Path }, newId: IdSource = defaultIds): IdStep {
  const redex = idsAt(ids, step.path)
  const [b0, y, z, ...rest] = redex.children
  const born = new Map<string, string>()
  const died = new Set<string>([redex.id, b0.id])
  let result: IdTree

  switch (step.rule) {
    case 'K': {
      // △△yz = y
      result = { id: y.id, children: [...y.children, ...rest] }
      allIds(z).forEach((id) => died.add(id))
      break
    }
    case 'S': {
      // △(△x)yz = yz(xz)
      const x = b0.children[0]
      const zCopy = copyWithFreshIds(z, born, newId)
      const xz: IdTree = { id: x.id, children: [...x.children, zCopy] }
      result = { id: y.id, children: [...y.children, z, xz, ...rest] }
      break
    }
    case 'F': {
      // △(△wx)yz = zwx
      const [w, x] = b0.children
      result = { id: z.id, children: [...z.children, w, x, ...rest] }
      allIds(y).forEach((id) => died.add(id))
      break
    }
  }

  return { ids: replaceAt(ids, step.path, result), born, died }
}
