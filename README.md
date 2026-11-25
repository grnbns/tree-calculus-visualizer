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

- **Build trees.** Type △ notation in the input box (`.` and `^` work as aliases for `△`), or click nodes to add branches. Use the modes at the top right: **Add** (A), **Remove** (R), **Move** (M).
- **Join trees.** Drag a tree by its root onto a node of another tree; that node is applied to it. In Move mode, drag any node to tear its subtree off.
- **Reduce.** Every redex has an orange border and a K, S or F letter. Click a letter to reduce that redex, or use **▶|** (→) to reduce the next one: its letter sits on a filled orange tag. **Play** (Space) runs to a normal form. **|◀** (←) and the scrubber move back and forth through the reduction like a video.
- **Variables.** K, I, D and S are built in. Right-click a node and choose **Name this…** to save a subtree as your own variable, e.g. `V`, `X2` or `True`. Variables are saved in your browser.
  - A variable shows as a single labelled chip, and typing its name works: `SKV` reads as `S K V`.
  - Right-click a chip to expand it; right-click inside an expanded variable to collapse it again.
  - During a reduction, a chip stays closed while it is only moved or copied. It opens only when a rule needs to look inside it.
- **Copy and paste.** ⌘/Ctrl+C copies the subtree under the pointer as △ text. ⌘/Ctrl+V pastes onto the node under the pointer, or as a new tree on empty canvas. The right-click menu does the same.
- **Undo and redo** (⌘/Ctrl+Z, ⌘/Ctrl+Shift+Z). A whole reduction counts as one action.
- **View.** Drag empty space or scroll to pan. Pinch, or ⌘/Ctrl + scroll, to zoom. **F** fits everything on screen, and **?** shows help.
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
| `engine.ts`, `parser.ts` | Pure reduction engine and △ parser (with names). Trees are immutable nested arrays: `[]` is a leaf. |
| `ids.ts` | Stable node ids, kept beside each tree, so animation can match nodes from one step to the next. |
| `marks.ts`, `vars.ts` | Variables: which subtrees show as chips, and when a step has to open one. Also definitions and browser storage. |
| `edit.ts`, `workspace.ts`, `run.ts` | Pure models: edits, a canvas of several trees with undo snapshots, and a reduction run you can scrub through. |
| `render.ts`, `scene.ts`, `camera.ts` | Tidy layout, the live force simulation and drawing, and pan/zoom. |
| `main.ts` | The UI: panels, menus, keyboard shortcuts and playback. |

Most of the logic is in pure modules with Vitest tests. `scene.ts` reports clicks and drags to `main.ts` and never changes trees itself.

## Python reference

The repository root has the original Python engine (`reduction_logic.py`, `parser.py`). `export_cases.py` writes `tests/cases.json`, and the TypeScript tests check that they reduce every case with the same steps, at the same paths, to the same result. Run the Python tests with `pytest`.

## Status

See [PLAN.md](PLAN.md) for the milestones. Milestones 0–9 are done: engine, drawing, motion, building, reducing, the full-screen canvas, and copy, paste and variables. Next are features to make reductions easier to follow for learners, then a public deploy.
