-- Visões agregadas para transparência financeira: nenhum dado de comprador
-- é exposto aqui (nome, contato, etc.), só números somados. Por serem views
-- comuns (não SECURITY INVOKER) criadas pelo dono das tabelas, elas enxergam
-- todos os pedidos independentemente da RLS de orders/order_items, e por
-- isso podem ser liberadas para qualquer usuário autenticado.

create view public.resumo_geral as
select
  (select count(*) from public.orders where status <> 'cancelado') as total_pedidos,
  (select count(*) from public.order_items oi join public.orders o on o.id = oi.order_id
     where o.status <> 'cancelado' and oi.produto = 'completo') as total_completos,
  (select count(*) from public.order_items oi join public.orders o on o.id = oi.order_id
     where o.status <> 'cancelado' and oi.produto = 'torcida') as total_torcida,
  (select coalesce(sum(valor_pago), 0) from public.orders where status <> 'cancelado') as total_arrecadado,
  (select coalesce(sum(valor_total - valor_pago), 0) from public.orders
     where status in ('aguardando_pagamento', 'standby', 'parcial')) as total_pendente;

grant select on public.resumo_geral to authenticated;

create view public.resumo_por_tamanho as
select oi.tamanho, count(*) as quantidade
from public.order_items oi
join public.orders o on o.id = oi.order_id
where o.status <> 'cancelado'
group by oi.tamanho;

grant select on public.resumo_por_tamanho to authenticated;
