// A reduction run (milestone 7): stepping one tree, watched like a video.
//
// A run is the list of workspace states ("frames") from the moment you
// started stepping a tree: frame 0 is before the first step. You can move
// back and forth through the frames without losing any (unlike undo), and
// step on past the end. To the undo history, a whole run is ONE action.
//
// Pure functions, like workspace.ts.

import { size, step, type Path, type Rule } from './engine'
import { allIds, type IdSource } from './ids'
import { getTree, makeRoom, recogniseResult, stepTree, unfoldFor, type Candidate, type Workspace } from './workspace'

export type Frame = {
  ws: Workspace
  /** the step that led to this frame (none for frame 0) */
  rule?: Rule
  path?: Path
  /** S-rule copies made by that step: new id -> origin id (for an unfold:
   *  the chip's insides -> the chip) */
  born?: ReadonlyMap<string, string>
  /** instead of a rule: these variables unfolded, because the next rule
   *  needs to look inside them (milestone 9) */
  unfold?: readonly string[]
  /** instead of a rule: the normal form turned out to be this variable,
   *  so it folded into its chip (`absorbed`: its nodes -> the chip) */
  recognised?: string
  absorbed?: ReadonlyMap<string, string>
}

export type Run = {
  treeKey: string
  frames: readonly Frame[]
  pos: number
  /** variables the normal form may turn out to be (first match wins) */
  recognise?: readonly Candidate[]
}

/** Play stops after this many steps in one run (a tree may never finish). */
export const MAX_RUN_STEPS = 200
/** ...or when the tree grows past this many nodes (S copies trees). */
export const MAX_NODES = 1500

export type Moved = { run: Run; born?: ReadonlyMap<string, string>; absorbed?: ReadonlyMap<string, string> }
export type Stopped = { stopped: 'normal' | 'limit' | 'size'; message: string }

export function startRun(ws: Workspace, treeKey: string, recognise: readonly Candidate[] = []): Run {
  return { treeKey, frames: [{ ws }], pos: 0, recognise }
}

export function currentWs(run: Run): Workspace {
  return run.frames[run.pos].ws
}

export const atEnd = (run: Run) => run.pos === run.frames.length - 1

/** One step forward: replay a frame that's already there, or reduce. */
export function forward(run: Run, newId: IdSource): Moved | Stopped {
  if (!atEnd(run)) {
    const pos = run.pos + 1
    const f = run.frames[pos]
    return { run: { ...run, pos }, born: f.born, absorbed: f.absorbed }
  }
  return reduce(run, newId)
}

/** How many rule steps (not unfolds) lead up to frame `pos`. */
export function stepsBefore(run: Run, pos = run.pos): number {
  return run.frames.slice(1, pos + 1).filter((f) => f.rule).length
}

/** Reduce the selected tree (at `at`, or leftmost-outermost), dropping any
 *  frames after the current one first. If the rule needs to look inside a
 *  collapsed variable, this records two frames: the unfold, then the step;
 *  and moves to the unfold (the next `forward` shows the step). */
export function reduce(run: Run, newId: IdSource, at?: Path): Moved | Stopped {
  const ws = currentWs(run)
  const steps = stepsBefore(run)
  if (steps >= MAX_RUN_STEPS) {
    return { stopped: 'limit', message: `Stopped after ${steps} steps: this tree may never reach a normal form.` }
  }
  const tree = getTree(ws, run.treeKey)?.tree
  if (tree && size(tree) > MAX_NODES) {
    return { stopped: 'size', message: `Stopped: the tree has grown past ${MAX_NODES} nodes.` }
  }
  const path = at ?? (tree && step(tree)?.path)
  const unfold = path ? unfoldFor(ws, run.treeKey, path) : null
  // A growing tree pushes the other trees aside instead of overlapping them.
  const unfolded = unfold && makeRoom(unfold.ws, run.treeKey)
  const s = path ? stepTree(unfolded ?? ws, run.treeKey, newId, path) : null
  if (!s) {
    return {
      stopped: 'normal',
      message: steps ? `Reached a normal form after ${steps} step${steps === 1 ? '' : 's'}.` : 'Nothing to reduce: this tree is a value.',
    }
  }
  const added: Frame[] = []
  if (unfold && unfolded) added.push({ ws: unfolded, unfold: unfold.names, born: unfold.born })
  const stepped = makeRoom(s.ws, run.treeKey)
  added.push({ ws: stepped, rule: s.rule, path: s.path, born: s.born })
  // At a normal form, the result may be exactly a variable: fold it into its chip.
  const done = getTree(stepped, run.treeKey)
  const known = done && step(done.tree) === null ? recogniseResult(stepped, run.treeKey, run.recognise ?? []) : null
  if (known) added.push({ ws: known.ws, recognised: known.name, absorbed: known.absorbed })
  const frames = [...run.frames.slice(0, run.pos + 1), ...added]
  return { run: { ...run, frames, pos: run.pos + 1 }, born: added[0].born }
}

/** Stepping back over unfolds: the chips' insides fold back into them. */
function absorbedBetween(run: Run, to: number): Map<string, string> {
  const absorbed = new Map<string, string>()
  for (let i = run.pos; i > to; i--) {
    const f = run.frames[i]
    if (f.unfold) for (const [inner, chip] of f.born ?? []) absorbed.set(inner, chip)
  }
  return absorbed
}

/** Stepping back over a recognised result: its nodes come out of the chip again. */
function bornBetween(run: Run, to: number): Map<string, string> {
  const born = new Map<string, string>()
  for (let i = run.pos; i > to; i--) for (const [inner, chip] of run.frames[i].absorbed ?? []) born.set(inner, chip)
  return born
}

export function back(run: Run): Moved | null {
  return run.pos > 0
    ? { run: { ...run, pos: run.pos - 1 }, absorbed: absorbedBetween(run, run.pos - 1), born: bornBetween(run, run.pos - 1) }
    : null
}

/** Jump to frame `pos`. Nodes copied along the way sprout from the oldest
 *  ancestor still on screen, so a big jump still animates sensibly. */
export function seek(run: Run, pos: number): Moved {
  pos = Math.max(0, Math.min(pos, run.frames.length - 1))
  if (pos <= run.pos) return { run: { ...run, pos }, absorbed: absorbedBetween(run, pos), born: bornBetween(run, pos) }
  const onScreen = new Set(getTree(currentWs(run), run.treeKey) ? allIds(getTree(currentWs(run), run.treeKey)!.ids) : [])
  const merged = new Map<string, string>()
  for (let i = run.pos + 1; i <= pos; i++) for (const [k, v] of run.frames[i].born ?? []) merged.set(k, v)
  const born = new Map<string, string>()
  for (const id of merged.keys()) {
    let origin = merged.get(id)
    while (origin !== undefined && !onScreen.has(origin)) origin = merged.get(origin)
    if (origin !== undefined) born.set(id, origin)
  }
  return { run: { ...run, pos }, born }
}

/** Short description of frame `i`, e.g. "Step 3 of 16: K at [1, 0]". */
export function describeFrame(run: Run, i = run.pos): string {
  // Numbers count rule steps only: unfolds and a recognised result aren't steps.
  const k = stepsBefore(run, i)
  if (i === 0) return 'Start'
  const f = run.frames[i]
  if (f.recognised) return `After step ${k}: the result is exactly ${f.recognised}`
  if (f.unfold) return `Before step ${k + 1}: unfold ${f.unfold.join(', ')}, because the rule looks inside`
  const where = f.path && f.path.length ? `at [${f.path.join(', ')}]` : 'at the root'
  return `Step ${k}: ${f.rule} rule ${where}`
}

// --- Half-steps (with colours on) -----------------------------------------------
//
// With colours on, the unfold frames are shown by the preview itself, so
// moving through a run skips them.

/** The next rule frame after `pos`, skipping unfold frames; null if none recorded. */
export function nextRuleFrame(run: Run, pos = run.pos): number | null {
  for (let i = pos + 1; i < run.frames.length; i++) {
    if (run.frames[i].rule) return i
    if (!run.frames[i].unfold) return null
  }
  return null
}

/** The frame before the rule at `pos`, skipping unfold frames. */
export function beforeRule(run: Run, pos = run.pos): number {
  let i = pos - 1
  while (i > 0 && run.frames[i].unfold) i--
  return Math.max(i, 0)
}
