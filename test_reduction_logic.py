import io
import unittest
from contextlib import redirect_stdout

import random

from parser import parse, K, I, D, S
from reduction_logic import (
    apply, apply_all, show, is_value, K_rule, S_rule, F_rule,
    reduce_root, step, normalize, trace,
)

LEAF = []
STEM = [[]]          # .(.)  i.e. ..
FORK = [[], []]      # ...


class TestApply(unittest.TestCase):
    def test_apply_adds_last_branch(self):
        self.assertEqual(apply([], []), [[]])
        self.assertEqual(apply([[]], [[]]), [[], [[]]])

    def test_apply_does_not_mutate(self):
        f = [[]]
        g = apply(f, [])
        self.assertEqual(f, [[]])
        self.assertIsNot(f, g)

    def test_apply_all_left_to_right(self):
        self.assertEqual(apply_all([], [[]], []), [[[]], []])

    def test_apply_all_no_args(self):
        self.assertEqual(apply_all([[]]), [[]])


class TestShow(unittest.TestCase):
    def test_leaf_stem_fork(self):
        self.assertEqual(show(LEAF), "△")
        self.assertEqual(show(STEM), "△△")
        self.assertEqual(show(FORK), "△△△")

    def test_nested_gets_parentheses(self):
        self.assertEqual(show([[[]], [[]]]), "△(△△)(△△)")
        self.assertEqual(show([[[]]]), "△(△△)")

    def test_round_trip_with_parser(self):
        for s in ["△", "△△", "△(△△)(△△)", "△(△△)(△△△)", "△△△(△△)△"]:
            self.assertEqual(show(parse(s)), s)


class TestParserAliases(unittest.TestCase):
    def test_all_leaf_symbols_equivalent(self):
        expected = parse("△(△△)(△△)")
        self.assertEqual(parse(".(..)(..)"), expected)
        self.assertEqual(parse("^(^^)(^^)"), expected)
        self.assertEqual(parse(I), expected)

    def test_mixed_symbols_and_spaces(self):
        self.assertEqual(parse("△ . ^"), [[], []])


class TestIsValue(unittest.TestCase):
    def test_values(self):
        self.assertTrue(is_value(LEAF))
        self.assertTrue(is_value(STEM))
        self.assertTrue(is_value(FORK))
        self.assertTrue(is_value(parse(I)))

    def test_redex_at_root(self):
        self.assertFalse(is_value([[], [], []]))

    def test_redex_nested(self):
        self.assertFalse(is_value([[[], [], []]]))


class TestRules(unittest.TestCase):
    def test_k(self):
        y, z = [[]], [[], []]
        self.assertEqual(K_rule([[], y, z]), y)

    def test_k_extra_branches(self):
        a = [[]]
        self.assertEqual(K_rule([[], [], [[]], a]), [a])

    def test_s(self):
        # .(.x) y z = y z (x z)
        x, y, z = [], [[]], [[], []]
        expected = apply(apply(y, z), apply(x, z))
        self.assertEqual(S_rule([[x], y, z]), expected)

    def test_s_extra_branches(self):
        x, y, z, a = [], [[]], [], [[]]
        expected = apply(apply(apply(y, z), apply(x, z)), a)
        self.assertEqual(S_rule([[x], y, z, a]), expected)

    def test_f(self):
        # .(.w x) y z = z w x
        w, x, y, z = [], [[]], [[], []], []
        self.assertEqual(F_rule([[w, x], y, z]), apply_all(z, w, x))

    def test_f_extra_branches(self):
        w, x, y, z, a = [], [[]], [], [], [[]]
        self.assertEqual(F_rule([[w, x], y, z, a]), apply_all(z, w, x, a))

    def test_rules_do_not_mutate_input(self):
        redex = [[[]], [[]], []]
        copy = [[[]], [[]], []]
        S_rule(redex)
        self.assertEqual(redex, copy)


class TestReduceRoot(unittest.TestCase):
    def test_too_few_branches(self):
        for t in (LEAF, STEM, FORK):
            self.assertIsNone(reduce_root(t))

    def test_dispatch(self):
        self.assertEqual(reduce_root([[], [[]], []])[1], "K")
        self.assertEqual(reduce_root([[[]], [], []])[1], "S")
        self.assertEqual(reduce_root([[[], []], [], []])[1], "F")

    def test_result_values(self):
        self.assertEqual(reduce_root([[], [[]], []])[0], [[]])

    def test_first_branch_is_redex(self):
        self.assertIsNone(reduce_root([[[], [], []], [], []]))


class TestStep(unittest.TestCase):
    def test_normal_form_returns_none(self):
        self.assertIsNone(step(LEAF))
        self.assertIsNone(step(parse(I)))

    def test_root_step(self):
        self.assertEqual(step([[], [[]], []]), ([[]], "K"))

    def test_step_inside_branch(self):
        # stem whose child is a K redex
        self.assertEqual(step([[[], [], []]]), ([[]], "K"))

    def test_leftmost_first(self):
        k_redex = [[], [[]], []]       # -> [[]]
        s_redex = [[[]], [], []]       # S redex
        new, rule = step([k_redex, s_redex])
        self.assertEqual(rule, "K")
        self.assertEqual(new, [[[]], s_redex])

    def test_first_branch_redex_reduced_before_root(self):
        inner = [[], [[]], []]         # K redex -> [[]]
        new, rule = step([inner, [], []])
        self.assertEqual(rule, "K")
        self.assertEqual(new, [[[]], [], []])

    def test_does_not_mutate_input(self):
        t = [[[], [], []]]
        step(t)
        self.assertEqual(t, [[[], [], []]])


class TestNormalize(unittest.TestCase):
    def test_already_normal(self):
        self.assertEqual(normalize(parse(I)), (parse(I), 0, True))

    def test_k(self):
        tree, steps, done = normalize(parse("...(..)(.)"))
        self.assertEqual((tree, steps, done), ([[]], 1, True))

    def test_identity(self):
        for arg in ["(.)", "(..)", "(.(..)(...))"]:
            tree, steps, done = normalize(parse(I + arg))
            self.assertTrue(done)
            self.assertEqual(tree, parse(arg))
            self.assertEqual(steps, 2)   # S then K

    def test_result_is_value(self):
        tree, _, done = normalize(parse(I + "(" + I + ")"))
        self.assertTrue(done)
        self.assertTrue(is_value(tree))

    def test_step_limit(self):
        tree, steps, done = normalize(parse(I + "(.)"), max_steps=1)
        self.assertEqual(steps, 1)
        self.assertFalse(done)

    def test_zero_steps_allowed(self):
        _, steps, done = normalize(parse(I + "(.)"), max_steps=0)
        self.assertEqual(steps, 0)
        self.assertFalse(done)

    def test_exact_limit_still_finishes(self):
        _, steps, done = normalize(parse(I + "(.)"), max_steps=2)
        self.assertEqual((steps, done), (2, True))

    def test_non_terminating(self):
        # M = .(.I)I ;  M M reduces forever
        m = parse(".(." + "(" + I + "))(" + I + ")")
        _, steps, done = normalize(apply(m, m), max_steps=50)
        self.assertFalse(done)
        self.assertEqual(steps, 50)


class TestTrace(unittest.TestCase):
    def run_trace(self, tree, **kw):
        buf = io.StringIO()
        with redirect_stdout(buf):
            result = trace(tree, **kw)
        return result, buf.getvalue()

    def test_matches_normalize(self):
        t = parse(I + "(..)")
        result, _ = self.run_trace(t)
        self.assertEqual(result, normalize(t))

    def test_prints_each_step(self):
        _, out = self.run_trace(parse(I + "(..)"))
        self.assertIn("S", out)
        self.assertIn("K", out)
        self.assertIn(show(parse("△△")), out)

    def test_normal_form_prints_something_or_nothing_but_returns(self):
        result, _ = self.run_trace(LEAF)
        self.assertEqual(result, (LEAF, 0, True))

    def test_step_limit(self):
        result, _ = self.run_trace(parse(I + "(.)"), max_steps=1)
        self.assertEqual(result[1:], (1, False))


# --- The book's equations, checked on concrete example trees ---------------

def random_tree(rng, depth):
    """A random binary tree (a value) of at most `depth` levels."""
    if depth == 0 or rng.random() < 0.3:
        return []
    return [random_tree(rng, depth - 1) for _ in range(rng.randint(1, 2))]


HAND_PICKED = [parse(s) for s in [
    "△", "△△", "△△△", "△(△△)", "△△(△△)", K, I, D, "△(△△△)(△△)",
]]


def example_trees(n_random=60, seed=0):
    rng = random.Random(seed)
    return HAND_PICKED + [random_tree(rng, 4) for _ in range(n_random)]


class TestBookEquations(unittest.TestCase):
    """Both sides of each equation must reduce to the same normal form.
    Pairs where either side doesn't finish within the step limit are skipped."""

    MAX_STEPS = 2000

    def assert_equation(self, lhs, rhs, n_vars, n_random=60):
        trees = example_trees(n_random)
        rng = random.Random(1)
        checked = 0
        for _ in range(len(trees) * 2):
            args = [rng.choice(trees) for _ in range(n_vars)]
            l, _, done_l = normalize(lhs(*args), self.MAX_STEPS)
            r, _, done_r = normalize(rhs(*args), self.MAX_STEPS)
            if not (done_l and done_r):
                continue
            checked += 1
            self.assertEqual(l, r, "failed for " + ", ".join(show(a) for a in args))
        self.assertGreater(checked, 0)

    def test_I_x_eq_x(self):
        self.assert_equation(lambda x: apply(parse(I), x),
                             lambda x: x, 1)

    def test_K_x_y_eq_x(self):
        self.assert_equation(lambda x, y: apply_all(parse(K), x, y),
                             lambda x, y: x, 2)

    def test_D_x_y_z_eq_y_z_xz(self):
        self.assert_equation(lambda x, y, z: apply_all(parse(D), x, y, z),
                             lambda x, y, z: apply_all(y, z, apply(x, z)), 3)

    def test_S_x_y_z_eq_x_z_yz(self):
        self.assert_equation(lambda x, y, z: apply_all(parse(S), x, y, z),
                             lambda x, y, z: apply_all(x, z, apply(y, z)), 3)

    def test_S_K_K_is_identity(self):
        skk = apply_all(parse(S), parse(K), parse(K))
        self.assert_equation(lambda x: apply(skk, x), lambda x: x, 1)


if __name__ == "__main__":
    unittest.main()
