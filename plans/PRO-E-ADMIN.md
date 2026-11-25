# Remind Pro + painel de admin — plano

Decisões (25/11/2026): pagamentos com **Stripe**; **2,99 €/mês ou 24 €/ano**; admin em **admin.remind.uno**;
Pro com os 4 benefícios abaixo. Nada é anunciado no site ou na app antes de funcionar.

## O que a pessoa ganha

| | Grátis | Pro |
|---|---|---|
| Páginas | até 50 | ilimitadas |
| Imagens e ficheiros nas páginas | — | até 10 GB |
| Histórico de versões | último dia | 30 dias, com recuperar |
| Exportar | — | PDF e Markdown |
| Importar do Notion (export Markdown) | — | sim |
| Temas de cor + distintivo Pro | — | sim |
| Calendário com o Google (ver e editar eventos) | calendário principal | todos os calendários |
| Sincronização, 2 passos, offline | sim | sim |

Quem deixa de pagar não perde nada: as páginas acima do limite ficam só de leitura até apagar ou voltar ao Pro;
os ficheiros continuam visíveis mas não se carregam novos.

## Fases (cada uma é um PR com testes; só junto com o teu "sim")

1. **Base de planos e admin no servidor**
   - Plugin `admin` do Better Auth: papel `admin`, banir/desbanir, terminar sessões, apagar conta.
   - Tabela `entitlement` (plano, origem: stripe/manual, até quando) e função única `planOf(user)`.
   - Limite de 50 páginas para contas grátis, validado no servidor (a app não consegue contornar).
   - Registo de ações de admin (`admin_audit`): quem fez o quê a quem e quando.
   - Primeiros admins definidos por `ADMIN_EMAILS` na Vercel.
2. **Painel admin.remind.uno**
   - Mesma origem que o servidor (projeto remind-server), por isso sem CORS nem cookies partilhados.
   - Entrar: email + password + código 2FA; só papel `admin`.
   - Utilizadores: procurar, filtrar (grátis/Pro/banidos/por verificar), detalhe (páginas, espaço usado,
     sessões, plano, pagamentos), dar/retirar Pro manualmente, banir, terminar sessões, apagar.
   - Números: total de contas, novas por semana, Pro ativos, receita mensal (MRR), cancelamentos.
3. **Pagamentos Stripe**
   - Plugin `@better-auth/stripe`: cliente Stripe por conta, Checkout, portal de faturação, webhooks.
   - Produto "Remind Pro" com preço mensal 2,99 € e anual 24 €; Stripe Tax para o IVA.
   - Na app: ecrã "Remind Pro" com benefícios; o pagamento abre no browser e a app atualiza sozinha.
4. **Benefícios Pro**
   - Ficheiros: Supabase Storage privado, URLs assinadas, quota 10 GB, imagens no editor.
   - Histórico: `page_version` (uma versão a cada 5 min de edição), painel para ver e recuperar.
   - Exportar PDF (impressão do Electron) e Markdown; importar a exportação Markdown do Notion.
   - Temas de cor e distintivo Pro.
5. **Calendário** (pedido a 25/11): separador Calendário na app (mês/semana/dia) ligado ao Google Calendar.
   - Ligar a conta Google a partir da app (abre o browser; o Remind só guarda o acesso no servidor).
   - Ver, criar, editar e apagar eventos; as alterações aparecem no Google e vice-versa.
   - Grátis: só o calendário principal. Pro: todos os calendários da conta.
   - Precisa de um projeto no Google Cloud com a Google Calendar API e um cliente OAuth (o mesmo serve para
     o "Entrar com Google"). Até a Google rever a app, só até 100 contas de teste podem ligar o calendário;
     a revisão pede política de privacidade e termos em remind.uno.
6. **Site**: secção de preços em remind.uno + página "Pro"; termos e privacidade.

## O que preciso de ti

- Conta Stripe (stripe.com) com os teus dados e IBAN; chaves postas só na Vercel.
- Atividade aberta nas Finanças antes de cobrar a sério; com Stripe as faturas certificadas pela AT
  ficam do teu lado (ex.: InvoiceXpress/Moloni ligado ao Stripe). Confirmar com um contabilista.
- O email da tua conta Remind para seres o primeiro admin.
- Projeto no Google Cloud (guio-te passo a passo) para o calendário e o login com Google.
