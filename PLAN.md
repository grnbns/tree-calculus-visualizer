# Tree Calculus Visualizer: Plan

A browser app for learning Barry Jay's tree calculus (as in *Reflective Programs in Tree Calculus*, 2021). You build trees, join them, and watch reductions happen. The UI should feel fluid and physical, like Obsidian's graph view: nodes float on springs, new branches sprout with a little motion, and reductions animate instead of redrawing.

This plan is deliberately high-level. Each milestone has a goal, a finish line, and a few questions to work out yourself.

---

## Where things stand (25 Nov 2026)

**Milestones 0–10 are done.** Next up: Milestone 11 (the finish-line test of milestone 10, a learner following a reduction alone, is still to be tried by a person).

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
| 9. Copy, paste and variables | ✅ Done |
| 10. Make it clear for learners | ✅ Done |
| 11. Ship it | ⏭️ Next |

What exists now:

- **`reduction_logic.py`**: the reference engine. `step` returns `(new_tree, rule, path)`, where `path` is the list of branch indices from the root to the redex (`[]` = root). `trace` prints the rule and path for each step.
- **`parser.py`**: parses △ notation (`.` and `^` accepted as aliases). Named trees `K`, `I`, `D`, `S`, with `S = D (K D) (D K (K D))`.
- **`test_reduction_logic.py`**: 50 tests, run with `pytest` from the `.venv`. Covers every function, paths, and the book's equations `I x = x`, `K x y = x`, `D x y z = y z (x z)`, `S x y z = x z (y z)` and `S K K x = x` on hand-picked and random trees.
- **`export_cases.py` → `tests/cases.json`**: 67 reference cases (values, each rule, book equations, nested/side-by-side redexes, one non-terminating case, 50 seeded random trees). Each records every step as `{rule, path, tree}` plus the final result. A test fails if the file is out of date.
- **`demo.py`**: runs `trace`/`normalize`/`step` on examples so you can watch reductions.
- **`.gitignore`** and a project **`.venv`** with pytest.
- **`web/`**: Vite + TypeScript (vanilla) app with Vitest. Vite's demo files removed. Run everything from inside `web/`: `npm run dev` (dev server), `npm test` (Vitest, watch mode), `npm run build` (type-check + production build).
- **`web/src/engine.ts`, `web/src/parser.ts`**: the TypeScript port. The TS parser also accepts **names** (the Python parser doesn't): a capital letter, then optional lowercase letters or digits (`V`, `X2`, `True`). A capital always starts a new name, so `SKV` is S K V. `parseNamed(text, lookup)` returns the tree plus `marks` (where each name was used, by path, including the names inside a definition); `parse` returns just the tree. Built-ins are `BUILTIN_TEXT` (`S` is written `D(K D)(D K(K D))`); the old raw strings `K`, `I`, `D`, `S` are still exported. Same functions in camelCase (`applyAll`, `isValue`, `kRule`, `reduceRoot`, …). `step` returns `{tree, rule, path}` or `null`; `normalize` returns `{tree, steps, finished}`; `reductionSteps` returns every step. `allRedexes(tree)` lists every `{path, rule}` leftmost-outermost first (the first is what `step` picks); `stepAt(tree, path)` reduces a chosen redex; `size(tree)` counts nodes. Trees are `readonly`, so mutation is a type error.
- **`web/src/render.ts`**: `layoutTree(tree, chips?)` (pure: d3-hierarchy positions, node kind, path per node; a collapsed variable is one node with only its arguments below it, and wide chips push neighbours apart) plus the spacing/size constants (`NODE_GAP_X`, `LEVEL_GAP_Y`, `NODE_RADIUS`, `COMPUTATION_RADIUS`, `CHIP_HEIGHT`, `chipWidth`).
- **`web/src/scene.ts`**: the live drawing. A `Scene` owns a d3-force simulation: springs with tidy-layout rest lengths, light repulsion, collision, pull toward tidy targets, and a custom sibling-order force (soft push always; a hard no-crossing rule in rows where a node is being dragged) so branches never swap sides at rest or while dragging. Drag a node and it springs back; the simulation settles to a stop. `setWorkspace(trees, {selected, born})` shows several trees side by side (each with its own root position) and matches nodes **by id**: survivors travel to their new place (even into another tree), copies sprout from the node they were copied from, vanished nodes and links disappear at once (`LEAVE_MS` = 0, an experiment; it was a 350 ms fade, which also drove the collapse slide-in). The simulation is driven by the scene's own frame loop (not d3's timer) so it has an **animation speed** (physics ticks per frame, default 0.5; positions are interpolated between ticks so slow motion stays smooth; dragging always runs at full speed; fades scale with it). Physics defaults are `DEFAULT_PARAMS` (damping 0.7, speed 0.5); a "Physics tuning" panel on the page has sliders and a "Copy values" button. In dev, an order check warns in the console if siblings are ever out of order at rest or while dragging. The scene never changes trees itself: it reports `onClick`, `onDragStart` and `onDrop` (with the drop-target node, highlighted while a tree is carried by its root) to `main.ts`. Each node element has `data-tree` and `data-path`. Every redex gets a thin orange border and a clickable **K/S/F badge** (just the letter; `onRedexClick`); the one ▶| will reduce next has its letter in white on a filled orange tag (no ring). Badges sit up and to the right, outside wide chips too. Nodes are no longer filled orange. A first click on an unselected (dimmed) tree, or one of its badges, only selects it. `isSettled(threshold)` tells playback when the last step's motion has calmed down. **Camera:** the SVG `viewBox` comes from `camera.ts`, so world coordinates (physics, dragging, drop targets) are unchanged. The camera never moves by itself except: fit on first show, `fitAll()`, `zoomBy()`, and `setWorkspace(…, {reveal: keys})`, and those **glide** (450 ms ease-out). Drag empty canvas to pan (two fingers: pan + pinch zoom); scroll pans; ctrl/⌘ + scroll or a trackpad pinch zooms around the pointer (a mouse-wheel notch is capped at ~28%).
- **`web/src/ids.ts`**: stable node identity, kept **beside** the tree (the engine stays pure). An `IdTree` has the same shape as the `Tree`. `freshIds(tree)` for a new tree; `stepIds(ids, step)` returns the new ids plus `born` (copy → origin) and `died`. In a redex `△ b0 y z rest`: **K** → y's node becomes the result (z, R, b0 vanish); **S** → y's node becomes the result, x and the original z keep their ids, the second z is a fresh copy; **F** → z's node becomes the result (y, R, b0 vanish).
- **`web/src/marks.ts`** (milestone 9): which subtrees are variables, kept **beside** the trees like ids: `Marks` = node id → `{name, def, expanded}`. A mark means "this node **plus its first n branches** is V" (n = V's arity, the number of branches of its definition); later branches are arguments hanging below the chip. That's what lets a chip survive a K step (`y` keeps its id and receives the leftover arguments). `chipsToUnfold(ids, marks, path)` decides what a step reaches inside: the redex is inside a chip's own branches, the redex *is* a chip's node, or the redex's first branch b0 is a chip; being y, z, w, x or an argument only moves it. Also `pruneMarks` (drops marks whose subtree no longer matches the definition: run after every action), `carryMarks` (an S-copy of a chip is a chip), `setExpanded`, `enclosingMarks` (the variables around a node, for Collapse), `insideIds`, `collapsedChips` (by path, for the layout), `fragmentAt` (a subtree with its marks: what gets copied, pasted and named), `isHidden`; and `hiddenBy` (the outermost chip hiding each node), `revealDiff` (what sprouts out of / slides into chips between two sets of marks), `openVariables` (visible expanded variables), `marksBelow`.
- **`web/src/vars.ts`** (milestone 9): variable definitions. `builtinVars()` (K, I, D, S: read-only), `defineVar`/`deleteVar`, `nameProblem` (name rules, no redefining built-ins), `lookupIn(vars)` for the parser, `showNamed(tree, marks)` (△ text with names, e.g. `S K K V`; with no marks it equals `show`), and `saveVars`/`loadVars` (JSON in `localStorage`; each definition stores its named text, its raw tree and its inner names, so redefining V doesn't change variables built from the old V; bad saved entries are skipped).
- **`web/src/parts.ts`** (milestone 10): the parts of a rule. `partsOf(ids, step)` gives each node id in w, x, y or z (whole subtrees; the redex, b0 and later arguments get none) and each part's root; `carryParts(parts, born)` gives the S rule's copy of z the colour of z. `RULE_TEXT` (`△(△x)yz → yz(xz)` etc.) and `PART_PATHS` (where each part sits in the redex).
- **`web/src/camera.ts`**: the camera, pure: `{x, y, zoom}` (world point at the centre, screen px per world unit). `screenToWorld`/`worldToScreen`, `panBy`, `zoomAt` (keeps the point under the pointer fixed), `fitBounds`, `reveal` (smallest pan, or zoom-out, to bring a box into view; nothing if it's visible), `lerpCamera`, `viewBox`. Zoom limits 0.15–4; fitting never zooms past 1.6.
- **`web/src/edit.ts`**: pure edits on a tree + its ids: `addLeaf`, `removeBranch` (any branch; later siblings shift left), `attach` (the node is applied to another tree, which keeps its ids), `detach`.
- **`web/src/workspace.ts`**: the workspace model, pure and immutable: a list of placed trees `{key, tree, ids, x, y}` plus the selected key and the variable `marks`. Actions return a `Change` (new workspace + `born` + `absorbed` (nodes sliding into a collapsing chip) + a message for the learner): `addTree`, `addFragment`, `replaceTree`, `removeTree`, `moveTree`, `addLeafAt`, `removeAt` (root = whole tree), `joinTrees`, `tearOff`, `stepTree`, and for milestone 9 `pasteOnto` (like a join), `nameAt`, `expandChip`, `collapseChip`, `unfoldFor` (opens the chips the next step needs), `setAllBelow` (Expand all / Collapse all in a subtree), and `makeRoom(ws, key)` (pushes the other trees sideways out of a tree's way, cascading; trees only move away, never back). Every action prunes marks that no longer fit, so editing inside a variable turns it back into plain nodes.
- **`web/src/run.ts`**: a **reduction run**, watched like a video: the list of workspace frames since you started stepping the selected tree. `forward` (replays a recorded frame or reduces), `reduce(run, newId, at?)` (a chosen redex; drops later frames), `back`, `seek` (big jumps animate sensibly: copies sprout from something still on screen), `describeFrame`. If a step needs to look inside a chip, `reduce` records **two frames**: an unfold frame (`unfold: ['K']`, "Step 3 of 9: unfold K, because the next rule looks inside"), then the step, and stops on the unfold; stepping back over an unfold folds the nodes back into the chip (`absorbed`). Every frame of a run goes through `makeRoom`, so a growing tree pushes the dimmed trees aside instead of overlapping them (stepping back restores their places). At a normal form, `reduce` also checks the result against `run.recognise` (your variables, the ones used in the tree first; never K, I, D, S) and, if the whole tree is exactly one of them, adds a frame that folds it into that chip ("the result is exactly V"; `recogniseResult` in workspace.ts). `nextRuleFrame` / `beforeRule` skip unfold frames (for half-steps). `stepsBefore` counts rule steps only, and so do the frame labels ("Step 3: K rule at the root", "Before step 4: unfold K", "After step 9: the result is exactly V"; no total, since it isn't known ahead). The playback panel's top line holds the step label (left) and the **Colours** toggle (right), above the rule card and the controls, so nothing moves when the label appears and the toggle always fits (used in the messages and the step limit). Limits: `MAX_RUN_STEPS` (200) and `MAX_NODES` (1500) stop playback with a message.
- **`web/src/main.ts`**: the UI, floating over a full-window canvas: top left (title, input, examples), top right (modes, undo/redo/clear, − + Fit, ? help popover), bottom left (just the selected tree's △ text, cut to one line, click to expand), bottom centre (playback, centred on the screen), bottom right (⚙ physics tuning). Mode help is in the mode buttons' tooltips and the ? popover. New trees (added, torn off, restored by undo) are revealed if off screen, and while playing the camera follows the selected tree. Keys: F fit, + / − zoom, ? help, Esc closes help. Mode toggle **Add branch / Remove / Move** (keys A/R/M; shift-click flips add ↔ remove). Dragging a tree by its root carries the whole tree in any mode; drop it on a node of another tree to join (that node is applied to it) or on empty space to move it. In Move mode, dragging any other node tears it off into its own tree (tear + drop = one undo step). **Undo/Redo** (Ctrl+Z / Ctrl+Shift+Z) over whole-workspace snapshots, so nodes glide back. Typing in the input box edits the selected tree (keystrokes coalesce into one undo step); **New tree** and the example buttons add trees. Unselected trees are dimmed. **Playback** for the selected tree: **|◀**, **▶ Play / ❚❚ Pause**, **▶|**, a scrubber with "Step n of m: rule at path", and a **Play speed** slider (steps per second; separate from the physics "Animation speed"). Keys: Space = play/pause, ← / → = step back/forward. Play waits for each step's motion to mostly settle, and stops by itself at a normal form or a limit. **Undo vs. playback:** the scrubber and arrows move within a run without losing frames; to Undo/Redo a whole run is one action. Any edit, undo, redo or switching trees ends the run where it is (later frames are dropped); a run that ends back at its start leaves no undo entry. `?t=<tree>` in the URL sets the starting tree (names allowed).
  **Milestone 10:** a **rule card** above the playback buttons shows the rule with its letters in colour (`△(△x)yz → yz(xz)`) and what each part is here (`x = K · y = K · z = V`). With **Colours** on (a toggle beside the speed slider, remembered in the browser), the parts are coloured in the tree: dots filled, chips outlined, links inside a part too (w teal, x blue, y green, z pink; never orange or purple). Timing: while paused it previews the next step (or the redex whose badge you hover); when a step fires, the colours stay on the parts while they travel ("Just now"), and once the motion settles they move on to the next step (`scene.setParts` only changes classes, so the physics isn't disturbed). Learner messages from edits, joins, pastes and the end of a run show under the Add menu. The **Var** button names the selected tree. Add-menu buttons can be **dragged** (a ghost follows the pointer): onto a node to attach, onto empty canvas to create there. Example buttons are labelled with their real trees.
  **Milestone 10 follow-ups:** with **Colours** on, ▶| goes in **half-steps**: the first click applies the rule and the colours stay on the parts; the second moves the colours and the card on to the next step (|◀ and Play go by halves too; the unfold frames are skipped because the preview shows them). While a step is previewed, the chips it has to look inside are **opened for display only** (the marks drawn are `ws.marks` with those chips expanded), so its coloured parts are visible; this only starts once you step that tree (▶|, Play, a K/S/F letter or the scrubber; if the first ▶| has chips to open, that press only opens them). Selecting another tree, clicking empty canvas, editing, undo or redo folds them away until you step again, and a chip you collapse yourself stays closed until the next step. With Colours off, ▶| is a whole step as before. Right-click **Expand all** / **Collapse all** act on a whole subtree. An expanded variable shows a **hollow tag with its name** (click it to collapse). The rule card's parts are separated by thin dividers, and instead of a "Next" / "Just now" label the lit side of the equation shows where you are: the left side before the rule fires, the right side after. In Add mode, **clicking empty canvas** makes a new leaf (not when the click only closed the menu). The **Add menu** has sections: Basics (always shown), Examples and Yours (n) fold open and closed (remembered); Yours scrolls after about three rows and gets a filter box past 8 variables.
  **Milestone 9:** collapsed variables are drawn as labelled chips (a rounded box with the name). The Add menu lists △, K I D S, the examples, then your variables (× forgets one). The input box and the bottom-left panel show the tree with names (`S K K V`), with the raw △ text in a second line. **Right-click menu** (one small panel at the pointer; Esc or clicking away closes it): on a node, Expand V (on a chip), Collapse V (inside an expanded variable), Copy, Paste here, Name this… (an inline name field with error messages), Remove; on empty canvas, Paste. **⌘/Ctrl+C** copies the subtree under the pointer (or the selected tree); **⌘/Ctrl+V** pastes onto the node under the pointer, or as a new tree at the pointer. The system clipboard gets plain △ text; the app keeps its own copy with chips and uses it while the clipboard still holds the same text, so pasting from another app parses the text (names included). Clicking the canvas leaves the input box, so the shortcuts act on the canvas. Expanding sprouts the insides out of the chip; collapsing slides them into it.
- **`web/src/*.test.ts`**: 434 Vitest tests, including every case in `tests/cases.json` (same steps, same paths, same order, same result as Python), id bookkeeping on every step of every case, edits, and the workspace (including the milestone 6 finish line: build I, drop x on it, get I x), `allRedexes`/`stepAt` against `step` on every reference case, and runs (play S K K x to x, back/forward keep frames, choosing a redex mid-run, the step limit, seek), the camera maths, and milestone 9: name parsing and marks, `chipsToUnfold` on every rule (and nested chips), marks through K/S steps (S copies a chip), `S K K V` reducing to a V chip without V ever unfolding, `showNamed` round trips, saving/loading variables (and broken saved data), paste/name/expand/collapse/join/tear with chips, unfold frames in runs, and chip layout; and milestone 10: the parts of every rule before and after a step (both copies of z), and recognising a normal form as a variable (as its own frame, undone by stepping back); and the follow-ups: `hiddenBy`/`revealDiff`/`openVariables`/`marksBelow`, Expand all / Collapse all, and the half-step frame helpers.

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

### 9. Copy, paste and variables ✅
Build bigger trees out of smaller named pieces, the way the book does (`K`, `I`, `D`, `S`, then trees built from those).

**Copy and paste**
- [x] **Copy** any subtree or the selected tree: right-click → Copy, or ⌘/Ctrl+C over a node (else the selected tree).
- [x] **Paste as a new tree**: ⌘/Ctrl+V over empty canvas, or right-click empty canvas → Paste. It appears at the pointer.
- [x] **Paste as a child of a node**: ⌘/Ctrl+V while hovering a node, or right-click → Paste here. The node is applied to the pasted tree, exactly like a join. One undo step.
- [x] The copy also goes to the system clipboard as △ text, and pasting △ text (with names) from elsewhere works too.

**Variables (named trees)**
- [x] **Create a variable**: right-click → "Name this…", e.g. `V`. Saved in the browser, so it survives a reload.
- [x] **It renders collapsed** as a labelled chip wherever it came from a name (typed, the Add menu, pasted, or just named), as long as it hasn't been changed.
- [x] **It shows up in the Add menu**, after K, I, D, S, which are now built-in (read-only) variables handled by the same machinery.
- [x] **Typing its name works**: `V`, `V(△△)`, `SKV`.
- [x] **Right-click a chip → Expand**; right-click inside an expanded variable → Collapse.
- [x] **Reduction unfolds a chip only when needed** (its own unfold frame, before the step). Moved or copied chips stay collapsed.
- [ ] Recognising results (a reduction produces a subtree equal to a variable, so it gets its chip back): left for later.

**Done when:** you can build a tree, name it `V`, see `V` in the Add menu, type `S K K V` and see `V` as a chip that travels during the reduction and only unfolds when a rule needs its insides; and you can copy a subtree and paste it as a new tree or onto a node.
**Answers:**
- **Where the marker lives:** beside the trees, in `Workspace.marks` (node id → `{name, def, expanded}`), so undo snapshots and run frames carry it. A chip is a node **plus its first n branches** (n = the definition's branch count); later branches are its arguments. This matters because a rule gives the leftover arguments to the surviving subtree, which keeps its id.
- **Reaching inside:** the redex lies in a chip's own branches, or is a chip's node, or its first branch b0 is a chip. Everything else (y, z, w, x, later arguments) only moves the chip. In `S K K V`, S, D and K unfold when they fire; V never does. `chipsToUnfold` in `marks.ts`, tested on every rule.
- **Names:** a capital letter, then optional lowercase letters or digits (`V`, `X2`, `True`); a capital starts a new name, so `SKV` and `SKKTrue` need no spaces. K, I, D, S can't be redefined; your variables can (after a confirmation), and variables built from the old definition keep their meaning.
- **Definitions keep their names:** `S = D(K D)(D K(K D))`, so expanding S shows D and K chips. A name at the very root of a definition is dropped (the outer name wins).
- **When chips appear:** only from names, never by matching shapes (otherwise every `△△` would become K).
- **Layout:** a chip is one node in the tidy layout; expanding sprouts its insides out of the chip (via `born`), collapsing slides them back in (`absorbed`).

### 10. Make it clear for learners ✅
**Small UI tasks (feedback from milestone 9):**
- [x] A **Var** button next to **New**: names the selected tree (the same inline form as right-click → Name this…).
- [x] **Drag the Add-menu buttons** onto the canvas: on a node to attach (like a paste, one undo step), on empty canvas to create the tree there. Clicking still adds a new tree.
- [x] **Honest example labels:** `K(△△)(△△△)`, `I(△△)`, `S K K(△△)`.

**For learners:**
- [x] **Messages:** the explanations the workspace already wrote (edits, joins, pastes) and the end of a run ("Reached a normal form after 3 steps") are now shown.
- [x] **Rule card:** the rule as an equation with w, x, y, z in colour, plus what each part is in this tree; the same parts coloured in the tree before and after the step. A **Colours** toggle turns the tree colouring off.
- [x] **Recognise results:** a normal form that is exactly one of your variables folds into its chip, as its own frame.

**Done when:** someone who has only read chapter 3 can follow a reduction without you explaining it. (The mechanics are checked; this still needs a real learner to try it.)
**Answers:**
- **Colour timing:** one set of colours at a time: the next step's parts while paused (or a hovered badge's), the step's parts while they travel, then on to the next step once the motion settles.
- **Colours:** whole subtrees; dots filled, chips keep their purple and get a coloured outline; orange stays for redexes only.
- **Recognising results:** only at a normal form, only the whole tree, only your variables (K, I, D, S would match every `△△`).
- **Shape labels (leaf, stem, fork):** dropped; the shapes are clear enough on their own, and the tooltip names them.

**Follow-ups (after trying it):**
- [x] **Half-steps** with Colours on: apply the rule, then move the colours on, as two clicks (Play and |◀ too).
- [x] **Preview opens hidden parts:** while paused on a step, just the chips hiding its coloured parts open (display only), and fold back if you move on without firing it.
- [x] **Expand all / Collapse all** for a subtree, in the right-click menu; a **hollow name tag** marks every open variable (click to collapse).
- [x] **Dividers** between the parts of the rule card.
- [x] **Add mode:** clicking empty canvas makes a new leaf.
- [x] **Add menu:** collapsible sections, scrolling list, filter box for many variables.

### Later (moved out of milestone 10)
- **Book trees as built-in variables:** booleans (`True = K`, `False = K I`, `Not`, `And`, `Or`, with the book's exact definitions), in a grouped Add menu (Basics · Booleans · Examples · Yours).
- **Guided lessons** from chapter 3: a Lessons panel, each lesson loads its trees and explains what to look at in 2–3 sentences, with Back / Next. Proposed: trees and shapes; adding a branch is application; K; F; S; `I x = x`; `D` and `S K K x = x`.

### Later: a choice of View (more ambitious)
A **View** setting in the ⚙ settings panel, with three ways to lay trees out. Switching views should animate: nodes keep their ids and glide to their new places.
- **Tidy** (what exists now): every level on its own row, siblings evenly spaced, branches straight down.
- **Spiderweb (radial):** the root in the centre, branches going out in every direction, each level on a ring further out. Branch order still has to be readable: going clockwise, the first branch comes first.
- **Organic:** still growing downward, but looser. Levels don't have to line up exactly, siblings aren't evenly spaced, and branches cluster toward "down" (a fan under their parent rather than a row). The variety comes from the tree itself: a node with more children spreads wider, so different shapes give different silhouettes. The same tree should always look the same, so no randomness.

**Think about:**
- Today the layout is a set of target positions that the physics pulls nodes toward (`layoutTree` in render.ts, plus the target forces in scene.ts). A View could just be a different target function with the same signature, so dragging, the camera, drop targets and animation all keep working.
- **Radial:** d3-hierarchy can do this: a `tree()` layout with `size([2π, radius])`, then convert to x/y. Watch for:
  - a root with only 1–2 children, which leaves half the circle empty
  - the redex badges and chips, which assume "up and to the right" is free space
  - several trees side by side: each needs a round footprint, so `makeRoom` and the camera fit need round or square bounds
- **Organic:** a possible recipe:
  - each child sits at an angle in a fan below its parent (the fan is wider for more children), at a distance that depends on the size of its subtree
  - pull toward those targets more weakly than in Tidy, so the springs and repulsion do more of the shaping
- **Branch order** must stay readable in every view. The sibling-order force is written for left-to-right rows: radial needs it by angle, organic by angle within the fan.
- Should the choice be remembered in the browser, like Colours? Probably yes.

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
