import { describe, it, expect } from 'vitest'
import { step } from './engine'
import { allIds, freshIds, idSource, idsAt, stepIds } from './ids'
import { parse } from './parser'
import { carryParts, partsOf, type Part } from './parts'

/** The parts of the first step of `text`, before and after it. */
function run(text: string) {
  const tree = parse(text)
  const ids = freshIds(tree, idSource('p'))
  const s = step(tree)!
  const { parts, roots } = partsOf(ids, s)
  const r = stepIds(ids, s, idSource('c'))
  const after = carryParts(parts, r.born)
  const count = (p: Part, live: string[]) => live.filter((id) => after.get(id) === p).length
  return { s, ids, parts, roots, after, live: allIds(r.ids), count }
}

describe('partsOf', () => {
  it('K: y and z (whole subtrees); y keeps its colour after', () => {
    const { s, parts, roots, ids, live, count } = run('△△(△△)(△△△)')
    expect(s.rule).toBe('K')
    expect(roots.get('y')).toBe(idsAt(ids, [1]).id)
    expect([...parts.values()].filter((p) => p === 'y')).toHaveLength(2)
    expect([...parts.values()].filter((p) => p === 'z')).toHaveLength(3)
    expect(count('y', live)).toBe(2)   // y survives
    expect(count('z', live)).toBe(0)   // z is dropped
  })

  it('S: x, y, z; both copies of z are coloured z afterwards', () => {
    const { s, roots, ids, live, count } = run('△(△(△△))△(△△)')
    expect(s.rule).toBe('S')
    expect(roots.get('x')).toBe(idsAt(ids, [0, 0]).id)
    expect(roots.has('w')).toBe(false)
    expect(count('z', live)).toBe(4)   // z has 2 nodes, and there are two of it
    expect(count('x', live)).toBe(2)
    expect(count('y', live)).toBe(1)
  })

  it('F: w, x, y, z; y vanishes, the others travel', () => {
    const { s, roots, ids, live, count } = run('△(△△(△△))(△△△)△')
    expect(s.rule).toBe('F')
    expect(roots.get('w')).toBe(idsAt(ids, [0, 0]).id)
    expect(roots.get('x')).toBe(idsAt(ids, [0, 1]).id)
    expect(count('w', live)).toBe(1)
    expect(count('x', live)).toBe(2)
    expect(count('y', live)).toBe(0)
    expect(count('z', live)).toBe(1)
  })

  it('the redex itself, b0 and later arguments get no part', () => {
    const { parts, ids } = run('△△△△(△△)')   // K with an extra argument
    expect(parts.has(ids.id)).toBe(false)
    expect(parts.has(idsAt(ids, [0]).id)).toBe(false)
    expect(parts.has(idsAt(ids, [3]).id)).toBe(false)
  })

  it('works on a redex deeper in the tree', () => {
    const tree = parse('△(△△△△)')
    const ids = freshIds(tree, idSource('d'))
    const s = step(tree)!
    expect(s.path).toEqual([0])
    expect(partsOf(ids, s).roots.get('y')).toBe(idsAt(ids, [0, 1]).id)
  })
})
