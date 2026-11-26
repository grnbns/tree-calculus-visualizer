import { describe, it, expect } from 'vitest'
import { atEnd, back, currentWs, describeFrame, forward, reduce, seek, startRun, stepsBefore, nextRuleFrame, beforeRule, MAX_RUN_STEPS, type Moved, type Run, type Stopped } from './run'
import { addFragment, addTree, emptyWorkspace, getTree } from './workspace'
import { allIds, idSource } from './ids'
import { parse, parseNamed, I } from './parser'

const moved = (r: Moved | Stopped): Moved => {
  if ('stopped' in r) throw new Error(r.message)
  return r
}

function setup(text: string) {
  const newId = idSource()
  const ws = addTree(emptyWorkspace(), parse(text), newId).ws
  return { newId, ws, run: startRun(ws, 't1') }
}

const treeOf = (run: Run) => getTree(currentWs(run), 't1')!.tree

describe('a reduction run', () => {
  it('plays S K K x to x, then stops with a message', () => {
    let { newId, run } = setup('S K K (△△)')
    let r = forward(run, newId)
    while (!('stopped' in r)) { run = r.run; r = forward(run, newId) }
    expect(treeOf(run)).toEqual(parse('△△'))
    expect(run.pos).toBe(16)
    expect(r.stopped).toBe('normal')
    expect(r.message).toMatch(/16 steps/)
  })

  it('back and forward move through frames without losing them', () => {
    let { newId, run } = setup(`${I}(△△)`)
    run = moved(forward(run, newId)).run
    run = moved(forward(run, newId)).run
    const end = treeOf(run)
    run = back(run)!.run
    run = back(run)!.run
    expect(run.pos).toBe(0)
    expect(back(run)).toBeNull()
    expect(run.frames).toHaveLength(3)          // nothing was dropped
    const f = moved(forward(run, newId))        // replays frame 1, keeps its born map
    expect(f.run.pos).toBe(1)
    run = moved(forward(f.run, newId)).run
    expect(treeOf(run)).toBe(end)               // the very same frame, not recomputed
  })

  it('reducing a chosen redex from the middle drops the later frames', () => {
    let { newId, run } = setup('△(△(△△)(△△)(△△))(△△(△△)△)')   // redexes at [0] (S) and [1] (K)
    run = moved(forward(run, newId)).run        // S at [0]
    run = moved(forward(run, newId)).run        // K at [0]
    run = back(run)!.run
    run = back(run)!.run
    run = moved(reduce(run, newId, [1])).run    // choose the K at [1] first
    expect(run.frames).toHaveLength(2)
    expect(run.frames[1]).toMatchObject({ rule: 'K', path: [1] })
    expect(atEnd(run)).toBe(true)
  })

  it('stops at the step limit for trees that never finish', () => {
    let { newId, run } = setup(`△(△(${I}))(${I})(△(△(${I}))(${I}))`)   // M M
    let r = forward(run, newId)
    while (!('stopped' in r)) { run = r.run; r = forward(run, newId) }
    expect(r.stopped).toBe('limit')
    expect(run.pos).toBe(MAX_RUN_STEPS)
  })

  it('a value has nothing to play', () => {
    const { newId, run } = setup('△△')
    const r = forward(run, newId)
    expect('stopped' in r && r.stopped).toBe('normal')
  })

  it('seek jumps, and copies sprout from something still on screen', () => {
    let { newId, run } = setup('S K K (△△)')
    let r = forward(run, newId)
    while (!('stopped' in r)) { run = r.run; r = forward(run, newId) }
    const start = seek(run, 0).run
    expect(start.pos).toBe(0)
    const jump = seek(start, 10)
    expect(jump.run.pos).toBe(10)
    const startIds = new Set(allIds(getTree(currentWs(start), 't1')!.ids))
    for (const origin of jump.born!.values()) expect(startIds.has(origin)).toBe(true)
    expect(seek(run, 999).run.pos).toBe(16)
  })

  it('describes frames', () => {
    let { newId, run } = setup(`${I}(△△)`)
    run = moved(forward(run, newId)).run
    expect(describeFrame(run)).toBe('Step 1: S rule at the root')
    expect(describeFrame(run, 0)).toBe('Start')
  })
})

describe('runs with variables (milestone 9)', () => {
  function setupNamed(text: string) {
    const newId = idSource()
    const ws = addFragment(emptyWorkspace(), parseNamed(text), newId).ws
    return { newId, run: startRun(ws, 't1') }
  }

  it('an unfold is its own frame, before the step that needs it', () => {
    let { newId, run } = setupNamed('K I D')
    run = moved(forward(run, newId)).run
    expect(run.frames[1].unfold).toEqual(['K'])
    expect(describeFrame(run)).toBe('Before step 1: unfold K, because the rule looks inside')
    expect(treeOf(run)).toEqual(parse('K I D'))          // unfolding changes no tree
    run = moved(forward(run, newId)).run
    expect(run.frames[2].rule).toBe('K')
    expect(treeOf(run)).toEqual(parse(I))
    expect(stepsBefore(run)).toBe(1)
  })

  it('stepping back over an unfold folds the insides back into the chip', () => {
    let { newId, run } = setupNamed('K I D')
    run = moved(forward(run, newId)).run
    const m = moved(back(run)!)
    expect(m.absorbed!.size).toBeGreaterThan(0)
    expect(new Set(m.absorbed!.values()).size).toBe(1)
  })

  it('a clicked redex inside a chip unfolds it, then reduces that redex', () => {
    // K applied to a redex: the K △ △ in the argument is clicked
    let { newId, run } = setupNamed('I (K △ △)')
    run = moved(reduce(run, newId, [2])).run
    expect(run.frames[1].unfold).toEqual(['K'])
    run = moved(forward(run, newId)).run
    expect(run.frames[2]).toMatchObject({ rule: 'K', path: [2] })
  })

  it('S K K x: plays to x, counting only rule steps in the message', () => {
    let { newId, run } = setupNamed('S K K (△△)')
    let r = forward(run, newId)
    while (!('stopped' in r)) { run = r.run; r = forward(run, newId) }
    expect(treeOf(run)).toEqual(parse('△△'))
    const steps = run.frames.filter((f) => f.rule).length
    expect(run.frames.some((f) => f.unfold)).toBe(true)
    expect(r.message).toBe(`Reached a normal form after ${steps} steps.`)
  })
})

describe('recognising the result (milestone 10)', () => {
  it('a normal form equal to a variable folds into its chip, as its own frame', () => {
    const newId = idSource()
    const ws = addFragment(emptyWorkspace(), parseNamed('K (△△△) △'), newId).ws
    let run = startRun(ws, 't1', [{ name: 'V', def: parse('△△△') }])
    let r = forward(run, newId)
    while (!('stopped' in r)) { run = r.run; r = forward(run, newId) }
    const last = run.frames.at(-1)!
    expect(last.recognised).toBe('V')
    expect(describeFrame(run)).toMatch(/the result is exactly V/)
    const t = getTree(currentWs(run), 't1')!
    expect(currentWs(run).marks.get(t.ids.id)).toMatchObject({ name: 'V', expanded: false })
    expect(last.absorbed!.size).toBe(2)
    // stepping back brings the nodes out of the chip again
    expect(moved(back(run)!).born!.size).toBe(2)
  })

  it('no match, or no candidates: nothing extra', () => {
    const newId = idSource()
    const ws = addFragment(emptyWorkspace(), parseNamed('K (△△) △'), newId).ws
    let run = startRun(ws, 't1', [{ name: 'V', def: parse('△△△') }])
    let r = forward(run, newId)
    while (!('stopped' in r)) { run = r.run; r = forward(run, newId) }
    expect(run.frames.some((f) => f.recognised)).toBe(false)
  })
})

describe('half-step helpers', () => {
  it('skip unfold frames in both directions', () => {
    const newId = idSource()
    const ws = addFragment(emptyWorkspace(), parseNamed('K I D'), newId).ws
    let run = startRun(ws, 't1')
    run = moved(forward(run, newId)).run            // frames: 0 start, 1 unfold K, 2 K rule
    expect(nextRuleFrame(run, 0)).toBe(2)
    expect(beforeRule(run, 2)).toBe(0)
    expect(nextRuleFrame(run, 2)).toBeNull()
  })
})
