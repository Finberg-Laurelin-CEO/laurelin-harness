#!/usr/bin/env python3
"""triage.py ROOT: rank the firms in an investors root by who needs attention this week.

Code reads each firm's _index.md frontmatter (status, updated, status_note, tier) and the first
"next touch" or "next step" line, and computes days since the last update. Jev answers two
questions per firm in batched requests (the jev-triage pattern): how much attention the record
needs this week, and whose move it is. Code ranks by the attention score, then by staleness,
and prints a table for Joe. Nothing is written and nothing is sent. Without TYPESAFE_API_KEY
the table is sorted by staleness alone and says that Jev was skipped.

Environment: TYPESAFE_API_KEY (or the key file), LAURELIN_JEV_THRESHOLD (default 0.6),
LAURELIN_TRIAGE_STALE_DAYS (default 30).
"""
import datetime, json, os, re, subprocess, sys

DATE = re.compile(r'\b(20\d\d-\d\d-\d\d)\b')
NEXT = re.compile(r'next (touch|step|action|move)', re.I)
NOT_FIRM = re.compile(r'not a firm|source-list|category-index|source container', re.I)
WAITING = ('waiting-on-them', 'waiting-on-us', 'approval-needed', 'diligence', 'researching')
ATTENTION = [
    "Nothing is due. The other side holds the next move and the last update is recent, or research "
    "is complete and no outreach is authorized, or the lane is closed.",
    "Something is due this week: a reply to answer, a promised follow-up, or a message with no answer "
    "for more than two weeks that needs one check.",
    "Overdue or blocked on Joe: an approval that waits, a reply left unanswered for weeks, or a note "
    "that asks for reconciliation or a decision.",
]
OWNER = {
    'joe': 'Joe must decide, approve, reply or reconcile before anything else can happen.',
    'agent': 'The agent can do the next step alone: research, a draft for approval, a validator run.',
    'them': 'The other side holds the next move and nothing is overdue.',
    'nobody': 'The lane is closed, done, or research-only with no outreach authorized.',
}


def frontmatter(path):
    fm, body = {}, []
    try:
        lines = open(path, encoding='utf-8', errors='replace').read().split('\n')
    except OSError:
        return fm, body
    if lines and lines[0].strip() == '---':
        i = 1
        while i < len(lines) and lines[i].strip() != '---':
            m = re.match(r'^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$', lines[i])
            if m:
                fm[m.group(1)] = m.group(2).strip().strip('"')
            i += 1
        body = lines[i + 1:]
    else:
        body = lines
    return fm, body


def records(root):
    today = datetime.date.today()
    out = []
    for name in sorted(os.listdir(root)):
        folder = os.path.join(root, name)
        idx = next((os.path.join(folder, n) for n in ('_index.md', 'Index.md')
                    if os.path.isfile(os.path.join(folder, n))), None)
        if not idx or name.startswith(('.', '_')):
            continue
        fm, body = frontmatter(idx)
        if NOT_FIRM.search(fm.get('status', '')) or NOT_FIRM.search(fm.get('tags', '')):
            continue
        m = DATE.search(fm.get('updated', '') or fm.get('created', ''))
        days = (today - datetime.date.fromisoformat(m.group(1))).days if m else None
        nxt = next((l.strip('-* ').strip() for l in body if NEXT.search(l)), '')
        out.append({'firm': name, 'status': fm.get('status', ''), 'status_note': fm.get('status_note', ''),
                    'tier': fm.get('tier', ''), 'days': days, 'next': nxt[:200]})
    return out


def have_key():
    if os.environ.get('TYPESAFE_API_KEY'):
        return True
    p = os.path.expanduser('~/.config/agent-keys/env')
    try:
        return any(l.startswith(('TYPESAFE_API_KEY=', 'export TYPESAFE_API_KEY=')) for l in open(p))
    except OSError:
        return False


def ask_jev(recs):
    """One request per 40 firms. Each firm's record goes into its own questions' instructions."""
    answers = {}
    for start in range(0, len(recs), 40):
        batch = recs[start:start + 40]
        questions = {}
        for i, r in enumerate(batch):
            rec = {'firm_id': f'f{start + i}', 'status': r['status'], 'status_note': r['status_note'],
                   'days_since_update': r['days'], 'next_step_line': r['next']}
            questions[f'attention_{start + i}'] = {'type': 'score', 'instructions': {
                'question': 'How much attention does this investor record need from Joe this week?',
                'record': rec}, 'criteria': ATTENTION}
            questions[f'owner_{start + i}'] = {'type': 'choice', 'instructions': {
                'question': 'Whose move is next on this investor record?', 'record': rec}, 'criteria': OWNER}
        req = {'state': {'task': 'Investor CRM follow-up triage. Each question carries its own record. '
                                 'Judge only the record inside that question.',
                         'today': datetime.date.today().isoformat()},
               'questions': questions}
        p = subprocess.run(['jev', '--raw'], input=json.dumps(req), capture_output=True, text=True)
        if p.returncode != 0:
            sys.stderr.write(f'triage: Jev call failed: {p.stderr.strip().splitlines()[:1]}\n')
            return None
        answers.update(json.loads(p.stdout).get('answers', {}))
    return answers


def main():
    root = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.getcwd()
    thr = float(os.environ.get('LAURELIN_JEV_THRESHOLD', '0.6'))
    stale_days = int(os.environ.get('LAURELIN_TRIAGE_STALE_DAYS', '30'))
    recs = records(root)
    if not recs:
        print(f'triage: 0 firms under {root}'); return
    answers = ask_jev(recs) if have_key() else None
    for i, r in enumerate(recs):
        a = (answers or {}).get(f'attention_{i}', {}); o = (answers or {}).get(f'owner_{i}', {})
        r['attention'] = a.get('score'); r['att_conf'] = a.get('confidence')
        r['owner'] = o.get('choice'); r['owner_conf'] = o.get('confidence')
        r['stale'] = r['days'] is not None and r['days'] > stale_days and r['status'] in WAITING
    recs.sort(key=lambda r: (-(r['attention'] or 0), -(r['days'] or 0), r['firm']))
    due = sum(1 for r in recs if (r['attention'] or 0) >= 1.5 and (r['att_conf'] or 0) >= thr)
    stale = sum(1 for r in recs if r['stale'])
    if answers is None:
        print(f'triage: {len(recs)} firms, Jev skipped (no TYPESAFE_API_KEY), sorted by days since update, {stale} stale over {stale_days} days')
    else:
        print(f'triage: {len(recs)} firms, {due} need attention this week (Jev at or above {thr}), {stale} stale over {stale_days} days')
    print(f'{"rank":>4}  {"firm":<32} {"status":<30} {"days":>4}  {"attention":<9} {"owner":<7} {"conf":<5} next')
    for n, r in enumerate(recs, 1):
        att = 'n/a' if r['attention'] is None else f'{r["attention"]:.2f}'
        conf = '' if r['att_conf'] is None else f'{r["att_conf"]:.2f}'
        low = ' (low confidence: ask Joe)' if r['att_conf'] is not None and r['att_conf'] < thr else ''
        days = '?' if r['days'] is None else str(r['days'])
        print(f'{n:>4}  {r["firm"][:32]:<32} {r["status"][:30]:<30} {days:>4}  {att:<9} {(r["owner"] or ""):<7} {conf:<5} {r["next"][:60]}{low}')
    if stale:
        print('would set status: stale (not written; Joe decides):')
        for r in recs:
            if r['stale']:
                print(f'  {r["firm"]}: {r["status"]}, {r["days"]} days')
    print('This is a list for Joe. Nothing was written or sent.')


if __name__ == '__main__':
    main()
