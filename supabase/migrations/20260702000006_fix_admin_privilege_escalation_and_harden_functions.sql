-- ITEM 1 (crítico): impede que qualquer usuário se auto-promova a admin.
-- Defesa em duas camadas independentes:

-- 1a) Privilégio de coluna: authenticated só pode alterar full_name/phone
--     do próprio perfil. Mesmo que a policy de RLS permita a linha, o
--     Postgres nega a alteração de qualquer outra coluna (is_admin, email, id).
revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- 1b) Defesa extra: mesmo se uma futura migração voltar a liberar UPDATE
--     amplo por engano, este trigger reverte qualquer mudança em is_admin
--     feita por quem não é admin (silenciosamente ignora, sem quebrar o
--     resto do update). Também permite, de propósito, que um admin
--     promova outra pessoa via uma futura tela de administração.
create or replace function public.protect_profile_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.is_admin is distinct from OLD.is_admin and not public.is_admin() then
    NEW.is_admin := OLD.is_admin;
  end if;
  return NEW;
end;
$$;

create trigger protect_is_admin_flag
  before update on public.profiles
  for each row execute function public.protect_profile_admin_flag();

-- ITEM 4: hardening geral apontado pelo linter de segurança do Supabase.

-- 4a) search_path fixo em touch_updated_at (evita search_path hijacking)
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

-- 4b) Funções de trigger não precisam de EXECUTE direto por ninguém
--     (o mecanismo de trigger não depende desse grant para funcionar).
revoke all on function public.sync_reservado() from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.touch_updated_at() from public;
revoke all on function public.protect_profile_admin_flag() from public;

-- 4c) is_admin() só precisa ser chamável por quem já está logado
--     (é usada dentro das policies de RLS para authenticated).
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- 4d) criar_pedido() tinha o grant padrão para PUBLIC (inclui anon) além
--     do grant explícito para authenticated. Fecha o acesso do anon
--     (a função já se protegia sozinha checando auth.uid(), mas o ideal
--     é nem deixar o anon chamar).
revoke all on function public.criar_pedido(text, text, text, jsonb) from public;
grant execute on function public.criar_pedido(text, text, text, jsonb) to authenticated;

-- IMPORTANTE: o Supabase concede EXECUTE diretamente para anon/authenticated/
-- service_role em toda função nova (default privileges do projeto), então
-- "REVOKE ... FROM PUBLIC" sozinho não remove esses grants diretos — foi
-- necessário revogar explicitamente de cada role (ver migração seguinte).
revoke all on function public.criar_pedido(text, text, text, jsonb) from anon, authenticated;
grant execute on function public.criar_pedido(text, text, text, jsonb) to authenticated;

revoke all on function public.is_admin() from anon, authenticated;
grant execute on function public.is_admin() to authenticated;

revoke all on function public.sync_reservado() from anon, authenticated;
revoke all on function public.handle_new_user() from anon, authenticated;
revoke all on function public.touch_updated_at() from anon, authenticated;
revoke all on function public.protect_profile_admin_flag() from anon, authenticated;
