// The workspace: several trees on screen at once (milestone 6).
//
// Pure data and pure functions, like the engine. Every action returns a new
// Workspace (plus what the scene needs to animate it), so undo is just
// "go back to the previous Workspace".

import { step, stepAt, type Path, type Rule, type Tree } from './engine'
import { addLeaf, attach, detach, removeBranch, subtreeAt } from './edit'
import { allIds, freshIds, idsAt, stepIds, type IdSource, type IdTree } from './ids'
import {
  NO_MARKS, carryMarks, chipsToUnfold, collapsedChips, insideIds, marksBelow, placeMarks, pruneMarks, revealDiff, sameTree, setExpanded,
  type Fragment, type Marks, type PathMark,
} from './marks'
import { layoutFor, type View } from './views'

export type PlacedTree = {
  key: string     // which tree this is (stays the same while the tree is edited)
  tree: Tree
  ids: IdTree
  x: number       // where its root sits on the canvas
  y: number
}

export type Workspace = {
  trees: readonly PlacedTree[]
  selected: string | null
  nextKey: number
  /** which nodes are variables, shown as chips (marks.ts); keyed by node id */
  marks: Marks
}

/** The result of an action: the new workspace, plus animation hints. */
export type Change = {
  ws: Workspace
  /** new node id -> id it was copied from (S rule copies) */
  born?: ReadonlyMap<string, string>
  /** node id -> id of the chip it disappears into (collapsing a variable) */
  absorbed?: ReadonlyMap<string, string>
  /** short explanation for the learner */
  message?: string
}

/** Horizontal space between neighbouring trees. */
export const TREE_GAP = 70

export function emptyWorkspace(): Workspace {
  return { trees: [], selected: null, nextKey: 1, marks: NO_MARKS }
}

/** Drop variable marks that no longer match (see marks.ts). Every action
 *  ends with this, so an edit inside a variable turns it back into nodes. */
function tidy(ws: Workspace): Workspace {
  const marks = pruneMarks(ws.trees, ws.marks)
  return marks === ws.marks ? ws : { ...ws, marks }
}

export function getTree(ws: Workspace, key: string | null): PlacedTree | undefined {
  return ws.trees.find((t) => t.key === key)
}

function update(ws: Workspace, key: string, f: (t: PlacedTree) => PlacedTree): Workspace {
  return { ...ws, trees: ws.trees.map((t) => (t.key === key ? f(t) : t)) }
}

/** Where a new tree goes: to the right of everything already there. */
function nextFreeX(ws: Workspace, tree: Tree, ids: IdTree, marks: Marks): number {
  if (ws.trees.length === 0) return 0
  const right = Math.max(...ws.trees.map((t) => t.x + layoutOf(t, ws.marks).bounds.maxX))
  return right + TREE_GAP - layoutOf({ tree, ids }, marks).bounds.minX
}

/** A tree's layout in a view (Tidy unless given), with its collapsed variables as single chips. */
export function layoutOf(t: { tree: Tree; ids: IdTree }, marks: Marks, view: View = 'tidy') {
  return layoutFor(view, t.tree, collapsedChips(t.ids, marks))
}

export function addTree(
  ws: Workspace, tree: Tree, newId: IdSource, at?: { x: number; y: number }, marks: readonly PathMark[] = [],
): Change {
  const key = `t${ws.nextKey}`
  const ids = freshIds(tree, newId)
  const all = placeMarks(ids, marks, new Map(ws.marks))
  const placed: PlacedTree = { key, tree, ids, x: at?.x ?? nextFreeX(ws, tree, ids, all), y: at?.y ?? 0 }
  return { ws: tidy({ trees: [...ws.trees, placed], selected: key, nextKey: ws.nextKey + 1, marks: all }) }
}

/** Add a copied or typed tree, with its variables, as a new tree. */
export function addFragment(ws: Workspace, frag: Fragment, newId: IdSource, at?: { x: number; y: number }): Change {
  return addTree(ws, frag.tree, newId, at, frag.marks)
}

/** Swap in a different tree (e.g. typed in the input box): all-new nodes. */
export function replaceTree(ws: Workspace, key: string, tree: Tree, newId: IdSource, marks: readonly PathMark[] = []): Change {
  const ids = freshIds(tree, newId)
  const next = update(ws, key, (t) => ({ ...t, tree, ids }))
  return { ws: tidy({ ...next, marks: placeMarks(ids, marks, new Map(ws.marks)) }) }
}

function withoutTree(ws: Workspace, key: string): Workspace {
  const trees = ws.trees.filter((t) => t.key !== key)
  const selected = ws.selected === key ? (trees.at(-1)?.key ?? null) : ws.selected
  return { ...ws, trees, selected }
}

export function removeTree(ws: Workspace, key: string): Change {
  return { ws: tidy(withoutTree(ws, key)) }
}

export function selectTree(ws: Workspace, key: string): Workspace {
  return ws.selected === key ? ws : { ...ws, selected: key }
}

export function moveTree(ws: Workspace, key: string, x: number, y: number): Change {
  return { ws: update(ws, key, (t) => ({ ...t, x, y })) }
}

const where = (path: Path) => (path.length ? `at [${path.join(', ')}]` : 'at the root')

function describeNode(t: Tree): string {
  return ['a leaf', 'a stem', 'a fork'][t.length] ?? `a computation (${t.length} branches)`
}

/** Click in Add mode: the node gets a new leaf branch. */
export function addLeafAt(ws: Workspace, key: string, path: Path, newId: IdSource): Change {
  const placed = getTree(ws, key)!
  const r = addLeaf(placed.tree, placed.ids, path, newId)
  const node = subtreeAt(r.tree, path)
  let message = `Added a leaf ${where(path)}: that node is applied to △ and is now ${describeNode(node)}.`
  if (node.length >= 3) {
    const s = step(r.tree)
    message += s ? ` It can now reduce: the next step is the ${s.rule} rule ${where(s.path)}.` : ''
  }
  return { ws: tidy(selectTree(update(ws, key, (t) => ({ ...t, ...r })), key)), message }
}

/** Click in Remove mode: a branch disappears, or the whole tree if it's the root. */
export function removeAt(ws: Workspace, key: string, path: Path): Change {
  if (path.length === 0) return { ...removeTree(ws, key), message: 'Removed the whole tree.' }
  const placed = getTree(ws, key)!
  const r = removeBranch(placed.tree, placed.ids, path)
  return {
    ws: tidy(selectTree(update(ws, key, (t) => ({ ...t, tree: r.tree, ids: r.ids })), key)),
    message: `Removed the branch ${where(path)}${r.died.size > 1 ? ` (${r.died.size} nodes)` : ''}.`,
  }
}

/** Drop tree `source` onto a node of tree `target`: that node is applied to it. */
export function joinTrees(ws: Workspace, source: string, target: string, path: Path): Change {
  if (source === target) throw new Error('cannot join a tree to itself')
  const from = getTree(ws, source)!
  const into = getTree(ws, target)!
  const r = attach(into.tree, into.ids, path, from.tree, from.ids)
  const joined = update(withoutTree(ws, source), target, (t) => ({ ...t, ...r }))
  const node = subtreeAt(r.tree, path)
  const s = step(r.tree)
  let message = `Applied the node ${where(path)} to the dropped tree; it now has ${node.length} branches.`
  if (s) message += ` Next step: the ${s.rule} rule ${where(s.path)}.`
  return { ws: tidy({ ...joined, selected: target }), message }
}

/** Tear the branch at `path` off into a tree of its own, rooted at (x, y). */
export function tearOff(ws: Workspace, key: string, path: Path, x: number, y: number): Change & { newKey: string } {
  const placed = getTree(ws, key)!
  const d = detach(placed.tree, placed.ids, path)
  const newKey = `t${ws.nextKey}`
  const torn: PlacedTree = { key: newKey, tree: d.sub, ids: d.subIds, x, y }
  const trees = [...update(ws, key, (t) => ({ ...t, tree: d.tree, ids: d.ids })).trees, torn]
  return {
    ws: tidy({ ...ws, trees, selected: newKey, nextKey: ws.nextKey + 1 }),
    newKey,
    message: `Tore off the branch ${where(path)} as a tree of its own.`,
  }
}

/** One reduction step on one tree: the leftmost-outermost redex, or the one
 *  at `at` if given. */
export function stepTree(
  ws: Workspace, key: string, newId: IdSource, at?: Path,
): (Change & { rule: Rule; path: Path }) | null {
  const placed = getTree(ws, key)
  if (!placed) return null
  const s = at ? stepAt(placed.tree, at) : step(placed.tree)
  if (!s) return null
  const r = stepIds(placed.ids, s, newId)
  const next = update(ws, key, (t) => ({ ...t, tree: s.tree, ids: r.ids }))
  return {
    ws: tidy({ ...next, marks: carryMarks(ws.marks, r.born) }),
    born: r.born,
    rule: s.rule,
    path: s.path,
  }
}

/** Every node id in the workspace (for checks). */
export function allWorkspaceIds(ws: Workspace): string[] {
  return ws.trees.flatMap((t) => allIds(t.ids))
}

// --- Copy, paste and variables (milestone 9) ------------------------------------

/** Paste `frag` onto the node at `path`: that node is applied to it, like a join. */
export function pasteOnto(ws: Workspace, key: string, path: Path, frag: Fragment, newId: IdSource): Change {
  const into = getTree(ws, key)!
  const subIds = freshIds(frag.tree, newId)
  const r = attach(into.tree, into.ids, path, frag.tree, subIds)
  const next = update(ws, key, (t) => ({ ...t, ...r }))
  const node = subtreeAt(r.tree, path)
  const s = step(r.tree)
  let message = `Pasted onto the node ${where(path)}: it is applied to the pasted tree and now has ${node.length} branches.`
  if (s) message += ` Next step: the ${s.rule} rule ${where(s.path)}.`
  return { ws: tidy({ ...next, selected: key, marks: placeMarks(subIds, frag.marks, new Map(ws.marks)) }), message }
}

/** Mark the subtree at `path` as variable `name` and collapse it to a chip. */
export function nameAt(ws: Workspace, key: string, path: Path, name: string): Change {
  const placed = getTree(ws, key)!
  const node = idsAt(placed.ids, path)
  const mark = { name, def: subtreeAt(placed.tree, path), expanded: false }
  const marks = new Map(ws.marks).set(node.id, mark)
  const absorbed = new Map(insideIds(node, mark).map((id) => [id, node.id]))
  return { ws: tidy(selectTree({ ...ws, marks }, key)), absorbed, message: `Named this tree ${name}. Type ${name} or use the Add menu to make more.` }
}

/** Show a chip's insides. Its nodes sprout out of the chip. */
export function expandChip(ws: Workspace, key: string, chipId: string): Change {
  const placed = getTree(ws, key)!
  const m = ws.marks.get(chipId)
  if (!m) return { ws }
  const node = findIds(placed.ids, chipId)!
  const born = new Map(insideIds(node, m).map((id) => [id, chipId]))
  return { ws: { ...ws, marks: setExpanded(ws.marks, [chipId], true) }, born, message: `Expanded ${m.name}.` }
}

/** Fold an expanded variable back into its chip. */
export function collapseChip(ws: Workspace, key: string, chipId: string): Change {
  const placed = getTree(ws, key)!
  const m = ws.marks.get(chipId)
  if (!m) return { ws }
  const node = findIds(placed.ids, chipId)!
  const absorbed = new Map(insideIds(node, m).map((id) => [id, chipId]))
  return { ws: { ...ws, marks: setExpanded(ws.marks, [chipId], false) }, absorbed, message: `Collapsed ${m.name}.` }
}

/** Before reducing the redex at `path`: unfold the chips the rule must look
 *  inside (see chipsToUnfold). Null if there are none. */
export function unfoldFor(ws: Workspace, key: string, path: Path): (Change & { names: string[] }) | null {
  const placed = getTree(ws, key)
  if (!placed) return null
  const chips = chipsToUnfold(placed.ids, ws.marks, path)
  if (chips.length === 0) return null
  const born = new Map<string, string>()
  for (const id of chips) {
    for (const inner of insideIds(findIds(placed.ids, id)!, ws.marks.get(id)!)) if (!born.has(inner)) born.set(inner, id)
  }
  return {
    ws: { ...ws, marks: setExpanded(ws.marks, chips, true) },
    born,
    names: chips.map((id) => ws.marks.get(id)!.name),
  }
}

/** A variable a result might turn out to be (milestone 10). */
export type Candidate = { readonly name: string; readonly def: Tree }

/** If the whole tree `key` is exactly one of `candidates` (the first that
 *  matches wins), show it as that variable's chip. Null if none matches, or
 *  if the whole tree already shows as one of the candidates. Any other chip
 *  at the root gives way: K applied to I becomes False, a bare K becomes True. */
export function recogniseResult(ws: Workspace, key: string, candidates: readonly Candidate[]): (Change & { name: string }) | null {
  const placed = getTree(ws, key)
  if (!placed) return null
  const current = ws.marks.get(placed.ids.id)
  if (current && sameTree(current.def, placed.tree) && candidates.some((c) => c.name === current.name)) return null
  const found = candidates.find((c) => sameTree(c.def, placed.tree))
  if (!found) return null
  const mark = { name: found.name, def: found.def, expanded: false }
  const marks = new Map(ws.marks).set(placed.ids.id, mark)
  const { absorbed } = revealDiff(placed.ids, ws.marks, marks)
  return {
    ws: { ...ws, marks },
    absorbed,
    name: found.name,
    message: `The result is exactly ${found.name}.`,
  }
}

function findIds(t: IdTree, id: string): IdTree | undefined {
  if (t.id === id) return t
  for (const c of t.children) {
    const found = findIds(c, id)
    if (found) return found
  }
  return undefined
}

// --- Keeping trees apart --------------------------------------------------------

/** Space kept between a growing tree's footprint (its nodes, chips and
 *  badges) and the trees it pushes aside. */
export const PUSH_GAP = 16

type Box = { minX: number; maxX: number; minY: number; maxY: number }

function boxOf(t: PlacedTree, marks: Marks, view: View): Box {
  const b = layoutOf(t, marks, view).box
  return { minX: b.minX + t.x, maxX: b.maxX + t.x, minY: b.minY + t.y, maxY: b.maxY + t.y }
}

/** Push the other trees sideways, out of the way of tree `key` (e.g. while it
 *  grows during a reduction). Trees to its right move right, trees to its left
 *  move left, and a pushed tree pushes the next one along. Trees only ever
 *  move away: nothing is pulled back when `key` shrinks. */
export function makeRoom(ws: Workspace, key: string, view: View = 'tidy'): Workspace {
  const me = getTree(ws, key)
  if (!me || ws.trees.length < 2) return ws
  const mine = boxOf(me, ws.marks, view)
  const centre = (mine.minX + mine.maxX) / 2
  const overlapsY = (a: Box, b: Box) => a.minY < b.maxY + PUSH_GAP && b.minY < a.maxY + PUSH_GAP
  const moved = new Map<string, number>()   // key -> new x

  for (const side of [1, -1] as const) {
    const others = ws.trees
      .filter((t) => t.key !== key)
      .map((t) => ({ t, box: boxOf(t, ws.marks, view) }))
      .filter(({ box }) => Math.sign((box.minX + box.maxX) / 2 - centre || 1) === side)
      .sort((a, b) => side * (a.box.minX - b.box.minX))
    const obstacles: Box[] = [mine]
    for (const { t, box } of others) {
      let shift = 0
      for (const o of obstacles) {
        if (!overlapsY(o, box)) continue
        shift = side === 1
          ? Math.max(shift, o.maxX + PUSH_GAP - box.minX)
          : Math.max(shift, box.maxX - (o.minX - PUSH_GAP))
      }
      const dx = side * shift
      if (dx !== 0) moved.set(t.key, t.x + dx)
      obstacles.push({ ...box, minX: box.minX + dx, maxX: box.maxX + dx })
    }
  }
  if (moved.size === 0) return ws
  return { ...ws, trees: ws.trees.map((t) => (moved.has(t.key) ? { ...t, x: moved.get(t.key)! } : t)) }
}

/** Where the trees are *drawn* in a view: like makeRoom around the selected
 *  tree (or the first), so trees placed for another view, or recorded in
 *  undo snapshots and run frames, never overlap. Only for display: nothing
 *  stored changes, and trees are only ever pushed apart. */
export function spreadApart(ws: Workspace, view: View): Workspace {
  const key = getTree(ws, ws.selected)?.key ?? ws.trees[0]?.key
  return key === undefined ? ws : makeRoom(ws, key, view)
}

/** Expand (or collapse) every variable in the subtree at `path`, the node's
 *  own included. Nodes sprout out of (or slide into) their chips. */
export function setAllBelow(ws: Workspace, key: string, path: Path, expanded: boolean): Change {
  const placed = getTree(ws, key)!
  const ids = marksBelow(placed.ids, ws.marks, path)
  const marks = setExpanded(ws.marks, ids, expanded)
  const { born, absorbed } = revealDiff(placed.ids, ws.marks, marks)
  return {
    ws: { ...ws, marks },
    born,
    absorbed,
    message: `${expanded ? 'Expanded' : 'Collapsed'} every variable ${path.length ? `under [${path.join(', ')}]` : 'in this tree'}.`,
  }
}
