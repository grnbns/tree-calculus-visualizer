import { describe, it, expect } from 'vitest'
import {
  addFragment, addLeafAt, addTree, allWorkspaceIds, collapseChip, emptyWorkspace, expandChip, getTree, joinTrees,
  layoutOf, makeRoom, moveTree, setAllBelow, nameAt, pasteOnto, PUSH_GAP, removeAt, removeTree, replaceTree, stepTree, tearOff, unfoldFor, type Workspace,
} from './workspace'
import { fragmentAt } from './marks'
import { idSource, sameShape } from './ids'
import { applyAll, normalize } from './engine'
import { parse, parseNamed, I } from './parser'

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
    const t = parse('S K K(△△△)')
    let ws = addTree(emptyWorkspace(), t, newId).ws
    for (let s = stepTree(ws, 't1', newId); s; s = stepTree(ws, 't1', newId)) ws = s.ws
    expect(getTree(ws, 't1')!.tree).toEqual(normalize(t).tree)
  })
})

describe('variables and paste (milestone 9)', () => {
  const named = (text: string) => parseNamed(text)

  it('a typed name is a collapsed chip; editing inside it turns it back into nodes', () => {
    const newId = idSource()
    let ws = addFragment(emptyWorkspace(), named('K △'), newId).ws
    const t = getTree(ws, 't1')!
    expect(ws.marks.get(t.ids.id)).toMatchObject({ name: 'K', expanded: false })
    // adding a branch at the chip's node gives it another argument: still K
    ws = addLeafAt(ws, 't1', [], newId).ws
    expect(ws.marks.size).toBe(1)
    // expand it and change K's own leaf: it isn't K any more
    ws = expandChip(ws, 't1', t.ids.id).ws
    ws = addLeafAt(ws, 't1', [0], newId).ws
    expect(ws.marks.size).toBe(0)
  })

  it('replaceTree keeps the typed names', () => {
    const newId = idSource()
    let ws = addTree(emptyWorkspace(), parse('△'), newId).ws
    const p = named('S K')
    ws = replaceTree(ws, 't1', p.tree, newId, p.marks).ws
    expect([...ws.marks.values()].filter((m) => !m.expanded).map((m) => m.name)).toContain('S')
    check(ws)
  })

  it('pasting onto a node is a join with fresh ids and the copied chips', () => {
    const newId = idSource()
    let ws = addFragment(emptyWorkspace(), named('I'), newId).ws
    const frag = fragmentAt(getTree(ws, 't1')!.tree, getTree(ws, 't1')!.ids, ws.marks)
    ws = pasteOnto(ws, 't1', [], frag, newId).ws
    const t = getTree(ws, 't1')!
    expect(t.tree).toEqual(applyAll(parse(I), parse(I)))
    expect(ws.marks.get(t.ids.children[2].id)?.name).toBe('I')
    check(ws)
  })

  it('pasting as a new tree puts it where asked', () => {
    const newId = idSource()
    let ws = emptyWorkspace()
    ws = addFragment(ws, named('D'), newId, { x: 40, y: 90 }).ws
    expect(getTree(ws, 't1')).toMatchObject({ x: 40, y: 90 })
  })

  it('naming a subtree collapses it; collapsing reports what shrinks into the chip', () => {
    const newId = idSource()
    let ws = addTree(emptyWorkspace(), parse('△(△△)(△△)△'), newId).ws
    const c = nameAt(ws, 't1', [1], 'V')
    const t = getTree(c.ws, 't1')!
    expect(c.ws.marks.get(t.ids.children[1].id)).toMatchObject({ name: 'V', def: parse('△△'), expanded: false })
    expect([...c.absorbed!.keys()]).toEqual([t.ids.children[1].children[0].id])
    const e = expandChip(c.ws, 't1', t.ids.children[1].id)
    expect([...e.born!.values()]).toEqual([t.ids.children[1].id])
    const back = collapseChip(e.ws, 't1', t.ids.children[1].id)
    expect(back.ws.marks.get(t.ids.children[1].id)!.expanded).toBe(false)
  })

  it('joining and tearing carry chips with the nodes', () => {
    const newId = idSource()
    let ws = addFragment(emptyWorkspace(), named('△'), newId).ws
    ws = addFragment(ws, named('K'), newId).ws
    ws = joinTrees(ws, 't2', 't1', []).ws
    expect([...ws.marks.values()].map((m) => m.name)).toEqual(['K'])
    ws = tearOff(ws, 't1', [0], 0, 0).ws
    expect([...ws.marks.values()].map((m) => m.name)).toEqual(['K'])
    ws = removeTree(ws, 't3').ws
    expect(ws.marks.size).toBe(0)
  })

  it('unfoldFor opens exactly the chips the next step needs', () => {
    const newId = idSource()
    const ws = addFragment(emptyWorkspace(), named('K I D'), newId).ws
    const u = unfoldFor(ws, 't1', [])!
    expect(u.names).toEqual(['K'])
    const s = stepTree(u.ws, 't1', newId, [])!
    expect(s.ws.marks.get(getTree(s.ws, 't1')!.ids.id)).toMatchObject({ name: 'I', expanded: false })
    expect(unfoldFor(addTree(emptyWorkspace(), parse('△△△△'), newId).ws, 't1', [])).toBeNull()
  })
})

describe('makeRoom', () => {
  const box = (ws: Workspace, key: string) => {
    const t = getTree(ws, key)!
    const b = layoutOf(t, ws.marks).bounds
    return { minX: b.minX + t.x, maxX: b.maxX + t.x }
  }

  it('pushes trees on both sides out of the way, and pushed trees push the next one', () => {
    const newId = idSource()
    let ws = addTree(emptyWorkspace(), parse('△'), newId, { x: -60, y: 0 }).ws
    ws = addTree(ws, parse('△△△△△△△△'), newId, { x: 0, y: 0 }).ws   // wide: overlaps both neighbours
    ws = addTree(ws, parse('△'), newId, { x: 60, y: 0 }).ws
    ws = addTree(ws, parse('△'), newId, { x: 100 + PUSH_GAP, y: 0 }).ws
    const roomy = makeRoom(ws, 't2')
    const mid = box(roomy, 't2')
    expect(box(roomy, 't1').maxX).toBeLessThanOrEqual(mid.minX - PUSH_GAP)
    expect(box(roomy, 't3').minX).toBeGreaterThanOrEqual(mid.maxX + PUSH_GAP)
    expect(box(roomy, 't4').minX).toBeGreaterThanOrEqual(box(roomy, 't3').maxX + PUSH_GAP)
  })

  it('leaves trees alone when there is room, or when they are above or below', () => {
    const newId = idSource()
    let ws = addTree(emptyWorkspace(), parse('△△'), newId).ws
    ws = addTree(ws, parse('△'), newId).ws                      // placed to the right with a gap
    ws = addTree(ws, parse('△'), newId, { x: 0, y: 500 }).ws     // far below
    expect(makeRoom(ws, 't1')).toBe(ws)
  })
})

describe('expand all / collapse all', () => {
  it('opens every variable in a subtree, and folds them all again', () => {
    const newId = idSource()
    let ws = addFragment(emptyWorkspace(), parseNamed('S K'), newId).ws
    const open = setAllBelow(ws, 't1', [], true)
    expect([...open.ws.marks.values()].every((m) => m.expanded)).toBe(true)
    expect(open.born!.size).toBeGreaterThan(10)        // all of S's insides sprout
    const shut = setAllBelow(open.ws, 't1', [], false)
    expect([...shut.ws.marks.values()].every((m) => !m.expanded)).toBe(true)
    expect(shut.absorbed!.size).toBe(open.born!.size)
    // only below a node: K (an argument of S) alone
    ws = setAllBelow(ws, 't1', [4], true).ws
    expect([...ws.marks.values()].filter((m) => m.expanded).map((m) => m.name)).toEqual(['K'])
  })
})
