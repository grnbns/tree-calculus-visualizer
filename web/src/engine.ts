// Tree calculus reduction rules (Jay, Reflective Programs in Tree Calculus, ch. 3).
// TypeScript port of reduction_logic.py; tests/cases.json checks the two agree.
//
// A tree is a list of its branches:
//   leaf  []        stem  [x]        fork  [w, x]
//   3 or more branches = a computation that needs reducing.
//
// Rules, chosen by the shape of the first branch:
//   K:  △△yz      = y
//   S:  △(△x)yz   = yz(xz)
//   F:  △(△wx)yz  = zwx
//
// Trees are `readonly`, so TypeScript refuses any attempt to modify one.
// Every function returns new arrays instead (the S rule copies z into two places).

export type Tree = readonly Tree[]
export type Rule = 'K' | 'S' | 'F'
export type Path = readonly number[]          // branch indices from the root; [] = root
export type Step = { tree: Tree; rule: Rule; path: Path }
export type Normalized = { tree: Tree; steps: number; finished: boolean }

export const LEAF = '△'

/** Return a NEW tree: `func` with `arg` attached as its last branch. */
export function apply(func: Tree, arg: Tree): Tree {
  return [...func, arg]
}

/** Apply `func` to each argument in turn: applyAll(f, a, b) means (f a) b. */
export function applyAll(func: Tree, ...args: Tree[]): Tree {
  let running = func
  for (const arg of args) {
    running = apply(running, arg)
  }
  return running
}

/** △-notation string, e.g. [[[]], [[]]] -> '△(△△)(△△)'.
 *  A branch that has branches of its own is wrapped in parentheses. */
export function show(tree: Tree): string {
  let result = LEAF
  for (const child of tree) {
    result += child.length === 0 ? show(child) : '(' + show(child) + ')'
  }
  return result
}

/** True if no node anywhere has 3 or more branches. */
export function isValue(tree: Tree): boolean {
  return tree.length < 3 && tree.every(isValue)
}

/** △△yz = y, with any branches after z applied to the result. */
export function kRule(redex: Tree): Tree {
  const y = redex[1]
  const rest = redex.slice(3)
  return applyAll(y, ...rest)
}

/** △(△x)yz = yz(xz), with any branches after z applied to the result. */
export function sRule(redex: Tree): Tree {
  const x = redex[0][0]
  const [, y, z] = redex
  const rest = redex.slice(3)
  return applyAll(apply(apply(y, z), apply(x, z)), ...rest)
}

/** △(△wx)yz = zwx, with any branches after z applied to the result. */
export function fRule(redex: Tree): Tree {
  const [w, x] = redex[0]
  const z = redex[2]
  const rest = redex.slice(3)
  return applyAll(z, w, x, ...rest)
}

/** If a rule applies at the root, return the result and the rule's name.
 *  No rule applies if the root has fewer than 3 branches, or if its first
 *  branch itself has 3+ branches (that must be reduced first). */
export function reduceRoot(tree: Tree): { tree: Tree; rule: Rule } | null {
  if (tree.length < 3) return null
  switch (tree[0].length) {
    case 0: return { tree: kRule(tree), rule: 'K' }
    case 1: return { tree: sRule(tree), rule: 'S' }
    case 2: return { tree: fRule(tree), rule: 'F' }
    default: return null
  }
}

/** One reduction step, leftmost-outermost: try the root, then each branch
 *  left to right. Returns null if no rule applies anywhere. */
export function step(tree: Tree): Step | null {
  const atRoot = reduceRoot(tree)
  if (atRoot !== null) {
    return { tree: atRoot.tree, rule: atRoot.rule, path: [] }
  }
  for (let i = 0; i < tree.length; i++) {
    const inner = step(tree[i])
    if (inner !== null) {
      return {
        tree: tree.with(i, inner.tree),
        rule: inner.rule,
        path: [i, ...inner.path],
      }
    }
  }
  return null
}

/** Step until nothing applies or `maxSteps` is reached.
 *  `finished` is false if it gave up at the step limit. */
export function normalize(tree: Tree, maxSteps = 1000): Normalized {
  let steps = 0
  while (true) {
    const result = step(tree)
    if (result === null) return { tree, steps, finished: true }
    if (steps >= maxSteps) return { tree, steps, finished: false }
    tree = result.tree
    steps++
  }
}

/** Every step from `tree` to its normal form (or until `maxSteps`).
 *  This is what the visualizer will play through. */
export function reductionSteps(tree: Tree, maxSteps = 1000): { steps: Step[]; finished: boolean } {
  const steps: Step[] = []
  while (true) {
    const result = step(tree)
    if (result === null) return { steps, finished: true }
    if (steps.length >= maxSteps) return { steps, finished: false }
    steps.push(result)
    tree = result.tree
  }
}

// --- Every redex, and reducing a chosen one (milestone 7) ---------------------

export type Redex = { path: Path; rule: Rule }

/** Every place a rule could fire, in leftmost-outermost order (a node before
 *  its branches, branches left to right). The first one is what `step` picks. */
export function allRedexes(tree: Tree): Redex[] {
  const found: Redex[] = []
  const visit = (t: Tree, path: Path) => {
    const r = reduceRoot(t)
    if (r !== null) found.push({ path, rule: r.rule })
    t.forEach((child, i) => visit(child, [...path, i]))
  }
  visit(tree, [])
  return found
}

/** Reduce the redex at `path` (instead of the leftmost-outermost one).
 *  Returns null if no rule applies at that node. */
export function stepAt(tree: Tree, path: Path): Step | null {
  const replace = (t: Tree, rest: Path): { tree: Tree; rule: Rule } | null => {
    if (rest.length === 0) return reduceRoot(t)
    const [i, ...more] = rest
    if (i < 0 || i >= t.length) return null
    const inner = replace(t[i], more)
    return inner && { tree: t.with(i, inner.tree), rule: inner.rule }
  }
  const r = replace(tree, path)
  return r && { tree: r.tree, rule: r.rule, path }
}

/** Number of nodes in a tree. */
export function size(tree: Tree): number {
  let n = 1
  for (const child of tree) n += size(child)
  return n
}
