"""Export reference test cases to tests/cases.json.

The Python engine is the trusted reference. This file records, for a set of
input trees, every step it takes (rule, path, tree after) and the final
result. The TypeScript port must reproduce these exactly.

Run with:  python export_cases.py
"""
import json
import os
import random

from parser import parse, K, I, D, S
from reduction_logic import apply, apply_all, show, step

OUT_PATH = os.path.join(os.path.dirname(__file__), "tests", "cases.json")
MAX_STEPS = 200
SEED = 0
N_RANDOM = 50


def run(tree, max_steps=MAX_STEPS):
    """Like normalize, but record every step instead of throwing it away."""
    steps = []
    while True:
        result = step(tree)
        if result is None:
            return steps, tree, True
        if len(steps) >= max_steps:
            return steps, tree, False
        tree, rule, path = result
        steps.append({"rule": rule, "path": path, "tree": tree})


def make_case(name, tree, max_steps=MAX_STEPS):
    steps, result, finished = run(tree, max_steps)
    return {
        "name": name,
        "input_text": show(tree),
        "input": tree,
        "steps": steps,
        "result": result,
        "result_text": show(result),
        "finished": finished,
    }


def random_tree(rng, depth):
    """A random tree. Unlike the test helper, nodes may have 3 branches,
    so the inputs contain redexes in random places."""
    if depth == 0 or rng.random() < 0.3:
        return []
    return [random_tree(rng, depth - 1) for _ in range(rng.randint(1, 3))]


def build_cases():
    k, i, d, s = parse(K), parse(I), parse(D), parse(S)
    a, b, c = parse("△△"), parse("△△△"), parse("△(△△)")
    m = parse("△(△(" + I + "))(" + I + ")")

    named = [
        # values: nothing to do
        ("leaf", parse("△")),
        ("stem", parse("△△")),
        ("fork", parse("△△△")),
        # one rule each
        ("K rule", parse("△△(△△)△")),
        ("S rule", parse("△(△△)(△△)(△△△)")),
        ("F rule", parse("△(△△△)(△△)(△△)")),
        ("extra branch after K", parse("△△(△△)△(△△△)")),
        # book equations
        ("I x", apply(i, a)),
        ("I I", apply(i, i)),
        ("K x y", apply_all(k, a, b)),
        ("D x y z", apply_all(d, a, b, c)),
        ("S x y z", apply_all(s, a, b, c)),
        ("S K K x", apply_all(s, k, k, a)),
        # non-root paths
        ("nested redex", parse("△△(△(" + I + "(△△)))")),
        ("two redexes, leftmost first", parse("△(" + I + "(△△))(△△(△△)△)")),
        ("first branch is a redex", [apply(i, a), b, c]),
    ]
    cases = [make_case(name, tree) for name, tree in named]
    cases.append(make_case("M M never finishes", apply(m, m), max_steps=20))

    rng = random.Random(SEED)
    for n in range(N_RANDOM):
        cases.append(make_case(f"random {n}", random_tree(rng, 4)))
    return cases


def main():
    cases = build_cases()
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(cases, f, ensure_ascii=False, indent=1)
        f.write("\n")
    finished = sum(c["finished"] for c in cases)
    print(f"wrote {len(cases)} cases to {OUT_PATH} "
          f"({finished} finished, {len(cases) - finished} hit the step limit)")


if __name__ == "__main__":
    main()
