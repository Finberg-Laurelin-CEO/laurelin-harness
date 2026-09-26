#!/usr/bin/env python3
"""prose-patterns: check a prose file against the learned regex patterns.

Usage:  prose-patterns.py PATTERNS_FILE PROSE_FILE
        prose-patterns.py --check REGEX PROSE_FILE

PATTERNS_FILE holds one rule per line, `<name>: <regex>` (Python re syntax,
case-insensitive); `#` lines and blank lines are ignored. The prose file is
split into sentences and headings the way jev-sweep does it, and every unit is
tested against every pattern. Hits print in jev-sweep's format:

    [<name> 1.00] <sentence>

Exit 0 when there is at least one hit, 1 when there is none, 2 on a bad
pattern (the pattern name and the error go to stderr). With --check, one regex
given on the command line stands in for the patterns file, named `check`.
"""
import re
import sys


def units(text):
    """Sentences and headings of a Markdown text, as (kind, text). Mirrors jev-sweep."""
    out, in_code = [], False
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("```"):
            in_code = not in_code
            continue
        if in_code or not line or line.startswith(("|", "---", "<!--", "![")):
            continue
        if line.startswith("#"):
            out.append(("H", line.lstrip("# ").strip()))
            continue
        line = re.sub(r"^[-*>]\s+|^\d+\.\s+", "", line)
        for s in re.split(r"(?<=[.!?])\s+(?=[A-Z\"'(])", line):
            s = s.strip()
            if len(s) > 3:
                out.append(("S", s))
    return out


def load_patterns(path):
    rules = []
    with open(path, encoding="utf-8") as f:
        for n, raw in enumerate(f, 1):
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            name, sep, regex = line.partition(":")
            name, regex = name.strip(), regex.strip()
            if not sep or not name or not regex:
                sys.stderr.write(f"{path}:{n}: expected `name: regex`\n")
                sys.exit(2)
            rules.append((name, regex))
    return rules


def compile_rules(rules):
    out = []
    for name, regex in rules:
        try:
            out.append((name, re.compile(regex, re.IGNORECASE)))
        except re.error as e:
            sys.stderr.write(f"bad pattern {name}: {e}\n")
            sys.exit(2)
    return out


def main(argv):
    if len(argv) >= 3 and argv[0] == "--check":
        rules, prose = [("check", argv[1])], argv[2]
    elif len(argv) >= 2:
        rules, prose = load_patterns(argv[0]), argv[1]
    else:
        sys.stderr.write(__doc__ or "")
        sys.exit(2)
    compiled = compile_rules(rules)
    with open(prose, encoding="utf-8") as f:
        text = f.read()
    hits = 0
    for kind, t in units(text):
        for name, rx in compiled:
            if rx.search(t):
                hits += 1
                print(f"  [{name} 1.00] {'# ' if kind == 'H' else ''}{t}")
    sys.exit(0 if hits else 1)


if __name__ == "__main__":
    main(sys.argv[1:])
