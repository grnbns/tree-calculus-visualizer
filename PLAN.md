# Tree Calculus Visualizer: Plan

A browser app for learning Barry Jay's tree calculus (as in *Reflective Programs in Tree Calculus*, 2021). You build trees, join them, and watch reductions happen. The UI should feel fluid and physical, like Obsidian's graph view: nodes float on springs, new branches sprout with a little motion, and reductions animate instead of redrawing.

This plan is deliberately high-level. Each milestone has a goal, a finish line, and a few questions to work out yourself.

---

## Where things stand (25 Nov 2026)

**Milestones 0–6 are done.** Next up: Milestone 7.

| Milestone | Status |
|---|---|
| 0. Tidy up the Python reference | ✅ Done |
| 1. Scaffold the web app | ✅ Done |
| 2. Port the engine to TypeScript | ✅ Done |
| 3. Draw a tree, no motion yet | ✅ Done |
| 4. Make it fluid | ✅ Done |
| 5. Stable node identity | ✅ Done |
| 6. Build and join trees | ✅ Done |
| 7. Step through reductions | ⏭️ Next |
| 8. Full-screen canvas | Not started |
| 9–10 | Not started |

What exists now:

- **`reduction_logic.py`**: the reference engine. `step` returns `(new_tree, rule, path)`, where `path` is the list of branch indices from the root to the redex (`[]` = root). `trace` prints the rule and path for each step.
- **`parser.py`**: parses △ notation (`.` and `^` accepted as aliases). Named trees `K`, `I`, `D`, `S`, with `S = D (K D) (D K (K D))`.
- **`test_reduction_logic.py`**: 50 tests, run with `pytest` from the `.venv`. Covers every function, paths, and the book's equations `I x = x`, `K x y = x`, `D x y z = y z (x z)`, `S x y z = x z (y z)` and `S K K x = x` on hand-picked and random trees.
- **`export_cases.py` → `tests/cases.json`**: 67 reference cases (values, each rule, book equations, nested/side-by-side redexes, one non-terminating case, 50 seeded random trees). Each records every step as `{rule, path, tree}` plus the final result. A test fails if the file is out of date.
- **`demo.py`**: runs `trace`/`normalize`/`step` on examples so you can watch reductions.
- **`.gitignore`** and a project **`.venv`** with pytest.
- **`web/`**: Vite + TypeScript (vanilla) app with Vitest. Vite's demo files removed. Run everything from inside `web/`: `npm run dev` (dev server), `npm test` (Vitest, watch mode), `npm run build` (type-check + production build).
- **`web/src/engine.ts`, `web/src/parser.ts`**: the TypeScript port. The TS parser also accepts the names `K`, `I`, `D`, `S` in input (e.g. `S K K △`); the Python parser doesn't. Same functions in camelCase (`applyAll`, `isValue`, `kRule`, `reduceRoot`, …). `step` returns `{tree, rule, path}` or `null`; `normalize` returns `{tree, steps, finished}`; `reductionSteps` returns every step (what the visualizer will play through). Trees are `readonly`, so mutation is a type error.
- **`web/src/render.ts`**: `layoutTree(tree)` (pure: d3-hierarchy positions, node kind, path per node) plus the spacing/size constants (`NODE_GAP_X`, `LEVEL_GAP_Y`, `NODE_RADIUS`, `COMPUTATION_RADIUS`, `HALO_RADIUS`).
- **`web/src/scene.ts`**: the live drawing. A `Scene` owns a d3-force simulation: springs with tidy-layout rest lengths, light repulsion, collision, pull toward tidy targets, and a custom sibling-order force (soft push always; a hard no-crossing rule in rows where a node is being dragged) so branches never swap sides at rest or while dragging. Drag a node and it springs back; the simulation settles to a stop. `setWorkspace(trees, {selected, born})` shows several trees side by side (each with its own root position) and matches nodes **by id**: survivors travel to their new place (even into another tree), copies sprout from the node they were copied from, vanished nodes and links fade out (350 ms). The simulation is driven by the scene's own frame loop (not d3's timer) so it has an **animation speed** (physics ticks per frame, default 0.5; positions are interpolated between ticks so slow motion stays smooth; dragging always runs at full speed; fades scale with it). Physics defaults are `DEFAULT_PARAMS` (damping 0.7, speed 0.5); a "Physics tuning" panel on the page has sliders and a "Copy values" button. In dev, an order check warns in the console if siblings are ever out of order at rest or while dragging. The scene never changes trees itself: it reports `onClick`, `onDragStart` and `onDrop` (with the drop-target node, highlighted while a tree is carried by its root) to `main.ts`. Each node element has `data-tree` and `data-path`.
- **`web/src/ids.ts`**: stable node identity, kept **beside** the tree (the engine stays pure). An `IdTree` has the same shape as the `Tree`. `freshIds(tree)` for a new tree; `stepIds(ids, step)` returns the new ids plus `born` (copy → origin) and `died`. In a redex `△ b0 y z rest`: **K** → y's node becomes the result (z, R, b0 vanish); **S** → y's node becomes the result, x and the original z keep their ids, the second z is a fresh copy; **F** → z's node becomes the result (y, R, b0 vanish).
- **`web/src/edit.ts`**: pure edits on a tree + its ids: `addLeaf`, `removeBranch` (any branch; later siblings shift left), `attach` (the node is applied to another tree, which keeps its ids), `detach`.
- **`web/src/workspace.ts`**: the workspace model, pure and immutable: a list of placed trees `{key, tree, ids, x, y}` plus the selected key. Actions return a `Change` (new workspace + `born` + a message for the learner): `addTree`, `replaceTree`, `removeTree`, `moveTree`, `addLeafAt`, `removeAt` (root = whole tree), `joinTrees`, `tearOff`, `stepTree`.
- **`web/src/main.ts`**: the UI. Mode toggle **Add branch / Remove / Move** (keys A/R/M; shift-click flips add ↔ remove). Dragging a tree by its root carries the whole tree in any mode; drop it on a node of another tree to join (that node is applied to it) or on empty space to move it. In Move mode, dragging any other node tears it off into its own tree (tear + drop = one undo step). **Undo/Redo** (Ctrl+Z / Ctrl+Shift+Z) over whole-workspace snapshots, so nodes glide back. Typing in the input box edits the selected tree (keystrokes coalesce into one undo step); **New tree** and the example buttons add trees. Step acts on the selected tree; unselected trees are dimmed. A message line explains each edit (e.g. when an added leaf creates a redex). `?t=<tree>` in the URL sets the starting tree.
- **`web/src/*.test.ts`**: 347 Vitest tests, including every case in `tests/cases.json` (same steps, same paths, same order, same result as Python), id bookkeeping on every step of every case, edits, and the workspace (including the milestone 6 finish line: build I, drop x on it, get I x).

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

### 7. Step through reductions
- Highlight every redex; show which rule would fire at each.
- **Play / Pause** on the selected tree: keeps stepping automatically until it reaches a normal form (or the step limit), then stops by itself. Each step waits for the previous animation to mostly settle, with a playback speed control.
- **Step** becomes a small **▶|** arrow button: one step at a time while paused (disabled while playing). Its partner **|◀** steps back.
- A step limit for trees that never finish (Play stops there with a message instead of running forever).
- Default order: leftmost-outermost (what your `step` does). Clicking a highlighted redex reduces *that* one instead.
- A history of steps you can click through. (Reset is gone since milestone 6; Undo/Redo and this history cover it. Decide how step history and edit undo fit together: probably one timeline.)
- Keyboard: Space = play/pause, → / ← = step forward/back.

**Done when:** you can play `S K K x` to `x`, pause partway, step with the arrow, and scrub back and forth smoothly.

### 8. Full-screen canvas: floating UI, pan and zoom, no teleporting
A UI makeover: the canvas *is* the page, like Obsidian's graph view, instead of a framed box between page sections.
- **The canvas fills the whole window** (and resizes with it). No page scrolling.
- **Every control floats on top of it**, small and out of the way: e.g. the input box and examples in a compact bar at the top, the Add/Remove/Move modes and Undo/Redo as a small toolbar, playback controls (▶|, Play/Pause, speed) at the bottom, the △ text and status/messages as a small caption, physics tuning in a collapsible corner panel. Panels should be translucent or minimal, and never block dragging trees underneath them more than necessary.
- **Pan:** drag empty canvas to look around (dragging a node still drags the node).
- **Zoom:** pinch on trackpads and touch screens, ctrl/⌘ + scroll wheel, plus a "fit all" button (and maybe a keyboard shortcut). Zoom around the pointer, not the centre. Clamp to sensible limits.
- **No teleporting.** Today every workspace change calls `fitView` in `scene.ts`, which snaps the camera to fit everything; when a drop changes the bounding box, the view jumps, so every tree *looks* like it teleports. Fix: the camera is something the user controls; it never snaps. Auto-framing only happens on request ("fit all") or when something would end up off screen, and then the camera **glides** there (animate the view, e.g. with an easing over ~400 ms, or a spring). New trees appear in view.
- Check the rest of the motion for jumps too: nodes are already matched by id, so with a still camera everything should visibly travel.

**Done when:** the whole window is canvas; you can pan, pinch-zoom and fit-all; and building, joining, tearing and stepping never make anything jump.
**Think about:** keep the camera (a translate + scale) separate from the simulation's coordinates, so physics, drop targets and dragging keep working in world coordinates; convert pointer positions through the camera (the current `getScreenCTM` approach already does this if the camera is the SVG `viewBox` or a transform on a top-level `<g>`).

### 9. Make it clear for learners
- **Rule card:** when a step happens, show the rule as an equation with w, x, y, z in colours, and colour the same parts in the tree, before and after.
- Label nodes by shape: leaf, stem, fork, computation.
- Recognise named trees (K, I, D, S, true/false) and optionally show them collapsed as a labelled chip.
- A few guided examples straight from chapter 3.

**Done when:** someone who has only read chapter 3 can follow a reduction without you explaining it.

### 10. Ship it
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
