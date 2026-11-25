# Tree Calculus Visualizer: Plan

A browser app for learning Barry Jay's tree calculus (as in *Reflective Programs in Tree Calculus*, 2021). You build trees, join them, and watch reductions happen. The UI should feel fluid and physical, like Obsidian's graph view: nodes float on springs, new branches sprout with a little motion, and reductions animate instead of redrawing.

This plan is deliberately high-level. Each milestone has a goal, a finish line, and a few questions to work out yourself.

---

## Where things stand (Nov 2026)

`reduction_logic.py` is done and correct. It was checked against:

- the book's equations `I x = x`, `K x y = x`, `D x y z = y z (x z)`, and `S x y z = x z (y z)` using S from eq. (3.1);
- an independent evaluator (innermost-first) on thousands of random trees.

Out of 14,988 checks there were 0 mismatches. Cases that never finish were skipped.

Things to know before building on it:

- **Recursion depth.** `show`, `is_value` and `step` hit Python's recursion limit at depth ~1000, e.g. a chain of 3000 stems. That's fine for learning, but keep it in mind; the JavaScript version will have a similar limit.
- **`step` only reports *which* rule fired, not *where*.** The visualizer needs the location of the redex (a path: the list of branch indices from the root) to highlight and animate it.
- **Rule set.** These are the book's rules. treecalcul.us uses a different variant (stem: `xz(yz)`, and a fork rule that looks at the shape of z), so its examples won't work here.
- `__pycache__/` should go in a `.gitignore`.

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

### 0. Tidy up the Python reference
- Add `.gitignore` and a few `pytest` tests (I, K, D, S from the book).
- Make `step` also return the **path** to the redex it reduced.
- Write a small script that exports test cases to `tests/cases.json`: input tree, expected normal form, and the list of (rule, path) steps.

**Done when:** `pytest` passes and `cases.json` exists.
**Think about:** what's the simplest JSON form for a tree? (Your lists already are JSON.)

### 1. Scaffold the web app
- Create the Vite + TypeScript project in a `web/` folder (keeps the Python separate).
- Add Vitest.

**Done when:** `npm run dev` shows a blank page and `npm test` runs.

### 2. Port the engine to TypeScript
- Same functions as `reduction_logic.py`: apply, show, isValue, the three rules, step (returning the path), normalize.
- Also port `parser.py`, since typing trees is a feature now.
- Run every case from `cases.json`.

**Done when:** all shared cases pass in Vitest, with the same steps in the same order as Python.
**Think about:** keep trees immutable (never modify an array after creating it). It makes undo/redo and animation much easier.

### 3. Draw a tree, no motion yet
- Use `d3-hierarchy` to compute x/y for every node and draw circles and lines in SVG.
- Branch order must be visible: first branch on the left.
- Show the △-notation text under the drawing.

**Done when:** typing `△(△△)(△△△)` (D) shows the same shape as Figure 3.3 in the book.
**Think about:** in the book, a node with 3+ branches *is* the computation, so how will you make those nodes stand out?

### 4. Make it fluid
- Switch to a `d3-force` simulation: links as springs, nodes repel, a collision force so nodes don't overlap.
- **Keep the tree readable:** add forces that pull each node toward its tidy-layout position from milestone 3 (`forceX`/`forceY` with a per-node target). Depth sets the height, sibling order sets left to right. The physics gives the bob; the targets keep the shape.
- Drag nodes around; they spring back when released.

**Done when:** the tree floats gently, can be dragged, and branches never swap sides.
**Think about:** how strong should the pull to the target be compared to the springs? Expose a slider while tuning.

### 5. Stable node identity (the key to smooth motion)
For anything to *move* rather than *redraw*, each node needs an id that survives from one tree to the next, so d3 knows "this circle moved there".
- Give every node an id when it's created.
- When a rule fires, decide where each node in the result came from:
  - **K** `△△yz = y`: y's nodes keep their ids; z and the leaf vanish (fade/shrink out).
  - **S** `△(△x)yz = yz(xz)`: z appears **twice**. One copy can keep z's ids; the other copy needs new ids. Let it sprout from where z was.
  - **F** `△(△wx)yz = zwx`: w, x and z keep their ids and move to their new places; y vanishes.
- Nodes that are new start at their "origin" position; nodes that vanish animate out.

**Done when:** stepping through `I x` shows x visibly travelling, not the screen redrawing.
**Think about:** whether ids live inside the tree data or in a separate structure alongside it. Both work; one keeps the engine pure.

### 6. Build and join trees
- **Click a node → add a leaf branch.** Note this means applying that subtree to `△`, so it can create a redex. That's a feature, and worth explaining to learners.
- Remove a branch (and its subtree).
- Type a tree in △ notation, with `.` and `^` accepted as aliases (and named trees K, I, D, S).
- **Workspace with several trees.** Drag one tree onto a node of another to attach it as a new branch, i.e. apply. That's the "join".

**Done when:** you can build `I` by clicking, build `x` separately, drop `x` onto `I`, and see a redex appear.

### 7. Step through reductions
- Highlight every redex; show which rule would fire at each.
- Controls: **Step**, **Back**, **Play** (with speed), **Reset**, and a step limit for trees that never finish.
- Default order: leftmost-outermost (what your `step` does). Clicking a highlighted redex reduces *that* one instead.
- A history of steps you can click through.

**Done when:** you can play `S K K x` to `x` and scrub back and forth smoothly.

### 8. Make it clear for learners
- **Rule card:** when a step happens, show the rule as an equation with w, x, y, z in colours, and colour the same parts in the tree, before and after.
- Label nodes by shape: leaf, stem, fork, computation.
- Recognise named trees (K, I, D, S, true/false) and optionally show them collapsed as a labelled chip.
- A few guided examples straight from chapter 3.

**Done when:** someone who has only read chapter 3 can follow a reduction without you explaining it.

### 9. Ship it
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
