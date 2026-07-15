-- Mantém a lista de e-mails que viram admin automaticamente no primeiro
-- cadastro, incluindo agora o e-mail sintético (derivado do WhatsApp)
-- correspondente a wa31988220152@metodistatimoteo.app. Os dois e-mails
-- antigos ficam como legado (não são mais alcançáveis pelo fluxo atual
-- de cadastro, que só usa e-mail sintético a partir do telefone).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, is_admin)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    lower(new.email) in (
      'saas.tct@gmail.com',
      'italoguisilva10@gmail.com',
      'wa31988220152@metodistatimoteo.app'
    )
  );
  return new;
end;
$$;
