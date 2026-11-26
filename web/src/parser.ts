// Parser for △ notation. TypeScript port of parser.py, plus named trees.
// "." and "^" are accepted as aliases for "△".
//
// Names: a letter, then any letters or digits (K, V, x2, isZero; case
// matters). Names need spaces (or brackets, or △) between them: "S K V" is
// three names, "SKV" is one. Around △ and brackets spaces are optional, so
// "K△", "△△" and "K(K I)" work. K, I, D and S are built in, and so are the
// book's booleans; other names come from a `Lookup` (your variables, see vars.ts).
//
// Besides the tree, parseNamed reports WHERE each name was used, so those
// places can be shown as collapsed chips (see marks.ts).

import { apply, LEAF, type Tree } from './engine'
import type { PathMark } from './marks'

const ALIASES = ['.', '^']

export const K = '△△'
export const I = '△(△△)(△△)'
export const D = '△(△△)(△△△)'
// S = D (K D) (D K (K D)). Each argument needs its own parentheses:
// plain string concatenation like K + D would NOT mean "K applied to D".
export const S = `${D}(${K}(${D}))(${D}(${K})(${K}(${D})))`

/** The built-in variables, written as in the book (its `d{x}` means
 *  `△(△x)` and `Kⁿ x` is K applied n times, both understood by this parser).
 *  The booleans are from §3.5, the numbers from §3.7, the queries from §3.8,
 *  self-application from §4.3. */
export const BUILTIN_TEXT: Readonly<Record<string, string>> = {
  K: '△△',
  I: '△(△△)(△△)',
  D: '△(△△)(△△△)',
  S: 'D(K D)(D K(K D))',
  selfApply: 'd{I} I',
  true: 'K',
  false: 'K I',
  and: 'd{K(K I)}',
  or: 'd{K K} I',
  implies: 'd{K K}',
  not: 'd{K K}(d{K(K I)} I)',
  iff: '△(△ I not) △',
  zero: '△',
  succ: 'K',
  isZero: 'd{K⁴ I}(d{K K} △)',
  pred: 'd{K² I}(d{K △} △)',
  isLeaf: 'query{K, K I, K I}',
  isStem: 'query{K I, K, K I}',
  isFork: 'query{K I, K I, K}',
}

/** Numbers can be written as digits: `3` is the book's number 3, `K³ △`
 *  (shown as a chip named 3). Up to this size. */
export const MAX_NUMBER = 1000

/** Built-ins grouped for the Add menu (milestone 11). */
export const BOOLEANS: readonly string[] = ['true', 'false', 'and', 'or', 'implies', 'not', 'iff']
export const NUMBERS: readonly string[] = ['zero', 'succ', 'isZero', 'pred']
export const QUERIES: readonly string[] = ['isLeaf', 'isStem', 'isFork']

/** The book's notation with parameters ("templates"), e.g. `d{K}` or
 *  `wait{x, y}`. They aren't trees: the parser fills in the arguments and
 *  builds the tree directly, so the canvas only ever holds trees. In a body,
 *  the parameter names stand for the arguments. */
export const TEMPLATES: Readonly<Record<string, { params: readonly string[]; body: string }>> = {
  d: { params: ['x'], body: '△(△ x)' },                                   // §3.4
  first: { params: ['p'], body: '△ p △ K' },                               // §3.6
  second: { params: ['p'], body: '△ p △ (K I)' },                          // §3.6
  query: { params: ['a', 'b', 'c'], body: 'd{K b}(d{K² I}(d{K⁵ c}(d{K³ a} △)))' }, // §3.8
  wait: { params: ['x', 'y'], body: 'd{I}(d{K y}(K x))' },                 // §4.4
  swap: { params: ['f'], body: 'd{K f}(d{d{K}(K △)}(K △))' },              // §4.4
}

/** A tree plus the places where names were used (paths from its root).
 *  `transparent`: stands in for a template's argument, so it gets no chip
 *  of its own (its own chips are kept). */
export type Parsed = { tree: Tree; marks: PathMark[]; transparent?: boolean }

/** What a name stands for, or undefined if it isn't defined. Inside a
 *  template's body, `argText` gives the text of the argument a parameter
 *  stands for, so chips of templates used in the body are labelled with
 *  the real arguments (`d{K △}`, not `d{K y}`). */
export type Lookup = ((name: string) => Parsed | undefined) & { argText?: (name: string) => string | undefined }

export const NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/

const builtinCache = new Map<string, Parsed>()

/** The built-in names only. */
export const builtinLookup: Lookup = (name) => {
  if (!(name in BUILTIN_TEXT)) return undefined
  let p = builtinCache.get(name)
  if (!p) {
    p = parseNamed(BUILTIN_TEXT[name], builtinLookup)
    builtinCache.set(name, p)
  }
  return p
}

const isLetter = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
const isNameRest = (c: string) => isLetter(c) || (c >= '0' && c <= '9')
const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c)
const skipSpaces = (s: string, i: number) => { while (isSpace(s[i])) i++; return i }
const SUPERSCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9'

/** `K**4` written with superscripts: `K⁴` (for showing in the input box). */
export function toSuperscripts(text: string, all = true): string {
  // While typing, only convert once the number is finished (something else follows).
  const re = all ? /\*\*(\d+)/g : /\*\*(\d+)(?=[^\d])/g
  return text.replace(re, (_, d: string) => [...d].map((c) => SUPERSCRIPTS[Number(c)]).join(''))
}

const numberCache = new Map<number, Parsed>()

/** The number n as a tree, `Kⁿ △` (with its K chips inside). */
export function numberTree(n: number): Parsed {
  let p = numberCache.get(n)
  if (!p) {
    p = parseNamed(n === 0 ? '△' : `K**${n} △`)
    numberCache.set(n, p)
  }
  return p
}
/** Characters that end a sequence of arguments. */
const ENDS = ')},'

/** "SKV" isn't a name, but S, K and V are: suggest the spaces. */
function unknownName(name: string, at: number, lookup: Lookup): Error {
  const parts = name.match(/[A-Z][a-z0-9]*|[a-z][a-z0-9]*/g) ?? []
  const hint = parts.length > 1 && parts.every((p) => lookup(p)) ? ` (names need spaces between them: '${parts.join(' ')}')` : ''
  return new Error(`unknown name '${name}' at ${at}${hint}`)
}

const prefixed = (marks: PathMark[], prefix: readonly number[]): PathMark[] =>
  marks.map((m) => ({ path: [...prefix, ...m.path], mark: m.mark }))

type Piece = [Tree, number, PathMark[]]

/** What a name means: its tree, with a chip for the name itself and its
 *  definition's names inside (hidden until expanded; a name at the very
 *  root of its own definition is dropped: the outer name wins). */
function named(name: string, def: Parsed, end: number): Piece {
  if (def.transparent) return [def.tree, end, def.marks]
  const inner = def.marks.filter((m) => m.path.length > 0).map((m) => ({ path: m.path, mark: { ...m.mark, expanded: false } }))
  return [def.tree, end, [{ path: [], mark: { name, def: def.tree, expanded: false } }, ...inner]]
}

/** A template call `name{arg, arg, …}`, starting at the '{' (s[i]). */
function parseTemplate(s: string, name: string, i: number, lookup: Lookup): Piece {
  const t = TEMPLATES[name]
  const args: Parsed[] = []
  const texts: string[] = []
  let j = i + 1
  while (true) {
    j = skipSpaces(s, j)
    if (s[j] === '}' && args.length === 0) throw new Error(`${name}{…} needs ${t.params.length} argument${t.params.length === 1 ? '' : 's'}`)
    const from = j
    const [tree, next, marks] = parseSeq(s, j, lookup)
    args.push({ tree, marks, transparent: true })
    texts.push(withArgs(s.slice(from, next).trim().replace(/\s+/g, ' '), lookup))
    j = next
    if (s[j] === ',') { j++; continue }
    if (s[j] === '}') { j++; break }
    throw new Error(`missing '}' at ${j}`)
  }
  if (args.length !== t.params.length) {
    throw new Error(`${name}{…} takes ${t.params.length} argument${t.params.length === 1 ? '' : 's'} (${t.params.join(', ')}), not ${args.length}`)
  }
  const local: Lookup = (n) => {
    const k = t.params.indexOf(n)
    return k >= 0 ? args[k] : builtinLookup(n)
  }
  local.argText = (n) => {
    const k = t.params.indexOf(n)
    return k >= 0 ? texts[k] : undefined
  }
  const body = parseNamed(t.body, local)
  return named(`${name}{${texts.join(', ')}}`, body, j)
}

/** A template argument's text as written in a body, with each parameter
 *  name replaced by the text of its argument (in brackets if it's more than
 *  one piece, so `d{K y}` with y = `K I` reads `d{K (K I)}`). */
function withArgs(text: string, lookup: Lookup): string {
  if (!lookup.argText) return text
  return text.replace(/[A-Za-z][A-Za-z0-9]*/g, (name) => {
    const arg = lookup.argText!(name)
    if (arg === undefined) return name
    return /\s/.test(arg) ? `(${arg})` : arg
  })
}

/** Read ONE argument starting at s[i]: a '△', a name, a template call or a
 *  '( ... )' group, optionally with a power (`K⁴ I` = K(K(K(K I)))). */
function parseAtom(s: string, i: number, lookup: Lookup): Piece {
  let [tree, j, marks] = parsePrimary(s, i, lookup)
  // A power: Xⁿ a = X(X(…(X a))), n times. Written X**n or with superscripts.
  let digits = ''
  if (s[j] === '*' && s[j + 1] === '*') {
    j += 2
    while (isDigit(s[j])) digits += s[j++]
    if (!digits) throw new Error(`'**' needs a number after it (like K**4), at ${j}`)
  } else {
    while (j < s.length && SUPERSCRIPTS.includes(s[j])) digits += String(SUPERSCRIPTS.indexOf(s[j++]))
  }
  if (!digits) return [tree, j, marks]
  const n = Number(digits)
  const k = skipSpaces(s, j)
  if (k >= s.length || ENDS.includes(s[k])) throw new Error(`a power (like K² x) needs something after it to apply to, at ${k}`)
  let [result, end, resultMarks] = parseAtom(s, k, lookup)
  for (let r = 0; r < n; r++) {
    resultMarks = [...marks, ...prefixed(resultMarks, [tree.length])]
    result = apply(tree, result)
  }
  return [result, end, resultMarks]
}

function parsePrimary(s: string, i: number, lookup: Lookup): Piece {
  if (i >= s.length) throw new Error('unexpected end of input')
  if (s[i] === LEAF) return [[], i + 1, []]
  if (isDigit(s[i])) {
    // A number: 3 = K³ △, shown as a chip named 3.
    let j = i
    while (isDigit(s[j])) j++
    if (isLetter(s[j] ?? '')) throw new Error(`a name can't start with a digit, at ${i}`)
    const n = Number(s.slice(i, j))
    if (n > MAX_NUMBER) throw new Error(`numbers go up to ${MAX_NUMBER}, at ${i}`)
    return named(String(n), numberTree(n), j)
  }
  if (isLetter(s[i])) {
    let j = i + 1
    while (j < s.length && isNameRest(s[j])) j++
    const name = s.slice(i, j)
    if (s[j] === '{') {
      if (!(name in TEMPLATES)) throw new Error(`'${name}' isn't one of the book's templates (${Object.keys(TEMPLATES).map((t) => t + '{…}').join(', ')}), at ${i}`)
      return parseTemplate(s, name, j, lookup)
    }
    const def = lookup(name)
    if (!def) {
      if (name in TEMPLATES) throw new Error(`${name} needs its argument${TEMPLATES[name].params.length === 1 ? '' : 's'} in braces: ${name}{${TEMPLATES[name].params.join(', ')}}`)
      throw unknownName(name, i, lookup)
    }
    return named(name, def, j)
  }
  if (s[i] === '(') {
    const [inner, j, marks] = parseSeq(s, skipSpaces(s, i + 1), lookup)
    if (j >= s.length || s[j] !== ')') throw new Error(`missing ')' at ${j}`)
    return [inner, j + 1, marks]
  }
  throw new Error(`unexpected '${s[i]}' at ${i}`)
}

/** Read a head and all its arguments, stopping at ')', '}', ',' or the end. */
function parseSeq(s: string, i: number, lookup: Lookup): Piece {
  let [tree, j, marks] = parseAtom(s, i, lookup)
  j = skipSpaces(s, j)
  while (j < s.length && !ENDS.includes(s[j])) {
    const [arg, next, argMarks] = parseAtom(s, j, lookup)
    marks = [...marks, ...prefixed(argMarks, [tree.length])]
    tree = apply(tree, arg)
    j = skipSpaces(s, next)
  }
  return [tree, j, marks]
}

/** Parse △ notation with names, reporting where each name was used. */
export function parseNamed(input: string, lookup: Lookup = builtinLookup): Parsed {
  let s = input
  for (const alias of ALIASES) s = s.replaceAll(alias, LEAF)
  const [tree, i, marks] = parseSeq(s, skipSpaces(s, 0), lookup)
  if (i !== s.length) throw new Error(`unexpected '${s[i]}' at ${i}`)
  return { tree, marks }
}

/** Parse △ notation (names allowed) into a plain tree. */
export function parse(input: string, lookup: Lookup = builtinLookup): Tree {
  return parseNamed(input, lookup).tree
}
