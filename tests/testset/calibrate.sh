#!/usr/bin/env bash
# Confidence calibration report (PLAN.md Step 6, section 18 group 7). Output only; changes nothing.
#
#   tests/testset/calibrate.sh [extra.jsonl ...]
#
# Reads every result in tests/testset/results/ (each embeds its run's gate log) and every
# decision-log/*.jsonl in the repo, plus any files named on the command line. Groups the rows
# per check (gate logs) and per router question (router logs), and prints for each: how many
# rows, the confidence distribution, and a suggested threshold. The threshold is the cut that
# best separates labeled passes from fails when labels exist; else the 20th percentile.
#
# A label is a field named label, joe_label, correct or outcome with a value of pass, fail,
# correct, wrong, yes, no, true, false or right. A gate's own "result" is not a label: it was
# produced by the threshold this report is meant to set.
set -uo pipefail
ROOT_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_REPO"
python3 - "$ROOT_REPO" "$@" <<'PY'
import glob, json, os, sys

repo = sys.argv[1]
extra = sys.argv[2:]
LABEL_FIELDS = ("label", "joe_label", "correct", "outcome")
POS = {"pass", "correct", "yes", "true", "right"}
NEG = {"fail", "wrong", "no", "false"}


def rows_from(path):
    out = []
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if line.startswith("{"):
                    try:
                        out.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
    except OSError:
        pass
    return out


def key_of(row, source):
    """Per check for gate rows; per question for router rows; a sensible field otherwise."""
    if "check" in row:
        return "gate:" + str(row["check"])
    for k in ("question_id", "question", "kind", "decision", "type"):
        if k in row and isinstance(row[k], str) and len(row[k]) <= 40:
            return f"{source}:{row[k]}"
    return f"{source}:?"


def label_of(row):
    for k in LABEL_FIELDS:
        v = row.get(k)
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            s = v.strip().lower()
            if s in POS:
                return True
            if s in NEG:
                return False
    return None


groups = {}
def add(row, source):
    c = row.get("confidence")
    if not isinstance(c, (int, float)):
        return
    groups.setdefault(key_of(row, source), []).append((float(c), label_of(row)))

results = sorted(glob.glob(os.path.join(repo, "tests", "testset", "results", "*.json")))
for r in results:
    try:
        d = json.load(open(r, encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        continue
    for row in d.get("gate_log", []):
        add(row, "result")
logs = sorted(glob.glob(os.path.join(repo, "decision-log", "*.jsonl"))) + extra
for path in logs:
    name = os.path.splitext(os.path.basename(path))[0]
    for row in rows_from(path):
        add(row, name)

print(f"sources: {len(results)} result file(s), {len(logs)} decision log(s)")
if not groups:
    print("no rows with a confidence found")
    sys.exit(0)


def pct(xs, p):
    xs = sorted(xs)
    if len(xs) == 1:
        return xs[0]
    i = (len(xs) - 1) * p
    lo, hi = int(i), min(int(i) + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (i - lo)


def best_cut(pairs):
    """The threshold with the most labels on the right side; ties go to the higher cut."""
    labeled = [(c, l) for c, l in pairs if l is not None]
    if not any(l for _, l in labeled) or not any(not l for _, l in labeled):
        return None
    cs = sorted({c for c, _ in labeled})
    cands = [0.0] + [(a + b) / 2 for a, b in zip(cs, cs[1:])] + [1.0]
    best, best_acc = None, -1
    for t in cands:
        acc = sum(1 for c, l in labeled if (c >= t) == l)
        if acc >= best_acc:
            best, best_acc = t, acc
    return best, best_acc, len(labeled)


hdr = f"{'decision':<22} {'n':>4} {'min':>5} {'p20':>5} {'p50':>5} {'max':>5} {'labeled':>7} {'threshold':>9}  basis"
print(hdr)
print("-" * len(hdr))
for key in sorted(groups):
    pairs = groups[key]
    cs = [c for c, _ in pairs]
    n_lab = sum(1 for _, l in pairs if l is not None)
    cut = best_cut(pairs)
    if cut:
        t, acc, m = cut
        basis = f"separates {acc}/{m} labeled rows"
    else:
        t = pct(cs, 0.20)
        basis = "20th percentile (no labels of both kinds)"
    print(f"{key:<22} {len(cs):>4} {min(cs):>5.2f} {pct(cs, .2):>5.2f} {pct(cs, .5):>5.2f} {max(cs):>5.2f} {n_lab:>7} {t:>9.2f}  {basis}")
PY
