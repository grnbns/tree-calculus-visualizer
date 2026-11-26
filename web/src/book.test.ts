import { describe, it, expect } from 'vitest'
import { apply, applyAll, normalize, show, type Tree } from './engine'
import { parse, parseNamed, toSuperscripts } from './parser'
import { showNamed } from './vars'

// The book's notation and trees beyond the booleans (milestone 11):
// templates like d{x}, powers like K⁴ I, numbers, queries, self-application.

const nf = (t: Tree | string) => normalize(typeof t === 'string' ? parse(t) : t).tree
const same = (a: Tree, b: Tree) => expect(show(a)).toBe(show(b))
const T = parse('K')
const F = parse('K I')
const num = (n: number) => parse(n === 0 ? '△' : `K${'⁰¹²³⁴⁵⁶⁷⁸⁹'[n]} △`)

describe('powers: Kⁿ x is K applied n times', () => {
  it('builds the nested applications', () => {
    same(parse('K⁴ I'), parse('K(K(K(K I)))'))
    same(parse('K² I'), parse('K(K I)'))
    same(parse('K¹ I'), parse('K I'))
    same(parse('K⁰ I'), parse('I'))
    same(parse('△²△'), parse('△(△△)'))
    same(parse('K¹⁰ △'), parse('K(K(K(K(K(K(K(K(K(K △)))))))))'))
  })

  it('a power takes one argument; the result can take more', () => {
    same(parse('K² I △'), apply(parse('K(K I)'), []))
  })

  it('needs something to apply to', () => {
    expect(() => parse('K²')).toThrow(/power/)
    expect(() => parse('(K²)')).toThrow(/power/)
  })
})

describe('templates: the book notation with parameters', () => {
  it('d{x} = △(△x)', () => {
    same(parse('d{K}'), parse('△(△(K))'))
    same(parse('d{K} I'), parse('△(△ K) I'))
  })

  it('match the written-out forms', () => {
    same(parse('query{K, K I, K I}'), parse('△(△(K(K I)))(△(△(K(K I)))(△(△(K(K(K(K(K(K I)))))))(△(△(K(K(K K))))△)))'))
    same(parse('wait{K, I}'), parse('△(△ I)(△(△(K I))(K K))'))
    same(parse('swap{K}'), parse('△(△(K K))(△(△(△(△ K)(K △)))(K △))'))
    same(parse('first{△ K I}'), parse('△ (△ K I) △ K'))
  })

  it('first and second take a pair apart', () => {
    same(nf('first{△ K I}'), T)
    same(nf('second{△ K I}'), parse('I'))
  })

  it('wait{x, y} is a value, and wait{x, y} z = x y z', () => {
    expect(normalize(parse('wait{K, I}')).steps).toBe(0)
    same(nf('wait{K, △} (△△)'), nf('K △ (△△)'))
  })

  it('swap{f} x y = f y x', () => {
    same(nf('swap{K} (△△) △'), nf('K △ (△△)'))
  })

  it('arguments can be anything, even other templates', () => {
    same(parse('d{d{K}}'), parse('△(△(△(△ K)))'))
    same(parse('d{K² I}'), parse('△(△(K(K I)))'))
  })

  it('say clearly what went wrong', () => {
    expect(() => parse('d')).toThrow(/d needs its argument in braces: d\{x\}/)
    expect(() => parse('d{K, I}')).toThrow(/takes 1 argument \(x\), not 2/)
    expect(() => parse('d{}')).toThrow(/needs 1 argument/)
    expect(() => parse('d{K')).toThrow(/missing '\}'/)
    expect(() => parse('K{I}')).toThrow(/isn't one of the book's templates/)
    expect(() => parse('K, I')).toThrow(/unexpected ','/)
  })

  it('templates used inside a template are labelled with the real arguments, not the parameter names', () => {
    const names = (text: string) => parseNamed(text).marks.map((m) => m.mark.name).filter((n) => n.includes('{'))
    expect(names('wait{K, △}')).toEqual(['wait{K, △}', 'd{K △}'])   // (d{I} is at the root, so wait's own label wins)
    expect(names('query{K, K I, K I}')).toEqual(['query{K, K I, K I}', 'd{K² I}', 'd{K⁵ (K I)}', 'd{K³ K}'])
    expect(names('query{K, K I, K I}').join()).not.toMatch(/\b[abc]\b/)
    expect(names('swap{S}')).toEqual(['swap{S}', 'd{d{K}(K △)}', 'd{K}'])
    // and each label is valid input for the same tree
    const p = parseNamed('query{K, K I, K I}')
    for (const m of p.marks.filter((m) => m.mark.name.startsWith('d{'))) expect(parse(m.mark.name)).toEqual(m.mark.def)
  })

  it('a template is a chip labelled as typed; its arguments keep their chips', () => {
    const p = parseNamed('d{ K }  △')
    expect(p.marks[0]).toMatchObject({ path: [], mark: { name: 'd{K}' } })
    expect(p.marks.find((m) => m.mark.name === 'K')?.path).toEqual([0, 0])
    expect(parseNamed('wait{ K ,  I }').marks[0].mark.name).toBe('wait{K, I}')
    // the chip's label is valid input again
    expect(showNamed(p.tree, p.marks.filter((m) => m.path.length <= 1))).toBe('d{K} △')
    expect(parse(showNamed(p.tree, p.marks))).toEqual(p.tree)
  })
})

describe('numbers (§3.7): n = Kⁿ △', () => {
  it('zero and succ', () => {
    same(parse('zero'), num(0))
    same(parse('succ (succ zero)'), num(2))
  })

  it('isZero', () => {
    same(nf(apply(parse('isZero'), num(0))), T)
    for (let n = 1; n <= 5; n++) same(nf(apply(parse('isZero'), num(n))), F)
  })

  it('pred', () => {
    same(nf(apply(parse('pred'), num(0))), num(0))
    for (let n = 1; n <= 5; n++) same(nf(apply(parse('pred'), num(n))), num(n - 1))
  })

  it('match the written-out forms', () => {
    same(parse('isZero'), parse('△(△(K(K(K(K I)))))(△(△(K K))△)'))
    same(parse('pred'), parse('△(△(K(K I)))(△(△(K △))△)'))
  })
})

describe('queries (§3.8): is it a leaf, a stem or a fork?', () => {
  const leaf = parse('△')
  const stem = parse('△ (△△)')
  const fork = parse('△ △ (△△)')
  const cases: [string, Tree[]][] = [['isLeaf', [leaf]], ['isStem', [stem]], ['isFork', [fork]]]
  for (const [q, yes] of cases) {
    it(q, () => {
      for (const t of [leaf, stem, fork]) same(nf(apply(parse(q), t)), yes.includes(t) ? T : F)
      // works on any tree of that shape, not just these
      same(nf(apply(parse(q), parse('△ (K I) (S K)'))), q === 'isFork' ? T : F)
    })
  }

  it('Exercise 7: isLeaf △, isLeaf K, isLeaf (K△)', () => {
    same(nf('isLeaf △'), T)
    same(nf('isLeaf K'), F)
    same(nf('isLeaf (K△)'), F)
  })
})

describe('self-application (§4.3)', () => {
  it('selfApply x = x x', () => {
    same(nf('selfApply (K △)'), nf('K △ (K △)'))
    same(nf('selfApply I'), parse('I'))
  })

  it('selfApply selfApply never finishes', () => {
    const r = normalize(parse('selfApply selfApply'), 60)
    expect(r.finished).toBe(false)
  })

  it('is the same as D I I after reducing', () => {
    same(nf('D I I'), parse('selfApply'))
  })

  it('applies to the whole argument', () => {
    same(parse('selfApply'), applyAll(parse('△(△ I)'), parse('I')))
  })
})

describe('numbers as digits, and ** powers', () => {
  it('3 is K³ △, shown as a chip named 3', () => {
    same(parse('3'), parse('K(K(K △))'))
    same(parse('0'), parse('△'))
    expect(parseNamed('3').marks[0].mark.name).toBe('3')
    same(parse('succ 2'), parse('3'))
    expect(() => parse('2x')).toThrow(/can't start with a digit/)
    expect(() => parse('1001')).toThrow(/up to 1000/)
  })

  it('K**4 I is K⁴ I', () => {
    same(parse('K**4 I'), parse('K⁴ I'))
    same(parse('K**12 △'), parse('12'))
    expect(() => parse('K** I')).toThrow(/needs a number/)
  })

  it('toSuperscripts writes powers the book way', () => {
    expect(toSuperscripts('K**4 I')).toBe('K⁴ I')
    expect(toSuperscripts('K**12 △')).toBe('K¹² △')
    // while typing: only once the number is finished
    expect(toSuperscripts('K**1', false)).toBe('K**1')
    expect(toSuperscripts('K**12 ', false)).toBe('K¹² ')
  })
})
