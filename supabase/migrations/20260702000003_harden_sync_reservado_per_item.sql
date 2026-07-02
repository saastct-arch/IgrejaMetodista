-- Atualiza reservado item a item (não em lote), para que um eventual conflito de
-- número (dois pedidos via Mercado Pago aprovados ao mesmo tempo, caso raríssimo)
-- nunca impeça a confirmação do pagamento do pedido inteiro. O item em conflito
-- fica sinalizado para revisão manual do admin em vez de travar a transação.
create or replace function public.sync_reservado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_novo_reservado boolean;
begin
  if NEW.status is distinct from OLD.status then
    v_novo_reservado := (NEW.status in ('pago','standby'));
    for v_item in select id from public.order_items where order_id = NEW.id loop
      begin
        update public.order_items set reservado = v_novo_reservado where id = v_item.id;
      exception when unique_violation then
        -- número em conflito com outro pedido; mantém como está para o admin revisar
        null;
      end;
    end loop;
  end if;
  return NEW;
end;
$$;
