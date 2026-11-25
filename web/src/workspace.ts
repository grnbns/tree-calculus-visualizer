// The workspace: several trees on screen at once (milestone 6).
//
// Pure data and pure functions, like the engine. Every action returns a new
// Workspace (plus what the scene needs to animate it), so undo is just
// "go back to the previous Workspace".

import { step, stepAt, type Path, type Rule, type Tree } from './engine'
import { addLeaf, attach, detach, removeBranch, subtreeAt } from './edit'
import { allIds, freshIds, stepIds, type IdSource, type IdTree } from './ids'
import { layoutTree } from './render'

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
}

/** The result of an action: the new workspace, plus animation hints. */
export type Change = {
  ws: Workspace
  /** new node id -> id it was copied from (S rule copies) */
  born?: ReadonlyMap<string, string>
  /** short explanation for the learner */
  message?: string
}

/** Horizontal space between neighbouring trees. */
export const TREE_GAP = 70

export function emptyWorkspace(): Workspace {
  return { trees: [], selected: null, nextKey: 1 }
}

export function getTree(ws: Workspace, key: string | null): PlacedTree | undefined {
  return ws.trees.find((t) => t.key === key)
}

function update(ws: Workspace, key: string, f: (t: PlacedTree) => PlacedTree): Workspace {
  return { ...ws, trees: ws.trees.map((t) => (t.key === key ? f(t) : t)) }
}

/** Where a new tree goes: to the right of everything already there. */
function nextFreeX(ws: Workspace, tree: Tree): number {
  if (ws.trees.length === 0) return 0
  const right = Math.max(...ws.trees.map((t) => t.x + layoutTree(t.tree).bounds.maxX))
  return right + TREE_GAP - layoutTree(tree).bounds.minX
}

export function addTree(ws: Workspace, tree: Tree, newId: IdSource, at?: { x: number; y: number }): Change {
  const key = `t${ws.nextKey}`
  const placed: PlacedTree = { key, tree, ids: freshIds(tree, newId), x: at?.x ?? nextFreeX(ws, tree), y: at?.y ?? 0 }
  return { ws: { trees: [...ws.trees, placed], selected: key, nextKey: ws.nextKey + 1 } }
}

/** Swap in a different tree (e.g. typed in the input box): all-new nodes. */
export function replaceTree(ws: Workspace, key: string, tree: Tree, newId: IdSource): Change {
  return { ws: update(ws, key, (t) => ({ ...t, tree, ids: freshIds(tree, newId) })) }
}

export function removeTree(ws: Workspace, key: string): Change {
  const trees = ws.trees.filter((t) => t.key !== key)
  const selected = ws.selected === key ? (trees.at(-1)?.key ?? null) : ws.selected
  return { ws: { ...ws, trees, selected } }
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
  return { ws: selectTree(update(ws, key, (t) => ({ ...t, ...r })), key), message }
}

/** Click in Remove mode: a branch disappears, or the whole tree if it's the root. */
export function removeAt(ws: Workspace, key: string, path: Path): Change {
  if (path.length === 0) return { ...removeTree(ws, key), message: 'Removed the whole tree.' }
  const placed = getTree(ws, key)!
  const r = removeBranch(placed.tree, placed.ids, path)
  return {
    ws: selectTree(update(ws, key, (t) => ({ ...t, tree: r.tree, ids: r.ids })), key),
    message: `Removed the branch ${where(path)}${r.died.size > 1 ? ` (${r.died.size} nodes)` : ''}.`,
  }
}

/** Drop tree `source` onto a node of tree `target`: that node is applied to it. */
export function joinTrees(ws: Workspace, source: string, target: string, path: Path): Change {
  if (source === target) throw new Error('cannot join a tree to itself')
  const from = getTree(ws, source)!
  const into = getTree(ws, target)!
  const r = attach(into.tree, into.ids, path, from.tree, from.ids)
  const joined = update(removeTree(ws, source).ws, target, (t) => ({ ...t, ...r }))
  const node = subtreeAt(r.tree, path)
  const s = step(r.tree)
  let message = `Applied the node ${where(path)} to the dropped tree; it now has ${node.length} branches.`
  if (s) message += ` Next step: the ${s.rule} rule ${where(s.path)}.`
  return { ws: { ...joined, selected: target }, message }
}

/** Tear the branch at `path` off into a tree of its own, rooted at (x, y). */
export function tearOff(ws: Workspace, key: string, path: Path, x: number, y: number): Change & { newKey: string } {
  const placed = getTree(ws, key)!
  const d = detach(placed.tree, placed.ids, path)
  const newKey = `t${ws.nextKey}`
  const torn: PlacedTree = { key: newKey, tree: d.sub, ids: d.subIds, x, y }
  const trees = [...update(ws, key, (t) => ({ ...t, tree: d.tree, ids: d.ids })).trees, torn]
  return {
    ws: { trees, selected: newKey, nextKey: ws.nextKey + 1 },
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
  return {
    ws: update(ws, key, (t) => ({ ...t, tree: s.tree, ids: r.ids })),
    born: r.born,
    rule: s.rule,
    path: s.path,
  }
}

/** Every node id in the workspace (for checks). */
export function allWorkspaceIds(ws: Workspace): string[] {
  return ws.trees.flatMap((t) => allIds(t.ids))
}
