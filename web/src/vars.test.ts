import { describe, it, expect } from 'vitest'
import { show } from './engine'
import { BUILTIN_TEXT, parse, parseNamed } from './parser'
import { builtinVars, defineVar, deleteVar, loadVars, loadVarsReport, lookupIn, nameProblem, saveVars, showNamed } from './vars'

describe('showNamed', () => {
  it('is plain show when there are no names', () => {
    for (const s of ['△', '△△', '△(△△)(△△)', '△△△(△△)△']) {
      const t = parse(s)
      expect(showNamed(t)).toBe(show(t))
    }
  })

  it('writes names with their arguments', () => {
    const vars = builtinVars()
    for (const s of ['S K K △', 'D(K D)(D K(K D))', 'K △(△△)', 'I', '△ K', 'S(K △)(I I)']) {
      const p = parseNamed(s, lookupIn(vars))
      const text = showNamed(p.tree, p.marks.filter((m) => m.path.length === 0 || !isInside(p.marks, m.path)))
      expect(text).toBe(s)
    }
  })

  it('round-trips through the parser', () => {
    const vars = builtinVars()
    const p = parseNamed('S (K I) (D △ K) △', lookupIn(vars))
    const again = parseNamed(showNamed(p.tree, p.marks), lookupIn(vars))
    expect(again.tree).toEqual(p.tree)
  })
})

/** Marks hidden inside another name (a definition's own names). */
function isInside(marks: ReturnType<typeof parseNamed>['marks'], path: readonly number[]): boolean {
  return marks.some((m) => m.path.length < path.length && m.path.every((v, i) => v === path[i])
    && path[m.path.length] < m.mark.def.length)
}

describe('defining variables', () => {
  it('K, I, D, S are built in and cannot be redefined', () => {
    const vars = builtinVars()
    expect([...vars.keys()]).toEqual(Object.keys(BUILTIN_TEXT))
    expect([...vars.keys()].slice(0, 4)).toEqual(['K', 'I', 'D', 'S'])
    expect(vars.get('S')!.text).toBe('D(K D)(D K(K D))')
    expect(nameProblem(vars, 'K')).toMatch(/built in/)
    expect(() => defineVar(vars, 'S', parseNamed('△'))).toThrow()
    expect(deleteVar(vars, 'K')).toBe(vars)
  })

  it('names: a letter, then letters or digits (V, x2, isZero)', () => {
    const vars = builtinVars()
    for (const ok of ['V', 'X2', 'Yes', 'Swap', 'v', 'VV', 'isEven', 'True']) expect(nameProblem(vars, ok)).toBeNull()
    for (const bad of ['', '2x', 'a b', '△', 'V-1', 'not', 'true', 'd', 'wait', 'isLeaf']) expect(nameProblem(vars, bad)).not.toBeNull()
  })

  it('a definition keeps the names it was built from', () => {
    let vars = builtinVars()
    vars = defineVar(vars, 'V', parseNamed('S K K', lookupIn(vars)))
    expect(vars.get('V')!.text).toBe('S K K')
    const p = parseNamed('V △', lookupIn(vars))
    expect(p.marks[0].mark.name).toBe('V')
    expect(p.marks.some((m) => m.mark.name === 'S')).toBe(false)   // S was at V's root: V wins
    // the two K arguments, plus the three inside S's own definition
    expect(p.marks.filter((m) => m.mark.name === 'K')).toHaveLength(5)
    expect(p.marks.filter((m) => m.mark.name === 'K' && m.path.length === 1).map((m) => m.path[0])).toEqual([2, 4, 5])   // [2] is S's own K D
  })

  it('redefining a variable leaves others built from it unchanged', () => {
    let vars = builtinVars()
    vars = defineVar(vars, 'V', parseNamed('△△'))
    vars = defineVar(vars, 'W', parseNamed('V V', lookupIn(vars)))
    vars = defineVar(vars, 'V', parseNamed('△'))
    expect(parse('W', lookupIn(vars))).toEqual(parse('△△(△△)'))
  })

  it('saves to and loads from JSON', () => {
    let vars = builtinVars()
    vars = defineVar(vars, 'V', parseNamed('S K K', lookupIn(vars)))
    vars = defineVar(vars, 'Yes', parseNamed('K', lookupIn(vars)))
    const loaded = loadVars(saveVars(vars))
    expect([...loaded.keys()].slice(-2)).toEqual(['V', 'Yes'])
    expect(loaded.get('V')!.tree).toEqual(vars.get('V')!.tree)
    expect(loaded.get('V')!.text).toBe('S K K')
    expect(parseNamed('V', lookupIn(loaded)).marks).toEqual(parseNamed('V', lookupIn(vars)).marks)
  })

  it('ignores broken saved data', () => {
    expect([...loadVars(null).keys()]).toHaveLength(Object.keys(BUILTIN_TEXT).length)
    expect([...loadVars('not json').keys()]).toHaveLength(Object.keys(BUILTIN_TEXT).length)
    // a saved name that is built in is kept under a new name, not dropped
    expect(loadVars('[{"name":"K","text":"△","tree":"△","marks":[]}]').get('K1')?.tree).toEqual(parse('△'))
    expect([...loadVars('[{"name":"V","text":"x","tree":"△△","marks":[{"path":[5],"name":"K","def":"△△"}]}]').keys()]).toHaveLength(Object.keys(BUILTIN_TEXT).length)
    expect(loadVars('[{"name":"V","text":"△","tree":"△","marks":[]}]').has('V')).toBe(true)
  })
})

describe('saved variables whose names are now built in', () => {
  it('are renamed, and so are their uses in other saved variables', () => {
    const saved = JSON.stringify([
      { name: 'not', text: '△△', tree: '△△', marks: [] },
      { name: 'not1', text: '△', tree: '△', marks: [] },
      { name: 'W', text: 'not △', tree: '△△△', marks: [{ path: [], name: 'not', def: '△△' }] },
    ])
    const { vars, renamed } = loadVarsReport(saved)
    expect(renamed).toEqual([['not', 'not2']])
    expect(vars.get('not')!.builtin).toBe(true)
    expect(vars.get('not2')!.tree).toEqual(parse('△△'))
    expect(vars.get('W')!.marks[0].mark.name).toBe('not2')
    expect(vars.get('W')!.text).toBe('not2 △')
  })
})
