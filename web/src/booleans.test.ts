import { describe, it, expect } from 'vitest'
import { normalize, show } from './engine'
import { parse, BOOLEANS, BUILTIN_TEXT } from './parser'

// The book's booleans (§3.5): True = K, False = K I, and the operators.
const T = parse('K')
const F = parse('K I')
const nf = (text: string) => normalize(parse(text)).tree
const name = (b: boolean) => (b ? 'true' : 'false')
const tree = (b: boolean) => (b ? T : F)

describe('booleans from the book', () => {
  it('true and false choose', () => {
    expect(nf('true (△△) △')).toEqual(parse('△△'))
    expect(nf('false (△△) △')).toEqual(parse('△'))
  })

  it('are values, so they never need reducing first', () => {
    for (const n of BOOLEANS) expect(normalize(parse(n)).steps, n).toBe(0)
  })

  it('not', () => {
    for (const a of [true, false]) expect(nf(`not ${name(a)}`), `not ${name(a)}`).toEqual(tree(!a))
  })

  const table: [string, (a: boolean, b: boolean) => boolean][] = [
    ['and', (a, b) => a && b],
    ['or', (a, b) => a || b],
    ['implies', (a, b) => !a || b],
    ['iff', (a, b) => a === b],
  ]
  for (const [op, f] of table) {
    it(`${op} truth table`, () => {
      for (const a of [true, false]) for (const b of [true, false]) {
        expect(show(nf(`${op} ${name(a)} ${name(b)}`)), `${op} ${name(a)} ${name(b)}`).toBe(show(tree(f(a, b))))
      }
    })
  }

  it('match the book forms', () => {
    // d{x} = △(△x)
    expect(parse(BUILTIN_TEXT.not)).toEqual(parse('△(△(△△(△△)))(△(△(△△(△△(△(△△)(△△))))) (△(△△)(△△)))'))
    expect(parse('or')).toEqual(parse('implies I'))
  })
})
