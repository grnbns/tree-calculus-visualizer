import { describe, it, expect } from 'vitest'
import {
  addLeafAt, addTree, allWorkspaceIds, emptyWorkspace, getTree, joinTrees,
  moveTree, removeAt, removeTree, replaceTree, stepTree, tearOff, type Workspace,
} from './workspace'
import { idSource, sameShape } from './ids'
import { applyAll, normalize } from './engine'
import { parse, I } from './parser'

function check(ws: Workspace) {
  for (const t of ws.trees) expect(sameShape(t.tree, t.ids)).toBe(true)
  const ids = allWorkspaceIds(ws)
  expect(new Set(ids).size).toBe(ids.length)          // ids unique across all trees
}

describe('workspace', () => {
  it('adds trees side by side and selects the newest', () => {
    const newId = idSource()
    let ws = addTree(emptyWorkspace(), parse('△△'), newId).ws
    ws = addTree(ws, parse(I), newId).ws
    expect(ws.trees.map((t) => t.key)).toEqual(['t1', 't2'])
    expect(ws.selected).toBe('t2')
    expect(ws.trees[1].x).toBeGreaterThan(ws.trees[0].x)
    check(ws)
  })

  it('removing the selected tree selects another', () => {
    const newId = idSource()
    let ws = addTree(emptyWorkspace(), parse('△'), newId).ws
    ws = addTree(ws, parse('△△'), newId).ws
    ws = removeTree(ws, 't2').ws
    expect(ws.selected).toBe('t1')
    expect(removeTree(ws, 't1').ws.selected).toBeNull()
  })

  it('replace and move keep the key', () => {
    const newId = idSource()
    let ws = addTree(emptyWorkspace(), parse('△'), newId).ws
    ws = replaceTree(ws, 't1', parse(I), newId).ws
    ws = moveTree(ws, 't1', 40, 50).ws
    expect(getTree(ws, 't1')).toMatchObject({ tree: parse(I), x: 40, y: 50 })
    check(ws)
  })
})

describe('building I by clicking', () => {
  it('△ -> ... -> △(△△)(△△) using only "add a leaf"', () => {
    const newId = idSource()
    let ws = addTree(emptyWorkspace(), parse('△'), newId).ws
    ws = addLeafAt(ws, 't1', [], newId).ws        // △△
    ws = addLeafAt(ws, 't1', [0], newId).ws       // △(△△)
    ws = addLeafAt(ws, 't1', [], newId).ws        // △(△△)△
    ws = addLeafAt(ws, 't1', [1], newId).ws       // △(△△)(△△)
    expect(getTree(ws, 't1')!.tree).toEqual(parse(I))
    check(ws)
  })

  it('explains when an added leaf creates a redex', () => {
    const newId = idSource()
    const ws = addTree(emptyWorkspace(), parse('△△△'), newId).ws
    const c = addLeafAt(ws, 't1', [], newId)
    expect(c.message).toMatch(/computation/)
    expect(c.message).toMatch(/K rule/)
  })
})

describe('the milestone 6 finish line: drop x onto I', () => {
  it('joins the trees into I x, keeping x\'s ids, and a redex appears', () => {
    const newId = idSource()
    let ws = addTree(emptyWorkspace(), parse(I), newId).ws
    ws = addTree(ws, parse('△△'), newId).ws
    const xIds = getTree(ws, 't2')!.ids
    const c = joinTrees(ws, 't2', 't1', [])
    ws = c.ws
    expect(ws.trees).toHaveLength(1)
    const joined = getTree(ws, 't1')!
    expect(joined.tree).toEqual(applyAll(parse(I), parse('△△')))
    expect(joined.ids.children[2]).toBe(xIds)
    expect(c.message).toMatch(/S rule/)
    check(ws)
    // and stepping it all the way gives x back
    let s = stepTree(ws, 't1', newId)
    while (s) { ws = s.ws; s = stepTree(ws, 't1', newId) }
    expect(getTree(ws, 't1')!.tree).toEqual(parse('△△'))
  })

  it('can join onto an inner node', () => {
    const newId = idSource()
    let ws = addTree(emptyWorkspace(), parse('△△△'), newId).ws
    ws = addTree(ws, parse('△'), newId).ws
    ws = joinTrees(ws, 't2', 't1', [0]).ws
    expect(getTree(ws, 't1')!.tree).toEqual(parse('△(△△)△'))
  })

  it('refuses to join a tree to itself', () => {
    const ws = addTree(emptyWorkspace(), parse('△△'), idSource()).ws
    expect(() => joinTrees(ws, 't1', 't1', [0])).toThrow()
  })
})

describe('removing and tearing', () => {
  it('removing the root removes the tree', () => {
    const ws = addTree(emptyWorkspace(), parse(I), idSource()).ws
    expect(removeAt(ws, 't1', []).ws.trees).toHaveLength(0)
  })

  it('removing a branch keeps the rest', () => {
    const ws = addTree(emptyWorkspace(), parse(I), idSource()).ws
    expect(getTree(removeAt(ws, 't1', [0]).ws, 't1')!.tree).toEqual(parse('△(△△)'))
  })

  it('tearing off a branch makes a new tree with the same ids', () => {
    const ws0 = addTree(emptyWorkspace(), parse('△(△△)(△△△)'), idSource()).ws
    const subIds = getTree(ws0, 't1')!.ids.children[1]
    const c = tearOff(ws0, 't1', [1], 100, 20)
    expect(c.newKey).toBe('t2')
    expect(getTree(c.ws, 't1')!.tree).toEqual(parse('△(△△)'))
    expect(getTree(c.ws, 't2')).toMatchObject({ tree: parse('△△△'), ids: subIds, x: 100, y: 20 })
    expect(c.ws.selected).toBe('t2')
    check(c.ws)
  })

  it('tear then join puts it back where it was (as the last branch)', () => {
    const ws0 = addTree(emptyWorkspace(), parse('△(△△)(△△△)'), idSource()).ws
    const torn = tearOff(ws0, 't1', [1], 0, 0).ws
    const back = joinTrees(torn, 't2', 't1', []).ws
    expect(getTree(back, 't1')!.tree).toEqual(getTree(ws0, 't1')!.tree)
    expect(getTree(back, 't1')!.ids).toEqual(getTree(ws0, 't1')!.ids)
  })
})

describe('stepTree', () => {
  it('steps only the chosen tree', () => {
    const newId = idSource()
    let ws = addTree(emptyWorkspace(), parse(`${I}(△△)`), newId).ws
    ws = addTree(ws, parse(`${I}(△△△)`), newId).ws
    const s = stepTree(ws, 't1', newId)!
    expect(s.rule).toBe('S')
    expect(getTree(s.ws, 't2')).toBe(getTree(ws, 't2'))   // untouched
    check(s.ws)
  })

  it('returns null for a value or a missing tree', () => {
    const ws = addTree(emptyWorkspace(), parse('△△'), idSource()).ws
    expect(stepTree(ws, 't1', idSource())).toBeNull()
    expect(stepTree(ws, 'nope', idSource())).toBeNull()
  })

  it('agrees with normalize', () => {
    const newId = idSource()
    const t = parse('SKK(△△△)')
    let ws = addTree(emptyWorkspace(), t, newId).ws
    for (let s = stepTree(ws, 't1', newId); s; s = stepTree(ws, 't1', newId)) ws = s.ws
    expect(getTree(ws, 't1')!.tree).toEqual(normalize(t).tree)
  })
})
