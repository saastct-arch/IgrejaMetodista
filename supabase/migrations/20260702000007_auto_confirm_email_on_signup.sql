-- Confirma o e-mail automaticamente no momento do cadastro, para o
-- usuário não precisar clicar em um link de confirmação para poder entrar.
-- (Não há como desligar o "Confirm email" do projeto por aqui — este
-- trigger tem o mesmo efeito prático: assim que a conta é criada,
-- email_confirmed_at já vem preenchido e o login funciona de imediato.)
create or replace function public.auto_confirm_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.email_confirmed_at is null then
    NEW.email_confirmed_at := now();
  end if;
  return NEW;
end;
$$;

create trigger auto_confirm_email_on_signup
  before insert on auth.users
  for each row execute function public.auto_confirm_email();

revoke all on function public.auto_confirm_email() from anon, authenticated, public;
