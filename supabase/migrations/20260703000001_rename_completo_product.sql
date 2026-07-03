-- Alinha o nome exibido do produto com o termo usado no site: "Uniforme
-- Completo" (antes "Uniforme Equipe"). Só o nome muda; id/preço/descrição
-- continuam os mesmos.
update public.products set nome = 'Uniforme Completo' where id = 'completo';
