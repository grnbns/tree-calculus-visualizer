import { describe, it, expect } from 'vitest'
import { allIds, freshIds, idsAt, idSource, sameShape, stepIds, type IdTree } from './ids'
import { applyAll, step, type Tree } from './engine'
import { parse, I, K, S } from './parser'
import rawCases from '../../tests/cases.json'

const cases = rawCases as { name: string; input: Tree; finished: boolean; steps: unknown[] }[]

/** Run every step of `tree`, updating ids alongside. */
function runWithIds(tree: Tree, maxSteps = 300) {
  const newId = idSource('t')
  let ids = freshIds(tree, newId)
  const history: { tree: Tree; ids: IdTree; born: Map<string, string>; died: Set<string> }[] = []
  for (let n = 0; n < maxSteps; n++) {
    const s = step(tree)
    if (!s) break
    const r = stepIds(ids, s, newId)
    tree = s.tree
    ids = r.ids
    history.push({ tree, ids, born: r.born, died: r.died })
  }
  return { history, final: { tree, ids } }
}

describe('freshIds', () => {
  it('matches the shape of the tree, with unique ids', () => {
    const t = parse(S)
    const ids = freshIds(t, idSource())
    expect(sameShape(t, ids)).toBe(true)
    const all = allIds(ids)
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('stepIds on every reference case', () => {
  it.each(cases.map((c) => [c.name, c] as const))('%s: shape always matches, ids stay unique', (_, c) => {
    const newId = idSource('t')
    let tree = c.input
    let ids = freshIds(tree, newId)
    const limit = c.finished ? 300 : c.steps.length
    for (let n = 0; n < limit; n++) {
      const s = step(tree)
      if (!s) break
      const before = new Set(allIds(ids))
      const r = stepIds(ids, s, newId)
      tree = s.tree
      ids = r.ids
      expect(sameShape(tree, ids)).toBe(true)
      const after = allIds(ids)
      expect(new Set(after).size).toBe(after.length)
      // bookkeeping adds up: survivors + born = after, survivors + died = before
      for (const id of after) expect(before.has(id) !== r.born.has(id)).toBe(true)
      for (const id of r.died) expect(before.has(id) && !after.includes(id)).toBe(true)
      for (const id of before) if (!r.died.has(id)) expect(after).toContain(id)
    }
  })
})

describe('each rule', () => {
  const newId = () => idSource('r')
  // Build a redex with recognisable ids:  R = △ b0 y z rest
  const leaf = (id: string): IdTree => ({ id, children: [] })

  it('K: y takes the redex place; R, b0 and z vanish', () => {
    const z: IdTree = { id: 'z', children: [leaf('z0')] }
    const ids: IdTree = { id: 'R', children: [leaf('b0'), leaf('y'), z, leaf('rest')] }
    const r = stepIds(ids, { rule: 'K', path: [] }, newId())
    expect(r.ids).toEqual({ id: 'y', children: [leaf('rest')] })
    expect([...r.died].sort()).toEqual(['R', 'b0', 'z', 'z0'])
    expect(r.born.size).toBe(0)
  })

  it('S: y z (x z), with a fresh copy of z inside (x z)', () => {
    const ids: IdTree = {
      id: 'R',
      children: [{ id: 'b0', children: [leaf('x')] }, leaf('y'), { id: 'z', children: [leaf('z0')] }],
    }
    const r = stepIds(ids, { rule: 'S', path: [] }, newId())
    expect(r.ids.id).toBe('y')
    expect(r.ids.children[0]).toEqual({ id: 'z', children: [leaf('z0')] }) // original z
    const xz = r.ids.children[1]
    expect(xz.id).toBe('x')
    const copy = xz.children[0]
    expect(copy.id).not.toBe('z')
    expect(r.born.get(copy.id)).toBe('z')
    expect(r.born.get(copy.children[0].id)).toBe('z0')
    expect([...r.died].sort()).toEqual(['R', 'b0'])
  })

  it('F: z w x; R, b0 and y vanish', () => {
    const ids: IdTree = {
      id: 'R',
      children: [{ id: 'b0', children: [leaf('w'), leaf('x')] }, { id: 'y', children: [leaf('y0')] }, leaf('z')],
    }
    const r = stepIds(ids, { rule: 'F', path: [] }, newId())
    expect(r.ids).toEqual({ id: 'z', children: [leaf('w'), leaf('x')] })
    expect([...r.died].sort()).toEqual(['R', 'b0', 'y', 'y0'])
  })

  it('leaves everything outside the redex alone', () => {
    const redex: IdTree = { id: 'R', children: [leaf('b0'), leaf('y'), leaf('z')] }
    const ids: IdTree = { id: 'top', children: [leaf('left'), redex] }
    const r = stepIds(ids, { rule: 'K', path: [1] }, newId())
    expect(r.ids).toEqual({ id: 'top', children: [leaf('left'), leaf('y')] })
  })
})

describe('the milestone 5 finish line', () => {
  it('I x: x ends up as the whole result, with its original ids', () => {
    const x = parse('△(△△)△')
    const tree = applyAll(parse(I), x)
    const newId = idSource('t')
    const startIds = freshIds(tree, newId)
    const xIdsBefore = allIds(idsAt(startIds, [2]))   // x is branch 2 of  I x = △ b0 b1 x

    let ids = startIds
    let t = tree
    for (let s = step(t); s; s = step(t)) {
      ids = stepIds(ids, s, newId).ids
      t = s.tree
    }
    expect(t).toEqual(x)
    // The original x node and all its descendants are the ones on screen at the end
    // (the S step makes a copy of x, but the K step throws the copy away).
    expect(allIds(ids)).toEqual(xIdsBefore)
  })

  it('K x y: x rises, y vanishes', () => {
    const tree = applyAll(parse(K), parse('△△'), parse('△△△'))
    const ids = freshIds(tree, idSource())
    const r = stepIds(ids, step(tree)!, idSource('n'))
    expect(r.ids.id).toBe(ids.children[1].id)                 // x's node is now the root
    for (const id of allIds(ids.children[2])) expect(r.died.has(id)).toBe(true) // y gone
  })

  it('runWithIds keeps shapes in sync for S K K x', () => {
    const { final } = runWithIds(applyAll(parse(S), parse(K), parse(K), parse('△△')))
    expect(final.tree).toEqual(parse('△△'))
    expect(sameShape(final.tree, final.ids)).toBe(true)
  })
})
