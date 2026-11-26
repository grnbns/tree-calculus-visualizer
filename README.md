# Tree Calculus Visualizer

A browser app for learning Barry Jay's **tree calculus**, following the rules in *Reflective Programs in Tree Calculus* (2021). You build trees in △ notation, join them together, and watch them reduce step by step. Nodes float on springs, so a subtree visibly travels to its new place when a rule fires instead of the picture being redrawn.

## The rules

A tree is a leaf `△` with any number of branches. A node with three or more branches is a computation, and the shape of its first branch picks the rule:

| Rule | Before | After |
|---|---|---|
| K | `△△yz` | `y` |
| S | `△(△x)yz` | `yz(xz)` |
| F | `△(△wx)yz` | `zwx` |

These are the book's rules. treecalcul.us uses a different variant, so its examples won't reduce the same way here.

## What you can do

- **Build trees.** Type △ notation in the input box (`.` and `^` work as aliases for `△`), or click nodes to add branches. Use the modes at the top right: **Add** (A), **Remove** (R), **Move** (M). In Add mode, clicking empty canvas starts a new tree. The **Add** menu (top left) has △, K, I, D, S and `selfApply`, plus foldable sections: **Booleans**, **Numbers**, **Queries**, **Templates**, **Examples** and **Yours**. Click a button to add a new tree, or drag it onto a node to attach it.
- **Join trees.** Drag a tree by its root onto a node of another tree; that node is applied to it. In Move mode, drag any node to tear its subtree off.
- **Reduce.** Every redex has an orange border and a K, S or F letter. Click a letter to reduce that redex, or use **▶|** (→) to reduce the next one: its letter sits on a filled orange tag. **Play** (Space) runs to a normal form. **|◀** (←) and the scrubber move back and forth through the reduction like a video, and the line above the buttons says which step you're on.
- **See each rule.** The card above the playback buttons shows the rule being used, e.g. `△(△x)yz → yz(xz)`, and what x, y and z are in your tree. The left side of the equation is lit before the rule fires and the right side after.
  - With **Colours** on, the parts are coloured in the tree as well: w teal, x blue, y green, z pink. Hover a letter to preview that redex.
  - **▶|** then goes in two halves. The first click applies the rule while the colours stay on the parts as they move; the second moves the colours on to the next step.
  - Once you start stepping, any variable that hides a coloured part opens just enough to show it.
- **Trees from the book.** These are built in, under the book's names:
  - the booleans from §3.5: `true` (= K), `false` (= K I), `and`, `or`, `implies`, `not`, `iff`
  - the numbers from §3.7: `zero`, `succ`, `isZero`, `pred`, and any number written as digits (`3` is K³ △)
  - the queries from §3.8: `isLeaf`, `isStem`, `isFork`
  - `selfApply` from §4.3

  When a reduction ends in exactly `true`, `false` or a number, the result shows as that chip: `not true` ends as `false`, `pred 3` as `2`.
- **The book's notation.** You can type the book's templates directly: `d{x}`, `first{p}`, `second{p}`, `query{a, b, c}`, `wait{x, y}` and `swap{f}`, with trees as the arguments (e.g. `d{K}`). They become the tree right away. Powers like `K**4 I` mean K(K(K(K I))) and are shown as `K⁴ I`.
- **Variables.** Your own variables work like the built-in ones. Right-click a node and choose **Name this…** to save a subtree as your own variable, e.g. `V`, `x2` or `isEven`. Variables are saved in your browser.
  - A variable shows as a single labelled chip, and typing its name works. A name is a letter followed by letters or digits, and names need spaces between them: `S K V`.
  - Right-click a chip to expand it, or use **Expand all** / **Collapse all** on a whole subtree. An open variable shows its name in a small hollow tag; click the tag to collapse it.
  - The **Var** button names the selected tree.
  - During a reduction, a chip stays closed while it is only moved or copied. It opens only when a rule needs to look inside it.
  - If a reduction ends in exactly one of your variables, the result folds back into its chip. Play on a tree that's already a value shows what it is: `succ 0` becomes `1`.
- **Copy and paste.** ⌘/Ctrl+C copies the subtree under the pointer as △ text. ⌘/Ctrl+V pastes onto the node under the pointer, or as a new tree on empty canvas. The right-click menu does the same.
- **Undo and redo** (⌘/Ctrl+Z, ⌘/Ctrl+Shift+Z). A whole reduction counts as one action.
- **Moving around.** Drag empty space or scroll to pan. Pinch, or ⌘/Ctrl + scroll, to zoom. **F** fits everything on screen, and **?** shows help.
- **Settings (⚙, bottom right).** Choose how trees are drawn (**V** switches between the two views):
  - **Tidy:** every level on its own row, with branches straight down.
  - **Organic:** drawn the way the book draws trees. Every edge is the same length and a stem carries straight on. A fork's branches are balanced by weight, so a leaf beside a big subtree swings out to the side. Edges never cross once the motion settles.

  Switching views animates, even during a reduction. **Animation speed** makes the motion slower or faster. Both are remembered. The **Physics** section holds the tuning sliders.
- **Link to a tree.** `?t=<tree>` in the URL sets the starting tree, e.g. `?t=S K K △`.

## Running it

You need Node.js. From the `web/` folder:

```sh
npm install
npm run dev      # start the app at the address Vite prints
npm test         # run the tests (Vitest)
npm run build    # type-check and build into web/dist
```

## How it's built

The app is TypeScript with Vite, d3-force for the physics and d3-hierarchy for the tidy layout targets, drawn in SVG. It doesn't use a UI framework. The code is in `web/src/`:

| File | What it does |
|---|---|
| `engine.ts`, `parser.ts` | Pure reduction engine and △ parser (with names, numbers, powers and the book's templates). Trees are immutable nested arrays: `[]` is a leaf. |
| `ids.ts` | Stable node ids, kept beside each tree, so animation can match nodes from one step to the next. |
| `marks.ts`, `vars.ts` | Variables: which subtrees show as chips, and when a step has to open one. Also definitions and browser storage. |
| `parts.ts` | Which nodes are w, x, y and z in a rule, before and after it fires (for the colours). |
| `edit.ts`, `workspace.ts`, `run.ts` | Pure models: edits, a canvas of several trees with undo snapshots, and a reduction run you can scrub through. |
| `render.ts`, `views.ts` | The layouts: Tidy, and Organic (the book's way of drawing trees, without crossing edges). |
| `scene.ts`, `camera.ts` | The live force simulation and drawing, and pan/zoom. |
| `main.ts` | The UI: panels, menus, keyboard shortcuts and playback. |

Most of the logic is in pure modules with Vitest tests. `scene.ts` reports clicks and drags to `main.ts` and never changes trees itself.

## Python reference

The repository root has the original Python engine (`reduction_logic.py`, `parser.py`). `export_cases.py` writes `tests/cases.json`, and the TypeScript tests check that they reduce every case with the same steps, at the same paths, to the same result. Run the Python tests with `pytest`.

## Status

See [PLAN.md](PLAN.md) for the milestones. Milestones 0–12 are done: engine, drawing, motion, building, reducing, the full-screen canvas, copy, paste and variables, the rule card and colours for learners, the book's trees and notation, and Settings with a choice of view. Next are guided lessons, defining your own templates, and touch support. A public deploy comes last.
