#!/usr/bin/env python3
"""query.py: find the vault sections that matter for a task.

  query.py "cryostat vendor"              top sections, one line each
  query.py --json --k 20 "..."            the same as JSON, with the section text
  echo "long task text" | query.py --stdin --json
  query.py --check                        can Polygres be reached, and is it ready

Two modes with one output shape:
  polygres  hybrid search on the synced copy: Polygres AI Context (vector, text embedded
            server side) plus PostgreSQL full-text search, fused by reciprocal rank, then a
            one-hop graph expand along the wikilink edges. Needs polygres-sdk,
            POLYGRES_API_KEY and POLYGRES_RUNTIME_URL.
  local     the same interface over the safe vault copy on disk: a BM25 rank over the
            sections that sync.py would send, heading and title matches count extra, then
            a one-hop expand along the wikilinks (forward and back). The section index is
            cached under LAURELIN_MEMORY_HOME and rebuilt when any note changes.
--auto (the default) uses polygres when it is configured and falls back to local on any
error, saying so in `note`.

Output JSON: {"mode", "query", "ms", "note", "results": [{"id", "path", "section", "heading",
"score", "words", "via", "text"}]}. `via` is empty for a direct hit, or says which hit's link
brought the section in.

Environment: LAURELIN_SAFE_VAULT, LAURELIN_MEMORY_HOME (default ~/.laurelin/memory),
LAURELIN_MEMORY_MODE (auto|local|polygres), POLYGRES_API_KEY, POLYGRES_RUNTIME_URL,
POLYGRES_SCHEMA (public), POLYGRES_COLLECTION (sections), POLYGRES_TEXT_CONFIG (sections_text).
"""
import argparse
import hashlib
import json
import math
import os
import re
import sys
import time
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vaultlib  # noqa: E402

DEFAULT_HOME = os.path.expanduser('~/.laurelin/memory')
STOP = set("""a an and are as at be but by for from has have if in into is it its of on or that the this to was
were will with about after all also any been before being can could did do does each few had he her here his how
just like may me more most much my no not now only other our out over own same she should so some such than
their them then there these they those through too under until up upon very we what when where which while who
why would you your""".split())
K1, B = 1.2, 0.75
HOP_FORWARD, HOP_BACK = 0.5, 0.4


def tokens(text):
    out = []
    for w in vaultlib.WORD.findall(text.lower()):
        if len(w) < 3 or w in STOP or (w.isdigit() and len(w) < 4):
            continue
        if len(w) > 4 and w.endswith('s') and not w.endswith('ss'):
            w = w[:-1]
        out.append(w)
    return out


# ---------------------------------------------------------------- local index

def home_dir():
    return os.path.expanduser(os.environ.get('LAURELIN_MEMORY_HOME') or DEFAULT_HOME)


def index_key(root, notes):
    h = hashlib.sha256(root.encode('utf-8'))
    for rel in notes:
        try:
            st = os.stat(os.path.join(root, rel))
        except OSError:
            continue
        h.update(f'{rel}|{st.st_mtime_ns}|{st.st_size}\n'.encode('utf-8'))
    return h.hexdigest()


def build_index(root, min_words, max_words):
    """All sections of the copy plus an inverted index, from the cache when no note changed."""
    notes = vaultlib.iter_notes(root)
    key = index_key(root, notes)
    cache = os.path.join(home_dir(), f"index-{hashlib.sha256(root.encode('utf-8')).hexdigest()[:8]}.json")
    try:
        with open(cache, encoding='utf-8') as fh:
            data = json.load(fh)
        if data.get('key') == key and data.get('min_words') == min_words and data.get('max_words') == max_words \
                and 'postings' in data:
            return data, True
    except (OSError, ValueError):
        pass
    link_index = vaultlib.build_link_index(notes)
    sections, postings, lengths = [], defaultdict(list), []
    for rel in notes:
        try:
            _, srows, _ = vaultlib.note_rows(root, rel, link_index, min_words, max_words)
        except OSError:
            continue
        for s in srows:
            i = len(sections)
            sections.append({'id': s['id'], 'path': s['path'], 'section': s['section'], 'heading': s['heading'],
                             'text': s['text'], 'words': s['words'],
                             'links': sorted({l['path'] for l in s['links'] if l['path'] and l['path'] != rel})})
            tf = Counter(tokens(s['text']))
            lengths.append(sum(tf.values()))
            for t, f in tf.items():
                postings[t].append([i, f])
    data = {'key': key, 'min_words': min_words, 'max_words': max_words, 'sections': sections,
            'postings': postings, 'lengths': lengths}
    try:
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        tmp = cache + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as fh:
            json.dump(data, fh)
        os.replace(tmp, cache)
    except OSError:
        pass  # a cache is a convenience, never a requirement
    return data, False


def bm25_scores(query_terms, index):
    """BM25 over section text through the inverted index, plus a bonus when a query term sits in
    the heading or the note title. Returns {section index: score} for sections that match."""
    sections, postings, lengths = index['sections'], index['postings'], index['lengths']
    n = len(sections)
    if not n:
        return {}
    avg = (sum(lengths) / n) or 1.0
    scores = defaultdict(float)
    terms = set(query_terms)
    for t in terms:
        plist = postings.get(t) or []
        if not plist:
            continue
        idf = math.log(1 + (n - len(plist) + 0.5) / (len(plist) + 0.5))
        for i, f in plist:
            length = lengths[i] or 1
            scores[i] += idf * f * (K1 + 1) / (f + K1 * (1 - B + B * length / avg))
    for i in list(scores):
        s = sections[i]
        head = set(tokens(s['heading'])) | set(tokens(vaultlib.note_title(s['path'])))
        for t in terms & head:
            plist = postings.get(t) or []
            scores[i] += 1.5 * math.log(1 + (n - len(plist) + 0.5) / (len(plist) + 0.5))
    return scores


def local_search(query, k, root, min_words, max_words):
    index, cached = build_index(root, min_words, max_words)
    sections = index['sections']
    terms = tokens(query)
    if not terms:
        return [], f'no searchable words in the query ({len(sections)} sections indexed)'
    scores = bm25_scores(terms, index)
    ranked = sorted(scores.items(), key=lambda x: -x[1])
    results = {}
    for i, sc in ranked[:k]:
        results[i] = dict(sections[i], score=round(sc, 4), via='')
    # one hop along the wikilinks from the strongest direct hits (forward, then back)
    by_path = defaultdict(list)
    for i, s in enumerate(sections):
        by_path[s['path']].append(i)

    def best_of(path):
        cand = by_path.get(path) or []
        return max(cand, key=lambda i: scores.get(i, 0.0)) if cand else None

    top_paths = {sections[i]['path'] for i, _ in ranked[:5]}
    back = defaultdict(set)
    for i, s in enumerate(sections):
        for dst in s['links']:
            if dst in top_paths:
                back[dst].add(s['path'])
    for i, sc in ranked[:5]:
        s = sections[i]
        for dst in s['links']:
            b = best_of(dst)
            if b is not None and b not in results:
                results[b] = dict(sections[b], score=round(max(scores.get(b, 0.0), sc * HOP_FORWARD), 4),
                                  via=f"link from {s['path']}")
        for src in back.get(s['path'], ()):
            b = best_of(src)
            if b is not None and b not in results:
                results[b] = dict(sections[b], score=round(max(scores.get(b, 0.0), sc * HOP_BACK), 4),
                                  via=f"links to {s['path']}")
    out = sorted(results.values(), key=lambda r: -r['score'])[:k]
    for r in out:
        r.pop('links', None)
    return out, f"{len(sections)} sections indexed{' (cached)' if cached else ''}"


# ---------------------------------------------------------------- polygres

def polygres_configured():
    return bool(os.environ.get('POLYGRES_API_KEY')) and bool(os.environ.get('POLYGRES_RUNTIME_URL'))


def polygres_project():
    from polygres import Polygres
    client = Polygres(api_key=os.environ['POLYGRES_API_KEY'], runtime_url=os.environ['POLYGRES_RUNTIME_URL'])
    return client, client.project()


def _fields(r):
    """The row fields of one SDK result, whatever the result type calls them."""
    for name in ('properties', 'payload', 'row', 'data', 'metadata'):
        v = getattr(r, name, None)
        if isinstance(v, dict) and v:
            return v
    return {}


def _result_id(r, fields):
    # Context (vector) results carry the section id inside properties.source_key / source_record, not at the
    # top level; without this the whole vector lane was dropped (found 2026-10-06).
    for key in ('source_key', 'source_record'):
        v = fields.get(key)
        if isinstance(v, dict) and v.get('id'):
            return str(v['id'])
    for v in (fields.get('id'), getattr(r, 'source_key', None), getattr(r, 'id', None)):
        if v:
            return str(v)
    node = getattr(r, 'node', None)
    return str(getattr(node, 'id', '')) if node is not None else ''


def _err(e):
    return getattr(e, 'code', None) or type(e).__name__



STOPWORDS = set("a an and are as at be been by for from has have how i if in into is it its of on or our that the their them then there these they this to was we were what when where which who why will with without you your write three plain sentences sentence note notes paths path given cite citing".split())

def text_query(query, limit=8):
    """Content words of the query, joined with OR for websearch-style full-text search."""
    words = []
    for w in re.findall(r"[A-Za-z][A-Za-z0-9'-]{2,}", query.lower()):
        if w in STOPWORDS or w in words:
            continue
        words.append(w)
        if len(words) >= limit:
            break
    return ' OR '.join(words) if words else query

def polygres_search(query, k, root, min_words, max_words, lanes_wanted=('vector', 'text')):
    """Context (vector) plus tsvector (text), reciprocal-rank fused, then one graph hop."""
    schema = os.environ.get('POLYGRES_SCHEMA', 'public')
    collection = os.environ.get('POLYGRES_COLLECTION', 'sections')
    text_config = os.environ.get('POLYGRES_TEXT_CONFIG', 'sections_text')
    client, project = polygres_project()
    lanes = {}
    notes = []
    if 'vector' in lanes_wanted:
        try:
            page = project.context.search(collection, text=query, limit=k)  # about 6 s: Polygres embeds the query
            lanes['vector'] = list(getattr(page, 'results', []) or [])
        except Exception as e:  # noqa: BLE001
            notes.append(f'vector lane off: {_err(e)}')
    if 'text' in lanes_wanted:
      try:
        # Full-text search ANDs every word, so a whole sentence matches nothing. Send the
        # content words joined with OR instead; ranking still favours sections with more of them.
        page = project.text.tsvector(text_query(query), config=text_config, limit=k)  # about 0.3 s
        lanes['text'] = list(getattr(page, 'results', []) or [])
      except Exception as e:  # noqa: BLE001
        notes.append(f'text lane off: {_err(e)}')
    if not lanes:
        raise RuntimeError('; '.join(notes) or 'no lane answered')
    fused = defaultdict(float)
    fields = {}
    for results in lanes.values():
        for rank, r in enumerate(results):
            f = _fields(r)
            sid = _result_id(r, f)
            if not sid:
                continue
            fused[sid] += 1.0 / (60 + rank)
            fields.setdefault(sid, f)
    via = {}
    for sid in sorted(fused, key=lambda s: -fused[s])[:3]:
        try:
            page = project.graph.expand({'schema': schema, 'table': 'sections', 'id': sid}, max_depth=3,
                                        direction='any', limit=20)
            for r in getattr(page, 'results', []) or []:
                node = getattr(r, 'node', None)
                if node is not None and getattr(node, 'table', '') == 'sections':
                    nid = str(getattr(node, 'id', ''))
                    if nid and nid not in fused:
                        fused[nid] = fused[sid] * HOP_FORWARD
                        via[nid] = f'graph from {sid}'
                        fields.setdefault(nid, _fields(r))
        except Exception as e:  # noqa: BLE001
            notes.append(f'graph hop off: {_err(e)}')
            break
    try:
        client.close()
    except Exception:  # noqa: BLE001
        pass
    # section text comes from the local copy when it is here; the row fields otherwise
    local = {}
    if os.path.isdir(root):
        index, _ = build_index(root, min_words, max_words)
        local = {s['id']: s for s in index['sections']}
    out = []
    for sid in sorted(fused, key=lambda s: -fused[s])[:k]:
        s = local.get(sid) or fields.get(sid) or {}
        out.append({'id': sid, 'path': s.get('path', ''), 'section': s.get('section', 0), 'heading': s.get('heading', ''),
                    'score': round(fused[sid], 5), 'words': s.get('words', 0), 'via': via.get(sid, ''),
                    'text': s.get('text', '')})
    return out, '; '.join([f"lanes: {', '.join(lanes)}"] + notes)


def check():
    if not polygres_configured():
        print('skipped: no POLYGRES key (POLYGRES_API_KEY and POLYGRES_RUNTIME_URL)')
        return 0
    try:
        client, project = polygres_project()
    except ImportError:
        print('polygres: sdk not installed (pip install polygres-sdk)')
        return 1
    try:
        r = project.readiness()
        print(f'polygres: graph {r.graph} vector {r.vector} hybrid {r.hybrid}')
        caps = project.context.get_capabilities()
        print(f'context: dense_search {getattr(caps, "dense_search", None)} '
              f'query_embedding_generation {getattr(caps, "query_embedding_generation", None)}')
        return 0
    except Exception as e:  # noqa: BLE001
        print(f'polygres: unreachable ({_err(e)})')
        return 1
    finally:
        try:
            client.close()
        except Exception:  # noqa: BLE001
            pass


# ---------------------------------------------------------------- main

def run(query, k=20, mode='auto', source=None, min_words=vaultlib.MIN_WORDS, max_words=vaultlib.MAX_WORDS):
    root = vaultlib.source_dir(source)
    t0 = time.time()
    note = ''
    results = []
    used = 'local'
    lanes_wanted = {'polygres-text': ('text',), 'polygres-vector': ('vector',)}.get(mode, ('vector', 'text'))
    if mode in ('polygres-text', 'polygres-vector'):
        if not polygres_configured():
            raise RuntimeError('POLYGRES_API_KEY and POLYGRES_RUNTIME_URL are not both set')
        results, note = polygres_search(query, k, root, min_words, max_words, lanes_wanted)
        return {'mode': mode, 'query': query, 'ms': int((time.time() - t0) * 1000), 'note': note, 'results': results}
    if mode in ('auto', 'polygres') and polygres_configured():
        try:
            results, note = polygres_search(query, k, root, min_words, max_words)
            used = 'polygres'
        except Exception as e:  # noqa: BLE001
            if mode == 'polygres':
                raise
            note = f'polygres failed ({_err(e)}); local used. '
    elif mode == 'polygres':
        raise RuntimeError('POLYGRES_API_KEY and POLYGRES_RUNTIME_URL are not both set')
    elif mode == 'auto':
        note = 'polygres not configured; local used. '
    if used == 'local':
        if not os.path.isdir(root):
            raise FileNotFoundError(f'no safe vault copy at {root}')
        results, lnote = local_search(query, k, root, min_words, max_words)
        note += lnote
    return {'mode': used, 'query': query, 'ms': int((time.time() - t0) * 1000), 'note': note.strip(), 'results': results}


# ---------------------------------------------------------------- warm server

_INDEX_MEMO = {}  # root -> (checked_at, key, data): the local index stays in memory between searches
_INDEX_RECHECK_S = float(os.environ.get('LAURELIN_MEMORY_RECHECK_S', '30'))


def _memo_build_index(root, min_words, max_words, _orig=build_index):
    """build_index, kept in memory; notes are re-checked for changes at most every 30 seconds."""
    now = time.time()
    hit = _INDEX_MEMO.get((root, min_words, max_words))
    if hit and now - hit[0] < _INDEX_RECHECK_S:
        return hit[2], True
    if hit:
        key = index_key(root, vaultlib.iter_notes(root))
        if key == hit[1]:
            _INDEX_MEMO[(root, min_words, max_words)] = (now, key, hit[2])
            return hit[2], True
    data, cached = _orig(root, min_words, max_words)
    _INDEX_MEMO[(root, min_words, max_words)] = (now, data.get('key'), data)
    return data, cached


def serve():
    """One JSON request per line on stdin: {"id", "query", "k", "mode"} with mode local | polygres | auto.
    One JSON answer per line on stdout: {"id", ...run() result} or {"id", "error"}. Requests run on threads,
    so a local search and a Polygres search for the same message run at the same time."""
    import threading
    from concurrent.futures import ThreadPoolExecutor
    global build_index
    build_index = _memo_build_index
    lock = threading.Lock()
    pool = ThreadPoolExecutor(max_workers=int(os.environ.get('LAURELIN_MEMORY_THREADS', '4')))

    def answer(req):
        rid = req.get('id')
        try:
            out = run(req['query'], int(req.get('k', 20)), req.get('mode', 'auto'))
            out['id'] = rid
        except Exception as e:  # noqa: BLE001
            out = {'id': rid, 'error': _err(e)}
        with lock:
            sys.stdout.write(json.dumps(out, ensure_ascii=False) + '\n')
            sys.stdout.flush()

    print(json.dumps({'id': None, 'ready': True}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except ValueError:
            continue
        pool.submit(answer, req)
    pool.shutdown(wait=True)
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('query', nargs='*', help='the search text (or use --stdin)')
    ap.add_argument('--stdin', action='store_true', help='read the query from standard input')
    ap.add_argument('--k', type=int, default=10, help='how many sections to return (default 10)')
    ap.add_argument('--json', action='store_true', help='print JSON with the section text')
    ap.add_argument('--local', action='store_true', help='search the copy on disk only')
    ap.add_argument('--polygres', action='store_true', help='search Polygres only, fail if unreachable')
    ap.add_argument('--check', action='store_true', help='report whether Polygres is configured and ready')
    ap.add_argument('--serve', action='store_true', help='stay running: one JSON request per stdin line, one answer per stdout line')
    ap.add_argument('--source', help='folder with the safe vault copy')
    ap.add_argument('--min-words', type=int, default=int(os.environ.get('LAURELIN_MEMORY_MIN_WORDS', vaultlib.MIN_WORDS)))
    ap.add_argument('--max-words', type=int, default=int(os.environ.get('LAURELIN_MEMORY_MAX_WORDS', vaultlib.MAX_WORDS)))
    args = ap.parse_args(argv)
    if args.check:
        return check()
    if args.serve:
        return serve()
    query = sys.stdin.read() if args.stdin else ' '.join(args.query)
    if not query.strip():
        ap.error('give a query, or --stdin')
    mode = 'local' if args.local else 'polygres' if args.polygres else os.environ.get('LAURELIN_MEMORY_MODE', 'auto')
    try:
        out = run(query, args.k, mode, args.source, args.min_words, args.max_words)
    except Exception as e:  # noqa: BLE001
        print(f'query: {e}', file=sys.stderr)
        return 1
    if args.json:
        json.dump(out, sys.stdout, ensure_ascii=False)
        print()
        return 0
    print(f"{out['mode']}: {len(out['results'])} sections in {out['ms']} ms" + (f" ({out['note']})" if out['note'] else ''))
    for r in out['results']:
        via = f"  via {r['via']}" if r['via'] else ''
        print(f"{r['score']:8.3f}  {r['path']}#{r['section']}  § {r['heading']}  ({r['words']} words){via}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
