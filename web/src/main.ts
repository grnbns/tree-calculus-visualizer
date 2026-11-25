import './style.css'
import { isValue, show, step, type Path } from './engine'
import { parse, K, I, D, S } from './parser'
import { Scene, DEFAULT_PARAMS, type PhysicsParams } from './scene'
import { idSource } from './ids'
import {
  addLeafAt, addTree, emptyWorkspace, getTree, joinTrees, moveTree, removeAt,
  replaceTree, selectTree, stepTree, tearOff, type Change, type Workspace,
} from './workspace'

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
  add: 'Click a node to give it a new leaf branch (that applies it to △). Shift-click removes a branch instead.',
  remove: 'Click a node to remove it and everything under it; click a root to remove the whole tree. Shift-click adds a leaf instead.',
  move: 'Drag any node to tear it off into a tree of its own. Click a tree to select it.',
}
const ALWAYS_HELP = 'In every mode: drag a tree by its root onto a node of another tree to join them (that node is applied to the tree).'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header>
    <h1>Tree Calculus</h1>
    <div class="input-row">
      <label for="tree-input">Tree</label>
      <input id="tree-input" spellcheck="false" autocomplete="off"
             placeholder="e.g. △(△△)(△△△) or S K K △   ( . and ^ also work )" />
      <button id="new-btn" type="button" title="Add the typed tree as a new tree">New tree</button>
    </div>
    <div class="examples" id="examples"><span class="label">Add:</span></div>
    <p class="error" id="error" role="alert"></p>
  </header>
  <main>
    <div class="toolbar">
      <div class="modes" role="radiogroup" aria-label="Click mode">
        <button type="button" role="radio" data-mode="add" title="Add branches (A)">Add branch</button>
        <button type="button" role="radio" data-mode="remove" title="Remove branches (R)">Remove</button>
        <button type="button" role="radio" data-mode="move" title="Tear off and move (M)">Move</button>
      </div>
      <div class="controls">
        <button id="undo-btn" type="button" title="Undo (Ctrl+Z)">Undo</button>
        <button id="redo-btn" type="button" title="Redo (Ctrl+Shift+Z)">Redo</button>
        <button id="clear-btn" type="button">Clear all</button>
      </div>
    </div>
    <p class="mode-help" id="mode-help"></p>
    <svg id="canvas" role="img" aria-label="Tree drawing"></svg>
    <div class="info">
      <code id="notation"></code>
      <p id="status"></p>
      <p id="message" aria-live="polite"></p>
      <div class="controls">
        <button id="step-btn" type="button">Step</button>
      </div>
      <details class="tuning">
        <summary>Physics tuning</summary>
        <div id="sliders"></div>
        <div class="controls">
          <button id="defaults-btn" type="button">Defaults</button>
          <button id="copy-btn" type="button">Copy values</button>
        </div>
      </details>
    </div>
  </main>
`

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!
const input = $<HTMLInputElement>('#tree-input')
const errorBox = $<HTMLParagraphElement>('#error')
const svg = $<SVGSVGElement>('#canvas')
const notation = $<HTMLElement>('#notation')
const status = $<HTMLParagraphElement>('#status')
const messageBox = $<HTMLParagraphElement>('#message')
const modeHelp = $<HTMLParagraphElement>('#mode-help')
const stepBtn = $<HTMLButtonElement>('#step-btn')
const undoBtn = $<HTMLButtonElement>('#undo-btn')
const redoBtn = $<HTMLButtonElement>('#redo-btn')
const clearBtn = $<HTMLButtonElement>('#clear-btn')
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

/** Apply a change. `typing`: consecutive keystrokes in one tree are one undo
 *  step. `sameAction`: part of the previous action (a drop that ends a tear),
 *  so it doesn't get an undo step of its own. */
function commit(change: Change, opts: { typing?: boolean; sameAction?: boolean } = {}): void {
  const coalesce = opts.sameAction || (opts.typing && lastTypedKey !== null && lastTypedKey === change.ws.selected)
  if (!coalesce) undoStack.push(ws)
  redoStack.length = 0
  lastTypedKey = opts.typing ? change.ws.selected : null
  ws = change.ws
  render(change.born)
  messageBox.textContent = change.message ?? ''
}

function render(born?: ReadonlyMap<string, string>): void {
  scene.setWorkspace(
    ws.trees.map((t) => ({ ...t, nextRedex: step(t.tree)?.path ?? null })),
    { selected: ws.selected, born },
  )
  const sel = getTree(ws, ws.selected)
  if (!sel) {
    notation.textContent = ''
    status.textContent = 'The workspace is empty: type a tree above or click one of the examples.'
  } else {
    notation.textContent = show(sel.tree)
    const next = step(sel.tree)
    let text: string
    if (next === null) {
      text = isValue(sel.tree) ? 'a value, nothing left to reduce.' : 'no rule applies.'
    } else {
      const where = next.path.length ? `at [${next.path.join(', ')}]` : 'at the root'
      text = `a computation; the next step is the ${next.rule} rule ${where} (ringed).`
    }
    status.textContent = ws.trees.length > 1 ? `Selected tree: ${text}` : text[0].toUpperCase() + text.slice(1)
    // Keep the input box showing the selected tree, unless you're typing in it.
    if (document.activeElement !== input) {
      input.value = show(sel.tree)
      errorBox.textContent = ''
    }
  }
  stepBtn.disabled = !sel || step(sel.tree) === null
  undoBtn.disabled = undoStack.length === 0
  redoBtn.disabled = redoStack.length === 0
  clearBtn.disabled = ws.trees.length === 0
}

function undo(): void {
  const prev = undoStack.pop()
  if (!prev) return
  redoStack.push(ws)
  ws = prev
  lastTypedKey = null
  messageBox.textContent = ''
  render()
}

function redo(): void {
  const next = redoStack.pop()
  if (!next) return
  undoStack.push(ws)
  ws = next
  lastTypedKey = null
  messageBox.textContent = ''
  render()
}

// --- Modes -----------------------------------------------------------------------

function setMode(m: Mode): void {
  mode = m
  for (const b of document.querySelectorAll<HTMLButtonElement>('.modes button')) {
    const on = b.dataset.mode === m
    b.classList.toggle('active', on)
    b.setAttribute('aria-checked', String(on))
  }
  svg.dataset.mode = m
  modeHelp.textContent = `${MODE_HELP[m]} ${ALWAYS_HELP}`
}

for (const b of document.querySelectorAll<HTMLButtonElement>('.modes button')) {
  b.addEventListener('click', () => setMode(b.dataset.mode as Mode))
}

// --- What clicks and drags on the canvas mean ------------------------------------

scene.events.onClick = ({ treeKey, path, shiftKey }) => {
  if (mode === 'move') {
    ws = selectTree(ws, treeKey)
    render()
    return
  }
  const adding = (mode === 'add') !== shiftKey   // shift flips add <-> remove
  commit(adding ? addLeafAt(ws, treeKey, path, newId) : removeAt(ws, treeKey, path as Path))
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

stepBtn.addEventListener('click', () => {
  if (!ws.selected) return
  const s = stepTree(ws, ws.selected, newId)
  if (s) commit(s)
})

undoBtn.addEventListener('click', undo)
redoBtn.addEventListener('click', redo)
clearBtn.addEventListener('click', () => commit({ ws: { ...ws, trees: [], selected: null } }))

document.addEventListener('keydown', (e) => {
  const typing = document.activeElement instanceof HTMLInputElement && document.activeElement.type !== 'range'
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
    e.preventDefault()
    if (e.shiftKey) redo()
    else undo()
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) {
    e.preventDefault()
    redo()
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
