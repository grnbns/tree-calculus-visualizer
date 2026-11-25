import { describe, it, expect } from 'vitest'
import { addLeaf, attach, detach, removeBranch, subtreeAt } from './edit'
import { allIds, freshIds, idSource, sameShape } from './ids'
import { applyAll, step } from './engine'
import { parse, I } from './parser'

describe('addLeaf', () => {
  it('adds a leaf as the last branch, with a fresh id', () => {
    const t = parse('△△')
    const ids = freshIds(t, idSource('a'))
    const r = addLeaf(t, ids, [], idSource('new'))
    expect(r.tree).toEqual(parse('△△△'))
    expect(sameShape(r.tree, r.ids)).toBe(true)
    expect(r.ids.children[0]).toBe(ids.children[0])   // untouched branch: same object
    expect(r.ids.children[1].id).toBe('new1')
  })

  it('works deep inside a tree', () => {
    const t = parse('△(△△)△')
    const r = addLeaf(t, freshIds(t, idSource()), [0, 0], idSource('n'))
    expect(r.tree).toEqual(parse('△(△(△△))△'))
  })

  it('turning a fork into a computation creates a redex', () => {
    const t = parse('△△△')                        // a fork: a value
    expect(step(t)).toBeNull()
    const r = addLeaf(t, freshIds(t, idSource()), [], idSource('n'))
    expect(step(r.tree)?.rule).toBe('K')          // now △△△△ reduces by K
  })

  it('does not change its input', () => {
    const t = parse('△△')
    const ids = freshIds(t, idSource())
    addLeaf(t, ids, [], idSource('n'))
    expect(t).toEqual(parse('△△'))
    expect(ids.children).toHaveLength(1)
  })
})

describe('removeBranch', () => {
  it('removes any branch; later siblings shift left', () => {
    const t = parse('△(△△)△(△△△)')               // branches: stem, leaf, fork
    const ids = freshIds(t, idSource())
    const r = removeBranch(t, ids, [0])
    expect(r.tree).toEqual(parse('△△(△△△)'))
    expect(sameShape(r.tree, r.ids)).toBe(true)
    expect([...r.died].sort()).toEqual(allIds(ids.children[0]).sort())
  })

  it('reports every id in the removed subtree as gone', () => {
    const t = parse(I)
    const ids = freshIds(t, idSource())
    const r = removeBranch(t, ids, [1])
    expect(r.died.size).toBe(2)
  })

  it('refuses to remove the root', () => {
    const t = parse('△△')
    expect(() => removeBranch(t, freshIds(t, idSource()), [])).toThrow()
  })
})

describe('attach and detach', () => {
  it('attach applies the node at the path to the other tree, keeping its ids', () => {
    const i = parse(I)
    const x = parse('△△')
    const iIds = freshIds(i, idSource('i'))
    const xIds = freshIds(x, idSource('x'))
    const r = attach(i, iIds, [], x, xIds)
    expect(r.tree).toEqual(applyAll(i, x))         // I x
    expect(r.ids.children[2]).toBe(xIds)           // x's ids carried over as-is
    expect(step(r.tree)?.rule).toBe('S')           // and it's now a redex
  })

  it('attach works on an inner node too', () => {
    const t = parse('△△△')
    const r = attach(t, freshIds(t, idSource('t')), [1], parse('△△'), freshIds(parse('△△'), idSource('s')))
    expect(r.tree).toEqual(parse('△△(△(△△))'))
    expect(sameShape(r.tree, r.ids)).toBe(true)
  })

  it('detach is the opposite of attach', () => {
    const t = parse('△(△△)(△△△)')
    const ids = freshIds(t, idSource())
    const d = detach(t, ids, [1])
    expect(d.tree).toEqual(parse('△(△△)'))
    expect(d.sub).toEqual(parse('△△△'))
    expect(d.subIds).toBe(ids.children[1])
    const back = attach(d.tree, d.ids, [], d.sub, d.subIds)
    expect(back.tree).toEqual(t)
    expect(back.ids).toEqual(ids)
  })

  it('subtreeAt finds a branch', () => {
    expect(subtreeAt(parse('△(△△)(△△△)'), [1, 0])).toEqual([])
  })
})
