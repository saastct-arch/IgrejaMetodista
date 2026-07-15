-- Atualiza criar_pedido() para receber e validar o gênero de cada item,
-- garantindo no servidor que o tamanho escolhido é compatível com o
-- gênero (o cliente já filtra isso, mas nunca confiamos só nele).
create or replace function public.criar_pedido(
  p_buyer_name text,
  p_contact text,
  p_payment_method text,
  p_itens jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_order_id uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_preco numeric;
  v_tem_numero boolean;
  v_nome text;
  v_numero int;
  v_tamanho text;
  v_produto text;
  v_genero text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  if now() > timestamptz '2026-07-27 23:59:59-03' then
    raise exception 'O prazo para novos pedidos encerrou em 27/07/2026.';
  end if;

  if p_payment_method not in ('mercado_pago','dinheiro') then
    raise exception 'Forma de pagamento inválida.';
  end if;

  if coalesce(trim(p_buyer_name), '') = '' then
    raise exception 'Informe o nome do comprador.';
  end if;

  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'O carrinho está vazio.';
  end if;

  v_status := case when p_payment_method = 'dinheiro' then 'standby' else 'aguardando_pagamento' end;

  insert into public.orders (user_id, buyer_name, contact, payment_method, status, valor_total, valor_pago)
  values (auth.uid(), trim(p_buyer_name), trim(coalesce(p_contact,'')), p_payment_method, v_status, 0, 0)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_produto := v_item->>'produto';
    v_genero := v_item->>'genero';
    v_tamanho := v_item->>'tamanho';
    v_nome := trim(coalesce(v_item->>'nomeCamisa',''));
    v_numero := nullif(v_item->>'numero','')::int;

    select preco, tem_numero into v_preco, v_tem_numero from public.products where id = v_produto;
    if not found then
      raise exception 'Produto inválido: %', v_produto;
    end if;

    if v_nome = '' then
      raise exception 'Informe o nome que vai na camisa.';
    end if;

    if v_genero not in ('masculina','feminina','infantil') then
      raise exception 'Escolha o gênero da camisa (masculina, feminina ou infantil).';
    end if;

    if not (
      (v_genero = 'infantil' and v_tamanho in ('2A','4A','6A','8A','10A','12A','14A'))
      or (v_genero = 'masculina' and v_tamanho in ('P','M','G','GG','EG','EGG'))
      or (v_genero = 'feminina' and v_tamanho in ('P','M','G','GG'))
    ) then
      raise exception 'Tamanho inválido para o gênero escolhido.';
    end if;

    if v_tem_numero then
      if v_numero is null or v_numero < 2 or v_numero > 99 then
        raise exception 'Escolha um número entre 2 e 99.';
      end if;
    else
      v_numero := null;
    end if;

    insert into public.order_items (order_id, produto, tamanho, genero, nome_camisa, numero, valor, reservado)
    values (v_order_id, v_produto, v_tamanho, v_genero, v_nome, v_numero, v_preco, v_status in ('pago','standby'));

    v_total := v_total + v_preco;
  end loop;

  update public.orders
    set valor_total = v_total, valor_pago = case when v_status = 'pago' then v_total else 0 end
    where id = v_order_id;

  return jsonb_build_object('order_id', v_order_id, 'status', v_status, 'valor_total', v_total);
exception
  when unique_violation then
    raise exception 'Um dos números escolhidos acabou de ser reservado por outra pessoa. Escolha outro número.';
end;
$$;
