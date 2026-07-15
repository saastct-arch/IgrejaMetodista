-- Novo sistema de tamanhos: cada item passa a ter um gênero
-- (masculina/feminina/infantil), que determina quais tamanhos são válidos.
--   masculina: P, M, G, GG, EG, EGG
--   feminina:  P, M, G, GG            (sem EG/EGG)
--   infantil:  2A, 4A, 6A, 8A, 10A, 12A, 14A

alter table public.order_items add column genero text;

-- dado existente (1 pedido de teste, já cancelado) recebe um valor
-- provisório só para não quebrar o NOT NULL/CHECK abaixo.
update public.order_items set genero = 'masculina' where genero is null;

alter table public.order_items alter column genero set not null;

alter table public.order_items drop constraint order_items_tamanho_check;

alter table public.order_items add constraint order_items_genero_check
  check (genero in ('masculina','feminina','infantil'));

alter table public.order_items add constraint order_items_tamanho_genero_check
  check (
    (genero = 'infantil' and tamanho in ('2A','4A','6A','8A','10A','12A','14A'))
    or (genero = 'masculina' and tamanho in ('P','M','G','GG','EG','EGG'))
    or (genero = 'feminina' and tamanho in ('P','M','G','GG'))
  );
