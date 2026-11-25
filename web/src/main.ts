import './style.css'
import { isValue, show, step, type Tree } from './engine'
import { parse, K, I, D, S } from './parser'
import { Scene, DEFAULT_PARAMS, type PhysicsParams } from './scene'
import { freshIds, stepIds, type IdTree } from './ids'

const EXAMPLES: [label: string, text: string][] = [
  ['K', K],
  ['I', I],
  ['D', D],
  ['S', S],
  ['K x y', `${K}(△△)(△△△)`],
  ['I x', `${I}(△△)`],
  ['S K K x', `${S}(${K})(${K})(△△)`],
]

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header>
    <h1>Tree Calculus</h1>
    <label class="input-row">
      <span>Tree</span>
      <input id="tree-input" spellcheck="false" autocomplete="off"
             placeholder="e.g. △(△△)(△△△)  ( . and ^ also work )" />
    </label>
    <div class="examples" id="examples"></div>
    <p class="error" id="error" role="alert"></p>
  </header>
  <main>
    <svg id="canvas" role="img" aria-label="Tree drawing"></svg>
    <div class="info">
      <code id="notation"></code>
      <p id="status"></p>
      <div class="controls">
        <button id="step-btn" type="button">Step</button>
        <button id="reset-btn" type="button">Reset</button>
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

const input = document.querySelector<HTMLInputElement>('#tree-input')!
const errorBox = document.querySelector<HTMLParagraphElement>('#error')!
const svg = document.querySelector<SVGSVGElement>('#canvas')!
const notation = document.querySelector<HTMLElement>('#notation')!
const status = document.querySelector<HTMLParagraphElement>('#status')!
const stepBtn = document.querySelector<HTMLButtonElement>('#step-btn')!
const resetBtn = document.querySelector<HTMLButtonElement>('#reset-btn')!
const examples = document.querySelector<HTMLDivElement>('#examples')!
const sliders = document.querySelector<HTMLDivElement>('#sliders')!

const scene = new Scene(svg)

// Every state since the tree was typed in: history[0] is the input, the last
// entry is what's on screen. Each state carries its node ids (see ids.ts), so
// nodes keep their identity across steps and Reset can animate back.
type State = { tree: Tree; ids: IdTree; born?: ReadonlyMap<string, string> }
let history: State[] = [{ tree: [], ids: freshIds([]) }]
let current: Tree = []
let stepsTaken = 0

function render(): void {
  const state = history[history.length - 1]
  current = state.tree
  stepsTaken = history.length - 1
  const next = step(current)
  scene.setTree(current, state.ids, { nextRedex: next?.path ?? null, born: state.born })
  notation.textContent = show(current)

  if (next === null) {
    status.textContent = isValue(current)
      ? `Value: nothing left to reduce${stepsTaken ? ` (after ${stepsTaken} steps)` : ''}.`
      : 'No rule applies.'
  } else {
    const where = next.path.length ? `at [${next.path.join(', ')}]` : 'at the root'
    status.textContent = `Computation: next step is the ${next.rule} rule ${where} (ringed).`
  }
  stepBtn.disabled = next === null
  resetBtn.disabled = stepsTaken === 0
}

function loadFromInput(): void {
  let tree: Tree
  try {
    tree = parse(input.value.trim() || '△')
  } catch (e) {
    errorBox.textContent = (e as Error).message
    return // keep showing the last good tree
  }
  errorBox.textContent = ''
  history = [{ tree, ids: freshIds(tree) }]   // a new tree: all-new nodes
  render()
}

input.addEventListener('input', loadFromInput)

stepBtn.addEventListener('click', () => {
  const next = step(current)
  if (next === null) return
  const { ids, born } = stepIds(history[history.length - 1].ids, next)
  history.push({ tree: next.tree, ids, born })
  render()
})

resetBtn.addEventListener('click', () => {
  // Back to the input tree with its ORIGINAL ids: surviving nodes glide back.
  history = [{ tree: history[0].tree, ids: history[0].ids }]
  render()
})

for (const [label, text] of EXAMPLES) {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  b.title = text
  b.addEventListener('click', () => {
    input.value = text
    loadFromInput()
  })
  examples.append(b)
}

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
loadFromInput()
