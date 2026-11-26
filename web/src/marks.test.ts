import { describe, it, expect } from 'vitest'
import { step, stepAt, type Path } from './engine'
import { allIds, freshIds, idSource, idsAt, stepIds } from './ids'
import { parseNamed } from './parser'
import {
  hiddenBy, marksBelow, openVariables, revealDiff,
  carryMarks, chipsToUnfold, collapsedChips, enclosingMarks, fits, fragmentAt, insideIds,
  isHidden, placeMarks, pruneMarks, setExpanded, type Marks, type VarMark,
} from './marks'

/** Parse with names, give ids, place the marks. */
function setup(text: string, lookup?: Parameters<typeof parseNamed>[1]) {
  const p = parseNamed(text, lookup)
  const ids = freshIds(p.tree, idSource('m'))
  return { tree: p.tree, ids, marks: placeMarks(ids, p.marks) as Marks }
}

const nameAt = (ids: ReturnType<typeof setup>['ids'], marks: Marks, path: Path) => marks.get(idsAt(ids, path).id)?.name

// A user variable V = △△△ (a fork: arity 2), for tests.
const V = parseNamed('△△△')
function builtin(name: string) {
  try { return parseNamed(name) } catch { return undefined }
}

describe('marks from parsing', () => {
  it('mark each use of a name at its node', () => {
    const { ids, marks } = setup('S K K △')
    expect(nameAt(ids, marks, [])).toBe('S')      // S applied to 3 arguments: same node
    // S = D(K D)(D K(K D)) has 4 branches of its own, so the arguments are branches 4, 5, 6
    expect(nameAt(ids, marks, [4])).toBe('K')
    expect(nameAt(ids, marks, [5])).toBe('K')
    expect(nameAt(ids, marks, [6])).toBeUndefined()
  })

  it('include the names a definition was built from (hidden while collapsed)', () => {
    const { ids, marks } = setup('S')
    // S = D(K D)(D K(K D)): D at the root is dropped (S wins); D has 2
    // branches, so K D is branch 2 and D K (K D) is branch 3.
    expect(nameAt(ids, marks, [])).toBe('S')
    expect(nameAt(ids, marks, [2])).toBe('K')
    expect(nameAt(ids, marks, [2, 1])).toBe('D')
    expect(nameAt(ids, marks, [3])).toBe('D')
    expect(nameAt(ids, marks, [3, 3, 1])).toBe('D')
    expect(isHidden(ids, marks, [2])).toBe(true)
    expect([...collapsedChips(ids, marks).keys()]).toEqual([''])
  })

  it('every mark fits its subtree', () => {
    const { tree, ids, marks } = setup('S K (I △) (D K)')
    expect(pruneMarks([{ tree, ids }], marks)).toBe(marks)
  })
})

describe('fits and pruneMarks', () => {
  const m: VarMark = { name: 'K', def: [[]], expanded: false }
  it('a variable applied to more arguments still fits', () => {
    expect(fits([[]], m)).toBe(true)
    expect(fits([[], [[]]], m)).toBe(true)
    expect(fits([], m)).toBe(false)
    expect(fits([[[]]], m)).toBe(false)
  })

  it('drops marks of changed or vanished nodes', () => {
    const { tree, ids, marks } = setup('K △')
    const changed = [[[]], []]   // K's own leaf grew a branch
    expect(pruneMarks([{ tree: changed, ids: freshIds(changed, idSource('z')) }], marks).size).toBe(0)
    expect(pruneMarks([], marks).size).toBe(0)
    expect(pruneMarks([{ tree, ids }], marks).size).toBe(1)
  })
})

describe('chipsToUnfold: what counts as reaching inside', () => {
  it('K rule: K itself unfolds; y and z stay chips', () => {
    // K y z with y = I, z = D: the redex is K's own node
    const { ids, marks } = setup('K I D')
    expect(chipsToUnfold(ids, marks, []).map((id) => marks.get(id)!.name)).toEqual(['K'])
  })

  it('S rule: the chip that is b0 unfolds; x, y, z do not', () => {
    // △(K I) y z: b0 = K I is a stem? K I = △△I is a fork. Use a stem chip:
    const stem = (n: string) => (n === 'T' ? parseNamed('△(△△△)') : builtin(n))
    const { tree, ids, marks } = setup('△ T I D', stem)
    expect(step(tree)!.rule).toBe('S')
    expect(chipsToUnfold(ids, marks, []).map((id) => marks.get(id)!.name)).toEqual(['T'])
  })

  it('F rule: the fork chip b0 unfolds; z stays', () => {
    const { tree, ids, marks } = setup('△ I K D')     // b0 = I is a fork
    expect(step(tree)!.rule).toBe('F')
    expect(chipsToUnfold(ids, marks, []).map((id) => marks.get(id)!.name)).toEqual(['I'])
  })

  it('no chip involved: nothing unfolds', () => {
    const { ids, marks } = setup('△△ I D')   // b0 is a plain leaf, y = I, z = D
    expect(chipsToUnfold(ids, marks, [])).toEqual([])
  })

  it('a redex inside a chip unfolds it (outer first), but not inside its arguments', () => {
    const lookup = (n: string) => (n === 'R' ? parseNamed('△(△△(△△)△)') : builtin(n))   // R holds a redex at [0]
    const { ids, marks } = setup('R (K △ △)', lookup)
    expect(chipsToUnfold(ids, marks, [0]).map((id) => marks.get(id)!.name)).toEqual(['R'])
    // the redex in R's argument (branch 1) is K's own node: K unfolds, R doesn't
    expect(chipsToUnfold(ids, marks, [1]).map((id) => marks.get(id)!.name)).toEqual(['K'])
  })

  it('expanded variables are not unfolded again', () => {
    const { ids, marks } = setup('K I D')
    const open = setExpanded(marks, [ids.id], true)
    expect(chipsToUnfold(ids, open, [])).toEqual([])
  })
})

describe('marks through steps', () => {
  it('S copies a chip z: the copy is a chip too', () => {
    const lookup = (n: string) => (n === 'V' ? V : builtin(n))
    const { tree, ids, marks } = setup('△(△△) △ V', lookup)   // S rule with z = V
    const s = step(tree)!
    expect(s.rule).toBe('S')
    const r = stepIds(ids, s, idSource('c'))
    const carried = pruneMarks([{ tree: s.tree, ids: r.ids }], carryMarks(marks, r.born))
    const names = [...carried.values()].map((m) => m.name)
    expect(names).toEqual(['V', 'V'])
  })

  it('K keeps a chip y as a chip, with the leftover arguments', () => {
    const lookup = (n: string) => (n === 'V' ? V : builtin(n))
    const { tree, ids, marks } = setup('△△ V △ (△△)', lookup)   // △△ V △ applied to △△
    const s = step(tree)!
    const r = stepIds(ids, s, idSource('c'))
    const kept = pruneMarks([{ tree: s.tree, ids: r.ids }], marks)
    expect(kept.get(r.ids.id)?.name).toBe('V')
    expect(collapsedChips(r.ids, kept).get('')).toMatchObject({ name: 'V', arity: 2 })
  })

  it('S K K V reduces to V without V ever unfolding', () => {
    const lookup = (n: string) => (n === 'V' ? V : builtin(n))
    let { tree, ids, marks } = setup('S K K V', lookup)
    const gen = idSource('s')
    for (let i = 0; i < 100; i++) {
      const s = step(tree)
      if (!s) break
      const unfold = chipsToUnfold(ids, marks, s.path)
      expect(unfold.map((id) => marks.get(id)!.name)).not.toContain('V')
      marks = setExpanded(marks, unfold, true)
      const r = stepIds(ids, s, gen)
      marks = pruneMarks([{ tree: s.tree, ids: r.ids }], carryMarks(marks, r.born))
      tree = s.tree
      ids = r.ids
    }
    expect(tree).toEqual(V.tree)
    // (the V that survives is the S rule's copy, which is a chip too)
    expect(marks.get(ids.id)).toMatchObject({ name: 'V', expanded: false })
    expect(collapsedChips(ids, marks).size).toBe(1)
  })

  it('stepAt on a chip-free redex leaves other chips alone', () => {
    const { tree, ids, marks } = setup('I (K △ △)')
    const s = stepAt(tree, [2])!
    const r = stepIds(ids, s, idSource('q'))
    const kept = pruneMarks([{ tree: s.tree, ids: r.ids }], setExpanded(marks, chipsToUnfold(ids, marks, [2]), true))
    expect([...kept.values()].map((m) => m.name)).toEqual(['I'])
  })
})

describe('enclosingMarks, insideIds, fragmentAt', () => {
  it('finds the variables around a node, innermost first', () => {
    const { ids, marks } = setup('S')
    const open = setExpanded(marks, allIds(ids), true)
    const names = (path: Path) => enclosingMarks(ids, open, path).map((id) => open.get(id)!.name)
    expect(names([2, 0])).toEqual(['K', 'S'])   // K's own leaf
    expect(names([2, 1])).toEqual(['D', 'S'])   // D is K's argument, not part of K
    // with S collapsed, inner nodes aren't visible: only S itself counts
    expect(enclosingMarks(ids, marks, []).map((id) => marks.get(id)!.name)).toEqual(['S'])
  })

  it('a node in an argument is not inside the variable', () => {
    const { ids, marks } = setup('K △')
    expect(enclosingMarks(ids, marks, [1])).toEqual([])
  })

  it('insideIds is everything in the own branches only', () => {
    const { ids, marks } = setup('K (△△)')
    expect(insideIds(ids, marks.get(ids.id)!)).toEqual([idsAt(ids, [0]).id])
  })

  it('fragmentAt gives the subtree and its marks, relative to it', () => {
    const { tree, ids, marks } = setup('△ (S K) △')
    const f = fragmentAt(tree, ids, marks, [0])
    expect(f.tree).toEqual(parseNamed('S K').tree)
    expect(f.marks.find((m) => m.path.length === 0)?.mark.name).toBe('S')
    expect(f.marks.find((m) => m.path.length === 1 && m.path[0] === 4)?.mark.name).toBe('K')
  })
})


describe('hiddenBy, revealDiff, openVariables, marksBelow', () => {
  it('a node is hidden by the outermost collapsed chip around it', () => {
    const { ids, marks } = setup('S')
    const h = hiddenBy(ids, marks)
    expect(h.get(idsAt(ids, [2, 1]).id)).toBe(ids.id)          // D inside S's K D: hidden by S
    expect(h.has(ids.id)).toBe(false)
    const open = setExpanded(marks, [ids.id], true)
    expect(hiddenBy(ids, open).get(idsAt(ids, [2, 0]).id)).toBe(idsAt(ids, [2]).id)   // now by K
  })

  it('revealDiff: what sprouts when opening, what slides in when closing', () => {
    const { ids, marks } = setup('K △')
    const open = setExpanded(marks, [ids.id], true)
    const leaf = idsAt(ids, [0]).id
    expect([...revealDiff(ids, marks, open).born]).toEqual([[leaf, ids.id]])
    expect([...revealDiff(ids, open, marks).absorbed]).toEqual([[leaf, ids.id]])
    expect(revealDiff(ids, marks, marks).born.size).toBe(0)
  })

  it('openVariables lists visible expanded variables only', () => {
    const { ids, marks } = setup('S')
    const all = setExpanded(marks, marksBelow(ids, marks), true)
    expect([...openVariables(ids, all).values()].map((c) => c.name).sort()).toEqual(['D', 'D', 'D', 'K', 'K', 'K', 'S'])
    // S closed again: everything inside is hidden, so nothing is listed
    expect(openVariables(ids, setExpanded(all, [ids.id], false)).size).toBe(0)
  })

  it('marksBelow includes hidden marks and the node itself', () => {
    const { ids, marks } = setup('△ S')
    expect(marksBelow(ids, marks, [0]).length).toBe(7)
    expect(marksBelow(ids, marks).length).toBe(7)
  })
})
