import './style.css'
import { allRedexes, show, step, type Path, type Rule, type Tree } from './engine'
import { numberTree, parseNamed, toSuperscripts, BOOLEANS, MAX_NUMBER, NUMBERS, QUERIES, TEMPLATES, D } from './parser'
import { Scene, DEFAULT_PARAMS, type PhysicsParams, type PointHit } from './scene'
import { idSource, idsAt } from './ids'
import {
  addFragment, addLeafAt, addTree, collapseChip, emptyWorkspace, expandChip, getTree, joinTrees,
  moveTree, nameAt, pasteOnto, recogniseResult, removeAt, replaceTree, selectTree, setAllBelow, tearOff,
  type Change, type PlacedTree, type Workspace,
} from './workspace'
import {
  chipsToUnfold, collapsedChips, enclosingMarks, fragmentAt, marksBelow, openVariables, revealDiff, setExpanded,
  type Fragment, type Marks,
} from './marks'
import { carryParts, partsOf, PART_PATHS, RULE_TEXT, type Parts } from './parts'
import { defineVar, deleteVar, loadVarsReport, lookupIn, nameProblem, saveVars, showNamed, type Vars } from './vars'
import {
  atEnd, back, beforeRule, currentWs, describeFrame, forward, nextRuleFrame, reduce, seek, startRun, stepsBefore,
  type Moved, type Run, type Stopped,
} from './run'

// Built-in variables come first in the Add menu, then these, then yours.
const EXAMPLES: [label: string, text: string][] = [
  ['K(△△)(△△△)', 'K(△△)(△△△)'],
  ['I(△△)', 'I(△△)'],
  ['S K K(△△)', 'S K K(△△)'],
  ['not true', 'not true'],
  ['and true false', 'and true false'],
  ['or false true', 'or false true'],
  ['succ 0', 'succ 0'],
  ['isZero (K² △)', 'isZero (K² △)'],
  ['pred (K³ △)', 'pred (K³ △)'],
  ['isLeaf K', 'isLeaf K'],
  ['wait{K, △} (△△)', 'wait{K, △} (△△)'],
  ['selfApply selfApply', 'selfApply selfApply'],
]
const COLOURS_KEY = 'tree-calculus-colours'
const VARS_KEY = 'tree-calculus-vars'

type Mode = 'add' | 'remove' | 'move'

const MODE_HELP: Record<Mode, string> = {
  add: 'Add branch (A): click a node to give it a new leaf branch, which applies it to △; click empty canvas for a new leaf. Shift-click removes instead.',
  remove: 'Remove (R): click a node to remove it and everything under it; click a root to remove the whole tree. Shift-click adds instead.',
  move: 'Move (M): drag any node to tear it off into a tree of its own. Click a tree to select it.',
}

// Everything floats over a full-window canvas (milestone 8).
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <svg id="canvas" role="img" aria-label="Tree drawing: drag empty space to pan, ctrl or ⌘ + scroll or pinch to zoom"></svg>

  <div class="hud top">
  <section class="panel top-left" aria-label="Trees">
    <h1>Tree Calculus</h1>
    <div class="input-row">
      <input id="tree-input" spellcheck="false" autocomplete="off" aria-label="Tree in △ notation"
             placeholder="△(△△)(△△△) or S K K △" />
      <button id="var-btn" type="button" title="Make the selected tree a variable">Var</button>
    </div>
    <div class="examples" id="examples"></div>
    <p class="error" id="error" role="alert"></p>
    <p class="status" id="status" role="status"></p>
  </section>

  <section class="panel top-right" aria-label="Tools">
    <div class="modes" role="radiogroup" aria-label="Click mode">
      <button type="button" role="radio" data-mode="add">Add</button>
      <button type="button" role="radio" data-mode="remove">Remove</button>
      <button type="button" role="radio" data-mode="move">Move</button>
    </div>
    <div class="row">
      <button id="undo-btn" type="button" title="Undo (Ctrl+Z)" aria-label="Undo">↶</button>
      <button id="redo-btn" type="button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo">↷</button>
      <button id="clear-btn" type="button" title="Remove every tree">Clear</button>
      <span class="sep"></span>
      <button id="zoom-out-btn" type="button" title="Zoom out (−)" aria-label="Zoom out">−</button>
      <button id="zoom-in-btn" type="button" title="Zoom in (+)" aria-label="Zoom in">+</button>
      <button id="fit-btn" type="button" title="Fit all trees (F)">Fit</button>
      <button id="help-btn" type="button" title="Help (?)" aria-label="Help" aria-expanded="false">?</button>
    </div>
  </section>
  </div>

  <section class="panel help" id="help" hidden aria-label="Help">
    <p><b>Add</b> (A): click a node to give it a leaf branch, which applies it to △; click empty canvas to start a new tree. <b>Remove</b> (R): click to remove a branch, or a root to remove its tree. Shift-click swaps the two. <b>Move</b> (M): drag any node to tear it off.</p>
    <p>In every mode, drag a tree by its <b>root</b> onto a node of another tree to join them (that node is applied to it). The first click on a dimmed tree selects it.</p>
    <p><b>Reduce:</b> ▶| steps (→), |◀ steps back (←), Space plays and pauses. Click a K/S/F letter to reduce that redex instead. The card above the playback buttons shows the rule; with <b>Colours</b> on, its parts w, x, y, z are coloured in the tree, and ▶| goes in half-steps: the first click applies the rule (the colours follow the parts), the second moves the colours to the next step. Hover a letter to preview that redex.</p>
    <p><b>Booleans</b> from the book (§3.5) are built in: true = K, false = K I, and, or, implies, not, iff. Try <i>not true</i> from the Examples. So are the numbers (n = Kⁿ △: zero, succ, isZero, pred), the queries isLeaf, isStem, isFork, and selfApply.</p>
    <p><b>Book notation:</b> type d{x}, first{p}, second{p}, query{a, b, c}, wait{x, y} and swap{f} with trees for the arguments, e.g. <i>d{K}</i>; they become the tree directly. Powers: <i>K**4 I</i> (shown as <i>K⁴ I</i>) is K(K(K(K I))). Numbers can be typed as digits: <i>3</i> is K³ △.</p>
    <p><b>Variables:</b> right-click a node → <i>Name this…</i> (or the <b>Var</b> button) to save it as a variable (V, x2, isZero…). It shows as a chip; type its name (names need spaces between them: <i>S K V</i>) or use the Add menu to make more. Right-click a chip to expand it; <i>Expand all</i> / <i>Collapse all</i> do a whole subtree. An open variable shows its name in a hollow tag: click the tag to collapse it. Reductions open a chip only when a rule needs its insides.</p>
    <p><b>Add menu:</b> click a button to add a new tree, or drag it onto a node to attach it there.</p>
    <p><b>Copy and paste:</b> ⌘/Ctrl+C copies the subtree under the pointer (or the selected tree) as △ text; ⌘/Ctrl+V pastes onto the node under the pointer, or as a new tree. Also in the right-click menu.</p>
    <p><b>View:</b> drag empty space or scroll to pan; ctrl/⌘ + scroll or pinch to zoom; F fits everything.</p>
  </section>

  <div class="hud bottom">
  <section class="panel bottom-left" aria-label="Current tree">
    <span class="panel-label">Current tree</span>
    <code id="notation" title="Click to show all"></code>
    <code id="notation-raw" title="The same tree in plain △ notation"></code>
  </section>

  <section class="panel bottom-center playback" aria-label="Reduction playback">
    <div class="status-row">
      <span id="frame-label"></span>
      <label class="colours-toggle" title="Colour the parts w, x, y, z of each rule in the tree">
        <input id="colours" type="checkbox" /> Colours
      </label>
    </div>
    <div id="rule-card" aria-live="polite"></div>
    <div class="controls">
    <button id="back-btn" type="button" title="Step back (←)" aria-label="Step back">|◀</button>
    <button id="play-btn" type="button" title="Play (Space)">▶ Play</button>
    <button id="fwd-btn" type="button" title="Step forward (→)" aria-label="Step forward">▶|</button>
    <input id="scrub" type="range" min="0" max="0" value="0" aria-label="Reduction steps" />
    <label class="play-speed" title="Steps per second while playing">
      <span>Speed</span>
      <input id="play-speed" type="range" min="0.25" max="4" step="0.25" value="1" />
      <output id="play-speed-out">1</output>
    </label>
    </div>
  </section>

  <section class="bottom-right">
    <div class="panel tuning" id="tuning" hidden aria-label="Physics tuning">
      <div id="sliders"></div>
      <div class="row">
        <button id="defaults-btn" type="button">Defaults</button>
        <button id="copy-btn" type="button">Copy values</button>
      </div>
    </div>
    <button id="gear-btn" class="gear" type="button" title="Physics tuning" aria-label="Physics tuning"
            aria-expanded="false" aria-controls="tuning">⚙</button>
  </section>
  </div>

  <div class="panel context-menu" id="context-menu" role="menu" hidden></div>
`

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!
const input = $<HTMLInputElement>('#tree-input')
const errorBox = $<HTMLParagraphElement>('#error')
const svg = $<SVGSVGElement>('#canvas')
const notation = $<HTMLElement>('#notation')
const notationRaw = $<HTMLElement>('#notation-raw')
const statusBox = $<HTMLParagraphElement>('#status')
const menu = $<HTMLDivElement>('#context-menu')
const ruleCard = $<HTMLDivElement>('#rule-card')
const coloursBox = $<HTMLInputElement>('#colours')
const varBtn = $<HTMLButtonElement>('#var-btn')
const backBtn = $<HTMLButtonElement>('#back-btn')
const playBtn = $<HTMLButtonElement>('#play-btn')
const fwdBtn = $<HTMLButtonElement>('#fwd-btn')
const scrub = $<HTMLInputElement>('#scrub')
const frameLabel = $<HTMLSpanElement>('#frame-label')
const playSpeed = $<HTMLInputElement>('#play-speed')
const undoBtn = $<HTMLButtonElement>('#undo-btn')
const redoBtn = $<HTMLButtonElement>('#redo-btn')
const clearBtn = $<HTMLButtonElement>('#clear-btn')
const helpBtn = $<HTMLButtonElement>('#help-btn')
const helpPanel = $<HTMLElement>('#help')
const examples = $<HTMLDivElement>('#examples')
const sliders = $<HTMLDivElement>('#sliders')

const scene = new Scene(svg)
const newId = idSource()

// --- Variables (milestone 9), saved in the browser ----------------------------------

const loaded = loadVarsReport(readStorage())
let vars: Vars = loaded.vars
const lookup = (name: string) => lookupIn(vars)(name)

function readStorage(): string | null {
  try { return localStorage.getItem(VARS_KEY) } catch { return null }
}

function saveVarsNow(): void {
  try { localStorage.setItem(VARS_KEY, saveVars(vars)) } catch { /* private window: not saved */ }
}

/** A tree with its variables, as written: collapsed chips by name. */
function namedText(t: PlacedTree): string {
  const f = fragmentAt(t.tree, t.ids, ws.marks)
  return showNamed(f.tree, f.marks.filter((m) => !m.mark.expanded))
}

let statusTimer: number | null = null
function say(text: string): void {
  statusBox.textContent = text
  if (statusTimer !== null) clearTimeout(statusTimer)
  statusTimer = window.setTimeout(() => (statusBox.textContent = ''), 10000)
}

// --- State and history ---------------------------------------------------------
//
// The whole workspace is one immutable value. Every action makes a new one and
// pushes the old one onto the undo stack; undo/redo just swap them back, and
// because each tree carries its node ids, nodes glide back on undo.

let ws: Workspace = emptyWorkspace()
let mode: Mode = 'add'
const undoStack: Workspace[] = []
const redoStack: Workspace[] = []
let lastTypedKey: string | null = null   // consecutive keystrokes = one undo step

// The reduction run being watched (see run.ts). While there is one, `ws` is
// always the frame it's on. To the undo history the whole run is one action:
// starting it pushes one undo entry, and any edit, undo or redo ends it.
let run: Run | null = null
let playing = false
let playTimer: number | null = null

// --- Rule card and colours (milestone 10) ------------------------------------------
//
// One set of colours at a time: the parts w, x, y, z of the next step (or of
// the redex whose letter you hover), or of the step that just fired.
//
// With Colours on, ▶| goes in half-steps: the first click applies the rule and
// the colours stay on the parts that moved ("Just now"); the second click
// moves the colours (and the card) on to the next step. While the next step is
// previewed, the chips it has to look inside are opened just for show, so its
// coloured parts are visible; they fold back if you leave without firing it.
// With Colours off, ▶| is a whole step and the card moves on once the motion
// settles.

type Shown = { rule: Rule; parts: Parts; bindings: [part: string, text: string][]; done: boolean }
let justDid: Shown | null = null        // the rule just applied (first half-step)
let hoverRedex: { treeKey: string; path: Path } | null = null
let colouring = (() => { try { return localStorage.getItem(COLOURS_KEY) !== 'off' } catch { return true } })()
let settleTimer: number | null = null
let lastDisplayMarks: Marks = new Map() // marks as last drawn (with the preview's opened chips)
let lastOpen = ''                       // chips opened for the preview, as last drawn
// Chips you just collapsed yourself: the preview doesn't reopen them until
// the next step fires (or the next edit).
let keepClosed = new Set<string>()
// The preview only opens chips once you've started stepping this tree (▶|,
// Play, a K/S/F letter or the scrubber). Selecting another tree, clicking
// empty canvas, editing, undo or redo stops it until you step again.
let previewArmed = false

/** The parts of the step `rule` at `path` in `t`; `born` (after the step)
 *  colours the S rule's copy of z too. */
function describeParts(t: PlacedTree, marks: Marks, rule: Rule, path: Path, born?: ReadonlyMap<string, string>): Shown {
  const { parts } = partsOf(t.ids, { rule, path })
  const bindings = PART_PATHS[rule].map(([part, rel]): [string, string] => {
    const f = fragmentAt(t.tree, t.ids, marks, [...path, ...rel])
    return [part, showNamed(f.tree, f.marks.filter((m) => !m.mark.expanded))]
  })
  return { rule, parts: born ? carryParts(parts, born) : parts, bindings, done: born !== undefined }
}

/** "Just now" for the rule frame at `pos` of `r`. */
function justDidAt(r: Run, pos: number): Shown | null {
  const f = r.frames[pos]
  const prev = r.frames[pos - 1]?.ws
  const t = prev && getTree(prev, r.treeKey)
  return t && f.rule && f.path ? describeParts(t, prev.marks, f.rule, f.path, f.born ?? new Map()) : null
}

/** The step the selected tree would take next (or the hovered badge's). */
function nextStepOf(t: PlacedTree): { rule: Rule; path: Path } | null {
  if (hoverRedex?.treeKey === t.key) {
    const r = allRedexes(t.tree).find((x) => x.path.join() === hoverRedex!.path.join())
    if (r) return r
  }
  const i = run?.treeKey === t.key ? nextRuleFrame(run) : null
  const recorded = i !== null ? run!.frames[i] : undefined
  if (recorded?.rule && recorded.path) return { rule: recorded.rule, path: recorded.path }
  return step(t.tree)
}

/** What the card and the colours show now, and which chips the preview opens. */
function currentShown(): { shown: Shown | null; open: string[] } {
  if (justDid) return { shown: justDid, open: [] }
  const sel = getTree(ws, ws.selected)
  const next = sel && nextStepOf(sel)
  if (!sel || !next) return { shown: null, open: [] }
  return {
    shown: describeParts(sel, ws.marks, next.rule, next.path),
    open: colouring && previewArmed ? chipsToUnfold(sel.ids, ws.marks, next.path).filter((id) => !keepClosed.has(id)) : [],
  }
}

/** Update the colours and the card; redraw only if the preview opens or
 *  closes chips (that changes the layout). */
function updateColours(): void {
  const { shown, open } = currentShown()
  if (open.join() !== lastOpen) {
    render()
    return
  }
  scene.setParts(colouring && shown ? shown.parts : new Map())
  renderCard(shown)
  waitToSettle()
}

/** Colours off: "Just now" lasts until the motion settles. */
function waitToSettle(): void {
  if (justDid && !colouring && settleTimer === null) {
    const check = () => {
      settleTimer = null
      if (!justDid || colouring) return
      if (scene.isSettled(0.3)) {
        justDid = null
        updateColours()
      } else settleTimer = window.setTimeout(check, 80)
    }
    settleTimer = window.setTimeout(check, 150)
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const lettered = (s: string) => esc(s).replace(/[wxyz]/g, (c) => `<span class="part-${c}">${c}</span>`)
const short = (s: string) => (s.length > 22 ? s.slice(0, 21) + '…' : s)

function renderCard(shown: Shown | null): void {
  ruleCard.hidden = !shown
  if (!shown) return
  const { before, after } = RULE_TEXT[shown.rule]
  // Segments: rule · equation · one per part, with a divider between. Which
  // side of the equation is lit says where we are: the left side before the
  // rule fires (next step), the right side once it has (just applied).
  ruleCard.classList.toggle('done', shown.done)
  ruleCard.setAttribute('aria-label', shown.done ? 'Rule just applied' : 'Next rule')
  const segs = [
    `<b>${shown.rule} rule</b>`,
    `<code class="eq"><span class="lhs">${lettered(before)}</span> → <span class="rhs">${lettered(after)}</span></code>`,
    ...shown.bindings.map(([p, t]) => `<span class="part-${p}">${p}</span> = <code title="${esc(t)}">${esc(short(t))}</code>`),
  ]
  ruleCard.innerHTML = segs.map((x) => `<span class="seg">${x}</span>`).join('')
}

/** Variables a normal form of tree `key` might be: yours (the ones used in
 *  the tree first), then true and false, but only if the tree used a boolean.
 *  (K, I, D and S never: every △△ would become K, and true is K too.) */
function resultCandidates(key: string): { name: string; def: Tree }[] {
  const t = getTree(ws, key)
  const used = new Set(t ? fragmentAt(t.tree, t.ids, ws.marks).marks.map((m) => m.mark.name) : [])
  const mine = [...vars.values()].filter((v) => !v.builtin)
  // (isZero and the queries answer with true or false too)
  const truth = [...BOOLEANS, 'isZero', ...QUERIES].some((b) => used.has(b)) ? ['true', 'false'].map((n) => vars.get(n)!) : []
  // Numbers, if the tree used them (3, zero, succ, pred): pred 3 ends as 2.
  const usesNumbers = [...used].some((n) => /^\d+$/.test(n)) || ['zero', 'succ', 'pred'].some((n) => used.has(n))
  const numbers = usesNumbers ? Array.from({ length: 65 }, (_, n) => ({ name: String(n), tree: numberTree(n).tree })) : []
  return [...mine.filter((v) => used.has(v.name)), ...mine.filter((v) => !used.has(v.name)), ...truth, ...numbers]
    .map((v) => ({ name: v.name, def: v.tree }))
}

/** Apply a change. `typing`: consecutive keystrokes in one tree are one undo
 *  step. `sameAction`: part of the previous action (a drop that ends a tear),
 *  so it doesn't get an undo step of its own. */
function commit(change: Change, opts: { typing?: boolean; sameAction?: boolean; keepClosed?: readonly string[] } = {}): void {
  endRun()
  const coalesce = opts.sameAction || (opts.typing && lastTypedKey !== null && lastTypedKey === change.ws.selected)
  if (!coalesce) undoStack.push(ws)
  redoStack.length = 0
  lastTypedKey = opts.typing ? change.ws.selected : null
  ws = change.ws
  justDid = null
  previewArmed = false
  keepClosed = new Set(opts.keepClosed ?? [])
  if (change.message) say(change.message)
  render(change.born, change.absorbed)
}

// Trees on screen at the last render: new ones get brought into view.
let shownKeys = new Set<string>()

function render(born?: ReadonlyMap<string, string>, absorbed?: ReadonlyMap<string, string>): void {
  // The camera never jumps. It only glides to reveal trees that just appeared
  // (added, torn off, brought back by undo) and, while playing, the tree being
  // played as it grows; and only if they'd otherwise be off screen.
  const keys = ws.trees.map((t) => t.key)
  const reveal = keys.filter((k) => !shownKeys.has(k))
  if (playing && ws.selected) reveal.push(ws.selected)
  shownKeys = new Set(keys)
  // Chips the preview opens just for show (see the rule card section).
  const { shown, open } = currentShown()
  const display = open.length ? setExpanded(ws.marks, open, true) : ws.marks
  const sel = getTree(ws, ws.selected)
  if (sel) {
    // Opening or closing chips (for real or for the preview): nodes sprout out of / slide into them.
    const d = revealDiff(sel.ids, lastDisplayMarks, display)
    born = new Map([...d.born, ...(born ?? [])])
    absorbed = new Map([...d.absorbed, ...(absorbed ?? [])])
  }
  lastDisplayMarks = display
  lastOpen = open.join()
  scene.setWorkspace(
    ws.trees.map((t) => ({
      ...t,
      nextRedex: step(t.tree)?.path ?? null,
      redexes: allRedexes(t.tree),
      chips: collapsedChips(t.ids, display),
      openVars: new Map([...openVariables(t.ids, display)].filter(([, c]) => ws.marks.get(c.id)?.expanded)),
    })),
    { selected: ws.selected, born, reveal, absorbed },
  )
  if (!sel) {
    notation.textContent = ''
    notationRaw.textContent = ''
  } else {
    const named = namedText(sel)
    const raw = show(sel.tree)
    notation.textContent = named
    notationRaw.textContent = named === raw ? '' : raw
    // Keep the input box showing the selected tree, unless you're typing in it.
    if (document.activeElement !== input) {
      input.value = named
      errorBox.textContent = ''
    }
  }
  renderPlayback()
  undoBtn.disabled = undoStack.length === 0
  redoBtn.disabled = redoStack.length === 0
  clearBtn.disabled = ws.trees.length === 0
  varBtn.disabled = !sel
  scene.setParts(colouring && shown ? shown.parts : new Map())
  renderCard(shown)
  waitToSettle()
}

function undo(): void {
  endRun()
  const prev = undoStack.pop()
  if (!prev) return
  redoStack.push(ws)
  ws = prev
  lastTypedKey = null
  justDid = null
  previewArmed = false
  say('')
  render()
}

function redo(): void {
  endRun()
  const next = redoStack.pop()
  if (!next) return
  undoStack.push(ws)
  ws = next
  lastTypedKey = null
  justDid = null
  previewArmed = false
  say('')
  render()
}

// --- Reduction runs and playback -------------------------------------------------

/** Stop playback and finish the current run (for edits, undo, redo...). */
function endRun(): void {
  pause()
  closeRun()
}

/** Finish the current run: keep whatever frame it's on. A run that ended up
 *  back at its start changed nothing, so it leaves no undo entry. */
function closeRun(): void {
  if (!run) return
  if (run.pos === 0 && undoStack.at(-1) === run.frames[0].ws) undoStack.pop()
  run = null
}

/** The run for the selected tree, starting one if needed. */
function ensureRun(): Run | null {
  const key = ws.selected
  if (!key) return null
  if (run?.treeKey === key) return run
  closeRun()                  // (doesn't pause: Play starts runs too)
  undoStack.push(ws)          // the whole run is one undo step
  redoStack.length = 0
  lastTypedKey = null
  run = startRun(ws, key, resultCandidates(key))
  say('')
  return run
}

/** Show the result of moving through a run. False if it couldn't move. */
function applyMove(r: Moved | Stopped | null): boolean {
  if (r === null) return false
  if ('stopped' in r) {
    say(r.message)
    renderPlayback()
    return false
  }
  // Forward onto a rule: keep its parts coloured while they travel.
  const forwardOnto = run !== null && r.run.pos > run.pos && r.run.frames[r.run.pos].rule
  justDid = forwardOnto ? justDidAt(r.run, r.run.pos) : null
  keepClosed = new Set()
  run = r.run
  ws = currentWs(run)
  render(r.born, r.absorbed)
  announceEnd()
  return true
}

function announceEnd(): void {
  if (!run || !atEnd(run) || canGoForward()) return
  const n = stepsBefore(run)
  say(n ? `Reached a normal form after ${n} step${n === 1 ? '' : 's'}.` : 'Nothing to reduce: this tree is a value.')
}

/** With colours on, unfold frames are shown by the preview: move past them. */
function skipUnfold(m: Moved | Stopped): Moved | Stopped {
  if (!colouring || 'stopped' in m) return m
  if (!m.run.frames[m.run.pos].unfold || atEnd(m.run)) return m
  const n = forward(m.run, newId)
  if ('stopped' in n) return m
  return { run: n.run, born: new Map([...(m.born ?? []), ...(n.born ?? [])]), absorbed: n.absorbed }
}

function canGoForward(): boolean {
  const sel = getTree(ws, ws.selected)
  if (!sel) return false
  if (colouring && justDid) return true          // the second half-step is still to come
  if (run?.treeKey === sel.key && !atEnd(run)) return true
  if (step(sel.tree) !== null) return true
  // Nothing to reduce, but Play can still show what it is (succ 0 is exactly 1).
  const candidates = run?.treeKey === sel.key ? (run.recognise ?? []) : resultCandidates(sel.key)
  return recogniseResult(ws, sel.key, candidates) !== null
}

function stepForward(): boolean {
  if (colouring && !previewArmed) {
    // The first press starts the preview; if that opens chips to show the
    // coloured parts, that's all this press does (the next one applies the rule).
    previewArmed = true
    if (currentShown().open.length) {
      render()
      return true
    }
  }
  if (colouring && justDid) {
    // Second half-step: the colours move on to the next step.
    justDid = null
    if (run && !atEnd(run) && run.frames[run.pos + 1].recognised) return applyMove(forward(run, newId))
    render()
    announceEnd()
    return true
  }
  const r = ensureRun()
  return r !== null && applyMove(skipUnfold(forward(r, newId)))
}

function stepBack(): void {
  if (!run) return
  if (!colouring) {
    applyMove(back(run))
    return
  }
  if (justDid) {
    // Undo the rule just applied: back to its preview.
    justDid = null
    applyMove(seek(run, beforeRule(run)))
    return
  }
  // From a preview: back to the "Just now" of the rule before it.
  const f = run.frames[run.pos]
  if (f.recognised || f.unfold) {
    applyMove(back(run))
    if (!run.frames[run.pos].rule) return
  } else if (!f.rule) return
  justDid = justDidAt(run, run.pos)
  render()
}

function play(): void {
  if (playing || !canGoForward()) return
  playing = true
  renderPlayback()
  playTick()
}

function pause(): void {
  playing = false
  if (playTimer !== null) clearTimeout(playTimer)
  playTimer = null
  renderPlayback()
}

/** One beat of playback: wait for the last step's motion to calm down, then
 *  step, then wait 1 / (play speed) seconds. Stops at a normal form, the step
 *  limit or the size limit (with a message). */
function playTick(): void {
  playTimer = null
  if (!playing) return
  if (!scene.isSettled(0.45)) {
    playTimer = window.setTimeout(playTick, 60)
    return
  }
  if (!stepForward()) {
    pause()
    return
  }
  playTimer = window.setTimeout(playTick, 1000 / Number(playSpeed.value))
}

function renderPlayback(): void {
  const forwardOk = canGoForward()
  playBtn.textContent = playing ? '❚❚ Pause' : '▶ Play'
  playBtn.title = playing ? 'Pause (Space)' : 'Play (Space)'
  playBtn.disabled = !playing && !forwardOk
  fwdBtn.disabled = playing || !forwardOk
  const r = run?.treeKey === ws.selected ? run : null
  backBtn.disabled = playing || !r || (r.pos === 0 && !justDid)
  scrub.hidden = !r || r.frames.length < 2
  if (r) {
    scrub.max = String(r.frames.length - 1)
    scrub.value = String(r.pos)
  }
  frameLabel.textContent = r && r.frames.length > 1 ? describeFrame(r) : ''
}

playBtn.addEventListener('click', () => (playing ? pause() : play()))
fwdBtn.addEventListener('click', () => { stepForward() })
backBtn.addEventListener('click', stepBack)
scrub.addEventListener('input', () => {
  const to = Number(scrub.value)   // read it before pause() redraws the slider
  pause()
  previewArmed = true
  if (run) applyMove(seek(run, to))
})
coloursBox.checked = colouring
coloursBox.addEventListener('change', () => {
  colouring = coloursBox.checked
  try { localStorage.setItem(COLOURS_KEY, colouring ? 'on' : 'off') } catch { /* not saved */ }
  updateColours()
})

playSpeed.addEventListener('input', () => {
  $<HTMLOutputElement>('#play-speed-out').textContent = playSpeed.value
})

// --- Modes -----------------------------------------------------------------------

function setMode(m: Mode): void {
  mode = m
  for (const b of document.querySelectorAll<HTMLButtonElement>('.modes button')) {
    const on = b.dataset.mode === m
    b.classList.toggle('active', on)
    b.setAttribute('aria-checked', String(on))
  }
  svg.dataset.mode = m
  svg.setAttribute('aria-description', MODE_HELP[m])
}

for (const b of document.querySelectorAll<HTMLButtonElement>('.modes button')) {
  b.title = MODE_HELP[b.dataset.mode as Mode]
  b.addEventListener('click', () => setMode(b.dataset.mode as Mode))
}

// --- View: zoom, fit, help, long notation ------------------------------------------

$<HTMLButtonElement>('#zoom-in-btn').addEventListener('click', () => scene.zoomBy(1.25))
$<HTMLButtonElement>('#zoom-out-btn').addEventListener('click', () => scene.zoomBy(0.8))
$<HTMLButtonElement>('#fit-btn').addEventListener('click', () => scene.fitAll())

function toggleHelp(show = helpPanel.hidden !== false): void {
  helpPanel.hidden = !show
  helpBtn.setAttribute('aria-expanded', String(show))
  helpBtn.classList.toggle('active', show)
}
helpBtn.addEventListener('click', () => toggleHelp())

// The ⚙ button stays put; the tuning sliders pop up above it.
const gearBtn = $<HTMLButtonElement>('#gear-btn')
const tuningPanel = $<HTMLElement>('#tuning')
function toggleTuning(show = tuningPanel.hidden !== false): void {
  tuningPanel.hidden = !show
  gearBtn.setAttribute('aria-expanded', String(show))
  gearBtn.classList.toggle('active', show)
}
gearBtn.addEventListener('click', () => toggleTuning())

// Long △ text is cut to one line; click it to see all of it.
notation.addEventListener('click', () => notation.classList.toggle('expanded'))

// --- What clicks and drags on the canvas mean ------------------------------------

/** Make `treeKey` the selected tree (ends any run on the old one). */
function select(treeKey: string): void {
  if (ws.selected === treeKey) return
  endRun()
  ws = selectTree(ws, treeKey)
  justDid = null
  previewArmed = false
  render()
}

scene.events.onClick = ({ treeKey, path, shiftKey }) => {
  // In any mode, the first click on a dimmed (unselected) tree just selects it.
  if (ws.selected !== treeKey || mode === 'move') {
    select(treeKey)
    return
  }
  const adding = (mode === 'add') !== shiftKey   // shift flips add <-> remove
  commit(adding ? addLeafAt(ws, treeKey, path, newId) : removeAt(ws, treeKey, path as Path))
}

// Clicking an expanded variable's name tag collapses it.
scene.events.onCollapseClick = ({ treeKey, path }) => {
  const t = getTree(ws, treeKey)
  if (t) collapseKeep(collapseChip(ws, treeKey, idsAt(t.ids, path).id), [idsAt(t.ids, path).id])
}

/** Collapse, and keep those chips closed in the preview until the next step. */
function collapseKeep(change: Change, ids: readonly string[]): void {
  commit(change, { keepClosed: ids })
}

// In Add mode, clicking empty canvas makes a new one-node tree there.
// (Not when the click only closed the right-click menu.)
let menuClosedByPress = false
scene.events.onCanvasClick = ({ x, y }) => {
  if (menuClosedByPress) { menuClosedByPress = false; return }
  if (previewArmed) {
    previewArmed = false       // clicking off the tree folds the preview's chips away
    render()
  }
  if (mode === 'add') commit({ ...addTree(ws, [], newId, { x, y }), message: 'Added a leaf △ as a new tree. Click it to give it branches.' })
}

// Hovering a badge previews that redex in the rule card and the colours.
scene.events.onRedexHover = (r) => {
  hoverRedex = r
  if (!justDid) updateColours()
}

// Clicking a redex's badge reduces that redex (as a step of the run).
scene.events.onRedexClick = ({ treeKey, path }) => {
  if (ws.selected !== treeKey) {
    select(treeKey)            // first click on a dimmed tree only selects it
    return
  }
  pause()
  previewArmed = true
  const r = ensureRun()
  if (r) applyMove(skipUnfold(reduce(r, newId, path)))
}

// A tear and the drop that ends it are one action (one undo step).
let tearMessage: string | null = null

scene.events.onDragStart = ({ treeKey, path, x, y }) => {
  tearMessage = null
  // In Move mode, dragging a non-root node tears it off into its own tree.
  // The node keeps its id, so the scene carries on dragging it (now a root).
  if (mode === 'move' && path.length > 0) {
    const torn = tearOff(ws, treeKey, path, x, y)
    commit(torn)
    tearMessage = torn.message ?? ''
  }
}

scene.events.onDrop = ({ treeKey, x, y, target }) => {
  const sameAction = tearMessage !== null
  if (target && target.treeKey !== treeKey) {
    commit(joinTrees(ws, treeKey, target.treeKey, target.path), { sameAction })
  } else {
    const moved = moveTree(ws, treeKey, x, y)
    commit({ ...moved, ws: selectTree(moved.ws, treeKey), message: tearMessage ?? undefined }, { sameAction })
  }
  tearMessage = null
}

// --- Input box, examples, buttons, keys ---------------------------------------------

/** Show K**4 as K⁴ in the input box: while typing, once the number is
 *  finished (a number the cursor is still in stays as typed); on leaving
 *  the box, all of them. The cursor stays where it was. */
function superscriptInput(all: boolean): void {
  const before = input.value
  if (all) {
    input.value = toSuperscripts(before, true)
    return
  }
  const caret = input.selectionStart ?? before.length
  const left = toSuperscripts(before.slice(0, caret), false)
  const right = toSuperscripts(before.slice(caret), false)
  if (left + right === before) return
  input.value = left + right
  input.setSelectionRange(left.length, left.length)
}

function onInput(): void {
  superscriptInput(false)
  let p
  try {
    p = parseNamed(input.value.trim() || '△', lookup)
  } catch (e) {
    errorBox.textContent = (e as Error).message
    return // keep showing the last good tree
  }
  errorBox.textContent = ''
  // Typing edits the selected tree; with nothing selected, it starts one.
  commit(
    ws.selected ? replaceTree(ws, ws.selected, p.tree, newId, p.marks) : addTree(ws, p.tree, newId, undefined, p.marks),
    { typing: true },
  )
}

input.addEventListener('input', onInput)
input.addEventListener('blur', () => {
  lastTypedKey = null
  superscriptInput(true)
})

varBtn.addEventListener('click', () => {
  if (!ws.selected) return
  const r = varBtn.getBoundingClientRect()
  openNameForm(ws.selected, [], r.left, r.bottom + 6)
})

/** Add-menu buttons can be dragged onto the canvas: dropped on a node, that
 *  node is applied to the tree (like a paste); on empty canvas, it's a new
 *  tree there. A plain click still adds it as a new tree. */
function makeDraggable(b: HTMLButtonElement, text: string, afterAdd?: () => void): void {
  let dragged = false
  b.addEventListener('click', (e) => {
    if (dragged) { dragged = false; e.preventDefault(); return }
    commit(addFragment(ws, parseNamed(text, lookup), newId))
    afterAdd?.()
  })
  b.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (e.target as Element).closest('.delete')) return
    const x0 = e.clientX, y0 = e.clientY
    let ghost: HTMLElement | null = null
    const target = (ev: PointerEvent) =>
      document.elementFromPoint(ev.clientX, ev.clientY)?.closest('#canvas') ? scene.hitAt(ev.clientX, ev.clientY) : null
    const move = (ev: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return
        ghost = document.createElement('div')
        ghost.className = 'drag-ghost'
        ghost.textContent = b.firstChild?.textContent ?? text
        document.body.append(ghost)
      }
      ghost.style.left = `${ev.clientX}px`
      ghost.style.top = `${ev.clientY}px`
      scene.showDropTarget(target(ev)?.node?.id ?? null)
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (!ghost) return
      ghost.remove()
      scene.showDropTarget(null)
      dragged = true                      // swallow the click that follows
      setTimeout(() => (dragged = false), 0)
      const hit = ev.type === 'pointerup' ? target(ev) : null
      if (hit) pasteFragment(parseNamed(text, lookup), hit)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  })
}

/** The Add menu: △, the built-in variables, examples, then your variables. */
// Sections of the Add menu: Basics is always shown; Examples and Yours fold
// open and closed (remembered). Yours scrolls when long, and gets a filter box
// once there are more than FILTER_FROM variables.
const ADD_OPEN_KEY = 'tree-calculus-add-open'
const FILTER_FROM = 8
let addOpen: Record<string, boolean> = (() => {
  const defaults = { booleans: true, numbers: false, queries: false, templates: false, examples: false, yours: true }
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(ADD_OPEN_KEY) ?? '{}') } } catch { return defaults }
})()
let varFilter = ''

function renderAddMenu(): void {
  const button = (into: HTMLElement, label: string, text: string, title = `Add ${text} as a new tree (or drag it onto a node)`, afterAdd?: () => void) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.title = title
    makeDraggable(b, text, afterAdd)
    into.append(b)
    return b
  }
  const section = (key: string, title: string) => {
    const d = document.createElement('details')
    d.className = 'add-group'
    d.open = addOpen[key] ?? false
    d.innerHTML = `<summary>${title}</summary><div class="add-items"></div>`
    d.addEventListener('toggle', () => {
      addOpen = { ...addOpen, [key]: d.open }
      try { localStorage.setItem(ADD_OPEN_KEY, JSON.stringify(addOpen)) } catch { /* not saved */ }
    })
    examples.append(d)
    return d.querySelector<HTMLDivElement>('.add-items')!
  }

  examples.replaceChildren()
  const basics = document.createElement('div')
  basics.className = 'add-row'
  basics.innerHTML = '<span class="label">Add</span>'
  examples.append(basics)
  button(basics, '△', '△')
  const builtin = (into: HTMLElement, v: { name: string; text: string }) =>
    button(into, v.name, v.name, `Add ${v.name} = ${v.text} (or drag it onto a node)`).classList.add('var')
  const grouped = [...BOOLEANS, ...NUMBERS, ...QUERIES]
  for (const v of vars.values()) if (v.builtin && !grouped.includes(v.name)) builtin(basics, v)

  for (const [key, title, names] of [['booleans', 'Booleans', BOOLEANS], ['numbers', 'Numbers', NUMBERS], ['queries', 'Queries', QUERIES]] as const) {
    const into = section(key, title)
    for (const n of names) builtin(into, vars.get(n)!)
    if (key === 'numbers') {
      // 0 to 10 by name: n is the book's Kⁿ △ (any number up to MAX_NUMBER can be typed)
      for (let n = 0; n <= 10; n++) button(into, String(n), String(n), `Add ${n} = ${n ? `K${toSuperscripts(`**${n}`)} △` : '△'} (or drag it onto a node; numbers up to ${MAX_NUMBER} can be typed)`).classList.add('var')
    }
  }

  // The book's notation with parameters: adds it with △ for each argument,
  // then puts the cursor on the first △ in the input box, ready to replace.
  const tpl = section('templates', 'Templates')
  for (const [name, t] of Object.entries(TEMPLATES)) {
    const text = `${name}{${t.params.map(() => '△').join(', ')}}`
    button(tpl, `${name}{${t.params.join(', ')}}`, text, `Add ${name}{${t.params.join(', ')}} = ${t.body}, with △ for each argument; then type over them`, () => {
      input.focus()
      const at = input.value.indexOf('{') + 1
      input.setSelectionRange(at, at + 1)
    }).classList.add('var')
  }

  const ex = section('examples', 'Examples')
  for (const [label, text] of EXAMPLES) button(ex, label, text)

  const mine = [...vars.values()].filter((v) => !v.builtin)
  if (mine.length === 0) return
  const yours = section('yours', `Yours (${mine.length})`)
  yours.classList.add('var-list')
  if (mine.length > FILTER_FROM) {
    const f = document.createElement('input')
    f.className = 'var-filter'
    f.placeholder = 'Filter…'
    f.spellcheck = false
    f.setAttribute('aria-label', 'Filter your variables')
    f.value = varFilter
    yours.before(f)
    f.addEventListener('input', () => {
      varFilter = f.value
      const q = varFilter.trim().toLowerCase()
      for (const b of yours.querySelectorAll<HTMLButtonElement>('button')) b.hidden = !!q && !b.dataset.name!.toLowerCase().includes(q)
    })
  }
  const q = varFilter.trim().toLowerCase()
  for (const v of mine) {
    const b = button(yours, v.name, v.name, `Add ${v.name} = ${v.text} (or drag it onto a node)`)
    b.classList.add('var', 'user-var')
    b.dataset.name = v.name
    b.hidden = !!q && !v.name.toLowerCase().includes(q)
    const del = document.createElement('span')
    del.className = 'delete'
    del.textContent = '×'
    del.title = `Forget the variable ${v.name}`
    del.setAttribute('role', 'button')
    del.addEventListener('click', (e) => {
      e.stopPropagation()
      if (!confirm(`Forget the variable ${v.name}? Chips already on the canvas stay.`)) return
      vars = deleteVar(vars, v.name)
      saveVarsNow()
      renderAddMenu()
    })
    b.append(del)
  }
}
renderAddMenu()

// --- Copy and paste (milestone 9) ---------------------------------------------------
//
// The system clipboard gets plain △ text. We also keep our own copy with the
// variables in it, and use that when the clipboard still holds the same text.

let clip: { frag: Fragment; text: string } | null = null
let pointer: { clientX: number; clientY: number } | null = null

svg.addEventListener('pointermove', (e) => { pointer = { clientX: e.clientX, clientY: e.clientY } })
svg.addEventListener('pointerleave', () => { pointer = null })
// Clicking the canvas leaves the input box, so ⌘C / ⌘V act on the canvas.
svg.addEventListener('pointerdown', () => { if (document.activeElement === input) input.blur() })

/** The subtree to copy: under `hit`, or the selected tree. */
function copyTarget(hit: PointHit | null): Fragment | null {
  const node = hit?.node
  const t = getTree(ws, node?.treeKey ?? ws.selected)
  if (!t) return null
  return fragmentAt(t.tree, t.ids, ws.marks, node?.path ?? [])
}

function remember(frag: Fragment): string {
  const text = show(frag.tree)
  clip = { frag, text }
  const named = showNamed(frag.tree, frag.marks.filter((m) => !m.mark.expanded))
  say(`Copied ${named.length > 40 ? named.slice(0, 40) + '…' : named}`)
  return text
}

/** Paste onto the node under `hit`, or as a new tree where it points. */
function pasteFragment(frag: Fragment, hit: PointHit | null): void {
  if (hit?.node) commit(pasteOnto(ws, hit.node.treeKey, hit.node.path, frag, newId))
  else commit(addFragment(ws, frag, newId, hit ? { x: hit.x, y: hit.y } : undefined))
}

function fragmentFromText(text: string): Fragment | null {
  if (clip && text === clip.text) return clip.frag
  try {
    return parseNamed(text.trim(), lookup)
  } catch (e) {
    say(`Can't paste that: ${(e as Error).message}`)
    return null
  }
}

const hitUnderPointer = () => (pointer ? scene.hitAt(pointer.clientX, pointer.clientY) : null)
const typingInField = () => document.activeElement instanceof HTMLInputElement && document.activeElement.type !== 'range'

document.addEventListener('copy', (e) => {
  if (typingInField() || !e.clipboardData) return
  const frag = copyTarget(hitUnderPointer())
  if (!frag) return
  e.preventDefault()
  e.clipboardData.setData('text/plain', remember(frag))
})

document.addEventListener('paste', (e) => {
  if (typingInField()) return
  const text = e.clipboardData?.getData('text/plain') ?? ''
  e.preventDefault()
  const frag = text ? fragmentFromText(text) : clip?.frag
  if (frag) pasteFragment(frag, hitUnderPointer())
})

// --- Right-click menu ------------------------------------------------------------------

function closeMenu(): void {
  menu.hidden = true
  menu.replaceChildren()
}

function openMenu(hit: PointHit, clientX: number, clientY: number): void {
  closeMenu()
  const item = (label: string, action: () => void, title?: string) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.setAttribute('role', 'menuitem')
    b.textContent = label
    if (title) b.title = title
    b.addEventListener('click', () => { closeMenu(); action() })
    menu.append(b)
  }
  const paste = async (at: PointHit) => {
    let text = ''
    try { text = await navigator.clipboard.readText() } catch { /* no permission: use our own copy */ }
    const frag = text ? fragmentFromText(text) : clip?.frag
    if (frag) pasteFragment(frag, at)
    else say('Nothing to paste: copy a tree first.')
  }

  const node = hit.node
  const t = node && getTree(ws, node.treeKey)
  if (node && t) {
    const mark = ws.marks.get(node.id)
    if (mark && !mark.expanded) {
      item(`Expand ${mark.name}`, () => commit(expandChip(ws, node.treeKey, node.id)))
    }
    const around = enclosingMarks(t.ids, ws.marks, node.path).find((id) => ws.marks.get(id)!.expanded)
    if (around) item(`Collapse ${ws.marks.get(around)!.name}`, () => collapseKeep(collapseChip(ws, node.treeKey, around), [around]))
    const below = marksBelow(t.ids, ws.marks, node.path).map((id) => ws.marks.get(id)!)
    if (below.some((m) => !m.expanded)) {
      item('Expand all', () => commit(setAllBelow(ws, node.treeKey, node.path, true)), 'Open every variable in this subtree')
    }
    if (below.some((m) => m.expanded)) {
      item('Collapse all', () => collapseKeep(setAllBelow(ws, node.treeKey, node.path, false), marksBelow(t.ids, ws.marks, node.path)), 'Close every variable in this subtree')
    }
    item('Copy', () => {
      const frag = copyTarget(hit)
      if (frag) navigator.clipboard?.writeText(remember(frag)).catch(() => {})
    }, '⌘/Ctrl+C over a node')
    item('Paste here', () => paste(hit), 'Apply this node to the copied tree (⌘/Ctrl+V over a node)')
    item('Name this…', () => openNameForm(node.treeKey, node.path, clientX, clientY))
    item(node.path.length ? 'Remove' : 'Remove tree', () => commit(removeAt(ws, node.treeKey, node.path)))
  } else {
    item('Paste', () => paste(hit), 'Paste as a new tree here (⌘/Ctrl+V)')
  }
  showMenuAt(clientX, clientY)
  menu.querySelector('button')?.focus()
}

function showMenuAt(clientX: number, clientY: number): void {
  menu.hidden = false
  const r = menu.getBoundingClientRect()
  menu.style.left = `${Math.max(4, Math.min(clientX, innerWidth - r.width - 4))}px`
  menu.style.top = `${Math.max(4, Math.min(clientY, innerHeight - r.height - 4))}px`
}

function openNameForm(treeKey: string, path: Path, clientX: number, clientY: number): void {
  closeMenu()
  const form = document.createElement('form')
  form.className = 'name-form'
  form.innerHTML = `<label>Name <input name="name" spellcheck="false" autocomplete="off" maxlength="20" placeholder="V" /></label>
    <button type="submit">Save</button><p class="error"></p>`
  const field = form.querySelector('input')!
  const err = form.querySelector<HTMLParagraphElement>('.error')!
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const name = field.value.trim()
    const problem = nameProblem(vars, name)
    if (problem) { err.textContent = problem; return }
    if (vars.has(name) && !confirm(`Replace the variable ${name}? Chips already on the canvas keep the old meaning.`)) return
    const t = getTree(ws, treeKey)
    if (!t) return closeMenu()
    vars = defineVar(vars, name, fragmentAt(t.tree, t.ids, ws.marks, path))
    saveVarsNow()
    renderAddMenu()
    closeMenu()
    commit(nameAt(ws, treeKey, path, name))
    say(`Saved ${name}. Type ${name} or use the Add menu to make more.`)
  })
  menu.append(form)
  showMenuAt(clientX, clientY)
  field.focus()
}

scene.events.onContextMenu = ({ clientX, clientY, ...hit }) => openMenu(hit, clientX, clientY)
document.addEventListener('pointerdown', (e) => {
  menuClosedByPress = false
  if (!menu.hidden && !menu.contains(e.target as Node)) {
    closeMenu()
    menuClosedByPress = true
  }
}, { capture: true })

undoBtn.addEventListener('click', undo)
redoBtn.addEventListener('click', redo)
clearBtn.addEventListener('click', () => commit({ ws: { ...ws, trees: [], selected: null } }))

document.addEventListener('keydown', (e) => {
  const focused = document.activeElement
  const typing = focused instanceof HTMLInputElement && focused.type !== 'range'
  const onSlider = focused instanceof HTMLInputElement && focused.type === 'range'
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey
  if (plain && !typing && e.key === ' ') {
    e.preventDefault()          // also stops a focused button from being "clicked"
    if (playing) pause()
    else play()
    return
  }
  if (plain && !typing && !onSlider && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    e.preventDefault()
    pause()
    if (e.key === 'ArrowRight') stepForward()
    else stepBack()
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
    e.preventDefault()
    if (e.shiftKey) redo()
    else undo()
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) {
    e.preventDefault()
    redo()
  } else if (!typing && plain && (e.key === 'f' || e.key === 'F')) {
    scene.fitAll()
  } else if (!typing && plain && (e.key === '+' || e.key === '=')) {
    scene.zoomBy(1.25)
  } else if (!typing && plain && (e.key === '-' || e.key === '_')) {
    scene.zoomBy(0.8)
  } else if (!typing && plain && e.key === '?') {
    toggleHelp()
  } else if (e.key === 'Escape') {
    closeMenu()
    toggleHelp(false)
    toggleTuning(false)
  } else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const m = ({ a: 'add', r: 'remove', m: 'move' } as const)[e.key.toLowerCase() as 'a' | 'r' | 'm']
    if (m) setMode(m)
  }
})

setMode('add')

// --- Physics tuning sliders (temporary: tune by eye, then hard-code the
// values you like into DEFAULT_PARAMS in scene.ts) --------------------------

const SLIDERS: { key: keyof PhysicsParams; label: string; min: number; max: number; step: number }[] = [
  { key: 'linkStrength', label: 'Spring stiffness', min: 0, max: 1, step: 0.05 },
  { key: 'pullX', label: 'Pull to target (x)', min: 0, max: 1, step: 0.05 },
  { key: 'pullY', label: 'Pull to target (y)', min: 0, max: 1, step: 0.05 },
  { key: 'repulsion', label: 'Repulsion', min: 0, max: 150, step: 5 },
  { key: 'orderStrength', label: 'Keep branch order', min: 0, max: 1, step: 0.05 },
  { key: 'damping', label: 'Damping', min: 0.05, max: 0.9, step: 0.05 },
  { key: 'speed', label: 'Animation speed', min: 0.1, max: 2, step: 0.05 },
]

const sliderInputs = new Map<keyof PhysicsParams, HTMLInputElement>()
for (const spec of SLIDERS) {
  const row = document.createElement('label')
  row.className = 'slider'
  row.innerHTML = `<span>${spec.label}</span>
    <input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}" />
    <output></output>`
  const range = row.querySelector('input')!
  const out = row.querySelector('output')!
  range.value = String(scene.getParams()[spec.key])
  out.textContent = range.value
  range.addEventListener('input', () => {
    out.textContent = range.value
    scene.setParams({ [spec.key]: Number(range.value) })
  })
  sliderInputs.set(spec.key, range)
  sliders.append(row)
}

document.querySelector('#defaults-btn')!.addEventListener('click', () => {
  scene.setParams(DEFAULT_PARAMS)
  for (const [key, range] of sliderInputs) {
    range.value = String(DEFAULT_PARAMS[key])
    range.nextElementSibling!.textContent = range.value
  }
})

document.querySelector('#copy-btn')!.addEventListener('click', async (e) => {
  const text = JSON.stringify(scene.getParams(), null, 2)
  const btn = e.currentTarget as HTMLButtonElement
  try {
    await navigator.clipboard.writeText(text)
    btn.textContent = 'Copied'
  } catch {
    console.log(text)
    btn.textContent = 'Logged to console'
  }
  setTimeout(() => (btn.textContent = 'Copy values'), 1500)
})

// Start from ?t=<tree> if the URL has one (handy for sharing), otherwise D.
input.value = new URLSearchParams(location.search).get('t') ?? D
onInput()
undoStack.length = 0   // the starting tree isn't something to undo
render()

// Saved variables whose names are now built in were renamed when loading: keep that, and say so once.
if (loaded.renamed.length) {
  saveVarsNow()
  say(`${loaded.renamed.map(([from, to]) => `Your ${from} is now called ${to}`).join('; ')}, because ${loaded.renamed.length === 1 ? 'that name is' : 'those names are'} now built in.`)
}
