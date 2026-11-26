-- 26/11/2026 — Remind Pro com a Stripe. Aplicar uma vez na base de dados de produção.
begin;
create table if not exists billing_customer (
  user_id            text primary key references "user"(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at         timestamptz not null default now()
);
-- Só o servidor (ligação direta) lê e escreve: sem políticas, a API pública da Supabase não vê nada.
alter table billing_customer enable row level security;
commit;
