// Parser for △ notation. TypeScript port of parser.py, plus named trees.
// "." and "^" are accepted as aliases for "△"; spaces are ignored.
//
// Names (milestone 9): a capital letter followed by any lowercase letters or
// digits, e.g. K, V, X2, True. A capital always starts a new name, so "SKV"
// reads as S K V and "SKKTrue" as S K K True. K, I, D and S are built in;
// other names come from a `Lookup` (the variables you define, see vars.ts).
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

/** The built-in variables, written with names where the book does. */
export const BUILTIN_TEXT: Readonly<Record<string, string>> = {
  K: '△△',
  I: '△(△△)(△△)',
  D: '△(△△)(△△△)',
  S: 'D(K D)(D K(K D))',
}

/** A tree plus the places where names were used (paths from its root). */
export type Parsed = { tree: Tree; marks: PathMark[] }

/** What a name stands for, or undefined if it isn't defined. */
export type Lookup = (name: string) => Parsed | undefined

export const NAME_RE = /^[A-Z][a-z0-9]*$/

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

const isUpper = (c: string) => c >= 'A' && c <= 'Z'
const isNameRest = (c: string) => (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')

const prefixed = (marks: PathMark[], i: number): PathMark[] =>
  marks.map((m) => ({ path: [i, ...m.path], mark: m.mark }))

/** Read ONE argument starting at s[i]: a '△', a name or a '( ... )' group.
 *  Returns the tree, the index just after it, and the names used in it. */
function parseAtom(s: string, i: number, lookup: Lookup): [Tree, number, PathMark[]] {
  if (i >= s.length) throw new Error('unexpected end of input')
  if (s[i] === LEAF) return [[], i + 1, []]
  if (isUpper(s[i])) {
    let j = i + 1
    while (j < s.length && isNameRest(s[j])) j++
    const name = s.slice(i, j)
    const def = lookup(name)
    if (!def) throw new Error(`unknown name '${name}' at ${i}`)
    // The name's own mark, plus the names its definition was built from
    // (hidden until it's expanded). A name at the very root of its own
    // definition is dropped: the outer name wins.
    const inner = def.marks.filter((m) => m.path.length > 0).map((m) => ({ path: m.path, mark: { ...m.mark, expanded: false } }))
    return [def.tree, j, [{ path: [], mark: { name, def: def.tree, expanded: false } }, ...inner]]
  }
  if (s[i] === '(') {
    const [inner, j, marks] = parseSeq(s, i + 1, lookup)
    if (j >= s.length || s[j] !== ')') throw new Error(`missing ')' at ${j}`)
    return [inner, j + 1, marks]
  }
  throw new Error(`unexpected '${s[i]}' at ${i}`)
}

/** Read a head and all its arguments, stopping at ')' or the end. */
function parseSeq(s: string, i: number, lookup: Lookup): [Tree, number, PathMark[]] {
  let [tree, j, marks] = parseAtom(s, i, lookup)
  while (j < s.length && s[j] !== ')') {
    const [arg, next, argMarks] = parseAtom(s, j, lookup)
    marks = [...marks, ...prefixed(argMarks, tree.length)]
    tree = apply(tree, arg)
    j = next
  }
  return [tree, j, marks]
}

/** Parse △ notation with names, reporting where each name was used. */
export function parseNamed(input: string, lookup: Lookup = builtinLookup): Parsed {
  let s = input.replace(/\s/g, '')
  for (const alias of ALIASES) s = s.replaceAll(alias, LEAF)
  const [tree, i, marks] = parseSeq(s, 0, lookup)
  if (i !== s.length) throw new Error(`unexpected '${s[i]}' at ${i}`)
  return { tree, marks }
}

/** Parse △ notation (names allowed) into a plain tree. */
export function parse(input: string, lookup: Lookup = builtinLookup): Tree {
  return parseNamed(input, lookup).tree
}
