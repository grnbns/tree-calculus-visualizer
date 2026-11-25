"""Run with: python3 demo.py"""
from parser import parse, I, K
from reduction_logic import apply_all, normalize, trace, show


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

section("Non-terminating: M M with M = △(△I)I, capped at 6 steps")
m = parse(".(.(" + I + "))(" + I + ")")
trace(apply_all(m, m), max_steps=6)
