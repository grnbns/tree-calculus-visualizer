// Parser for △ notation. TypeScript port of parser.py, plus named trees.
// "." and "^" are accepted as aliases for "△"; spaces are ignored.
// The names K, I, D and S stand for those trees, so "S K K (△△)" works.

import { apply, LEAF, type Tree } from './engine'

const ALIASES = ['.', '^']

export const K = '△△'
export const I = '△(△△)(△△)'
export const D = '△(△△)(△△△)'
// S = D (K D) (D K (K D)). Each argument needs its own parentheses:
// plain string concatenation like K + D would NOT mean "K applied to D".
export const S = `${D}(${K}(${D}))(${D}(${K})(${K}(${D})))`

/** Names you can type in place of a tree. */
export const NAMED_TREES: Readonly<Record<string, string>> = { K, I, D, S }

/** Read ONE argument starting at s[i]: a '△', a name (K, I, D, S) or a '( ... )' group.
 *  Returns the tree and the index just after it. */
function parseAtom(s: string, i: number): [Tree, number] {
  if (i >= s.length) throw new Error('unexpected end of input')
  if (s[i] === LEAF) return [[], i + 1]
  if (s[i] in NAMED_TREES) return [parse(NAMED_TREES[s[i]]), i + 1]
  if (s[i] === '(') {
    const [inner, j] = parseSeq(s, i + 1)
    if (j >= s.length || s[j] !== ')') throw new Error(`missing ')' at ${j}`)
    return [inner, j + 1]
  }
  throw new Error(`unexpected '${s[i]}' at ${i}`)
}

/** Read a head and all its arguments, stopping at ')' or the end. */
function parseSeq(s: string, i: number): [Tree, number] {
  let [tree, j] = parseAtom(s, i)
  while (j < s.length && s[j] !== ')') {
    const [arg, next] = parseAtom(s, j)
    tree = apply(tree, arg)
    j = next
  }
  return [tree, j]
}

export function parse(input: string): Tree {
  let s = input.replace(/\s/g, '')
  for (const alias of ALIASES) s = s.replaceAll(alias, LEAF)
  const [tree, i] = parseSeq(s, 0)
  if (i !== s.length) throw new Error(`unexpected '${s[i]}' at ${i}`)
  return tree
}
