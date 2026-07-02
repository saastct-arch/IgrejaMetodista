# Igreja Metodista · Loja de Uniformes

Site de vendas dos uniformes do time da Igreja Metodista (Uniforme Equipe e Camisa Torcida).

## Status atual

- `index.html` — login e cadastro.
- `redefinir-senha.html` — redefinição de senha (link enviado por e-mail).
- `pedido.html` — Montar pedido: escolha de produto (Uniforme Equipe / Camisa Torcida), tamanho, nome, número (2–99, exclusivo por uniforme completo), carrinho e checkout.
- `pedido-confirmado.html` — página de retorno do Mercado Pago, mostra o status do pagamento.

Backend: Supabase (autenticação por e-mail/senha, banco de dados com Row Level Security, e Edge Functions para o pagamento).

### Pagamento

- **Dinheiro**: o pedido é criado com status `standby` (número já fica reservado) e aguarda o admin confirmar o recebimento — isso ainda será feito na futura página de admin.
- **Mercado Pago (Checkout Pro)**: redireciona para a página de pagamento do Mercado Pago. A confirmação chega por webhook (`mp-webhook`), que consulta o pagamento direto na API do Mercado Pago antes de marcar o pedido como pago (nunca confia no retorno do navegador).

**Configuração pendente:** falta cadastrar o `MP_ACCESS_TOKEN` (de teste, por enquanto) como *secret* da Edge Function no painel do Supabase (Project Settings → Edge Functions → Secrets) para os pagamentos online funcionarem. Sem isso, a opção "Cartão / Pix" mostra um aviso e a pessoa pode optar por pagar em dinheiro normalmente.

Prazo de pedidos: bloqueado automaticamente após 27/07/2026, tanto na tela quanto na função do banco que cria o pedido.

## Próximas páginas (a confirmar com o cliente)

- Meus Pedidos
- Resumo de arrecadação (transparência financeira)
- Área administrativa (todos os pedidos, confirmar pagamento em dinheiro, exportar CSV)
