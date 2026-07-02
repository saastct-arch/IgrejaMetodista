-- Catálogo de produtos (preço validado sempre no servidor, nunca confiando no cliente)
create table public.products (
  id text primary key,
  nome text not null,
  descricao text not null default '',
  preco numeric(10,2) not null,
  tem_numero boolean not null default false
);
alter table public.products enable row level security;
create policy "products are readable by authenticated users" on public.products
  for select to authenticated using (true);

insert into public.products (id, nome, descricao, preco, tem_numero) values
  ('completo', 'Uniforme Equipe', 'Short + Camisa com nome e número', 78.00, true),
  ('torcida', 'Camisa Torcida', 'Camisa somente com o nome', 55.00, false);

-- Pedidos
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  buyer_name text not null,
  contact text not null default '',
  payment_method text not null check (payment_method in ('mercado_pago','dinheiro')),
  status text not null default 'aguardando_pagamento'
    check (status in ('aguardando_pagamento','standby','pago','parcial','cancelado')),
  valor_total numeric(10,2) not null default 0,
  valor_pago numeric(10,2) not null default 0,
  mp_preference_id text,
  mp_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.orders enable row level security;

create policy "users see own orders, admins see all" on public.orders
  for select using (auth.uid() = user_id or public.is_admin());
create policy "admins update orders" on public.orders
  for update using (public.is_admin());
-- Sem policy de insert/delete: criação só pela função criar_pedido() (SECURITY DEFINER).

-- Itens do pedido
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  produto text not null references public.products(id),
  tamanho text not null check (tamanho in ('PP','P','M','G','GG','XG','XXG')),
  nome_camisa text not null,
  numero smallint check (numero between 2 and 99),
  valor numeric(10,2) not null,
  reservado boolean not null default false
);
alter table public.order_items enable row level security;

create policy "users see own order items, admins see all" on public.order_items
  for select using (
    exists (select 1 from public.orders o where o.id = order_items.order_id and (o.user_id = auth.uid() or public.is_admin()))
  );

-- Um número de uniforme completo só pode estar "reservado" (standby ou pago) em um único item por vez
create unique index ux_order_items_numero_reservado
  on public.order_items (numero)
  where produto = 'completo' and reservado = true;

-- Visão pública (só o número, sem dados do comprador) dos números já reservados
create view public.numeros_reservados as
  select numero from public.order_items where produto = 'completo' and reservado = true;
grant select on public.numeros_reservados to authenticated;

-- Mantém order_items.reservado sincronizado quando o status do pedido muda
-- (ex.: admin confirma dinheiro, ou webhook do Mercado Pago aprova o pagamento)
create or replace function public.sync_reservado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status is distinct from OLD.status then
    update public.order_items
      set reservado = (NEW.status in ('pago','standby'))
      where order_id = NEW.id;
  end if;
  return NEW;
end;
$$;

create trigger on_order_status_change
  after update on public.orders
  for each row execute function public.sync_reservado();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

create trigger set_orders_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

-- Cria um pedido de forma atômica: valida prazo, forma de pagamento, itens,
-- calcula o valor a partir do catálogo (nunca confia no preço enviado pelo
-- cliente) e reserva números de uniforme completo com segurança contra
-- concorrência (a unique index acima garante isso mesmo sob corrida).
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

    if v_tamanho not in ('PP','P','M','G','GG','XG','XXG') then
      raise exception 'Tamanho inválido.';
    end if;

    if v_tem_numero then
      if v_numero is null or v_numero < 2 or v_numero > 99 then
        raise exception 'Escolha um número entre 2 e 99.';
      end if;
    else
      v_numero := null;
    end if;

    insert into public.order_items (order_id, produto, tamanho, nome_camisa, numero, valor, reservado)
    values (v_order_id, v_produto, v_tamanho, v_nome, v_numero, v_preco, v_status in ('pago','standby'));

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

grant execute on function public.criar_pedido(text, text, text, jsonb) to authenticated;
