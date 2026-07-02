# Metodista Timóteo F.C. · Loja de Uniformes

Site de vendas dos uniformes do time Metodista Timóteo F.C., da Igreja Metodista (Uniforme Equipe e Camisa Torcida).

## Status atual

- `index.html` — login e cadastro. Cadastro **não exige clique em link de confirmação por e-mail**: um trigger no banco (`auto_confirm_email_on_signup`) confirma o e-mail automaticamente na hora da criação da conta, e o cliente já entra em seguida com a senha recém-criada.
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

**Credenciais do Mercado Pago: PRODUÇÃO ATIVA (02/07/2026).** O `MP_ACCESS_TOKEN` na tabela `app_secrets` é o Access Token real da conta do time — pagamentos por Cartão/Pix a partir de agora cobram dinheiro de verdade. O token nunca fica em nenhum arquivo do repositório, só no banco, e só o `service_role` das Edge Functions consegue lê-lo. Public Key, Client ID e Client Secret enviados junto **não foram armazenados**, porque a integração atual (Checkout Pro) só precisa do Access Token.

Prazo de pedidos: bloqueado automaticamente após 27/07/2026, tanto na tela quanto na função do banco que cria o pedido.

## Segurança (revisão de 02/07/2026)

Rodei uma revisão de segurança no schema e nas Edge Functions. Corrigidos:

- **Crítico — auto-promoção a admin**: a policy de UPDATE de `profiles` permitia, sem querer, que qualquer usuário alterasse a própria coluna `is_admin` direto pela API. Corrigido com privilégio de coluna (`authenticated` só pode alterar `full_name`/`phone`) + um trigger de defesa extra que reverte qualquer mudança de `is_admin` feita por quem não é admin. Testado: tentativa de auto-promoção agora falha com "permission denied"; edição do próprio nome continua funcionando normalmente.
- **Open redirect no checkout do Mercado Pago**: o `origin` enviado pelo cliente para montar os `back_urls` só era validado com `startsWith("http")`. Agora há uma lista de domínios permitidos (`localhost`, `*.vercel.app`, e um lugar reservado para o domínio de produção) em `criar-preferencia-mp`.
- **Hardening de funções**: `search_path` fixo em `touch_updated_at`; removido o `EXECUTE` que o Supabase concede por padrão a `anon`/`authenticated` em funções que não precisam disso (`sync_reservado`, `handle_new_user`, `protect_profile_admin_flag` só rodam via trigger; `criar_pedido`/`is_admin` continuam liberadas só para `authenticated`, que é quem realmente precisa).

Não corrigido (achado de baixa severidade, aceito por ora): pedidos em dinheiro reservam o número imediatamente sem qualquer pagamento verificado, então em tese alguém poderia criar contas e travar vários números sem nunca pagar — hoje isso só se resolve cancelando manualmente pelo painel admin.

## Design (revisão de 02/07/2026)

- Tipografia trocada de Source Serif 4 + IBM Plex Sans + IBM Plex Mono para uma família única, **Inter**, em todo o site — visual mais sóbrio/corporativo, menos "template pronto".
- Marca do time em toda a navegação e títulos de página: **Metodista Timóteo F.C.** (antes "Loja de Uniformes").
- Mobile: no login/cadastro/redefinição de senha, o formulário agora aparece antes do painel de marca (antes era preciso rolar a tela toda pra achar o campo de e-mail). No cabeçalho das páginas internas, a navegação virou uma faixa de abas rolável abaixo da marca, em vez de espremer tudo numa única linha. Painel admin com botões de ação empilhados em largura total no celular.

## Backend (Supabase)

- `supabase/migrations/` — histórico do schema (perfis/admin, produtos, pedidos, itens, tabela de segredos). Aplicadas diretamente no projeto; guardadas aqui só como referência/documentação.
- `supabase/functions/` — código das Edge Functions `criar-preferencia-mp` e `mp-webhook`, já implantadas no projeto.

## Próximos passos possíveis

Todas as páginas do plano inicial estão prontas. Ideias para depois, se fizer sentido:

- Tela dedicada de redefinição de e-mail admin / gestão de quem é admin pela interface (hoje é só por SQL).
- Notificação (e-mail/WhatsApp) automática quando um pedido é confirmado.
- Página de "sobre o time" / fotos, se quiserem dar mais cara de loja à `pedido.html`.
