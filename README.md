# Igreja Metodista · Loja de Uniformes

Site de vendas dos uniformes do time da Igreja Metodista (Uniforme Equipe e Camisa Torcida).

## Status atual

- `index.html` — login e cadastro.
- `redefinir-senha.html` — redefinição de senha (link enviado por e-mail).
- `pedido.html` — Montar pedido: escolha de produto (Uniforme Equipe / Camisa Torcida), tamanho, nome, número (2–99, exclusivo por uniforme completo), carrinho e checkout.
- `pedido-confirmado.html` — página de retorno do Mercado Pago, mostra o status do pagamento.
- `meus-pedidos.html` — histórico dos próprios pedidos do comprador, com status e botão para retomar um pagamento pendente.
- `resumo.html` — transparência financeira: totais agregados de todos os compradores (pedidos, arrecadado, a receber, peças por tamanho), sem expor dados pessoais. Visível a qualquer usuário logado.
- `admin.html` — painel restrito aos e-mails admin: lista todos os pedidos com contato via WhatsApp, confirma pagamento em dinheiro, edita status/valor pago, cancela pedidos, alerta conflito de número e exporta CSV.

O link "Admin" só aparece na navegação para quem tem `is_admin = true`; a página em si também redireciona quem não é admin de volta para `pedido.html`.

Backend: Supabase (autenticação por e-mail/senha, banco de dados com Row Level Security, e Edge Functions para o pagamento).

### Pagamento

- **Dinheiro**: o pedido é criado com status `standby` (número já fica reservado) e aguarda o admin confirmar o recebimento — isso ainda será feito na futura página de admin.
- **Mercado Pago (Checkout Pro)**: redireciona para a página de pagamento do Mercado Pago. A confirmação chega por webhook (`mp-webhook`), que consulta o pagamento direto na API do Mercado Pago antes de marcar o pedido como pago (nunca confia no retorno do navegador).

**Credenciais do Mercado Pago:** configuradas com o Access Token de um usuário de teste (`APP_USR-...`), guardado na tabela `app_secrets` (só o `service_role` das Edge Functions consegue ler; nunca fica em nenhum arquivo do repositório). Como o vendedor é uma conta de teste, todo pagamento feito é automaticamente simulado — nenhum valor real é cobrado. Para testar uma compra até o fim, use um cartão de teste do Mercado Pago no checkout, por exemplo:
  - Mastercard `5031 4332 1540 6351`, CVV `123`, validade `11/30`
  - Nome do titular `APRO` → pagamento aprovado · `OTHE` → recusado · `CONT` → pendente

Quando o time tiver a conta real do Mercado Pago pronta para produção, basta trocar o valor de `MP_ACCESS_TOKEN` na tabela `app_secrets` pelo Access Token de produção (`APP_USR-...` da conta real).

Prazo de pedidos: bloqueado automaticamente após 27/07/2026, tanto na tela quanto na função do banco que cria o pedido.

## Backend (Supabase)

- `supabase/migrations/` — histórico do schema (perfis/admin, produtos, pedidos, itens, tabela de segredos). Aplicadas diretamente no projeto; guardadas aqui só como referência/documentação.
- `supabase/functions/` — código das Edge Functions `criar-preferencia-mp` e `mp-webhook`, já implantadas no projeto.

## Próximos passos possíveis

Todas as páginas do plano inicial estão prontas. Ideias para depois, se fizer sentido:

- Tela dedicada de redefinição de e-mail admin / gestão de quem é admin pela interface (hoje é só por SQL).
- Notificação (e-mail/WhatsApp) automática quando um pedido é confirmado.
- Página de "sobre o time" / fotos, se quiserem dar mais cara de loja à `pedido.html`.
