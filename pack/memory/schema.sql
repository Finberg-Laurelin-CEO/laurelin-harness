-- Laurelin memory: the safe vault copy as notes, sections and wikilink edges.
-- Applied once with:  polygres --json migrations apply --file pack/memory/schema.sql
-- pgGraph walks the foreign keys: links.src_id -> sections.id, links.dst_path -> notes.path,
-- sections.path -> notes.path. Text search and embeddings are configured on sections.text
-- afterwards (see pack/memory/README.md).

create table if not exists notes (
  path       text primary key,
  title      text,
  updated    timestamptz,
  sha256     text,
  words      integer,
  deleted_at timestamptz
);

create table if not exists sections (
  id         text primary key,
  path       text not null references notes(path),
  section    integer not null,
  heading    text,
  text       text,
  words      integer,
  updated    timestamptz,
  links      jsonb,
  deleted_at timestamptz
);

create table if not exists links (
  src_id   text not null references sections(id),
  dst_path text not null references notes(path),
  target   text,
  primary key (src_id, dst_path)
);

create index if not exists sections_path_idx on sections(path);
create index if not exists links_dst_idx on links(dst_path);
