// Variables on screen (milestone 9): which subtrees show as a collapsed chip.
//
// Like ids (ids.ts), this lives BESIDE the trees, so the engine stays pure.
// `Marks` maps a node id to a VarMark: "this node, together with its first
// n branches, is variable V", where n is the number of branches V's
// definition has (its arity). Any branches after those are arguments V is
// applied to; they hang below the chip as ordinary branches. That matters
// because a rule hands the leftover arguments to the subtree that survives
// (K: △△yz rest = y rest), and that subtree keeps its id: a chip `y` stays a
// chip, now with arguments.
//
// A collapsed chip hides everything in its own branches. Marks are carried
// through reduction steps by id; S-copies copy the chip. A mark whose subtree
// no longer matches its definition (it was edited, or a rule took it apart)
// is dropped by pruneMarks.

import type { Path, Tree } from './engine'
import { idsAt, type IdTree } from './ids'

export type VarMark = {
  readonly name: string
  /** what the name meant when it was used (redefining V later doesn't change it) */
  readonly def: Tree
  /** shown with its insides (true) or as a single chip (false) */
  readonly expanded: boolean
}

export type Marks = ReadonlyMap<string, VarMark>
export const NO_MARKS: Marks = new Map()

/** A mark at a path (relative to some root), for trees without ids yet. */
export type PathMark = { readonly path: Path; readonly mark: VarMark }

/** A tree plus the variables in it: what gets copied, pasted and named. */
export type Fragment = { readonly tree: Tree; readonly marks: readonly PathMark[] }

/** How many of the node's branches belong to the variable itself. */
export const arity = (m: VarMark): number => m.def.length

export const pathKey = (path: Path): string => path.join('.')

export function sameTree(a: Tree, b: Tree): boolean {
  return a === b || (a.length === b.length && a.every((c, i) => sameTree(c, b[i])))
}

/** True if `t` is still variable `m` (possibly applied to more arguments). */
export function fits(t: Tree, m: VarMark): boolean {
  return t.length >= m.def.length && m.def.every((c, i) => sameTree(t[i], c))
}

/** Marks for a freshly id'd tree, from marks given by path. */
export function placeMarks(ids: IdTree, marks: readonly PathMark[], into = new Map<string, VarMark>()): Map<string, VarMark> {
  for (const { path, mark } of marks) into.set(idsAt(ids, path).id, mark)
  return into
}

/** The marks inside the subtree at `path`, by path relative to it. */
export function fragmentAt(tree: Tree, ids: IdTree, marks: Marks, path: Path = []): Fragment {
  let sub = tree
  for (const i of path) sub = sub[i]
  const found: PathMark[] = []
  const visit = (t: IdTree, p: Path) => {
    const m = marks.get(t.id)
    if (m) found.push({ path: p, mark: m })
    t.children.forEach((c, i) => visit(c, [...p, i]))
  }
  visit(idsAt(ids, path), [])
  return { tree: sub, marks: found }
}

/** Drop marks whose node is gone or no longer matches its definition. */
export function pruneMarks(trees: readonly { tree: Tree; ids: IdTree }[], marks: Marks): Marks {
  if (marks.size === 0) return marks
  const kept = new Map<string, VarMark>()
  const visit = (t: Tree, ids: IdTree) => {
    const m = marks.get(ids.id)
    if (m && fits(t, m)) kept.set(ids.id, m)
    t.forEach((c, i) => visit(c, ids.children[i]))
  }
  for (const t of trees) visit(t.tree, t.ids)
  return kept.size === marks.size ? marks : kept
}

/** After a reduction step: a copy of a chip (S rule) is a chip too. */
export function carryMarks(marks: Marks, born: ReadonlyMap<string, string>): Marks {
  let out: Map<string, VarMark> | null = null
  for (const [id, origin] of born) {
    const m = marks.get(origin)
    if (!m) continue
    out ??= new Map(marks)
    out.set(id, m)
  }
  return out ?? marks
}

/** Collapsed chips that a rule firing at `path` has to look inside, so they
 *  must unfold first:
 *  - the redex lies inside a chip's own branches (not in its arguments)
 *  - the redex is a chip's node (the rule reads its first branch)
 *  - the redex's first branch b0 is a chip (its shape picks K, S or F, and
 *    S and F take it apart)
 *  A chip that is only moved or copied (as y, z, w, x or a later argument)
 *  stays collapsed. Outermost first. */
export function chipsToUnfold(ids: IdTree, marks: Marks, path: Path): string[] {
  const out: string[] = []
  const collapsed = (n: IdTree) => {
    const m = marks.get(n.id)
    return m && !m.expanded ? m : undefined
  }
  let node = ids
  for (const i of path) {
    const m = collapsed(node)
    if (m && i < arity(m)) out.push(node.id)
    node = node.children[i]
  }
  if (collapsed(node)) out.push(node.id)
  const b0 = node.children[0]
  if (b0 && collapsed(b0)) out.push(b0.id)
  return out
}

/** Set chips to expanded (true) or collapsed (false). */
export function setExpanded(marks: Marks, chipIds: readonly string[], expanded: boolean): Marks {
  const out = new Map(marks)
  for (const id of chipIds) {
    const m = out.get(id)
    if (m) out.set(id, { ...m, expanded })
  }
  return out
}

/** Ids inside a variable's own branches (what a collapsed chip hides). */
export function insideIds(ids: IdTree, m: VarMark): string[] {
  const out: string[] = []
  const all = (t: IdTree) => { out.push(t.id); t.children.forEach(all) }
  ids.children.slice(0, arity(m)).forEach(all)
  return out
}

/** Marked nodes whose variable contains the node at `path` (the node itself
 *  or something in its own branches), innermost first. Only visible ones:
 *  the walk stops at a collapsed chip. */
export function enclosingMarks(ids: IdTree, marks: Marks, path: Path): string[] {
  const out: string[] = []
  let node = ids
  for (let k = 0; ; k++) {
    const m = marks.get(node.id)
    if (m && (k === path.length || path[k] < arity(m))) out.push(node.id)
    if (k === path.length) break
    if (m && !m.expanded && path[k] < arity(m)) break   // hidden below here
    node = node.children[path[k]]
  }
  return out.reverse()
}

export type Chip = { readonly id: string; readonly name: string; readonly arity: number }

/** Every visible collapsed chip, by path key (see pathKey). */
export function collapsedChips(ids: IdTree, marks: Marks): Map<string, Chip> {
  const out = new Map<string, Chip>()
  if (marks.size === 0) return out
  const visit = (t: IdTree, path: Path) => {
    const m = marks.get(t.id)
    const from = m && !m.expanded ? arity(m) : 0
    if (m && !m.expanded) out.set(pathKey(path), { id: t.id, name: m.name, arity: from })
    for (let i = from; i < t.children.length; i++) visit(t.children[i], [...path, i])
  }
  visit(ids, [])
  return out
}

/** Is the node at `path` hidden inside a collapsed chip? */
export function isHidden(ids: IdTree, marks: Marks, path: Path): boolean {
  let node = ids
  for (const i of path) {
    const m = marks.get(node.id)
    if (m && !m.expanded && i < arity(m)) return true
    node = node.children[i]
  }
  return false
}
