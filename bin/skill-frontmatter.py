#!/usr/bin/env python3
"""Read or rewrite one field in a SKILL.md frontmatter block.

Usage:
  skill-frontmatter.py get FIELD SKILL.md            print the field's value (block scalars folded to one line)
  skill-frontmatter.py set FIELD VALUE SKILL.md      replace the field's value with a one-line plain scalar

Only the top YAML block between the first two `---` lines is touched. Plain scalars,
quoted scalars and `>` or `|` block scalars are understood; nested maps are left as they are.
No YAML library is needed, so the script runs on a bare python3.
"""
import re
import sys


def split(text):
    """Return (frontmatter_lines, body_text). Body keeps the closing '---' line and after."""
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return None, text
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            return lines[1:i], "\n".join(lines[i:])
    return None, text


def find_field(fm, field):
    """Return (start, end) line indexes of the field inside fm, or None. end is exclusive."""
    start = None
    for i, line in enumerate(fm):
        if re.match(r"^" + re.escape(field) + r":", line):
            start = i
            break
    if start is None:
        return None
    end = start + 1
    while end < len(fm) and (fm[end].startswith(" ") or fm[end].startswith("\t") or fm[end].strip() == ""):
        end += 1
    # Trailing blank lines belong to the next field, not to this one.
    while end > start + 1 and fm[end - 1].strip() == "":
        end -= 1
    return start, end


def value_of(fm, field):
    span = find_field(fm, field)
    if span is None:
        return None
    start, end = span
    head = fm[start][len(field) + 1:].strip()
    if head in (">", "|", ">-", "|-", ">+", "|+"):
        parts = [l.strip() for l in fm[start + 1:end] if l.strip()]
        return " ".join(parts)
    if end > start + 1 and head == "":
        parts = [l.strip() for l in fm[start + 1:end] if l.strip()]
        return " ".join(parts)
    if len(head) >= 2 and head[0] == head[-1] and head[0] in "\"'":
        return head[1:-1]
    return head


def quote(value):
    """Quote for a one-line YAML plain scalar when the text needs it."""
    if re.search(r'[:#"\'\[\]{}|>&*!%@`]|^\s|\s$', value) or value == "":
        return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return value


def main(argv):
    if len(argv) >= 4 and argv[1] == "get":
        field, path = argv[2], argv[3]
        with open(path, encoding="utf-8") as f:
            fm, _ = split(f.read())
        if fm is None:
            sys.exit("no frontmatter in " + path)
        v = value_of(fm, field)
        if v is None:
            sys.exit("no field " + field + " in " + path)
        print(v)
        return
    if len(argv) >= 5 and argv[1] == "set":
        field, value, path = argv[2], argv[3], argv[4]
        with open(path, encoding="utf-8") as f:
            text = f.read()
        fm, body = split(text)
        if fm is None:
            sys.exit("no frontmatter in " + path)
        span = find_field(fm, field)
        new_line = field + ": " + quote(value)
        if span is None:
            fm = fm + [new_line]
        else:
            fm = fm[:span[0]] + [new_line] + fm[span[1]:]
        with open(path, "w", encoding="utf-8") as f:
            f.write("---\n" + "\n".join(fm) + "\n" + body)
        return
    sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv)
