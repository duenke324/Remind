-- 25/11/2026 — painel de admin e planos (fase 1). Aplicar uma vez na base de dados de produção.
begin;
-- Papéis e contas suspensas (plugin admin do Better Auth)
alter table "user" add column if not exists role text;
alter table "user" add column if not exists banned boolean default false;
alter table "user" add column if not exists "banReason" text;
alter table "user" add column if not exists "banExpires" timestamptz;
alter table "session" add column if not exists "impersonatedBy" text;

-- Planos e registo das ações de admin
create table if not exists entitlement (
      user_id     text primary key references "user"(id) on delete cascade,
      plan        text not null check (plan in ('pro')),
      source      text not null check (source in ('manual', 'stripe')),
      expires_at  timestamptz,
      granted_by  text,
      note        text,
      created_at  timestamptz not null default now(),
      updated_at  timestamptz not null default now()
    );
    create table if not exists admin_audit (
      id          bigserial primary key,
      admin_id    text,
      admin_email text not null,
      target_id   text,
      target_email text,
      action      text not null,
      details     jsonb not null default '{}'::jsonb,
      created_at  timestamptz not null default now()
    );
    create index if not exists admin_audit_target_idx on admin_audit (target_id, created_at desc);
    create index if not exists admin_audit_created_idx on admin_audit (created_at desc);

-- Bloquear a API pública do Supabase (o servidor liga-se como dono das tabelas)
alter table "entitlement" enable row level security;
alter table "admin_audit" enable row level security;
commit;
