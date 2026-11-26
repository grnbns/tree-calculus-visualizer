// Variables: named trees (milestone 9).
//
// K, I, D and S are built in and can't be changed. Your own variables are
// saved in the browser. Each definition keeps the names it was built from
// (S = D(K D)(D K(K D))), so expanding a chip shows those as chips in turn.
// Pure functions; main.ts does the actual saving.

import { LEAF, show, type Path, type Tree } from './engine'
import { BUILTIN_TEXT, NAME_RE, TEMPLATES, builtinLookup, parse, type Lookup, type Parsed } from './parser'
import { arity, fits, pathKey, type Fragment, type PathMark, type VarMark } from './marks'

export type VarDef = Parsed & {
  readonly name: string
  /** the definition written with names, e.g. 'S K K' */
  readonly text: string
  readonly builtin: boolean
}

export type Vars = ReadonlyMap<string, VarDef>

export function builtinVars(): Vars {
  const vars = new Map<string, VarDef>()
  for (const name of Object.keys(BUILTIN_TEXT)) {
    vars.set(name, { name, text: BUILTIN_TEXT[name], builtin: true, ...builtinLookup(name)! })
  }
  return vars
}

export function lookupIn(vars: Vars): Lookup {
  return (name) => vars.get(name)
}

/** Why `name` can't be used for a new variable, or null if it can. */
export function nameProblem(vars: Vars, name: string): string | null {
  if (!NAME_RE.test(name)) return 'A name is a letter, then any letters or digits (V, x2, isZero).'
  if (vars.get(name)?.builtin) return `${name} is built in and can't be redefined.`
  if (name in TEMPLATES) return `${name} is the book's notation ${name}{…}, so it can't be a variable's name.`
  return null
}

/** Define (or redefine) a variable as this fragment. */
export function defineVar(vars: Vars, name: string, frag: Fragment): Vars {
  const problem = nameProblem(vars, name)
  if (problem) throw new Error(problem)
  const out = new Map(vars)
  out.set(name, { name, text: showNamed(frag.tree, frag.marks), tree: frag.tree, marks: [...frag.marks], builtin: false })
  return out
}

export function deleteVar(vars: Vars, name: string): Vars {
  if (!vars.has(name) || vars.get(name)!.builtin) return vars
  const out = new Map(vars)
  out.delete(name)
  return out
}

/** △ text that uses names where `marks` say, e.g. 'S K K V' or
 *  'D(K D)(D K(K D))'. With no marks it's exactly show(tree). */
export function showNamed(tree: Tree, marks: readonly PathMark[] = []): string {
  const byPath = new Map<string, VarMark>()
  for (const m of marks) byPath.set(pathKey(m.path), m.mark)

  // Returns the text and whether it's a single bare name.
  const fmt = (t: Tree, path: Path): { text: string; name: boolean; atom: boolean } => {
    const m = byPath.get(pathKey(path))
    const from = m ? arity(m) : 0
    const parts: { text: string; name: boolean }[] = [{ text: m ? m.name : LEAF, name: !!m }]
    for (let i = from; i < t.length; i++) {
      const sub = fmt(t[i], [...path, i])
      parts.push(sub.atom ? sub : { text: `(${sub.text})`, name: false })
    }
    let text = parts[0].text
    for (let i = 1; i < parts.length; i++) {
      const next = parts[i]
      const space = !next.text.startsWith('(') && (parts[i - 1].name || next.name)
      text += (space ? ' ' : '') + next.text
    }
    return { text, name: !!m && parts.length === 1, atom: parts.length === 1 }
  }
  return fmt(tree, []).text
}

// --- Saving in the browser ---------------------------------------------------

type Saved = { name: string; text: string; tree: string; marks: { path: number[]; name: string; def: string }[] }

/** The user's variables as JSON (built-ins aren't saved). */
export function saveVars(vars: Vars): string {
  const list: Saved[] = [...vars.values()].filter((v) => !v.builtin).map((v) => ({
    name: v.name,
    text: v.text,
    tree: show(v.tree),
    marks: v.marks.map((m) => ({ path: [...m.path], name: m.mark.name, def: show(m.mark.def) })),
  }))
  return JSON.stringify(list)
}

/** Built-ins plus the variables saved by saveVars. Bad entries are skipped. */
export function loadVars(json: string | null): Vars {
  return loadVarsReport(json).vars
}

/** Like loadVars, and also reports saved variables that had to be renamed
 *  because their name is now built in (your `True` becomes `True1`). */
export function loadVarsReport(json: string | null): { vars: Vars; renamed: [from: string, to: string][] } {
  const vars = new Map(builtinVars())
  const renamed: [string, string][] = []
  if (!json) return { vars, renamed }
  let list: unknown
  try { list = JSON.parse(json) } catch { return { vars, renamed } }
  if (!Array.isArray(list)) return { vars, renamed }
  const saved = list as Saved[]
  // A saved name that is now built in gets a number added, and so does every
  // use of it inside other saved definitions.
  const taken = new Set([...vars.keys(), ...saved.map((v) => v?.name)])
  const rename = new Map<string, string>()
  for (const v of saved) {
    if (!vars.get(v?.name)?.builtin && !(v?.name in TEMPLATES)) continue
    let n = 1
    while (taken.has(`${v.name}${n}`)) n++
    rename.set(v.name, `${v.name}${n}`)
    taken.add(`${v.name}${n}`)
  }
  for (const s of saved) {
    try {
      const name = rename.get(s.name) ?? s.name
      if (nameProblem(vars, name)) continue
      const tree = parse(s.tree)
      const marks: PathMark[] = s.marks.map((m) => ({
        path: m.path,
        mark: { name: rename.get(m.name) ?? m.name, def: parse(m.def), expanded: false },
      }))
      if (!marks.every((m) => { const t = at(tree, m.path); return t !== undefined && fits(t, m.mark) })) continue
      const touched = name !== s.name || s.marks.some((m) => rename.has(m.name))
      vars.set(name, { name, text: touched ? showNamed(tree, marks) : s.text, tree, marks, builtin: false })
      if (name !== s.name) renamed.push([s.name, name])
    } catch { /* skip it */ }
  }
  return { vars, renamed }
}

function at(t: Tree, path: readonly number[]): Tree | undefined {
  let node: Tree | undefined = t
  for (const i of path) node = Number.isInteger(i) ? node?.[i] : undefined
  return node
}
