LEAF = "△"          # canonical leaf symbol; "." and "^" are accepted as aliases
ALIASES = (".", "^")

K = "△△"
I = "△(△△)(△△)"
D = "△(△△)(△△△)"

def apply(f, x):
    return f + [x]      # a NEW list, so copies never share state

def parse_atom(s, i):
    """Read ONE argument starting at s[i]: a '△' or a '( ... )' group.
    Return (tree, index just after it)."""
    if i >= len(s):
        raise ValueError("unexpected end of input")
    if s[i] == LEAF:
        return [], i + 1
    if s[i] == "(":
        inner, i = parse_seq(s, i + 1)
        if i >= len(s) or s[i] != ")":
            raise ValueError(f"missing ')' at {i}")
        return inner, i + 1          # step past the ')'
    raise ValueError(f"unexpected {s[i]!r} at {i}")

def parse_seq(s, i):
    """Read a head and all its arguments, stopping at ')' or the end."""
    tree, i = parse_atom(s, i)
    while i < len(s) and s[i] != ")":
        arg, i = parse_atom(s, i)
        tree = apply(tree, arg)
    return tree, i

def parse(s):
    s = s.replace(" ", "")
    for alias in ALIASES:
        s = s.replace(alias, LEAF)
    tree, i = parse_seq(s, 0)
    if i != len(s):
        raise ValueError(f"unexpected {s[i]!r} at {i}")
    return tree