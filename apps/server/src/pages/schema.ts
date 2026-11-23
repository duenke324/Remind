import type pg from 'pg'

/** Tabela das páginas. Os ids vêm da app (criados offline), por isso são texto. */
export const PAGES_SQL = `
    create sequence if not exists page_seq;
    create table if not exists page (
      id          text primary key,
      user_id     text not null references "user"(id) on delete cascade,
      parent_id   text,
      title       text not null default '',
      icon        text,
      cover       text,
      sort        double precision not null default 0,
      favorite    boolean not null default false,
      trashed_at  timestamptz,
      deleted     boolean not null default false,
      content     jsonb not null default '[]'::jsonb,
      version     integer not null default 1,
      seq         bigint not null default nextval('page_seq'),
      created_at  timestamptz not null default now(),
      updated_at  timestamptz not null default now()
    );
    create index if not exists page_user_seq_idx on page (user_id, seq);
    create index if not exists page_parent_idx on page (parent_id);
`

export async function migratePages(pool: pg.Pool): Promise<void> {
  await pool.query(PAGES_SQL)
}
