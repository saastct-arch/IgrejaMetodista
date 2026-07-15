drop view public.resumo_por_tamanho;

create view public.resumo_por_tamanho as
select oi.genero, oi.tamanho, count(*) as quantidade
from public.order_items oi
join public.orders o on o.id = oi.order_id
where o.status <> 'cancelado'
group by oi.genero, oi.tamanho;

grant select on public.resumo_por_tamanho to authenticated;
