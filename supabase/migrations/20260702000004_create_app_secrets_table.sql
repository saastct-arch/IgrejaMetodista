-- Guarda credenciais de integrações (ex.: token do Mercado Pago) fora do
-- código-fonte. RLS habilitado e SEM nenhuma policy: nem anon nem
-- authenticated conseguem ler/gravar por aqui. Só o service_role (usado
-- pelas Edge Functions) enxerga esta tabela, pois ele ignora RLS.
--
-- Os valores em si (tokens) NÃO ficam neste arquivo nem em nenhum lugar do
-- repositório: são inseridos manualmente via SQL direto no projeto Supabase.
create table public.app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
