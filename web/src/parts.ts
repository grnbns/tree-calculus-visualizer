// The parts of a rule (milestone 10): which nodes are w, x, y and z.
//
// In a redex  R = △ b0 y z  the first branch b0 picks the rule:
//   K  △△yz      = y         b0 = △
//   S  △(△x)yz   = yz(xz)    b0 = △x
//   F  △(△wx)yz  = zwx       b0 = △wx
// Each part is a whole subtree. Nodes keep their ids through a step (ids.ts),
// so colouring by id colours the same parts before and after; the S rule's
// second z is a copy, and carryParts gives it z's colour too.

import type { Path, Rule } from './engine'
import { allIds, idsAt, type IdTree } from './ids'

export type Part = 'w' | 'x' | 'y' | 'z'

/** node id -> the part of the rule it belongs to */
export type Parts = ReadonlyMap<string, Part>

/** The rule written with its parts, e.g. '△(△x)yz → yz(xz)'. */
export const RULE_TEXT: Readonly<Record<Rule, { before: string; after: string }>> = {
  K: { before: '△△yz', after: 'y' },
  S: { before: '△(△x)yz', after: 'yz(xz)' },
  F: { before: '△(△wx)yz', after: 'zwx' },
}

/** Where each part sits, relative to the redex, in letter order. */
export const PART_PATHS: Readonly<Record<Rule, readonly (readonly [Part, Path])[]>> = {
  K: [['y', [1]], ['z', [2]]],
  S: [['x', [0, 0]], ['y', [1]], ['z', [2]]],
  F: [['w', [0, 0]], ['x', [0, 1]], ['y', [1]], ['z', [2]]],
}

/** The parts of the redex at `path`, by id, and the root id of each part. */
export function partsOf(ids: IdTree, step: { rule: Rule; path: Path }): { parts: Parts; roots: Map<Part, string> } {
  const redex = idsAt(ids, step.path)
  const roots = new Map<Part, string>()
  const parts = new Map<string, Part>()
  for (const [part, rel] of PART_PATHS[step.rule]) {
    const t = idsAt(redex, rel)
    roots.set(part, t.id)
    for (const id of allIds(t)) parts.set(id, part)
  }
  return { parts, roots }
}

/** After the step: copies (`born`: new id -> origin) take their origin's part. */
export function carryParts(parts: Parts, born: ReadonlyMap<string, string> = new Map()): Parts {
  if (born.size === 0) return parts
  const out = new Map(parts)
  for (const [id, origin] of born) {
    const p = parts.get(origin)
    if (p) out.set(id, p)
  }
  return out
}
