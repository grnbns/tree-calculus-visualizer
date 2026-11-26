# Tree Calculus Visualizer: Plan

A browser app for learning Barry Jay's tree calculus (as in *Reflective Programs in Tree Calculus*, 2021). You build trees, join them, and watch reductions happen. The UI should feel fluid and physical, like Obsidian's graph view: nodes float on springs, new branches sprout with a little motion, and reductions animate instead of redrawing.

This plan is deliberately high-level. Each milestone has a goal, a finish line, and a few questions to work out yourself.

---

## Where things stand (25 Nov 2026)

**Milestones 0–12 are done.** Next up: Milestone 13. Deploying is deliberately last (milestone 16), after the remaining features. (Milestone 10's finish line, a learner following a reduction alone, is still to be tried by a person; milestone 13's lessons are where that gets tested.)

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
| 11. Book trees and notation | ✅ Done |
| 12. Settings and a choice of View | ✅ Done |
| 13. Guided lessons | ⏭️ Next |
| 14. Your own templates | Not started |
| 15. Touch and small screens | Not started |
| 16. Ship it | Not started |

What exists now:

- **`reduction_logic.py`**: the reference engine. `step` returns `(new_tree, rule, path)`, where `path` is the list of branch indices from the root to the redex (`[]` = root). `trace` prints the rule and path for each step.
- **`parser.py`**: parses △ notation (`.` and `^` accepted as aliases). Named trees `K`, `I`, `D`, `S`, with `S = D (K D) (D K (K D))`.
- **`test_reduction_logic.py`**: 50 tests, run with `pytest` from the `.venv`. Covers every function, paths, and the book's equations `I x = x`, `K x y = x`, `D x y z = y z (x z)`, `S x y z = x z (y z)` and `S K K x = x` on hand-picked and random trees.
- **`export_cases.py` → `tests/cases.json`**: 67 reference cases (values, each rule, book equations, nested/side-by-side redexes, one non-terminating case, 50 seeded random trees). Each records every step as `{rule, path, tree}` plus the final result. A test fails if the file is out of date.
- **`demo.py`**: runs `trace`/`normalize`/`step` on examples so you can watch reductions.
- **`.gitignore`** and a project **`.venv`** with pytest.
- **`web/`**: Vite + TypeScript (vanilla) app with Vitest. Vite's demo files removed. Run everything from inside `web/`: `npm run dev` (dev server), `npm test` (Vitest, watch mode), `npm run build` (type-check + production build).
- **`web/src/engine.ts`, `web/src/parser.ts`**: the TypeScript port. The TS parser also accepts **names** (the Python parser doesn't): a letter, then any letters or digits (`V`, `x2`, `isZero`; case matters). Names need spaces between them (`S K V`; `SKV` is one name, and the error suggests the spaces); next to △ and brackets no space is needed (`K△`, `K(K I)`). `parseNamed(text, lookup)` returns the tree plus `marks` (where each name was used, by path, including the names inside a definition); `parse` returns just the tree. Built-ins are `BUILTIN_TEXT` (`S` is written `D(K D)(D K(K D))`; milestone 11 adds, in the book's spelling and written as in the book: the booleans `true`, `false`, `and`, `or`, `implies`, `not`, `iff`, the numbers `zero`, `succ`, `isZero`, `pred`, the queries `isLeaf`, `isStem`, `isFork`, and `selfApply`; grouped in `BOOLEANS`, `NUMBERS`, `QUERIES`). The parser also reads the book's **notation**: templates `d{x}`, `first{p}`, `second{p}`, `query{a, b, c}`, `wait{x, y}`, `swap{f}` (`TEMPLATES`: parameters and a body; the parser fills in the arguments and builds the tree directly, shown as a chip labelled as typed, e.g. `d{K}`), powers written `K**4 I` or with superscript digits `K⁴ I` (= `K(K(K(K I)))`; `toSuperscripts` turns `**4` into `⁴`), and numbers as digits (`3` = `K³ △`, a chip named 3, up to `MAX_NUMBER` = 1000; `numberTree(n)`); the old raw strings `K`, `I`, `D`, `S` are still exported. Same functions in camelCase (`applyAll`, `isValue`, `kRule`, `reduceRoot`, …). `step` returns `{tree, rule, path}` or `null`; `normalize` returns `{tree, steps, finished}`; `reductionSteps` returns every step. `allRedexes(tree)` lists every `{path, rule}` leftmost-outermost first (the first is what `step` picks); `stepAt(tree, path)` reduces a chosen redex; `size(tree)` counts nodes. Trees are `readonly`, so mutation is a type error.
- **`web/src/render.ts`**: `layoutTree(tree, chips?)` (pure: d3-hierarchy positions, node kind, path per node; a collapsed variable is one node with only its arguments below it, and wide chips push neighbours apart) plus the spacing/size constants (`NODE_GAP_X`, `LEVEL_GAP_Y`, `NODE_RADIUS`, `COMPUTATION_RADIUS`, `CHIP_HEIGHT`, `chipWidth`).
- **`web/src/scene.ts`**: the live drawing. A `Scene` owns a d3-force simulation: springs with tidy-layout rest lengths, light repulsion, collision, pull toward tidy targets, and a custom sibling-order force (soft push always; a hard no-crossing rule in rows where a node is being dragged) so branches never swap sides at rest or while dragging. Since milestone 12 the force works by x or **by angle** around the parent (`SimNode.order`, from `CHILD_ORDER`): the push goes along the tangent, and the hard rule turns the free sibling round the pivot by exactly the missing angle. **Views:** `setView(view)` / `getView()`. The next `setWorkspace` lays trees out with `layoutFor`, and nodes glide to their new places. While a tree is carried by its root, repulsion and collision act separately on it and on everything else (`byGroup`), so it passes over other trees instead of shoving the node you're aiming at, and it is drawn see-through (`.carried`). The soft order push is off for 150 ticks after a switch (a row can really turn round: in Organic, a branch heading sideways has its own branches one above the other), and the dev order check waits 90 ticks longer. Camera fit and reveal use each layout's `box`. Drag a node and it springs back; the simulation settles to a stop. `setWorkspace(trees, {selected, born})` shows several trees side by side (each with its own root position) and matches nodes **by id**: survivors travel to their new place (even into another tree), copies sprout from the node they were copied from, vanished nodes and links disappear at once by default; `setFade(true)` brings back the 350 ms fade (`FADE_MS`), which also drives the collapse slide-in (the Fade checkbox in Settings → Physics). The simulation is driven by the scene's own frame loop (not d3's timer) so it has an **animation speed** (physics ticks per frame, default 0.5; positions are interpolated between ticks so slow motion stays smooth; dragging always runs at full speed; fades scale with it). Physics defaults are `DEFAULT_PARAMS` (damping 0.7, speed 0.5). The sliders are in Settings (see main.ts). In dev, an order check warns in the console if siblings are ever out of order at rest or while dragging. The scene never changes trees itself: it reports `onClick`, `onDragStart` and `onDrop` (with the drop-target node, highlighted while a tree is carried by its root) to `main.ts`. Each node element has `data-tree` and `data-path`. Every redex gets a thin orange border and a clickable **K/S/F badge** (just the letter; `onRedexClick`); the one ▶| will reduce next has its letter in white on a filled orange tag (no ring). In Tidy, badges sit up and to the right, outside wide chips too; in Organic, in the free space around the node (views.ts). Nodes are no longer filled orange. A first click on an unselected (dimmed) tree, or one of its badges, only selects it. `isSettled(threshold)` tells playback when the last step's motion has calmed down. **Camera:** the SVG `viewBox` comes from `camera.ts`, so world coordinates (physics, dragging, drop targets) are unchanged. The camera never moves by itself except: fit on first show, `fitAll()`, `zoomBy()`, and `setWorkspace(…, {reveal: keys})`, and those **glide** (450 ms ease-out). Drag empty canvas to pan (two fingers: pan + pinch zoom); scroll pans; ctrl/⌘ + scroll or a trackpad pinch zooms around the pointer (a mouse-wheel notch is capped at ~28%).
- **`web/src/views.ts`** (milestone 12): the two **views**, pure. `layoutFor(view, tree, chips?)` gives target positions plus, per node, where its badge goes, and a `box` (the footprint: dots, chips and a margin for badges and tags). **Tidy** is `layoutTree` unchanged. **Organic** draws trees the way the book does (its figures of the booleans in §3.5). Every edge is `BOOK_EDGE` (36) long, the root is at the top, and a stem's branch carries straight on in the direction it came from. A node's branches are 60° apart (narrower for many, at most 150° in all), first branch on the left, and turned so their weights (subtree sizes) balance on the incoming direction: the heavier branch bends less. So a leaf beside a big subtree swings out about 50° while the subtree carries almost straight on, and two equal branches go ±30°. Fans are kept at least 15° below horizontal, so a tree never grows upward. **No crossings:** `findClashes` (a grid search) finds edges that cross, nodes too close to an edge they aren't on, and nodes too close together. For each clash, the fork where the two branches part opens wider (×1.2 per round), or, once it's as wide as it goes, its branches get longer (×1.15). The tree is laid out again until nothing clashes (at most 80 rounds; every reference tree and reduction step comes out clean). Trees that don't crowd stay exactly as the book draws them. Organic layouts are cached per tree and set of chips (trees never change); about 30 ms for 300 nodes, 0.4 s at the 1500-node limit. `CHILD_ORDER`: Tidy keeps branches in order by x, Organic by angle around the parent, anticlockwise from "up" (left to right below the parent, as in Tidy). By angle, order is **cyclic and local** (`turnBetween`, `SWAP_WINDOW` = 90°): a pair is swapped only when the later one is just behind the earlier one. `PULL_SCALE` is 1 in both views. In Organic, badges go in the widest free angle between a node's links (`widestGap`). The badge and the name tag split that angle, the tag on the half away from the parent link, and the tag slides sideways if it would cover the badge (`badgeOffset`, `tagOffset`). `VIEWS`, `isView`, `nextView`. (A third view, Spiderweb, with rings round the root, was built and dropped: after a few reduction steps most nodes have two branches, so it never looked like a web.)
- **`web/src/ids.ts`**: stable node identity, kept **beside** the tree (the engine stays pure). An `IdTree` has the same shape as the `Tree`. `freshIds(tree)` for a new tree; `stepIds(ids, step)` returns the new ids plus `born` (copy → origin) and `died`. In a redex `△ b0 y z rest`: **K** → y's node becomes the result (z, R, b0 vanish); **S** → y's node becomes the result, x and the original z keep their ids, the second z is a fresh copy; **F** → z's node becomes the result (y, R, b0 vanish).
- **`web/src/marks.ts`** (milestone 9): which subtrees are variables, kept **beside** the trees like ids: `Marks` = node id → `{name, def, expanded}`. A mark means "this node **plus its first n branches** is V" (n = V's arity, the number of branches of its definition); later branches are arguments hanging below the chip. That's what lets a chip survive a K step (`y` keeps its id and receives the leftover arguments). `chipsToUnfold(ids, marks, path)` decides what a step reaches inside: the redex is inside a chip's own branches, the redex *is* a chip's node, or the redex's first branch b0 is a chip; being y, z, w, x or an argument only moves it. Also `pruneMarks` (drops marks whose subtree no longer matches the definition: run after every action), `carryMarks` (an S-copy of a chip is a chip), `setExpanded`, `enclosingMarks` (the variables around a node, for Collapse), `insideIds`, `collapsedChips` (by path, for the layout), `fragmentAt` (a subtree with its marks: what gets copied, pasted and named), `isHidden`; and `hiddenBy` (the outermost chip hiding each node), `revealDiff` (what sprouts out of / slides into chips between two sets of marks), `openVariables` (visible expanded variables), `marksBelow`.
- **`web/src/vars.ts`** (milestone 9): variable definitions. `builtinVars()` (K, I, D, S: read-only), `defineVar`/`deleteVar`, `nameProblem` (name rules, no redefining built-ins), `lookupIn(vars)` for the parser, `showNamed(tree, marks)` (△ text with names, e.g. `S K K V`; with no marks it equals `show`), and `saveVars`/`loadVars` (JSON in `localStorage`; `loadVarsReport` also renames a saved variable whose name is now built in, e.g. your `True` becomes `True1`, along with its uses inside other saved variables; each definition stores its named text, its raw tree and its inner names, so redefining V doesn't change variables built from the old V; bad saved entries are skipped).
- **`web/src/parts.ts`** (milestone 10): the parts of a rule. `partsOf(ids, step)` gives each node id in w, x, y or z (whole subtrees; the redex, b0 and later arguments get none) and each part's root; `carryParts(parts, born)` gives the S rule's copy of z the colour of z. `RULE_TEXT` (`△(△x)yz → yz(xz)` etc.) and `PART_PATHS` (where each part sits in the redex).
- **`web/src/camera.ts`**: the camera, pure: `{x, y, zoom}` (world point at the centre, screen px per world unit). `screenToWorld`/`worldToScreen`, `panBy`, `zoomAt` (keeps the point under the pointer fixed), `fitBounds`, `reveal` (smallest pan, or zoom-out, to bring a box into view; nothing if it's visible), `lerpCamera`, `viewBox`. Zoom limits 0.15–4; fitting never zooms past 1.6.
- **`web/src/edit.ts`**: pure edits on a tree + its ids: `addLeaf`, `removeBranch` (any branch; later siblings shift left), `attach` (the node is applied to another tree, which keeps its ids), `detach`.
- **`web/src/workspace.ts`**: the workspace model, pure and immutable: a list of placed trees `{key, tree, ids, x, y}` plus the selected key and the variable `marks`. Actions return a `Change` (new workspace + `born` + `absorbed` (nodes sliding into a collapsing chip) + a message for the learner): `addTree`, `addFragment`, `replaceTree`, `removeTree`, `moveTree`, `addLeafAt`, `removeAt` (root = whole tree), `joinTrees`, `tearOff`, `stepTree`, and for milestone 9 `pasteOnto` (like a join), `nameAt`, `expandChip`, `collapseChip`, `unfoldFor` (opens the chips the next step needs), `setAllBelow` (Expand all / Collapse all in a subtree), and `makeRoom(ws, key, view?)` (pushes the other trees sideways out of a tree's way, cascading; trees only move away, never back; since milestone 12 it uses each layout's footprint `box` with `PUSH_GAP` = 16). `spreadApart(ws, view)` is the same push around the selected tree, used **only for drawing**, so trees placed for another view (or recorded in undo snapshots and run frames) never overlap and nothing stored changes. `layoutOf(t, marks, view?)`. Every action prunes marks that no longer fit, so editing inside a variable turns it back into plain nodes.
- **`web/src/run.ts`**: a **reduction run**, watched like a video: the list of workspace frames since you started stepping the selected tree. `forward` (replays a recorded frame or reduces), `reduce(run, newId, at?)` (a chosen redex; drops later frames), `back`, `seek` (big jumps animate sensibly: copies sprout from something still on screen), `describeFrame`. If a step needs to look inside a chip, `reduce` records **two frames**: an unfold frame (`unfold: ['K']`, "Step 3 of 9: unfold K, because the next rule looks inside"), then the step, and stops on the unfold; stepping back over an unfold folds the nodes back into the chip (`absorbed`). Every frame of a run goes through `makeRoom`, so a growing tree pushes the dimmed trees aside instead of overlapping them (stepping back restores their places). At a normal form, `reduce` also checks the result against `run.recognise` (your variables, the ones used in the tree first; then True and False, but only if the tree used a boolean; never K, I, D, S) and, if the whole tree is exactly one of them, adds a frame that folds it into that chip ("the result is exactly V"; `recogniseResult` in workspace.ts). A chip already at the root gives way unless it's one of the names looked for, so `K I` becomes `False` and a bare `K` becomes `True`. `nextRuleFrame` / `beforeRule` skip unfold frames (for half-steps). `stepsBefore` counts rule steps only, and so do the frame labels ("Step 3: K rule at the root", "Before step 4: unfold K", "After step 9: the result is exactly V"; no total, since it isn't known ahead). The playback panel's top line holds the step label (left) and the **Colours** toggle (right), above the rule card and the controls, so nothing moves when the label appears and the toggle always fits (used in the messages and the step limit). Limits: `MAX_RUN_STEPS` (200) and `MAX_NODES` (1500) stop playback with a message.
- **`web/src/main.ts`**: the UI, floating over a full-window canvas: top left (title, input, and the Add menu: every section, Basics first, is a dropdown; the ▾ button by the title folds the whole menu away (remembered), and the menu scrolls past 45% of the window height), top right (modes, undo/redo/clear, − + Fit, ? help popover), bottom left (just the selected tree's △ text, cut to one line, click to expand), bottom centre (playback, centred on the screen), bottom right (⚙ **Settings**: the **View** (Tidy / Organic; V switches), **Animation speed**, and a folded **Physics** section with the other sliders, a "Fade removed nodes" checkbox, Defaults (physics only) and Copy values. The view and the speed are remembered in the browser. Switching views works mid-reduction and brings the trees into view if they've grown off screen. Trees are drawn through `spreadApart`). Mode help is in the mode buttons' tooltips and the ? popover. New trees (added, torn off, restored by undo) are revealed if off screen, and while playing the camera follows the selected tree. Keys: F fit, + / − zoom, ? help, Esc closes help. Mode toggle **Add branch / Remove / Move** (keys A/R/M; shift-click flips add ↔ remove). Dragging a tree by its root carries the whole tree in any mode; drop it on a node of another tree to join (that node is applied to it) or on empty space to move it. In Move mode, dragging any other node tears it off into its own tree (tear + drop = one undo step). **Undo/Redo** (Ctrl+Z / Ctrl+Shift+Z) over whole-workspace snapshots, so nodes glide back. Typing in the input box edits the selected tree (keystrokes coalesce into one undo step); the Add-menu buttons add trees (the New button was removed in milestone 11). Unselected trees are dimmed. **Playback** for the selected tree: **|◀**, **▶ Play / ❚❚ Pause**, **▶|**, a scrubber with "Step n of m: rule at path", and a **Play speed** slider (steps per second; separate from the physics "Animation speed"). Keys: Space = play/pause, ← / → = step back/forward. Play waits for each step's motion to mostly settle, and stops by itself at a normal form or a limit. **Undo vs. playback:** the scrubber and arrows move within a run without losing frames; to Undo/Redo a whole run is one action. Any edit, undo, redo or switching trees ends the run where it is (later frames are dropped); a run that ends back at its start leaves no undo entry. `?t=<tree>` in the URL sets the starting tree (names allowed).
  **Milestone 10:** a **rule card** above the playback buttons shows the rule with its letters in colour (`△(△x)yz → yz(xz)`) and what each part is here (`x = K · y = K · z = V`). With **Colours** on (a toggle beside the speed slider, remembered in the browser), the parts are coloured in the tree: dots filled, chips outlined, links inside a part too (w teal, x blue, y green, z pink; never orange or purple). Timing: while paused it previews the next step (or the redex whose badge you hover); when a step fires, the colours stay on the parts while they travel ("Just now"), and once the motion settles they move on to the next step (`scene.setParts` only changes classes, so the physics isn't disturbed). Learner messages from edits, joins, pastes and the end of a run show under the Add menu. The **Var** button names the selected tree. Add-menu buttons can be **dragged** (a ghost follows the pointer): onto a node to attach, onto empty canvas to create there. Example buttons are labelled with their real trees.
  **Milestone 10 follow-ups:** with **Colours** on, ▶| goes in **half-steps**: the first click applies the rule and the colours stay on the parts; the second moves the colours and the card on to the next step (|◀ and Play go by halves too; the unfold frames are skipped because the preview shows them). While a step is previewed, the chips it has to look inside are **opened for display only** (the marks drawn are `ws.marks` with those chips expanded), so its coloured parts are visible; this only starts once you step that tree (▶|, Play, a K/S/F letter or the scrubber; if the first ▶| has chips to open, that press only opens them). Selecting another tree, clicking empty canvas, editing, undo or redo folds them away until you step again, and a chip you collapse yourself stays closed until the next step. With Colours off, ▶| is a whole step as before. Right-click **Expand all** / **Collapse all** act on a whole subtree. An expanded variable shows a **hollow tag with its name** (click it to collapse). The rule card's parts are separated by thin dividers, and instead of a "Next" / "Just now" label the lit side of the equation shows where you are: the left side before the rule fires, the right side after. In Add mode, **clicking empty canvas** makes a new leaf (not when the click only closed the menu). The **Add menu** has sections: Basics (always shown), Examples and Yours (n) fold open and closed (remembered); Yours scrolls after about three rows and gets a filter box past 8 variables.
  **Milestone 9:** collapsed variables are drawn as labelled chips (a rounded box with the name). The Add menu lists △, K I D S, the examples, then your variables (× forgets one). The input box and the bottom-left panel show the tree with names (`S K K V`), with the raw △ text in a second line. **Right-click menu** (one small panel at the pointer; Esc or clicking away closes it): on a node, Expand V (on a chip), Collapse V (inside an expanded variable), Copy, Paste here, Name this… (an inline name field with error messages), Remove; on empty canvas, Paste. **⌘/Ctrl+C** copies the subtree under the pointer (or the selected tree); **⌘/Ctrl+V** pastes onto the node under the pointer, or as a new tree at the pointer. The system clipboard gets plain △ text; the app keeps its own copy with chips and uses it while the clipboard still holds the same text, so pasting from another app parses the text (names included). Clicking the canvas leaves the input box, so the shortcuts act on the canvas. Expanding sprouts the insides out of the chip; collapsing slides them into it.
- **`web/src/*.test.ts`**: 509 Vitest tests, including every case in `tests/cases.json` (same steps, same paths, same order, same result as Python), id bookkeeping on every step of every case, edits, and the workspace (including the milestone 6 finish line: build I, drop x on it, get I x), `allRedexes`/`stepAt` against `step` on every reference case, and runs (play S K K x to x, back/forward keep frames, choosing a redex mid-run, the step limit, seek), the camera maths, and milestone 9: name parsing and marks, `chipsToUnfold` on every rule (and nested chips), marks through K/S steps (S copies a chip), `S K K V` reducing to a V chip without V ever unfolding, `showNamed` round trips, saving/loading variables (and broken saved data), paste/name/expand/collapse/join/tear with chips, unfold frames in runs, and chip layout; and milestone 10: the parts of every rule before and after a step (both copies of z), and recognising a normal form as a variable (as its own frame, undone by stepping back); and the follow-ups: `hiddenBy`/`revealDiff`/`openVariables`/`marksBelow`, Expand all / Collapse all, and the half-step frame helpers; and milestone 11: every boolean's truth table, that they're all values, that `or = implies I`, the templates and powers (against the written-out forms and their behaviour: `first`/`second` take pairs apart, `wait{x, y}` is a value and `wait{x, y} z = x y z`, `swap{f} x y = f y x`), `isZero`/`pred` on 0–5, the queries on leaves, stems and forks (and Exercise 7), `selfApply x = x x`, `D I I` → `selfApply`, `selfApply selfApply` never finishing, renaming saved variables whose names became built in, and that `Not True`, `Not False`, `Iff False False`, `And True False` and `Or False True` all end as a True or False chip; and milestone 12: every view on every reference tree (and the built-ins) keeps nodes more than 20 units apart and branches in order, footprints cover every node, chip and badge, Organic's book rules (equal edges unless lengthened to avoid a clash, stems straight on, forks balanced by weight, never growing upward, cached) and no crossing edges or clashes on any reference tree or reduction step, switching from Tidy never reverses a row, badges and tags (never overlapping, tag away from the parent), cyclic order by angle, the order force by angle (push back, drag over the top, hard rule), and `spreadApart`.

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
- [x] **Typing its name works**: `V`, `V(△△)`, `S K V`.
- [x] **Right-click a chip → Expand**; right-click inside an expanded variable → Collapse.
- [x] **Reduction unfolds a chip only when needed** (its own unfold frame, before the step). Moved or copied chips stay collapsed.
- [ ] Recognising results (a reduction produces a subtree equal to a variable, so it gets its chip back): left for later.

**Done when:** you can build a tree, name it `V`, see `V` in the Add menu, type `S K K V` and see `V` as a chip that travels during the reduction and only unfolds when a rule needs its insides; and you can copy a subtree and paste it as a new tree or onto a node.
**Answers:**
- **Where the marker lives:** beside the trees, in `Workspace.marks` (node id → `{name, def, expanded}`), so undo snapshots and run frames carry it. A chip is a node **plus its first n branches** (n = the definition's branch count); later branches are its arguments. This matters because a rule gives the leftover arguments to the surviving subtree, which keeps its id.
- **Reaching inside:** the redex lies in a chip's own branches, or is a chip's node, or its first branch b0 is a chip. Everything else (y, z, w, x, later arguments) only moves the chip. In `S K K V`, S, D and K unfold when they fire; V never does. `chipsToUnfold` in `marks.ts`, tested on every rule.
- **Names** (changed in milestone 11): at first a capital started each name, so `SKV` needed no spaces; now a name is a letter then letters or digits, with spaces between names, so the book's lowercase names fit. K, I, D, S can't be redefined; your variables can (after a confirmation), and variables built from the old definition keep their meaning.
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

### 11. Book trees and notation ✅
More named trees from the book, built in like K, I, D, S.
- [x] `true`, `false`, `and`, `or`, `implies`, `not`, `iff` (the book's spelling) as **built-in variables** (read-only), using the book's definitions from §3.5 (table below), written with K and I so expanding one shows those chips.
- [x] **Grouped Add menu:** Basics (△ K I D S) · Booleans (open by default) · Examples · Yours.
- [x] **Examples:** `not true`, `and true false`, `or false true`.
- [x] **Numbers, queries, self-application:** `zero`, `succ`, `isZero`, `pred` (§3.7), `isLeaf`, `isStem`, `isFork` (§3.8), `selfApply` (§4.3), each in its own Add-menu section (selfApply in Basics). `isZero` and the queries end as a `true`/`false` chip like the booleans.
- [x] **The book's notation in the input box:** templates `d{x}`, `first{p}`, `second{p}`, `query{a, b, c}`, `wait{x, y}`, `swap{f}` and powers `Kⁿ x` (superscript digits). The built-ins are now written that way too (`and = d{K(K I)}`, `isLeaf = query{K, K I, K I}`).
- [x] **Numbers 0–10 by name** in the Numbers section (`0`, `1`, … `10`); any number up to 1000 can be typed. A result that is exactly a number shows as its chip when the tree used numbers (`pred 3` ends as `2`), and Play on a tree that is already a value can still show what it is (`succ 0`: "This is exactly 1").
- [x] **Powers as `K**4`**, shown as `K⁴` in the input box once the number is finished (or on leaving the box); superscripts still work.
- [x] **Templates section** in the Add menu: `d{x}`, `first{p}`, … add the template with △ for each argument and select the first △ in the input box, ready to type over.
- [x] The **New** button is gone (the Add menu, Var and typing cover it).
- [x] More examples: `succ 0`, `isZero (K² △)`, `pred (K³ △)`, `isLeaf K`, `wait{K, △} (△△)`, `selfApply selfApply` (runs into the step limit).
- [x] **Names need spaces between them** and may start with any letter (`isZero`, `x2`), so the book's names can be used as written. `SKV` is now one (unknown) name; the error suggests `S K V`.
- [x] Saved variables that clash with the new names are **renamed** on load (`not` → `not1`, uses inside other variables too), with a one-time message.

**Done when:** you can add `not true` from the menu, play it, and watch it end as `false`. ✔ (checked in headless Chrome; also `iff false false` → `true`)
**Answers:**
- **Which name wins:** True and False are only looked for when the starting tree used a boolean; your variables come first. So `K △ △` still ends as plain `△`, but `Iff False False` ends as `True` even though its result is literally a K chip (a chip at the root gives way unless it's one of the names looked for).
- **Definitions:** the book's, as in the table; `Or = Implies I` holds as trees (tested). Expanding `Not` shows K and I chips, not `Implies`.

#### Book trees: definitions to build in

Taken from *Reflective Programs in Tree Calculus*, ch. 3–4. In the book, `d{x}` means `△(△x)` and `Kⁿ x` means K applied n times (`K²I = K(K I)`). Below, everything is written out so the app's parser takes it as it is.

**How these were checked:** each one was parsed (with the app's rules) and run with the book's rules, in a separate checker:
- the boolean operators on all four (or two) inputs;
- the queries and pairs on 300 random trees;
- the numbers 0–5.

Every definition is already a value (a binary tree), so it never needs reducing before use, except where noted.

**Name rule:** names now need spaces between them and can be any letters or digits, so the book's own spellings work (`isZero`, `isLeaf`, `selfApply`). The tables below were written before that change; when building them in, use the book's spelling.

**Booleans (§3.5)**: milestone 11

| Name | Book | Type into the app | Behaviour |
|---|---|---|---|
| `True` | `K` | `K` | `True x y = x` |
| `False` | `K I` | `K I` | `False x y = y` |
| `And` | `d{K(K I)}` | `△(△(K(K I)))` | `And x y = x y (K I)` |
| `Or` | `d{KK} I` | `△(△(K K)) I` | `Or x y = x K y` |
| `Implies` | `d{KK}` | `△(△(K K))` | |
| `Not` | `d{KK}(d{K(K I)} I)` | `△(△(K K))(△(△(K(K I))) I)` | |
| `Iff` | `△(△ I not) △` | `△(△ I Not) △` | uses `Not` |

All the truth tables come out right (checked). Things worth noticing:
- `Or` is `Implies I`, and `Not` is `Implies (And I)`, so expanding `Not` shows `Implies`-shaped insides even though the book doesn't say so. You could write `Not = Implies(And I)` if you'd like the chips to show that.
- `And True False` → `False` and `Not True` → `False` both end on `K I`. `Or False True` ends on `K`, which is also `True`: that's the naming question above.
- The book leaves checking `implies`, `not` and `iff` as exercises (Ex. 2–3), so these make good lesson material for milestone 13.

**Pairs (§3.6)**: maybe later
- `Pair = △`, so `Pair x y` is simply the fork `△ x y`.
- `first{p} = △ p △ K` and `second{p} = △ p △ (K I)` are **templates** (they need a specific p filled in), not trees. So they can't be built-in variables as they stand.
- Exercise 4 asks you to find trees `fst` and `snd` that work on any pair. That's a nice one to solve yourself and then add.

**Natural numbers (§3.7)**: maybe later
The number n is `Kⁿ △`: `0 = △`, `1 = K △`, `2 = K(K △)`, …

| Name | Book | Type into the app | Behaviour |
|---|---|---|---|
| `Zero` | `△` | `△` | |
| `Succ` | `K` | `K` | `Succ n = K n` (same tree as K and True) |
| `Iszero` | `d{K⁴I}(d{KK}△)` | `△(△(K(K(K(K I)))))(△(△(K K))△)` | `Iszero 0 = True`, otherwise `False` |
| `Pred` | `d{K²I}(d{K△}△)` | `△(△(K(K I)))(△(△(K △))△)` | `Pred 0 = 0`, `Pred (n+1) = n` |

Exercise 6 (hard) redoes this with `△ⁿ△` numbers instead.

**Fundamental queries (§3.8)**: maybe later
`query{a, b, c}` = `△(△(K b))(△(△(K(K I)))(△(△(K⁵ c))(△(△(K³ a))△)))` answers a for a leaf, b for a stem, c for a fork. It's a template; the three real trees are:

| Name | Book | Type into the app |
|---|---|---|
| `Isleaf` | `query{K, K I, K I}` | `△(△(K(K I)))(△(△(K(K I)))(△(△(K(K(K(K(K(K I)))))))(△(△(K(K(K K))))△)))` |
| `Isstem` | `query{K I, K, K I}` | `△(△(K K))(△(△(K(K I)))(△(△(K(K(K(K(K(K I)))))))(△(△(K(K(K(K I)))))△)))` |
| `Isfork` | `query{K I, K I, K}` | `△(△(K(K I)))(△(△(K(K I)))(△(△(K(K(K(K(K K))))))(△(△(K(K(K(K I)))))△)))` |

These are the first trees that *look inside* their argument, which is the point of the book, so they make a great demo. Exercise 7 asks you to evaluate `isLeaf △`, `isLeaf K` and `isLeaf (K△)` by hand; the visualizer can now do that.

**Self-application and waiting (§4.3–4.4)**: maybe later
- `Selfapply` = `d{I} I` = `△(△ I) I`, so `Selfapply x = x x`. It's the same tree as the book's `D I I` after reducing.
- **`Selfapply Selfapply` never finishes**: it reduces back to itself. That makes it the canonical example for the step limit.
- `wait{x, y}` = `△(△ I)(△(△(K y))(K x))` is a template: `wait{x, y} z = x y z`, but `wait{x, y}` on its own stays a value, so x and y can't interact yet. It's the key to the book's fixpoints.
- `swap{f}` = `△(△(K f))(△(△(△(△ K)(K △)))(K △))` is a template: `swap{f} x y = f y x`.

Both templates were checked on random trees. The fixpoint `Y2{f}` and `plus` (§4.5–4.6) are built from these. The text copy of the book garbles those formulas, so build them from the printed book if you want them.

**Templates (decided, then changed):** first decided as option 4 below; then changed to **reading the book's notation directly**: the parser fills in the arguments and builds the tree, so the canvas still only holds trees, and `wait{x, y}` is a value at once, as in the book. The old option 4, for reference: `d{x}`, `wait{x, y}`, `query{a, b, c}`, `first{p}` and `swap{f}` take *trees as parameters*, so they aren't trees themselves (applying a tree only ever adds a branch at its root, but a template puts its parameter deeper inside). **Decision: build each as an ordinary function tree** `f` with `f x …` *reducing to* the template's tree (e.g. `S(K △)(S(K △) I) x` → `△(△x)`, and Exercise 4's `fst`/`snd` for `first`/`second`). That always works: every template here is made only by application from fixed trees and its parameters, so bracket abstraction gives such an `f` (combinatory completeness: S and K suffice). Catches:
- you watch a few S/K steps before the shape appears;
- plain S/K abstraction makes big trees (use the usual optimisations, or the book's own solutions where it gives them);
- the result is a new tree, so it won't show as a named chip.

### 12. Settings and a choice of View (more ambitious) ✅
The ⚙ panel is still the physics-tuning panel from milestone 4. Turn it into **Settings**:
- keep **Animation speed** up front (useful to learners)
- fold the other physics sliders into a "Physics" section
- add a **View** choice with three ways to lay trees out (in the end two: Spiderweb was dropped)

Switching views should animate: nodes keep their ids and glide to their new places. The choice is remembered in the browser, like Colours.
- **Tidy** (what exists now): every level on its own row, siblings evenly spaced, branches straight down.
- ~~**Spiderweb (radial):** the root in the centre, branches going out in every direction, each level on a ring further out.~~ Built, then dropped (see the answers).
- **Organic:** still growing downward, but looser. Levels don't have to line up exactly, siblings aren't evenly spaced, and branches cluster toward "down" (a fan under their parent rather than a row). The variety comes from the tree itself: a node with more children spreads wider, so different shapes give different silhouettes. The same tree should always look the same, so no randomness. (In the end: drawn as the book draws trees, with no crossing edges.)

**Done when:** you can switch between the three views while a reduction plays, and every view keeps branch order readable, chips and badges legible, and trees out of each other's way.
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
- The fade time is still the `LEAVE_MS = 0` experiment; decide here whether it stays (as a setting, perhaps).

- [x] **Settings panel** (⚙): View, Animation speed (both remembered), and a folded Physics section (sliders, Fade removed nodes, Defaults, Copy values). V cycles the views.
- [x] **Tidy and Organic** as target functions (`views.ts`); switching animates, even mid-reduction.
- [x] **Branch order** by angle in Organic; badges and name tags in the free space around each node.
- [x] **Organic has no crossing edges** once the motion settles.
- [x] **Footprints** (boxes with chips and badges) for keeping trees apart and fitting the camera; trees are spread apart for drawing in every view.

**Done when:** ✔ checked in headless Chrome. Both views on several trees (`isLeaf (K △)`, an F-redex with four branches, `S K K (△△)` with D, S and I beside it, the book's booleans fully expanded side by side with the book's figures); switching both ways with 0 siblings out of order at rest; switching while `S K K (△△)` and `not true` play (`not true` still ends as `false`); trees never overlap (on-screen boxes); badges and open-variable tags clear of each other; dragging a branch past its siblings never swaps them; view and speed survive a reload. Organic, counted from the drawn lines: 0 crossing edges after building a 28-node tree by 30 clicks, and at rest after each of 8 steps of `S K K (△△)`, `not true` and `isZero (K² △)`.
**Answers:**
- **Views and physics:** a view only changes the targets and how order is kept. Springs, collision, dragging and drop targets are unchanged.
- **Spiderweb (dropped):** built with rings round the root (anticlockwise from 12 o'clock, the root's links longest), then removed: after a few reduction steps most nodes have just two branches, so it never looked like a web. Lessons kept from it: order by angle must run anticlockwise from "up" (left to right below a node, as in Tidy), or switching from Tidy reverses every row and the order force traps branches on the wrong side.
- **Order by angle is cyclic:** only a sibling *just* behind the one before it (within 90°) counts as swapped, so a branch heading sideways or a branch dragged round isn't "swapped" with all its siblings. After a view change the soft push waits 150 ticks, because a row can really turn round.
- **Organic (changed twice after trying it):** first uneven rows bent into fans; then drawn as in the book (see "What exists now"), its rules read off the book's figures of `and`, `or`, `implies`, `not` and `iff` and checked against them (in `and`, the book's fork turns its leaf about 50° and the big branch about 7°; the balance rule gives 52° and 7.5°). A settling pass (springs + collision) kept nodes apart but not edges, so edges crossed while building trees and during playback. Now each clash is fixed where its two branches part (wider fork, or longer branches), and the physics pulls at full strength so the drawing rests on those crossing-free targets.
- **Badges:** in the widest free angle; the tag takes the half away from the parent link and never covers the badge. Tidy is unchanged.
- **Footprints:** axis-aligned boxes including chips and a 14-unit badge margin; `PUSH_GAP` went from 40 to 16 to keep Tidy's spacing about the same.
- **Overlaps after a switch:** `spreadApart` when drawing (display only).
- **Fade:** a setting, off by default.
- **Follow-ups (after trying it):**
  - [x] Spiderweb removed.
  - [x] Organic: no crossing edges once the motion settles.
  - [x] Carrying a tree onto another (any view): the carried tree no longer pushes the other trees (the target used to slide away, 24 px or more) and is drawn see-through.
  - [x] Organic: looks like the trees in the book (checked side by side with the book's booleans, fully expanded).
  - Still true of Organic: a node with very many branches (say a dozen, built by clicking one node over and over) gets long spokes, because its whole fan is lengthened until its neighbouring subtrees fit.
- **Small fixes after the milestone:** the Add menu's sections are all dropdowns (Basics first) and the whole menu folds away and scrolls; undo/redo are drawn arrows; the Speed slider stays at the right of the playback row; templates used inside a template (`wait`, `query`) label their chips with the real arguments (`d{K △}`, not `d{K y}`); and in Organic, badges of nodes close together no longer overlap (each takes the first clear spot within its node's free space).
- **Known (from before this milestone, unchanged):** while you drag fast in Tidy, the dev order check can report a pair out of order for a frame (the hard rule works on position + velocity before d3's damping). The order is right again on release.

### 13. Guided lessons
A **Lessons** panel (a 📖 button, top right). Each lesson loads its trees, explains in 2–3 plain sentences what to look at, and has **Back / Next**. It doesn't check answers.
- Proposed, from chapter 3: trees and shapes; adding a branch is application; the K rule; the fork rule F; the stem rule S; `I x = x`; `D` and `S K K x = x`. Maybe one on booleans (milestone 11).
- Written last on purpose, so the text describes the finished UI.

**Done when:** someone who has only read chapter 3 can go through the lessons and then follow a reduction on their own (this is also milestone 10's finish line, still to be tried by a person).

### 14. Your own templates
Let people define their own book-style notation, e.g. `pair{x, y} = △ x y`, next to their variables.
- The parser already has templates (`TEMPLATES` in parser.ts: parameters and a body), so this is mostly UI and saving: a way to write the definition, a section in the Add menu, and renaming on load like variables.
- Parameter names are local to the body; the body may use built-ins, your variables and other templates (watch for a template that uses itself).

**Done when:** you can define `pair{x, y} = △ x y`, type `first{pair{K, I}}` and watch it reduce to `K`.

### 15. Touch and small screens
Pan, pinch and drag already work on touch screens; the right-click menu doesn't.
- **Long press** opens the same menu as right-click (Copy, Paste here, Name this…, Expand, Collapse, Remove).
- Check the floating panels, the Add menu and the playback panel on a phone-sized screen.
- Hover-only things (previewing a redex by hovering its letter, tooltips) need a touch alternative or can be skipped.

**Done when:** you can build, name, expand and reduce a tree on a phone without a mouse or keyboard.

### 16. Ship it
Put it online: GitHub Pages, deployed by GitHub Actions.
- **Build under a subfolder:** Pages serves the app at `https://<user>.github.io/tree-calculus-visualizer/`. There's no `vite.config` yet, so the built paths (and `/favicon.svg` in index.html) start at `/` and would break; set `base: './'`. Check the built app with `vite preview` under a subpath, `?t=` links included.
- **Workflow** (`.github/workflows/deploy.yml`):
  - on every push to `main`: install, run the tests, build, deploy
  - pull requests: tests only
  - also run the Python tests (`pytest`, which checks that `tests/cases.json` is up to date), so the two engines can't drift apart
  - add a `test:run` script (`vitest run`; `npm test` is watch mode)
- **One-time repo setting** (done in the browser): Settings → Pages → Source → "GitHub Actions". Pages on a private repo needs a paid plan, so the repo should be public.
- **Polish:**
  - open the ? help once on a first visit (remembered)
  - start from a tree that shows something, e.g. `S K K (△△)`
  - a `<meta name="description">` and Open Graph tags with a still image, so a shared link shows a preview
  - a license (e.g. MIT) if wanted
- **README:** the live link and a short GIF at the top. For example, `S K K V` with Colours on, about 8 seconds and under 3 MB, recorded in headless Chrome and converted with ffmpeg.
- Saved data is fine on `github.io`: browser storage is shared by every project site there, but all our keys start with `tree-calculus-`.

**Done when:** pushing to `main` runs the tests and updates the live site, and the README opens with the GIF and the link.

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
