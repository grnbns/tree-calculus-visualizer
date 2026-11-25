# Tree Calculus Visualizer: Plan

A browser app for learning Barry Jay's tree calculus (as in *Reflective Programs in Tree Calculus*, 2021). You build trees, join them, and watch reductions happen. The UI should feel fluid and physical, like Obsidian's graph view: nodes float on springs, new branches sprout with a little motion, and reductions animate instead of redrawing.

This plan is deliberately high-level. Each milestone has a goal, a finish line, and a few questions to work out yourself.

---

## Where things stand (25 Nov 2026)

**Milestones 0–8 are done.** Next up: Milestone 9.

| Milestone | Status |
|---|---|
| 0. Tidy up the Python reference | ✅ Done |
| 1. Scaffold the web app | ✅ Done |
| 2. Port the engine to TypeScript | ✅ Done |
| 3. Draw a tree, no motion yet | ✅ Done |
| 4. Make it fluid | ✅ Done |
| 5. Stable node identity | ✅ Done |
| 6. Build and join trees | ✅ Done |
| 7. Step through reductions | ✅ Done |
| 8. Full-screen canvas | ✅ Done |
| 9. Copy, paste and variables | ⏭️ Next |
| 10. Make it clear for learners | Not started |
| 11. Ship it | Not started |

What exists now:

- **`reduction_logic.py`**: the reference engine. `step` returns `(new_tree, rule, path)`, where `path` is the list of branch indices from the root to the redex (`[]` = root). `trace` prints the rule and path for each step.
- **`parser.py`**: parses △ notation (`.` and `^` accepted as aliases). Named trees `K`, `I`, `D`, `S`, with `S = D (K D) (D K (K D))`.
- **`test_reduction_logic.py`**: 50 tests, run with `pytest` from the `.venv`. Covers every function, paths, and the book's equations `I x = x`, `K x y = x`, `D x y z = y z (x z)`, `S x y z = x z (y z)` and `S K K x = x` on hand-picked and random trees.
- **`export_cases.py` → `tests/cases.json`**: 67 reference cases (values, each rule, book equations, nested/side-by-side redexes, one non-terminating case, 50 seeded random trees). Each records every step as `{rule, path, tree}` plus the final result. A test fails if the file is out of date.
- **`demo.py`**: runs `trace`/`normalize`/`step` on examples so you can watch reductions.
- **`.gitignore`** and a project **`.venv`** with pytest.
- **`web/`**: Vite + TypeScript (vanilla) app with Vitest. Vite's demo files removed. Run everything from inside `web/`: `npm run dev` (dev server), `npm test` (Vitest, watch mode), `npm run build` (type-check + production build).
- **`web/src/engine.ts`, `web/src/parser.ts`**: the TypeScript port. The TS parser also accepts the names `K`, `I`, `D`, `S` in input (e.g. `S K K △`); the Python parser doesn't. Same functions in camelCase (`applyAll`, `isValue`, `kRule`, `reduceRoot`, …). `step` returns `{tree, rule, path}` or `null`; `normalize` returns `{tree, steps, finished}`; `reductionSteps` returns every step. `allRedexes(tree)` lists every `{path, rule}` leftmost-outermost first (the first is what `step` picks); `stepAt(tree, path)` reduces a chosen redex; `size(tree)` counts nodes. Trees are `readonly`, so mutation is a type error.
- **`web/src/render.ts`**: `layoutTree(tree)` (pure: d3-hierarchy positions, node kind, path per node) plus the spacing/size constants (`NODE_GAP_X`, `LEVEL_GAP_Y`, `NODE_RADIUS`, `COMPUTATION_RADIUS`, `HALO_RADIUS`).
- **`web/src/scene.ts`**: the live drawing. A `Scene` owns a d3-force simulation: springs with tidy-layout rest lengths, light repulsion, collision, pull toward tidy targets, and a custom sibling-order force (soft push always; a hard no-crossing rule in rows where a node is being dragged) so branches never swap sides at rest or while dragging. Drag a node and it springs back; the simulation settles to a stop. `setWorkspace(trees, {selected, born})` shows several trees side by side (each with its own root position) and matches nodes **by id**: survivors travel to their new place (even into another tree), copies sprout from the node they were copied from, vanished nodes and links fade out (350 ms). The simulation is driven by the scene's own frame loop (not d3's timer) so it has an **animation speed** (physics ticks per frame, default 0.5; positions are interpolated between ticks so slow motion stays smooth; dragging always runs at full speed; fades scale with it). Physics defaults are `DEFAULT_PARAMS` (damping 0.7, speed 0.5); a "Physics tuning" panel on the page has sliders and a "Copy values" button. In dev, an order check warns in the console if siblings are ever out of order at rest or while dragging. The scene never changes trees itself: it reports `onClick`, `onDragStart` and `onDrop` (with the drop-target node, highlighted while a tree is carried by its root) to `main.ts`. Each node element has `data-tree` and `data-path`. Every redex gets a clickable **K/S/F badge** (just the letter; `onRedexClick`); only the one ▶| will reduce gets a ring. A first click on an unselected (dimmed) tree, or one of its badges, only selects it. `isSettled(threshold)` tells playback when the last step's motion has calmed down. **Camera:** the SVG `viewBox` comes from `camera.ts`, so world coordinates (physics, dragging, drop targets) are unchanged. The camera never moves by itself except: fit on first show, `fitAll()`, `zoomBy()`, and `setWorkspace(…, {reveal: keys})`, and those **glide** (450 ms ease-out). Drag empty canvas to pan (two fingers: pan + pinch zoom); scroll pans; ctrl/⌘ + scroll or a trackpad pinch zooms around the pointer (a mouse-wheel notch is capped at ~28%).
- **`web/src/ids.ts`**: stable node identity, kept **beside** the tree (the engine stays pure). An `IdTree` has the same shape as the `Tree`. `freshIds(tree)` for a new tree; `stepIds(ids, step)` returns the new ids plus `born` (copy → origin) and `died`. In a redex `△ b0 y z rest`: **K** → y's node becomes the result (z, R, b0 vanish); **S** → y's node becomes the result, x and the original z keep their ids, the second z is a fresh copy; **F** → z's node becomes the result (y, R, b0 vanish).
- **`web/src/camera.ts`**: the camera, pure: `{x, y, zoom}` (world point at the centre, screen px per world unit). `screenToWorld`/`worldToScreen`, `panBy`, `zoomAt` (keeps the point under the pointer fixed), `fitBounds`, `reveal` (smallest pan, or zoom-out, to bring a box into view; nothing if it's visible), `lerpCamera`, `viewBox`. Zoom limits 0.15–4; fitting never zooms past 1.6.
- **`web/src/edit.ts`**: pure edits on a tree + its ids: `addLeaf`, `removeBranch` (any branch; later siblings shift left), `attach` (the node is applied to another tree, which keeps its ids), `detach`.
- **`web/src/workspace.ts`**: the workspace model, pure and immutable: a list of placed trees `{key, tree, ids, x, y}` plus the selected key. Actions return a `Change` (new workspace + `born` + a message for the learner): `addTree`, `replaceTree`, `removeTree`, `moveTree`, `addLeafAt`, `removeAt` (root = whole tree), `joinTrees`, `tearOff`, `stepTree`.
- **`web/src/run.ts`**: a **reduction run**, watched like a video: the list of workspace frames since you started stepping the selected tree. `forward` (replays a recorded frame or reduces), `reduce(run, newId, at?)` (a chosen redex; drops later frames), `back`, `seek` (big jumps animate sensibly: copies sprout from something still on screen), `describeFrame`. Limits: `MAX_RUN_STEPS` (200) and `MAX_NODES` (1500) stop playback with a message.
- **`web/src/main.ts`**: the UI, floating over a full-window canvas: top left (title, input, examples), top right (modes, undo/redo/clear, − + Fit, ? help popover), bottom left (just the selected tree's △ text, cut to one line, click to expand), bottom centre (playback, centred on the screen), bottom right (⚙ physics tuning). Mode help is in the mode buttons' tooltips and the ? popover. New trees (added, torn off, restored by undo) are revealed if off screen, and while playing the camera follows the selected tree. Keys: F fit, + / − zoom, ? help, Esc closes help. Mode toggle **Add branch / Remove / Move** (keys A/R/M; shift-click flips add ↔ remove). Dragging a tree by its root carries the whole tree in any mode; drop it on a node of another tree to join (that node is applied to it) or on empty space to move it. In Move mode, dragging any other node tears it off into its own tree (tear + drop = one undo step). **Undo/Redo** (Ctrl+Z / Ctrl+Shift+Z) over whole-workspace snapshots, so nodes glide back. Typing in the input box edits the selected tree (keystrokes coalesce into one undo step); **New tree** and the example buttons add trees. Unselected trees are dimmed. **Playback** for the selected tree: **|◀**, **▶ Play / ❚❚ Pause**, **▶|**, a scrubber with "Step n of m: rule at path", and a **Play speed** slider (steps per second; separate from the physics "Animation speed"). Keys: Space = play/pause, ← / → = step back/forward. Play waits for each step's motion to mostly settle, and stops by itself at a normal form or a limit. **Undo vs. playback:** the scrubber and arrows move within a run without losing frames; to Undo/Redo a whole run is one action. Any edit, undo, redo or switching trees ends the run where it is (later frames are dropped); a run that ends back at its start leaves no undo entry. `?t=<tree>` in the URL sets the starting tree.
- **`web/src/*.test.ts`**: 372 Vitest tests, including every case in `tests/cases.json` (same steps, same paths, same order, same result as Python), id bookkeeping on every step of every case, edits, and the workspace (including the milestone 6 finish line: build I, drop x on it, get I x), `allRedexes`/`stepAt` against `step` on every reference case, and runs (play S K K x to x, back/forward keep frames, choosing a redex mid-run, the step limit, seek), and the camera maths.

Things to know before building on it:

- **Recursion depth.** `show`, `is_value` and `step` hit Python's recursion limit at depth ~1000, e.g. a chain of 3000 stems. That's fine for learning, but keep it in mind; the JavaScript version will have a similar limit.
- **Rule set.** These are the book's rules. treecalcul.us uses a different variant (stem: `xz(yz)`, and a fork rule that looks at the shape of z), so its examples won't work here.
- **Building named trees from strings.** `K + D` as strings is *not* "K applied to D"; each argument needs its own parentheses (`K + "(" + D + ")"`). Same trap in TypeScript.

---

## Tech choices

| Part | Choice | Why |
|---|---|---|
| Language | **TypeScript** | Runs in the browser; types catch "wrong kind of tree" mistakes. |
| Dev server / build | **Vite** | One command to start (`npm create vite@latest`, "vanilla-ts" template), instant reload. |
| Physics | **d3-force** | The engine behind most "bouncy graph" UIs. You can write custom forces to keep branches in order. |
| Tidy layout targets | **d3-hierarchy** (`tree()`) | Computes where each node *should* sit; physics pulls nodes there softly. |
| Drawing | **SVG** | Each node is a DOM element, so clicking, hovering and highlighting are easy. Fine up to roughly a thousand or two nodes. |
| UI framework | **None at first** | Plain HTML buttons are enough. If the panels get tangled, **Svelte** is the natural upgrade (it has built-in `spring`/`tweened` motion). |
| Tests | **Vitest** | Same style as pytest; runs the shared test cases. |
| Hosting | **GitHub Pages** | Free, from this repo. |
| Later, if needed | **PixiJS** (WebGL) | Only if trees regularly reach thousands of nodes. The S rule copies z, so trees can grow fast. |

The Python code stays in the repo as the **reference implementation**: it generates test cases that the TypeScript version must agree with.

---

## Milestones

### 0. Tidy up the Python reference ✅
- [x] Add `.gitignore` and a few `pytest` tests (I, K, D, S from the book).
- [x] Make `step` also return the **path** to the redex it reduced.
- [x] Write a small script that exports test cases to `tests/cases.json`: input tree, expected normal form, and the list of (rule, path) steps.

**Done when:** `pytest` passes and `cases.json` exists.
**Answer:** trees are stored as the same nested lists, which are already JSON.

### 1. Scaffold the web app ✅
- [x] Create the Vite + TypeScript project in a `web/` folder (keeps the Python separate).
- [x] Add Vitest.
- [x] Remove Vite's demo files (counter, logos, demo stylesheet).

**Done when:** `npm run dev` shows a blank page and `npm test` runs.

### 2. Port the engine to TypeScript ✅
- Same functions as `reduction_logic.py`: apply, show, isValue, the three rules, step (returning the path), normalize.
- Also port `parser.py`, since typing trees is a feature now.
- Run every case from `cases.json`.

**Done when:** all shared cases pass in Vitest, with the same steps in the same order as Python.
**Think about:** keep trees immutable (never modify an array after creating it). It makes undo/redo and animation much easier.

### 3. Draw a tree, no motion yet ✅
- Use `d3-hierarchy` to compute x/y for every node and draw circles and lines in SVG.
- Branch order must be visible: first branch on the left.
- Show the △-notation text under the drawing.

**Done when:** typing `△(△△)(△△△)` (D) shows the same shape as Figure 3.3 in the book.
**Think about:** in the book, a node with 3+ branches *is* the computation, so how will you make those nodes stand out?

### 4. Make it fluid ✅
- Switch to a `d3-force` simulation: links as springs, nodes repel, a collision force so nodes don't overlap.
- **Keep the tree readable:** add forces that pull each node toward its tidy-layout position from milestone 3 (`forceX`/`forceY` with a per-node target). Depth sets the height, sibling order sets left to right. The physics gives the bob; the targets keep the shape.
- Drag nodes around; they spring back when released.

**Done when:** the tree floats gently, can be dragged, and branches never swap sides.
**Think about:** how strong should the pull to the target be compared to the springs? Expose a slider while tuning.

### 5. Stable node identity (the key to smooth motion) ✅
For anything to *move* rather than *redraw*, each node needs an id that survives from one tree to the next, so d3 knows "this circle moved there".
- [x] Give every node an id when it's created.
- [x] When a rule fires, decide where each node in the result came from:
  - **K** `△△yz = y`: y's nodes keep their ids; z and the leaf vanish (fade/shrink out).
  - **S** `△(△x)yz = yz(xz)`: z appears **twice**. One copy can keep z's ids; the other copy needs new ids. Let it sprout from where z was.
  - **F** `△(△wx)yz = zwx`: w, x and z keep their ids and move to their new places; y vanishes.
- [x] Nodes that are new start at their "origin" position; nodes that vanish animate out.

**Done when:** stepping through `I x` shows x visibly travelling, not the screen redrawing.
**Answer:** ids live in a separate `IdTree` beside the tree (`ids.ts`), so the engine and `cases.json` didn't change. The result of a rule takes over the id of y (K, S) or z (F), so that subtree visibly rises into the redex's place. The hard no-crossing rule now only applies while dragging; after a step, subtrees are travelling and shoving them would make them teleport.

### 6. Build and join trees ✅
- [x] **Click a node → add a leaf branch.** Note this means applying that subtree to `△`, so it can create a redex. That's a feature, and the message line explains it to learners.
- [x] Remove a branch (and its subtree): any branch, in Remove mode or with shift-click.
- [x] Type a tree in △ notation, with `.` and `^` accepted as aliases (and named trees K, I, D, S).
- [x] **Workspace with several trees.** Drag one tree (by its root) onto a node of another to attach it as a new branch, i.e. apply. That's the "join".
- [x] Extra: tear any subtree off into its own tree (Move mode), and join onto any node, not just roots. Undo/redo.

**Done when:** you can build `I` by clicking, build `x` separately, drop `x` onto `I`, and see a redex appear.

### 7. Step through reductions ✅
- [x] Highlight every redex; show which rule would fire at each (a K/S/F badge on each; the next one also has a ring).
- [x] **Play / Pause** on the selected tree: keeps stepping until a normal form (or a limit), then stops by itself. Each step waits for the previous animation to mostly settle; **Play speed** slider.
- [x] **Step** is now a small **▶|** arrow (disabled while playing), with **|◀** to step back.
- [x] A step limit (200) and a node limit (1500) for trees that never finish or explode; Play stops there with a message.
- [x] Default order: leftmost-outermost. Clicking a redex's badge reduces *that* one instead.
- [x] A history of steps you can scrub through (slider + "Step n of m: rule at path").
- [x] Keyboard: Space = play/pause, → / ← = step forward/back.

**Done when:** you can play `S K K x` to `x`, pause partway, step with the arrow, and scrub back and forth smoothly.
**Answer (undo vs. step back):** two tools, not one. Playback controls move within a *run* (all steps since you started stepping a tree) without losing frames, like a video. Undo/Redo work on your actions, and a whole run is one action. Editing partway through a run keeps it up to that point.

### 8. Full-screen canvas: floating UI, pan and zoom, no teleporting ✅
A UI makeover: the canvas *is* the page, like Obsidian's graph view.
- [x] **The canvas fills the whole window** and resizes with it. No page scrolling.
- [x] **Every control floats on top of it** in small translucent panels: input + examples top left; modes, undo/redo, zoom/fit and help top right; △ text bottom left; playback bottom centre (centred on the screen); physics tuning behind a ⚙ bottom right. Panels stack on narrow screens.
- [x] **Pan:** drag empty canvas, or scroll.
- [x] **Zoom:** trackpad pinch, ctrl/⌘ + scroll, two-finger pinch on touch screens, the − / + buttons and keys, and **Fit** (F). Zooms around the pointer; clamped.
- [x] **No teleporting.** The cause was `fitView` snapping the camera on every change; it's gone. The camera only moves on request (Fit, zoom) or to reveal trees that would be off screen (new trees, and the playing tree as it grows), and then it glides.
- [x] Motion checked: joining, tearing and dropping don't move the camera; nodes travel.

**Done when:** the whole window is canvas; you can pan, pinch-zoom and fit-all; and building, joining, tearing and stepping never make anything jump.
**Answer:** the camera lives in `camera.ts` and is applied as the SVG `viewBox`, so physics, dragging and drop targets stay in world coordinates and `getScreenCTM` still converts pointer positions.

### 9. Copy, paste and variables
Build bigger trees out of smaller named pieces, the way the book does (`K`, `I`, `D`, `S`, then trees built from those).

**Copy and paste**
- **Copy** the selected tree, or any subtree (e.g. right-click a node → Copy, or Ctrl/⌘+C copies what you last clicked).
- **Paste as a new tree** (Ctrl/⌘+V over empty canvas, or a Paste button): appears where the pointer is.
- **Paste as a child of a node** (Ctrl/⌘+V while hovering a node, or right-click → Paste here): the node is applied to the pasted tree, exactly like a join. One undo step.
- The copy also goes to the system clipboard as △ text, so it can be pasted into the input box or another app (and pasting △ text from elsewhere works too).

**Variables (named trees)**
- **Create a variable** from the selected tree or a subtree: right-click → "Name this…", e.g. `V`. Its definition is stored (and saved in the browser, so it survives a reload).
- **It renders collapsed** as a single labelled chip (`V`) instead of the whole tree, wherever that exact subtree appears, as long as it hasn't been changed.
- **It shows up in the Add menu** (top left), next to K, I, D, S. In fact K, I, D and S become built-in variables, so the same machinery handles them.
- **Typing its name in the input box works**: `V`, `V(△△)`, `S V K` parse to the stored tree and render with the chip.
- **Right-click a chip → Expand** shows its insides (and right-click inside an expanded variable → Collapse puts the chip back).
- **Reduction expands it automatically, only when needed**: if a step reaches inside a variable (the redex is in it, or a rule looks at its shape, e.g. it's the first branch `b0` whose shape picks K/S/F), the chip unfolds smoothly into its tree first. If a step only moves it around (as a `y` or `z`), it stays collapsed and travels as one chip; an S-copy of it is a copy of the chip.
- Optionally, recognise results: when a reduction produces a subtree equal to a variable's definition (e.g. `S K K x` → `x` where `x` was named), show the chip again.

**Done when:** you can build a tree, name it `V`, see `V` in the Add menu, type `S K K V` and see `V` as a chip that travels during the reduction and only unfolds when a rule needs its insides; and you can copy a subtree and paste it as a new tree or onto a node.
**Think about:**
- Where the "this subtree is variable `V`" information lives. Like ids, keep it **beside** the tree (e.g. a set of node ids marking the roots of collapsed occurrences), so the engine stays pure; `stepIds` already tells you which ids survive, move or get copied.
- What counts as "reaching inside": the redex path passing through the chip's root, or the chip being the redex's first branch. Write it as a pure function and test it on every rule.
- Names: single capital letters (`V`, `X`) parse with no separators (`SKV`). Longer names would need spaces or brackets in the input; decide before building the parser part. Names must not clash with K, I, D, S (or allow redefining them?).
- Layout: a chip is one node in the layout, so collapsing changes the tidy positions; the expand/collapse should animate with the same id machinery (the chip's id becomes the root id of the expanded tree).

### 10. Make it clear for learners
- **Rule card:** when a step happens, show the rule as an equation with w, x, y, z in colours, and colour the same parts in the tree, before and after.
- Label nodes by shape: leaf, stem, fork, computation.
- Named trees: built on milestone 9's variables (true/false and other book trees as built-in variables).
- A few guided examples straight from chapter 3.

**Done when:** someone who has only read chapter 3 can follow a reduction without you explaining it.

### 11. Ship it
- GitHub Pages deploy, short README with a GIF.

---

## Stretch ideas
- Toggle between **book rules** and **treecalcul.us rules**.
- Other evaluation strategies from chapter 7 (e.g. branch-first).
- PixiJS renderer for big trees.
- Export a reduction as a GIF or a shareable link.
- Reflection examples (size, equality, tag tests) from later chapters.

---

## Pitfalls to expect
- **Branches swapping sides** under physics: that's what the target forces in milestone 4 are for.
- **Tree explosions:** S duplicates z, so some reductions blow up. Cap node count and step count, and show a message instead of freezing.
- **Shared references:** if you mutate arrays in the TS port, both copies of z change together. Keep trees immutable.
- **Animation without ids:** if every step creates fresh ids, everything fades and reappears instead of moving. Get milestone 5 right before polishing visuals.
