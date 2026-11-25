"""Run with: python3 demo.py"""
from parser import parse, I, K
from reduction_logic import apply_all, normalize, trace, show, step


def section(title):
    print(f"\n=== {title} ===")


section("I applied to a stem: △(△△)(△△) (△△)")
trace(parse(I + "(..)"))

section("K y z picks y: △△△(△△)(△△△)")
trace(parse("...(..)(...)"))

section("K applied via apply_all: K (..) (...)")
trace(apply_all(parse(K), parse("(..)"), parse("(...)")))

section("normalize returns (tree, steps, finished)")
tree, steps, finished = normalize(parse(I + "(" + I + ")"))
print(show(tree), steps, finished)

section("step returns (new_tree, rule, path): where each redex was")
# path = branch indices from the root; [] means the root itself
for s in ["△△(△△)△",            # K redex at the root
          "△(△△△△)",            # K redex inside branch 0
          "△△(△△(△(△△)△△))",    # S redex at branch 1, then branch 1
          ]:
    result = step(parse(s))
    if result is not None:
        new, rule, path = result
        print(f"{s:<20} {rule} at {str(path):<8} -> {show(new)}")

section("Step by step with paths: S K K △△  (S K K is the identity)")
from parser import S
tree = apply_all(parse(S), parse(K), parse(K), parse("△△"))
n = 0
while (result := step(tree)) is not None:
    tree, rule, path = result
    n += 1
    print(f"{n:>3}. {rule} at {str(path):<10} {show(tree)}")

section("Paths in trace: redexes nested inside a finished root")
# The root has < 3 branches, so it can't reduce; the work happens inside.
trace(parse("△△(△(" + I + "(△△)))"))          # I △△ at branch 1, then 0

section("Two redexes side by side: leftmost goes first")
trace(parse("△(" + I + "(△△))(△△(△△)△)"))      # I △△ at [0], K △△ △ at [1]

section("Non-terminating: M M with M = △(△I)I, capped at 6 steps")
m = parse(".(.(" + I + "))(" + I + ")")
trace(apply_all(m, m), max_steps=6)
