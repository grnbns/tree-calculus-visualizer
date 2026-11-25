import './style.css'
import { allRedexes, show, step, type Path } from './engine'
import { parse, K, I, D, S } from './parser'
import { Scene, DEFAULT_PARAMS, type PhysicsParams } from './scene'
import { idSource } from './ids'
import {
  addLeafAt, addTree, emptyWorkspace, getTree, joinTrees, moveTree, removeAt,
  replaceTree, selectTree, tearOff, type Change, type Workspace,
} from './workspace'
import {
  atEnd, back, currentWs, describeFrame, forward, reduce, seek, startRun,
  type Moved, type Run, type Stopped,
} from './run'

const EXAMPLES: [label: string, text: string][] = [
  ['△', '△'],
  ['K', K],
  ['I', I],
  ['D', D],
  ['S', S],
  ['K x y', `${K}(△△)(△△△)`],
  ['I x', `${I}(△△)`],
  ['S K K x', `${S}(${K})(${K})(△△)`],
]

type Mode = 'add' | 'remove' | 'move'

const MODE_HELP: Record<Mode, string> = {
  add: 'Add branch (A): click a node to give it a new leaf branch, which applies it to △. Shift-click removes instead.',
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
      <button id="new-btn" type="button" title="Add the typed tree as a new tree">New</button>
    </div>
    <div class="examples" id="examples"><span class="label">Add</span></div>
    <p class="error" id="error" role="alert"></p>
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
    <p><b>Add</b> (A): click a node to give it a leaf branch, which applies it to △. <b>Remove</b> (R): click to remove a branch, or a root to remove its tree. Shift-click swaps the two. <b>Move</b> (M): drag any node to tear it off.</p>
    <p>In every mode, drag a tree by its <b>root</b> onto a node of another tree to join them (that node is applied to it). The first click on a dimmed tree selects it.</p>
    <p><b>Reduce:</b> ▶| steps (→), |◀ steps back (←), Space plays and pauses. Click a K/S/F letter to reduce that redex instead.</p>
    <p><b>View:</b> drag empty space or scroll to pan; ctrl/⌘ + scroll or pinch to zoom; F fits everything.</p>
  </section>

  <div class="hud bottom">
  <section class="panel bottom-left" aria-label="Current tree">
    <span class="panel-label">Current tree</span>
    <code id="notation" title="Click to show all"></code>
  </section>

  <section class="panel bottom-center playback" aria-label="Reduction playback">
    <button id="back-btn" type="button" title="Step back (←)" aria-label="Step back">|◀</button>
    <button id="play-btn" type="button" title="Play (Space)">▶ Play</button>
    <button id="fwd-btn" type="button" title="Step forward (→)" aria-label="Step forward">▶|</button>
    <input id="scrub" type="range" min="0" max="0" value="0" aria-label="Reduction steps" />
    <span id="frame-label"></span>
    <label class="play-speed" title="Steps per second while playing">
      <span>Speed</span>
      <input id="play-speed" type="range" min="0.25" max="4" step="0.25" value="1" />
      <output id="play-speed-out">1</output>
    </label>
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
`

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!
const input = $<HTMLInputElement>('#tree-input')
const errorBox = $<HTMLParagraphElement>('#error')
const svg = $<SVGSVGElement>('#canvas')
const notation = $<HTMLElement>('#notation')
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

/** Apply a change. `typing`: consecutive keystrokes in one tree are one undo
 *  step. `sameAction`: part of the previous action (a drop that ends a tear),
 *  so it doesn't get an undo step of its own. */
function commit(change: Change, opts: { typing?: boolean; sameAction?: boolean } = {}): void {
  endRun()
  const coalesce = opts.sameAction || (opts.typing && lastTypedKey !== null && lastTypedKey === change.ws.selected)
  if (!coalesce) undoStack.push(ws)
  redoStack.length = 0
  lastTypedKey = opts.typing ? change.ws.selected : null
  ws = change.ws
  render(change.born)
}

// Trees on screen at the last render: new ones get brought into view.
let shownKeys = new Set<string>()

function render(born?: ReadonlyMap<string, string>): void {
  // The camera never jumps. It only glides to reveal trees that just appeared
  // (added, torn off, brought back by undo) and, while playing, the tree being
  // played as it grows; and only if they'd otherwise be off screen.
  const keys = ws.trees.map((t) => t.key)
  const reveal = keys.filter((k) => !shownKeys.has(k))
  if (playing && ws.selected) reveal.push(ws.selected)
  shownKeys = new Set(keys)
  scene.setWorkspace(
    ws.trees.map((t) => ({ ...t, nextRedex: step(t.tree)?.path ?? null, redexes: allRedexes(t.tree) })),
    { selected: ws.selected, born, reveal },
  )
  const sel = getTree(ws, ws.selected)
  if (!sel) {
    notation.textContent = ''
  } else {
    notation.textContent = show(sel.tree)
    // Keep the input box showing the selected tree, unless you're typing in it.
    if (document.activeElement !== input) {
      input.value = show(sel.tree)
      errorBox.textContent = ''
    }
  }
  renderPlayback()
  undoBtn.disabled = undoStack.length === 0
  redoBtn.disabled = redoStack.length === 0
  clearBtn.disabled = ws.trees.length === 0
}

function undo(): void {
  endRun()
  const prev = undoStack.pop()
  if (!prev) return
  redoStack.push(ws)
  ws = prev
  lastTypedKey = null
  render()
}

function redo(): void {
  endRun()
  const next = redoStack.pop()
  if (!next) return
  undoStack.push(ws)
  ws = next
  lastTypedKey = null
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
  run = startRun(ws, key)
  return run
}

/** Show the result of moving through a run. False if it couldn't move. */
function applyMove(r: Moved | Stopped | null): boolean {
  if (r === null) return false
  if ('stopped' in r) {
    renderPlayback()
    return false
  }
  run = r.run
  ws = currentWs(run)
  render(r.born)
  return true
}

function canGoForward(): boolean {
  const sel = getTree(ws, ws.selected)
  if (!sel) return false
  if (run?.treeKey === sel.key && !atEnd(run)) return true
  return step(sel.tree) !== null
}

function stepForward(): boolean {
  const r = ensureRun()
  return r !== null && applyMove(forward(r, newId))
}

function stepBack(): void {
  if (run) applyMove(back(run))
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
  backBtn.disabled = playing || !r || r.pos === 0
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
  if (run) applyMove(seek(run, to))
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

// Clicking a redex's badge reduces that redex (as a step of the run).
scene.events.onRedexClick = ({ treeKey, path }) => {
  if (ws.selected !== treeKey) {
    select(treeKey)            // first click on a dimmed tree only selects it
    return
  }
  pause()
  const r = ensureRun()
  if (r) applyMove(reduce(r, newId, path))
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

function onInput(): void {
  let tree
  try {
    tree = parse(input.value.trim() || '△')
  } catch (e) {
    errorBox.textContent = (e as Error).message
    return // keep showing the last good tree
  }
  errorBox.textContent = ''
  // Typing edits the selected tree; with nothing selected, it starts one.
  commit(ws.selected ? replaceTree(ws, ws.selected, tree, newId) : addTree(ws, tree, newId), { typing: true })
}

input.addEventListener('input', onInput)
input.addEventListener('blur', () => { lastTypedKey = null })

$<HTMLButtonElement>('#new-btn').addEventListener('click', () => {
  try {
    commit(addTree(ws, parse(input.value.trim() || '△'), newId))
    errorBox.textContent = ''
  } catch (e) {
    errorBox.textContent = (e as Error).message
  }
})

for (const [label, text] of EXAMPLES) {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  b.title = `Add ${text} as a new tree`
  b.addEventListener('click', () => commit(addTree(ws, parse(text), newId)))
  examples.append(b)
}

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
