import { describe, it, expect } from 'vitest'
import {
  apply, applyAll, show, isValue, kRule, sRule, fRule,
  reduceRoot, step, normalize, reductionSteps, allRedexes, stepAt, size, type Tree,
} from './engine'
import { parse } from './parser'
import rawCases from '../../tests/cases.json'

const LEAF: Tree = []
const STEM: Tree = [[]]
const FORK: Tree = [[], []]

describe('apply / applyAll', () => {
  it('adds the argument as the last branch', () => {
    expect(apply(LEAF, LEAF)).toEqual(STEM)
    expect(apply(STEM, STEM)).toEqual([[], [[]]])
  })

  it('does not modify its input', () => {
    const f: Tree = [[]]
    const g = apply(f, [])
    expect(f).toEqual([[]])
    expect(g).not.toBe(f)
  })

  it('applies left to right', () => {
    expect(applyAll(LEAF, STEM, LEAF)).toEqual([[[]], []])
    expect(applyAll(STEM)).toEqual(STEM)
  })
})

describe('show', () => {
  it('prints leaf, stem, fork', () => {
    expect(show(LEAF)).toBe('△')
    expect(show(STEM)).toBe('△△')
    expect(show(FORK)).toBe('△△△')
  })

  it('wraps branches that have branches in parentheses', () => {
    expect(show([[[]], [[]]])).toBe('△(△△)(△△)')
  })
})

describe('isValue', () => {
  it('accepts binary trees', () => {
    for (const t of [LEAF, STEM, FORK, parse('△(△△)(△△)')]) expect(isValue(t)).toBe(true)
  })
  it('rejects a redex at the root or nested', () => {
    expect(isValue([[], [], []])).toBe(false)
    expect(isValue([[[], [], []]])).toBe(false)
  })
})

describe('rules', () => {
  it('K: △△yz = y', () => expect(kRule([[], STEM, FORK])).toEqual(STEM))
  it('K keeps extra branches', () => expect(kRule([[], LEAF, STEM, STEM])).toEqual([STEM]))

  it('S: △(△x)yz = yz(xz)', () => {
    const [x, y, z] = [LEAF, STEM, FORK]
    expect(sRule([[x], y, z])).toEqual(apply(apply(y, z), apply(x, z)))
  })

  it('F: △(△wx)yz = zwx', () => {
    const [w, x, y, z] = [LEAF, STEM, FORK, LEAF]
    expect(fRule([[w, x], y, z])).toEqual(applyAll(z, w, x))
  })

  it('do not modify the redex', () => {
    const redex: Tree = [[[]], [[]], []]
    sRule(redex)
    expect(redex).toEqual([[[]], [[]], []])
  })
})

describe('reduceRoot', () => {
  it('returns null for fewer than 3 branches', () => {
    for (const t of [LEAF, STEM, FORK]) expect(reduceRoot(t)).toBeNull()
  })
  it('picks the rule by the first branch', () => {
    expect(reduceRoot([[], STEM, LEAF])?.rule).toBe('K')
    expect(reduceRoot([[[]], LEAF, LEAF])?.rule).toBe('S')
    expect(reduceRoot([[[], []], LEAF, LEAF])?.rule).toBe('F')
  })
  it('returns null when the first branch is itself a redex', () => {
    expect(reduceRoot([[[], [], []], LEAF, LEAF])).toBeNull()
  })
})

describe('step', () => {
  it('returns null for a normal form', () => {
    expect(step(LEAF)).toBeNull()
    expect(step(parse('△(△△)(△△)'))).toBeNull()
  })
  it('reports the path to the redex', () => {
    expect(step([[], STEM, LEAF])).toEqual({ tree: STEM, rule: 'K', path: [] })
    expect(step([[[], [], []]])).toEqual({ tree: STEM, rule: 'K', path: [0] })
    expect(step([[], [[], [[[]], [], []]]])?.path).toEqual([1, 1])
  })
  it('reduces leftmost first', () => {
    const k: Tree = [[], STEM, LEAF]
    const s: Tree = [[[]], LEAF, LEAF]
    expect(step([k, s])).toEqual({ tree: [STEM, s], rule: 'K', path: [0] })
  })
})

describe('normalize', () => {
  it('stops at the step limit', () => {
    const iX = parse('△(△△)(△△)(△)')
    expect(normalize(iX, 0)).toEqual({ tree: iX, steps: 0, finished: false })
    expect(normalize(iX, 2).finished).toBe(true)
    expect(normalize(iX, 1).finished).toBe(false)
  })
})

// --- The answer key: every case exported by the Python reference ----------

type Case = {
  name: string
  input_text: string
  input: Tree
  steps: { rule: string; path: number[]; tree: Tree }[]
  result: Tree
  result_text: string
  finished: boolean
}
const cases = rawCases as Case[]

describe('matches the Python reference (tests/cases.json)', () => {
  it('has cases to check', () => expect(cases.length).toBeGreaterThan(0))

  describe.each(cases)('$name', (c) => {
    // The JSON doesn't store each case's step limit; for unfinished cases
    // the number of recorded steps IS the limit.
    const limit = c.finished ? 10_000 : c.steps.length

    it('shows and parses the input the same way', () => {
      expect(show(c.input)).toBe(c.input_text)
      expect(parse(c.input_text)).toEqual(c.input)
    })

    it('takes the same steps in the same order', () => {
      const { steps, finished } = reductionSteps(c.input, limit)
      expect(steps.length).toBe(c.steps.length)
      steps.forEach((s, n) => {
        expect({ n, rule: s.rule, path: s.path }).toEqual({ n, rule: c.steps[n].rule, path: c.steps[n].path })
        expect(s.tree).toEqual(c.steps[n].tree)
      })
      expect(finished).toBe(c.finished)
    })

    it('normalizes to the same result', () => {
      const r = normalize(c.input, limit)
      expect(r.tree).toEqual(c.result)
      expect(show(r.tree)).toBe(c.result_text)
      expect(r.finished).toBe(c.finished)
    })
  })
})

describe('allRedexes / stepAt / size', () => {
  it('finds every redex, leftmost-outermost first', () => {
    const k: Tree = [[], STEM, LEAF]          // K redex
    const s: Tree = [[[]], LEAF, LEAF]        // S redex
    expect(allRedexes([k, s])).toEqual([
      { path: [0], rule: 'K' },
      { path: [1], rule: 'S' },
    ])
    expect(allRedexes(parse('△(△△)(△△)'))).toEqual([])
  })

  it('lists a redex before the redexes inside it', () => {
    const inner: Tree = [[], STEM, LEAF]
    const t: Tree = [[], inner, LEAF]          // K redex whose y is a K redex
    expect(allRedexes(t).map((r) => r.path)).toEqual([[], [1]])
  })

  it('skips a node whose first branch is still a computation', () => {
    const t: Tree = [[[], [], []], LEAF, LEAF]
    expect(allRedexes(t)).toEqual([{ path: [0], rule: 'K' }])
  })

  it('stepAt reduces the chosen redex and leaves the rest', () => {
    const k: Tree = [[], STEM, LEAF]
    const s: Tree = [[[]], LEAF, LEAF]
    const r = stepAt([k, s], [1])!
    expect(r.rule).toBe('S')
    expect(r.path).toEqual([1])
    expect(r.tree[0]).toBe(k)                  // the K redex is untouched
    expect(r.tree[1]).toEqual(sRule(s))
  })

  it('stepAt returns null where no rule applies', () => {
    expect(stepAt([[], STEM], [])).toBeNull()
    expect(stepAt([[], STEM], [5])).toBeNull()
  })

  it('counts nodes', () => {
    expect(size([])).toBe(1)
    expect(size(parse('△(△△)(△△)'))).toBe(5)
  })

  it('agrees with step on every reference case', () => {
    for (const c of cases) {
      const limit = c.finished ? 300 : c.steps.length
      let t = c.input
      for (let n = 0; n < limit; n++) {
        const s = step(t)
        const first = allRedexes(t)[0]
        if (!s) { expect(first).toBeUndefined(); break }
        expect(first).toEqual({ path: s.path, rule: s.rule })
        expect(stepAt(t, s.path)).toEqual(s)
        t = s.tree
      }
    }
  })
})
