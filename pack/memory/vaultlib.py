"""vaultlib: read a folder of Markdown notes and cut each note into sections.

Shared by sync.py (which sends sections to Polygres) and query.py (which searches them
locally when Polygres is unreachable). No network, no third-party imports.

A section is a heading-bounded piece of a note, merged with its neighbours when it is
short and split at paragraph breaks when it is long, so most sections land between
MIN_WORDS and MAX_WORDS. Wikilinks (`[[Note]]`, `[[Note#Heading|alias]]`, `![[Note]]`)
inside a section become edges from that section to the note they name.

Environment: LAURELIN_SAFE_VAULT (the folder; default ~/.gbrain/sources/laurelin-safe),
LAURELIN_MEMORY_SKIP (comma list of top-level folders to skip; default _local-repos).
"""
import hashlib
import math
import os
import re
from datetime import datetime, timezone

DEFAULT_SOURCE = os.path.expanduser('~/.gbrain/sources/laurelin-safe')
DEFAULT_SKIP = ('_local-repos',)
MIN_WORDS = 300
MAX_WORDS = 800

HEADING = re.compile(r'^(#{1,6})\s+(.*?)\s*#*\s*$')
FENCE = re.compile(r'^(```|~~~)')
WIKILINK = re.compile(r'!?\[\[([^\]\|#]+)(?:#[^\]\|]*)?(?:\|[^\]]*)?\]\]')
WORD = re.compile(r"[A-Za-z0-9][A-Za-z0-9'\-]*")


def source_dir(override=None):
    return os.path.abspath(os.path.expanduser(override or os.environ.get('LAURELIN_SAFE_VAULT') or DEFAULT_SOURCE))


def skip_dirs():
    raw = os.environ.get('LAURELIN_MEMORY_SKIP')
    if raw is None:
        return set(DEFAULT_SKIP)
    return {s.strip() for s in raw.split(',') if s.strip()}


def iter_notes(root):
    """Return sorted relative paths of every .md note under root, skipping hidden entries."""
    skip = skip_dirs()
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = os.path.relpath(dirpath, root)
        dirnames[:] = sorted(d for d in dirnames if not d.startswith('.')
                             and not (rel_dir == '.' and d in skip))
        for f in filenames:
            if f.endswith('.md') and not f.startswith('.'):
                out.append(os.path.normpath(os.path.join(rel_dir, f)))
    return sorted(out)


def read_note(root, rel):
    """Return (text, mtime_iso, sha256) for one note."""
    full = os.path.join(root, rel)
    with open(full, 'rb') as fh:
        raw = fh.read()
    st = os.stat(full)
    mtime = datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(timespec='seconds')
    return raw.decode('utf-8', errors='replace'), mtime, hashlib.sha256(raw).hexdigest()


def note_title(rel):
    return os.path.splitext(os.path.basename(rel))[0]


def strip_frontmatter(text):
    if text.startswith('---'):
        end = text.find('\n---', 3)
        if end != -1:
            return text[end + 4:].lstrip('\n')
    return text


def word_count(text):
    return len(WORD.findall(text))


def wikilinks(text):
    """Unique wikilink targets in order of first appearance."""
    seen, out = set(), []
    for m in WIKILINK.finditer(text):
        t = m.group(1).strip()
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out


def _raw_sections(text, title):
    """Cut on headings, ignoring headings inside fenced code. Returns [(heading, level, text)]."""
    sections = []
    heading, level, buf = title, 0, []
    in_fence = False
    for line in text.split('\n'):
        if FENCE.match(line):
            in_fence = not in_fence
        m = None if in_fence else HEADING.match(line)
        if m:
            if ''.join(buf).strip():
                sections.append((heading, level, '\n'.join(buf).strip()))
            heading, level, buf = m.group(2).strip() or title, len(m.group(1)), []
            continue
        buf.append(line)
    body = '\n'.join(buf).strip()
    if body or not sections:
        sections.append((heading, level, body))
    return sections


def _pack(pieces, joiner, max_words):
    """Join pieces into chunks of about even size, none over max_words. The limit for each
    chunk is what is left divided by the chunks still to make, so a 2,500-word section
    becomes four parts of 550 to 800 words, not three of 800 and a stub of 100. A single
    oversize piece stays whole; the caller splits it finer."""
    sizes = [word_count(p) for p in pieces]
    remaining = sum(sizes)
    left = max(1, math.ceil(remaining / max_words))
    chunks, buf, n = [], [], 0
    for p, w in zip(pieces, sizes):
        # remaining counts the words not yet placed, buf included; left counts this chunk too
        limit = min(max_words, math.ceil(remaining / left)) if left > 1 else max_words
        if buf and n + w > limit:
            chunks.append(joiner.join(buf)); remaining -= n; buf, n = [], 0
            left = max(1, left - 1)
        buf.append(p); n += w
    if buf:
        chunks.append(joiner.join(buf))
    return chunks


def _split_long(text, max_words):
    """Split a long section so chunks stay under max_words: at blank lines, then single
    lines (tables, lists), then sentence ends, then plain word windows."""
    out = []
    for para in _pack([p for p in re.split(r'\n\s*\n', text) if p.strip()], '\n\n', max_words):
        if word_count(para) <= max_words:
            out.append(para); continue
        for block in _pack([l for l in para.split('\n') if l.strip()], '\n', max_words):
            if word_count(block) <= max_words:
                out.append(block); continue
            for sent in _pack(re.split(r'(?<=[.!?])\s+', block), ' ', max_words):
                if word_count(sent) <= max_words:
                    out.append(sent); continue
                words = sent.split()
                out.extend(' '.join(words[i:i + max_words]) for i in range(0, len(words), max_words))
    return out or [text]


def split_sections(text, title, min_words=MIN_WORDS, max_words=MAX_WORDS):
    """Return [{'heading', 'level', 'text', 'words'}] for one note body (frontmatter allowed)."""
    body = strip_frontmatter(text)
    raw = _raw_sections(body, title)
    # merge short sections forward until they reach min_words
    merged = []
    for heading, level, sec in raw:
        if merged and merged[-1]['words'] < min_words:
            prev = merged[-1]
            joiner = f"\n\n{'#' * max(level, 1)} {heading}\n\n" if heading != title else '\n\n'
            prev['text'] = (prev['text'] + joiner + sec).strip()
            prev['words'] = word_count(prev['text'])
            continue
        merged.append({'heading': heading, 'level': level, 'text': sec, 'words': word_count(sec)})
    # split long sections at paragraph breaks
    out = []
    for s in merged:
        if s['words'] <= max_words:
            out.append(s)
            continue
        parts = _split_long(s['text'], max_words)
        for i, part in enumerate(parts):
            h = s['heading'] if i == 0 else f"{s['heading']} (part {i + 1})"
            out.append({'heading': h, 'level': s['level'], 'text': part, 'words': word_count(part)})
    return out


def section_id(rel, index):
    return hashlib.sha256(f'{rel}#{index}'.encode('utf-8')).hexdigest()[:24]


def build_link_index(notes):
    """Map lowercase basename and lowercase path (without .md) to the relative path."""
    idx = {}
    for rel in notes:
        key = os.path.splitext(rel)[0].lower()
        idx.setdefault(key, rel)
        idx.setdefault(os.path.basename(key), rel)
    return idx


def resolve_link(target, link_index):
    t = target.strip().lower()
    if t.endswith('.md'):
        t = t[:-3]
    return link_index.get(t) or link_index.get(t.split('/')[-1])


def note_rows(root, rel, link_index, min_words=MIN_WORDS, max_words=MAX_WORDS):
    """One note -> (note_row, [section_rows], [link_rows]). Section rows carry links[] too."""
    text, mtime, sha = read_note(root, rel)
    title = note_title(rel)
    sections = split_sections(text, title, min_words, max_words)
    note = {'path': rel, 'title': title, 'updated': mtime, 'sha256': sha,
            'words': sum(s['words'] for s in sections), 'deleted_at': None}
    srows, lrows = [], []
    for i, s in enumerate(sections):
        sid = section_id(rel, i)
        links = []
        for t in wikilinks(s['text']):
            dst = resolve_link(t, link_index)
            links.append({'target': t, 'path': dst})
            if dst and dst != rel:
                lrows.append({'src_id': sid, 'dst_path': dst, 'target': t})
        srows.append({'id': sid, 'path': rel, 'section': i, 'heading': s['heading'], 'text': s['text'],
                      'words': s['words'], 'updated': mtime, 'links': links, 'deleted_at': None})
    return note, srows, lrows
