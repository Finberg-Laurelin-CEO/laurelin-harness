#!/usr/bin/env python3
"""sync.py: send the safe vault copy to Polygres as sections and wikilink edges.

  sync.py --dry-run [--limit N]        print the sections and edges that would be written
  sync.py --csv DIR                    write notes.csv, sections.csv, links.csv for `polygres import csv`
  sync.py                              upsert changed notes through the SDK (rows API); first run and
                                       large changes are sent to --csv instead, see below

Source: the SAFE copy of the vault (the sanitized set gbrain imports), never the vault itself.
Default ~/.gbrain/sources/laurelin-safe, or LAURELIN_SAFE_VAULT, or --source.

Incremental: a state file remembers each note's mtime, content hash and section count.
A note is re-sent only when its mtime changed and its hash changed. Notes that vanished
get a deleted_at tombstone on the note row and on each of their section rows.

Tables (pack/memory/schema.sql): notes(path pk), sections(id pk, path -> notes),
links(src_id -> sections, dst_path -> notes). Section rows also carry links as JSON.
Unresolved wikilinks stay in that JSON and produce no edge.

Polygres limits: the rows API takes about 60 writes a minute, so the first load of the whole
copy (thousands of sections) goes through CSV files and `polygres import csv`. Daily changes
(tens of rows) go through the SDK. --max-rows (default 200) is the line between the two.

Needs for a live write: `pip install polygres-sdk`, POLYGRES_API_KEY and POLYGRES_RUNTIME_URL
in the environment (from the key store). Neither value is ever printed.

Environment: LAURELIN_SAFE_VAULT, LAURELIN_MEMORY_STATE (default ~/.laurelin/memory/sync-state.json),
LAURELIN_MEMORY_SKIP, POLYGRES_API_KEY, POLYGRES_RUNTIME_URL, POLYGRES_SCHEMA (default public).
"""
import argparse
import csv
import json
import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vaultlib  # noqa: E402

DEFAULT_STATE = os.path.expanduser('~/.laurelin/memory/sync-state.json')
SECTION_COLS = ['id', 'path', 'section', 'heading', 'text', 'words', 'updated', 'links', 'deleted_at']
NOTE_COLS = ['path', 'title', 'updated', 'sha256', 'words', 'deleted_at']
LINK_COLS = ['src_id', 'dst_path', 'target']
ROWS_PER_MINUTE = 60


def now_iso():
    return datetime.now(tz=timezone.utc).isoformat(timespec='seconds')


def state_path(override=None):
    return os.path.expanduser(override or os.environ.get('LAURELIN_MEMORY_STATE') or DEFAULT_STATE)


def load_state(path):
    try:
        with open(path, encoding='utf-8') as fh:
            st = json.load(fh)
        if isinstance(st, dict) and isinstance(st.get('notes'), dict):
            return st
    except (OSError, ValueError):
        pass
    return {'version': 1, 'notes': {}}


def save_state(path, state):
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        json.dump(state, fh, indent=1, sort_keys=True)
    os.replace(tmp, path)


def plan(root, state, min_words, max_words, force=False):
    """Decide what to send. Returns dict with rows, tombstones, counts and the next state."""
    notes = vaultlib.iter_notes(root)
    link_index = vaultlib.build_link_index(notes)
    known = state['notes']
    out = {'scanned': len(notes), 'unchanged': 0, 'changed': [], 'note_rows': [], 'section_rows': [],
           'link_rows': [], 'tombstone_notes': [], 'tombstone_sections': [], 'unresolved': 0, 'new_state': {}}
    for rel in notes:
        full = os.path.join(root, rel)
        try:
            mtime = datetime.fromtimestamp(os.stat(full).st_mtime, tz=timezone.utc).isoformat(timespec='seconds')
        except OSError:
            continue
        prev = known.get(rel)
        if prev and not force and prev.get('mtime') == mtime:
            out['unchanged'] += 1
            out['new_state'][rel] = prev
            continue
        note, srows, lrows = vaultlib.note_rows(root, rel, link_index, min_words, max_words)
        if prev and not force and prev.get('sha256') == note['sha256']:
            out['unchanged'] += 1  # touched but same content: remember the new mtime only
            out['new_state'][rel] = dict(prev, mtime=mtime)
            continue
        out['changed'].append(rel)
        out['note_rows'].append(note)
        out['section_rows'].extend(srows)
        out['link_rows'].extend(lrows)
        out['unresolved'] += sum(1 for s in srows for l in s['links'] if not l['path'])
        # a note that shrank leaves surplus section ids behind: tombstone them
        for i in range(len(srows), int(prev.get('sections', 0)) if prev else 0):
            out['tombstone_sections'].append({'id': vaultlib.section_id(rel, i), 'path': rel, 'section': i})
        out['new_state'][rel] = {'mtime': mtime, 'sha256': note['sha256'], 'sections': len(srows)}
    for rel, prev in known.items():
        if rel not in out['new_state']:
            out['tombstone_notes'].append(rel)
            for i in range(int(prev.get('sections', 0))):
                out['tombstone_sections'].append({'id': vaultlib.section_id(rel, i), 'path': rel, 'section': i})
    return out


def print_dry_run(p, limit, verbose):
    shown = 0
    for s in p['section_rows']:
        if limit is not None and shown >= limit:
            break
        links = ', '.join(f"{l['target']} -> {l['path'] or '(unresolved)'}" for l in s['links']) or '-'
        print(f"section  {s['path']}#{s['section']}  \"{s['heading']}\"  {s['words']} words  links: {links}")
        if verbose:
            print('  ' + s['text'][:200].replace('\n', ' ') + ('...' if len(s['text']) > 200 else ''))
        shown += 1
    edges = 0
    for l in p['link_rows']:
        if limit is not None and edges >= limit:
            break
        print(f"edge     {l['src_id']} -> {l['dst_path']}  ({l['target']})")
        edges += 1
    for rel in p['tombstone_notes']:
        print(f"deleted  {rel}")
    print(f"dry-run: {p['scanned']} notes scanned, {len(p['changed'])} changed, {p['unchanged']} unchanged, "
          f"{len(p['section_rows'])} sections, {len(p['link_rows'])} edges, {p['unresolved']} unresolved links, "
          f"{len(p['tombstone_notes'])} deleted notes, {len(p['tombstone_sections'])} sections to tombstone"
          + (f"; showing {shown} sections and {edges} edges" if limit is not None else ''))


def write_csv(p, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    ts = now_iso()
    paths = {}
    tomb_notes = [{'path': r, 'title': vaultlib.note_title(r), 'updated': ts, 'sha256': '', 'words': 0,
                   'deleted_at': ts} for r in p['tombstone_notes']]
    tomb_sections = [{'id': t['id'], 'path': t['path'], 'section': t['section'], 'heading': '', 'text': '',
                      'words': 0, 'updated': ts, 'links': [], 'deleted_at': ts} for t in p['tombstone_sections']]
    for name, cols, rows in (('notes', NOTE_COLS, p['note_rows'] + tomb_notes),
                             ('sections', SECTION_COLS, p['section_rows'] + tomb_sections),
                             ('links', LINK_COLS, p['link_rows'])):
        path = os.path.join(out_dir, f'{name}.csv')
        with open(path, 'w', encoding='utf-8', newline='') as fh:
            w = csv.writer(fh, lineterminator='\n')
            w.writerow(cols)
            for r in rows:
                w.writerow([json.dumps(r[c]) if c == 'links' else ('' if r.get(c) is None else r.get(c)) for c in cols])
        paths[name] = path
    return paths


def print_import_commands(paths, first_run):
    schema = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'schema.sql')
    print('csv written:')
    for path in paths.values():
        print(f'  {path}')
    print('then, with `polygres login` done and the project selected (Joe runs these, rule 8):')
    if first_run:
        print(f'  polygres --json migrations apply --file {schema}')
    for name in ('notes', 'sections', 'links'):
        print(f"  polygres --json import csv {paths[name]} --table {name} --schema public --mode append_existing --wait")
    if not first_run:
        print('note: a CSV import appends; rows that already exist need the SDK path (rows upsert) or a fresh table.')


def have_polygres_env():
    return bool(os.environ.get('POLYGRES_API_KEY')) and bool(os.environ.get('POLYGRES_RUNTIME_URL'))


def polygres_project():
    from polygres import Polygres  # imported here so dry runs need no SDK
    client = Polygres(api_key=os.environ['POLYGRES_API_KEY'], runtime_url=os.environ['POLYGRES_RUNTIME_URL'])
    return client, client.project()


def upsert_rows(p, schema, verbose):
    """Send changed rows one by one through project.rows.upsert, under the rate limit."""
    client, project = polygres_project()
    ts = now_iso()
    writes = []
    for n in p['note_rows']:
        writes.append(('notes', dict(n), ['path']))
    for rel in p['tombstone_notes']:
        writes.append(('notes', {'path': rel, 'title': vaultlib.note_title(rel), 'updated': ts, 'deleted_at': ts}, ['path']))
    for s in p['section_rows']:
        row = dict(s)
        row['links'] = json.dumps(row['links'])
        writes.append(('sections', row, ['id']))
    for t in p['tombstone_sections']:
        writes.append(('sections', {'id': t['id'], 'path': t['path'], 'section': t['section'], 'text': '',
                                    'words': 0, 'updated': ts, 'deleted_at': ts}, ['id']))
    for l in p['link_rows']:
        writes.append(('links', dict(l), ['src_id', 'dst_path']))
    done, failed = 0, 0
    gap = 60.0 / ROWS_PER_MINUTE
    for i, (table, row, conflict) in enumerate(writes):
        key = row.get('id') or row.get('path') or ''
        idem = f"{table}:{key}:{row.get('dst_path', '')}:{row.get('updated', ts)}"[:120]
        try:
            project.rows.upsert(schema=schema, table=table, row=row, conflict_columns=conflict,
                                returning=conflict[:1], idempotency_key=idem)
            done += 1
            if verbose:
                print(f'upsert {table} {key}')
        except Exception as e:  # noqa: BLE001 - report and continue; the state is saved only for full success
            failed += 1
            code = getattr(e, 'code', None) or type(e).__name__
            print(f'error  {table} {key}: {code}', file=sys.stderr)
        if i + 1 < len(writes):
            time.sleep(gap)
    try:
        client.close()
    except Exception:  # noqa: BLE001
        pass
    return done, failed


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--source', help='folder with the safe vault copy')
    ap.add_argument('--state', help='state file (default LAURELIN_MEMORY_STATE or ~/.laurelin/memory/sync-state.json)')
    ap.add_argument('--dry-run', action='store_true', help='print what would be written; touch nothing')
    ap.add_argument('--limit', type=int, help='in --dry-run, show at most N sections and N edges')
    ap.add_argument('--verbose', action='store_true', help='print the first 200 characters of each section')
    ap.add_argument('--csv', metavar='DIR', help='write CSV files for `polygres import csv` instead of using the SDK')
    ap.add_argument('--rows', action='store_true', help='force the SDK rows path even on a first run')
    ap.add_argument('--max-rows', type=int, default=200, help='above this many rows, refuse the SDK path (default 200)')
    ap.add_argument('--force', action='store_true', help='treat every note as changed')
    ap.add_argument('--min-words', type=int, default=int(os.environ.get('LAURELIN_MEMORY_MIN_WORDS', vaultlib.MIN_WORDS)))
    ap.add_argument('--max-words', type=int, default=int(os.environ.get('LAURELIN_MEMORY_MAX_WORDS', vaultlib.MAX_WORDS)))
    args = ap.parse_args(argv)

    root = vaultlib.source_dir(args.source)
    if not os.path.isdir(root):
        print(f'sync: no safe vault copy at {root}', file=sys.stderr)
        return 2
    spath = state_path(args.state)
    state = load_state(spath)
    first_run = not state['notes']
    p = plan(root, state, args.min_words, args.max_words, force=args.force)

    if args.dry_run:
        print_dry_run(p, args.limit, args.verbose)
        return 0

    total_rows = len(p['note_rows']) + len(p['section_rows']) + len(p['link_rows']) + \
        len(p['tombstone_notes']) + len(p['tombstone_sections'])
    if total_rows == 0:
        print(f'sync: nothing changed ({p["scanned"]} notes, state {spath})')
        return 0

    use_csv = bool(args.csv) or (not args.rows and (first_run or total_rows > args.max_rows))
    if use_csv:
        out_dir = args.csv or os.path.join(os.path.dirname(spath), 'csv', datetime.now().strftime('%Y%m%d-%H%M%S'))
        paths = write_csv(p, out_dir)
        print_import_commands(paths, first_run)
        if not args.csv:
            print('sync: first run, so the bulk path was chosen' if first_run
                  else f'sync: {total_rows} rows is above --max-rows {args.max_rows}, so the bulk path was chosen')
        state['notes'] = p['new_state']
        state['last_sync'] = now_iso()
        state['source'] = root
        save_state(spath, state)
        print(f'state saved to {spath} on the assumption the import runs; `--force` redoes everything')
        return 0

    if not have_polygres_env():
        print('sync: POLYGRES_API_KEY and POLYGRES_RUNTIME_URL are not both set; use --dry-run or --csv DIR', file=sys.stderr)
        return 3
    try:
        import polygres  # noqa: F401
    except ImportError:
        print('sync: polygres-sdk is not installed (pip install polygres-sdk); use --csv DIR', file=sys.stderr)
        return 3
    done, failed = upsert_rows(p, os.environ.get('POLYGRES_SCHEMA', 'public'), args.verbose)
    print(f'sync: {done} rows upserted, {failed} failed, {len(p["changed"])} notes changed, '
          f'{len(p["tombstone_notes"])} notes deleted')
    if failed:
        print('state not saved because some writes failed; rerun to retry', file=sys.stderr)
        return 1
    state['notes'] = p['new_state']
    state['last_sync'] = now_iso()
    state['source'] = root
    save_state(spath, state)
    return 0


if __name__ == '__main__':
    sys.exit(main())
