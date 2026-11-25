# Tree calculus reduction rules (Jay, Reflective Programs in Tree Calculus, ch. 3).
#
# A tree is a list of its branches:
#   leaf  []        stem  [x]        fork  [w, x]
#   3 or more branches = a computation that needs reducing.
#
# Rules, chosen by the shape of the first branch:
#   K:  △△yz      = y
#   S:  △(△x)yz   = yz(xz)
#   F:  △(△wx)yz  = zwx


LEAF = '△'


def apply(function, argument):
    """Return a NEW tree: `function` with `argument` attached as its last branch.
    Never modify `function` in place (the S rule copies z into two places)."""
    return function + [argument]


def apply_all(function, *arguments):
    """Apply `function` to each argument in turn, left to right:
    apply_all(f, a, b) means (f a) b."""
    running = function
    for arg in arguments:
        running = apply(running, arg) 
    return running


def show(tree):
    """Return the string for `tree` using △ for each node, e.g. [[[]], [[]]] -> '△(△△)(△△)'.
    A branch that has branches of its own is wrapped in parentheses."""
    result = LEAF
    for child in tree:
        if child == []:
            result += show(child)
        else:
            result += '(' + show(child) + ')'
    return result


def is_value(tree):
    """True if `tree` is a binary tree: no node anywhere has 3 or more branches."""
    return len(tree) < 3 and all(is_value(child) for child in tree)


def K_rule(redex):
    """`redex` has 3+ branches and its first branch is a leaf: △△yz = y.
    Return the result, with any branches after z applied to it unchanged."""
    y, z, rest = redex[1], redex[2], redex[3:]
    return apply_all(y, *rest)


def S_rule(redex):
    """`redex` has 3+ branches and its first branch is a stem △x: △(△x)yz = yz(xz).
    Return the result, with any branches after z applied to it unchanged."""
    x, y, z, rest = redex[0][0], redex[1], redex[2], redex[3:]
    result = apply(apply(y,z), apply(x,z))
    return apply_all(result, *rest)


def F_rule(redex):
    """`redex` has 3+ branches and its first branch is a fork △wx: △(△wx)yz = zwx.
    Return the result, with any branches after z applied to it unchanged."""
    w, x, z, rest = redex[0][0], redex[0][1], redex[2], redex[3:]
    return apply_all(z, w, x, *rest)


def reduce_root(tree):
    """If a rule applies at the root of `tree`, return (result, rule_name),
    where rule_name is 'K', 'S' or 'F'. Otherwise return None.
    No rule applies at the root if it has fewer than 3 branches,
    or if its first branch itself has 3+ branches (reduce inside it first)."""
    if len(tree) < 3:
        return None
    first = tree[0]
    if len(first) == 0:
        return K_rule(tree), 'K'
    if len(first) == 1:
        return S_rule(tree), 'S'
    if len(first) == 2:
        return F_rule(tree), 'F'
    return None


def step(tree):
    """Do one reduction step anywhere in `tree`: try the root first, then each
    branch from left to right (leftmost-outermost order).
    Return (new_tree, rule_name, path), or None if no rule applies anywhere."""
    at_root = reduce_root(tree)
    if at_root is not None:
        new_tree, rule = at_root
        return new_tree, rule, []
    for i, child in enumerate(tree):
        inner = step(child)
        if inner is not None:
            new_child, rule, path = inner
            return tree[:i] + [new_child] + tree[i + 1:], rule, [i] + path
    return None


def normalize(tree, max_steps=1000):
    """Call `step` repeatedly until no rule applies or `max_steps` is reached.
    Return (final_tree, steps_taken, finished), where `finished` is False
    if it gave up at the step limit."""
    steps = 0
    while True:
        result = step(tree)
        if result is None:
            return tree, steps, True
        if steps >= max_steps:
            return tree, steps, False
        tree, _, _ = result
        steps += 1


def trace(tree, max_steps=1000):
    """Like `normalize`, but print each step: the rule used, the path to the
    redex it reduced, and the tree after it."""
    print(f"start: {show(tree)}")
    steps = 0
    while True:
        result = step(tree)
        if result is None:
            print(f"done after {steps} steps")
            return tree, steps, True
        if steps >= max_steps:
            print(f"gave up after {steps} steps")
            return tree, steps, False
        tree, rule, path = result
        steps += 1
        print(f"{steps:>4}. {rule} at {str(path):<8} {show(tree)}")
