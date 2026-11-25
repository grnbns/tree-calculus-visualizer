import { describe, it, expect } from 'vitest'
import { parse, parseNamed, builtinLookup, BUILTIN_TEXT, K, I, D, S } from './parser'
import { show, applyAll, normalize, apply } from './engine'

describe('parse', () => {
  it('reads leaf, stem, fork', () => {
    expect(parse('△')).toEqual([])
    expect(parse('△△')).toEqual([[]])
    expect(parse('△△△')).toEqual([[], []])
  })

  it('reads parenthesised branches', () => {
    expect(parse(I)).toEqual([[[]], [[]]])
    expect(parse('△(△△△)')).toEqual([[[], []]])
  })

  it('accepts . and ^ as aliases, and ignores spaces', () => {
    const expected = parse('△(△△)(△△)')
    expect(parse('.(..)(..)')).toEqual(expected)
    expect(parse('^(^^)(^^)')).toEqual(expected)
    expect(parse('△ . ^')).toEqual([[], []])
  })

  it('round-trips with show', () => {
    for (const s of ['△', '△△', I, D, '△△△(△△)△', S]) {
      expect(show(parse(s))).toBe(s)
    }
  })

  it('rejects bad input', () => {
    expect(() => parse('')).toThrow()
    expect(() => parse('△(△△')).toThrow()
    expect(() => parse('△)')).toThrow()
    expect(() => parse('x')).toThrow()
    expect(() => parse('△()')).toThrow()
  })
})

describe('names in the input', () => {
  it('expand to their trees', () => {
    expect(parse('K')).toEqual(parse(K))
    expect(parse('I')).toEqual(parse(I))
    expect(parse('S')).toEqual(parse(S))
  })

  it('work as heads and as arguments', () => {
    expect(parse('S K K (△△)')).toEqual(applyAll(parse(S), parse(K), parse(K), parse('△△')))
    expect(parse('△ I K')).toEqual(applyAll(parse('△'), parse(I), parse(K)))
    expect(parse('K(I)△')).toEqual(applyAll(parse(K), parse(I), parse('△')))
  })

  it('reduce like the book says: S K K x = x', () => {
    expect(normalize(parse('SKK(△△△)')).tree).toEqual(parse('△△△'))
  })

  it('still rejects other letters', () => {
    expect(() => parse('X')).toThrow()
    expect(() => parse('k')).toThrow()
  })
})

describe('named trees', () => {
  const x = parse('△△')
  const y = parse('△△△')
  const z = parse('△(△△)')
  const nf = (t: ReturnType<typeof parse>) => normalize(t).tree

  it('I x = x', () => expect(nf(apply(parse(I), x))).toEqual(x))
  it('K x y = x', () => expect(nf(applyAll(parse(K), x, y))).toEqual(x))
  it('D x y z = y z (x z)', () =>
    expect(nf(applyAll(parse(D), x, y, z))).toEqual(nf(applyAll(y, z, apply(x, z)))))
  it('S x y z = x z (y z)', () =>
    expect(nf(applyAll(parse(S), x, y, z))).toEqual(nf(applyAll(x, z, apply(y, z)))))
})

describe('names (milestone 9)', () => {
  const lookup = (name: string) =>
    ({ V: parseNamed('△△△'), True: parseNamed('K'), X2: parseNamed('△') } as Record<string, ReturnType<typeof parseNamed>>)[name]
    ?? builtinLookup(name)

  it('a capital starts a new name; lowercase letters and digits continue it', () => {
    expect(parse('SKV', lookup)).toEqual(applyAll(parse(S), parse(K), parse('△△△')))
    expect(parse('KTrue', lookup)).toEqual(apply(parse(K), parse(K)))
    expect(parse('X2X2', lookup)).toEqual([[]])
  })

  it('rejects unknown names, naming them', () => {
    expect(() => parse('V')).toThrow(/unknown name 'V'/)
    expect(() => parse('Tru', lookup)).toThrow(/unknown name 'Tru'/)
  })

  it('reports where each name was used', () => {
    const p = parseNamed('V(K △)△', lookup)
    const at = (path: number[]) => p.marks.find((m) => m.path.join() === path.join())?.mark.name
    expect(at([])).toBe('V')
    expect(at([2])).toBe('K')       // V has 2 own branches: K △ is branch 2
    expect(p.marks).toHaveLength(2)
  })

  it('names inside a definition come along, collapsed', () => {
    const p = parseNamed('S')
    expect(p.marks[0]).toMatchObject({ path: [], mark: { name: 'S', expanded: false } })
    expect(p.marks.map((m) => m.mark.name).sort()).toEqual(['D', 'D', 'D', 'K', 'K', 'K', 'S'])
    expect(p.tree).toEqual(parse(S))
  })

  it('raw △ text has no marks', () => {
    expect(parseNamed(D).marks).toEqual([])
  })

  it('built-in texts mean the book trees', () => {
    for (const [name, raw] of Object.entries({ K, I, D, S })) {
      expect(parse(BUILTIN_TEXT[name])).toEqual(parse(raw))
    }
  })
})
