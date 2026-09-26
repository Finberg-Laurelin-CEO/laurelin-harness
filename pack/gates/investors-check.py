#!/usr/bin/env python3
"""investors-check.py ROOT: check an investors corpus and print one JSON object.

The bash gate (investors.sh) decides pass or fail from the JSON and prints the one line.
Rules come from the vault's Investor Research Playbook and _RESTRUCTURE-SPEC (paths in
pack/skills/investor-research/SKILL.md). Nothing here names a real firm or person.

Kinds of target:
  investors root   a folder whose subfolders hold _index.md (or Index.md)
  firm folder      a folder that itself holds _index.md (or Index.md)
  file             checked as part of its parent firm folder
Anything else: {"kind": "none"} and the gate skips.

Checks, per firm folder:
  index        _index.md exists. Index.md alone is accepted and reported.
  index_keys   the index frontmatter has tags, firm, status, website, updated.
               The other keys from the spec are counted as "recommended" and reported.
  roster       every person note is linked from the block between
               <!-- investor-people:start --> and <!-- investor-people:end --> as [[<Firm>/<Person>|...]].
  backlink     every person note links back to the firm index ([[<Firm>/_index|...]] or [[_index|...]]).
  person_keys  every person note has tags, person, firm, status.
  email        a note that holds an email address has email_status in its frontmatter, or every
               line with an address carries a verification marker (Hunter, verified, not found).
               Email - notes are records of real mail and are exempt.
  dated        every body line with a URL carries a YYYY-MM-DD date, or sits under a heading
               that carries one (the playbook's "## Research (captured YYYY-MM-DD)"), or says
               not publicly verified. Frontmatter lines are identity fields and are exempt.
Category folders (status says "not a firm" or "source container", or tags include source-list or
category-index) need only tags, status and updated, and get no people checks.
"""
import json, os, re, sys

URL = re.compile(r'https?://')
DATE = re.compile(r'\b20\d\d-\d\d-\d\d\b')
EMAIL = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
MARKER = re.compile(r'email_status|hunter|verified|not found|not publicly verified', re.I)
NOT_FIRM = re.compile(r'not a firm|category-index|source container', re.I)
SOURCE_TAG = re.compile(r'^\s*-\s*source-list\s*$|^tags:.*\bsource-list\b')
REQUIRED_CATEGORY = ['tags', 'status', 'updated']
NOT_PERSON_PREFIX = ('Email -', 'Deck Guidance', 'WORK-LOG', 'Research', 'Sources', 'Source Ledger',
                     'Relationship', 'Outreach', 'Materials', 'Meeting', 'Application', 'Partners and Mentors')
REQUIRED_INDEX = ['tags', 'firm', 'status', 'website', 'updated']
RECOMMENDED_INDEX = ['domain', 'stage', 'check_size', 'source', 'source_list', 'laurelin_fit', 'frege_fit',
                     'contact', 'email', 'linkedin_company']
REQUIRED_PERSON = ['tags', 'person', 'firm', 'status']


def read(path):
    with open(path, encoding='utf-8', errors='replace') as f:
        return f.read().split('\n')


def split(lines):
    """Return (frontmatter dict, frontmatter line count, body lines)."""
    if not lines or lines[0].strip() != '---':
        return {}, 0, lines
    fm, i = {}, 1
    while i < len(lines) and lines[i].strip() != '---':
        m = re.match(r'^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$', lines[i])
        if m:
            fm[m.group(1)] = m.group(2).strip()
        i += 1
    return fm, i + 1, lines[i + 1:]


def index_of(folder):
    for name in ('_index.md', 'Index.md'):
        p = os.path.join(folder, name)
        if os.path.isfile(p):
            return name
    return None


def is_person(name):
    if name in ('_index.md', 'Index.md', 'People.md'):
        return False
    return not name.startswith(NOT_PERSON_PREFIX)


def roster_block(body):
    inside, block = False, []
    for line in body:
        if 'investor-people:start' in line:
            inside = True
            continue
        if 'investor-people:end' in line:
            return block, True
        if inside:
            block.append(line)
    return block, False


def check_email(fm, lines, problems, rel):
    if 'email_status' in fm:
        return
    for n, line in enumerate(lines, 1):
        if EMAIL.search(line) and not MARKER.search(line):
            problems.append(f'{rel}:{n}: email without email_status')
            return


def check_dated(body, offset, problems, rel):
    heading_dated, count = False, 0
    for n, line in enumerate(body, offset + 1):
        if line.startswith('#'):
            heading_dated = bool(DATE.search(line))
            continue
        if not URL.search(line):
            continue
        count += 1
        if DATE.search(line) or heading_dated or 'not publicly verified' in line:
            continue
        problems.append(f'{rel}:{n}: fact with a URL and no date')
    return count


def check_firm(root, folder):
    firm = os.path.basename(folder)
    problems, notes = [], []
    result = {'firm': firm, 'people': 0, 'facts': 0, 'problems': problems, 'notes': notes}
    idx = index_of(folder)
    if idx is None:
        problems.append(f'{firm}/: missing _index.md')
        return result
    if idx == 'Index.md':
        notes.append(f'{firm}/: Index.md instead of _index.md')
    ilines = read(os.path.join(folder, idx))
    fm, off, body = split(ilines)
    category = bool(NOT_FIRM.search(fm.get('status', '')) or NOT_FIRM.search(fm.get('tags', ''))
                    or any(SOURCE_TAG.search(l) for l in ilines[:off]))
    for k in (REQUIRED_CATEGORY if category else REQUIRED_INDEX):
        if k not in fm:
            problems.append(f'{firm}/{idx}: frontmatter lacks {k}')
    result['facts'] += check_dated(body, off, problems, f'{firm}/{idx}')
    check_email(fm, ilines, problems, f'{firm}/{idx}')
    if category:
        result['category'] = True
        return result
    missing_rec = [k for k in RECOMMENDED_INDEX if k not in fm]
    if missing_rec:
        notes.append(f'{firm}/{idx}: recommended keys missing: {", ".join(missing_rec)}')

    block, closed = roster_block(body)
    block_text = '\n'.join(block)
    if not closed:
        problems.append(f'{firm}/{idx}: no investor-people block')
    for m in re.finditer(r'\[\[' + re.escape(firm) + r'/([^\]|#]+)', block_text):
        if not os.path.isfile(os.path.join(folder, m.group(1).strip() + '.md')):
            notes.append(f'{firm}/{idx}: roster link points nowhere: {m.group(1).strip()}')

    for name in sorted(os.listdir(folder)):
        path = os.path.join(folder, name)
        if not name.endswith('.md') or not os.path.isfile(path):
            continue
        rel = f'{firm}/{name}'
        lines = read(path)
        pfm, poff, pbody = split(lines)
        if name != idx:
            result['facts'] += check_dated(pbody, poff, problems, rel)
        if not is_person(name):
            if name == 'People.md':
                check_email(pfm, lines, problems, rel)
            continue
        if 'source-email' in pfm.get('tags', ''):
            continue
        person = name[:-3]
        result['people'] += 1
        if f'[[{firm}/{person}|' not in block_text and f'[[{firm}/{person}]]' not in block_text:
            problems.append(f'{rel}: not linked from the people block of {idx}')
        text = '\n'.join(lines)
        if f'[[{firm}/_index' not in text and '[[_index' not in text and \
                f'[[{firm}/Index' not in text and '[[Index|' not in text:
            problems.append(f'{rel}: no link back to the firm index')
        for k in REQUIRED_PERSON:
            if k not in pfm:
                problems.append(f'{rel}: frontmatter lacks {k}')
        check_email(pfm, lines, problems, rel)
    # Sub-notes in subfolders (Research, Sources, ...) get the dated check only.
    for sub in sorted(os.listdir(folder)):
        subp = os.path.join(folder, sub)
        if not os.path.isdir(subp) or sub.startswith('.'):
            continue
        for dp, _, files in os.walk(subp):
            for f in sorted(files):
                if f.endswith('.md'):
                    l = read(os.path.join(dp, f))
                    _, o, b = split(l)
                    result['facts'] += check_dated(b, o, problems, os.path.relpath(os.path.join(dp, f), root))
    return result


def main():
    target = os.path.abspath(sys.argv[1])
    if os.path.isfile(target):
        target = os.path.dirname(target)
    if not os.path.isdir(target):
        print(json.dumps({'kind': 'none'})); return
    if index_of(target):
        kind, root, folders = 'firm', os.path.dirname(target), [target]
    else:
        folders = sorted(os.path.join(target, d) for d in os.listdir(target)
                         if os.path.isdir(os.path.join(target, d)) and not d.startswith(('.', '_')))
        if not any(index_of(f) for f in folders):
            print(json.dumps({'kind': 'none'})); return
        kind, root = 'root', target
    firms = [check_firm(root, f) for f in folders]
    out = {
        'kind': kind, 'root': root,
        'firms': len(firms),
        'categories': sum(1 for f in firms if f.get('category')),
        'people': sum(f['people'] for f in firms),
        'facts': sum(f['facts'] for f in firms),
        'problems': [p for f in firms for p in f['problems']],
        'notes': [n for f in firms for n in f['notes']],
    }
    print(json.dumps(out))


if __name__ == '__main__':
    main()
