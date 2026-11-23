# Plano — Remind: app tipo Notion para desktop

Estado: **aprovado a 23/11/2026 — Fase 0 em curso**.

Nota sobre o REA: o utilizador decidiu usá-lo. Corre no PC dele (Windows, onde está o Notion), não neste servidor, e serve só para observar como a app funciona. Ver a tabela de Decisões.

## 0. Crítica direta (ler primeiro)

1. **"Copiar o Notion em todos os aspetos" não é um objetivo, é uma década de trabalho de centenas de engenheiros.** O plano entrega por fases; cada fase é uma app usável e testada.
2. **Copiamos funcionalidades, nunca a marca nem o código.** Nome, logótipo, ícones, textos e design visual são originais. Funcionalidades (blocos, páginas, bases de dados) não são protegidas; código, marca e assets são.
3. **O REA não é a ferramenta certa aqui.** É uma ferramenta de engenharia reversa (decompilar apps). Os Termos do Notion proíbem engenharia reversa da app, e o próprio aviso do REA diz que não ajuda a "copiar software proprietário". Além disso, o Notion desktop está no teu PC, não neste servidor, e a execução do REA aqui foi bloqueada. Proposta: não decompilar o Notion; usamos o comportamento visível como utilizador + bibliotecas open-source (BlockNote, Yjs), que é mais rápido e legal.
4. **Contas = é preciso um servidor.** Uma app desktop com login Google/GitHub e OTP por email precisa de backend, base de dados e serviço de email. Não há forma de evitar isto.
5. **.dmg só se gera em macOS.** Resolvo com GitHub Actions (máquina macOS na cloud). Sem assinatura paga, o Windows mostra aviso do SmartScreen e o macOS bloqueia a app até o utilizador a autorizar nas Definições.
6. **GitHub:** o token desta sessão é inválido, não consigo criar o repositório. Tens de o criar tu (vazio, privado) e reconectar o GitHub ao Claude; depois eu faço tudo o resto.

## 1. Stack proposta

| Camada | Escolha | Porquê |
| --- | --- | --- |
| App desktop | Electron + React + TypeScript (electron-vite) | Igual ao Notion desktop; um código para Windows e macOS |
| Editor de blocos | BlockNote (sobre ProseMirror/Tiptap) | Comando "/", arrastar blocos, atalhos markdown já feitos |
| Dados locais / sync | Yjs (CRDT) + armazenamento local | Funciona offline; base para colaboração em tempo real |
| Backend + contas | Better Auth em Vercel + Postgres no Supabase | Better Auth tem 2FA por OTP de email nativo + Google + GitHub; já usas Vercel e Supabase |
| Email | Resend (com domínio) ou Gmail SMTP | Envio dos códigos OTP |
| Instaladores | electron-builder → .exe (NSIS) e .dmg | Gerados no GitHub Actions a cada versão |
| Testes | Vitest (unidade), Playwright (E2E da app Electron), testes de integração do backend | Testes antes de cada funcionalidade (TDD) |

## 2. Fases

### Fase 0 — Provas de risco ("testes antes de tudo")
Antes de escrever a app, provo que cada dependência externa funciona:
- push para o repo GitHub; CI a correr
- electron-builder gera um .exe "olá mundo"; GitHub Actions gera um .dmg
- Postgres no Supabase acessível; Better Auth a criar uma conta de teste
- envio real de um email OTP
- login Google e GitHub a voltar à app desktop (deep link `remind://`)
**Verificado quando:** cada prova tem um teste automático verde. Se alguma falhar, paro e digo-te antes de avançar.

### Fase 1 — Contas (MVP de autenticação)
- Ecrã de criar conta / entrar (email + palavra-passe)
- Verificação do email ao criar conta
- **2FA: código OTP de 6 dígitos por email em cada login**
- Entrar/criar conta com **Google** e **GitHub** (abre o browser, volta à app)
- Recuperar palavra-passe, terminar sessão, lista de sessões
- Limite de tentativas e expiração de códigos (10 min)
**Verificado quando:** testes E2E cobrem registo → OTP → entrada, e OAuth testado manualmente contigo.

### Fase 2 — Núcleo do editor
- Sidebar com árvore de páginas (subpáginas, arrastar, favoritos, lixo/restaurar)
- Editor de blocos: texto, títulos, listas, to-do, toggle, citação, callout, código, divisor, imagem; menu "/"; arrastar blocos; atalhos markdown
- Ícone e capa da página, pesquisa rápida (Ctrl+K), tema claro/escuro, PT-PT/EN
- Funciona offline; sincroniza com a cloud quando há ligação
**Verificado quando:** E2E cria/edita/move/apaga páginas e os dados sobrevivem a reiniciar a app e a sincronizar noutra máquina.

### Fase 3 — Bases de dados
Tabela, quadro (kanban), lista, calendário, galeria; propriedades (texto, número, seleção, data, pessoa, checkbox, URL, relação, fórmula simples); filtros, ordenação, agrupamento.

### Fase 4 — Colaboração
Partilha de páginas, permissões, edição em tempo real, comentários, menções, histórico de versões.

### Fase 5 — Extras
Templates, importar export do Notion (ZIP Markdown/CSV), exportar Markdown/PDF, publicar página na web, IA (Claude) no editor.

### Instaladores
A partir da Fase 1, cada versão publica .exe e .dmg nas Releases do GitHub.

## 3. O que tu tens de fazer (não consigo fazer por ti)
1. Criar repo vazio privado no GitHub (ex.: `duenke324/remind`) e reconectar o GitHub em claude.ai/connect-github.
2. Criar projeto Supabase novo (ou dar-me acesso) — chaves entram por formulário seguro, nunca no chat.
3. Criar credenciais OAuth: Google Cloud Console e GitHub OAuth App (dou-te o passo-a-passo).
4. Conta Resend (+ domínio) ou password de app do Gmail.
5. Testar os instaladores no teu Windows (e num Mac, se tiveres).

## 4. Notion (organizar as ideias)
Feito: criei no teu Notion uma página "Remind — Projeto" com: visão, esta crítica, base de dados **Roadmap** (fase, tarefa, estado, prioridade), registo de **Decisões**, e checklist de credenciais (sem segredos), no mesmo formato dos teus outros projetos (HelpDesk, PAP).

## Sempre / Nunca
- Sempre: testes antes do código; segredos só em variáveis de ambiente; repo privado.
- Nunca: logótipo, nome, ícones, textos ou código do Notion; decompilar o Notion; segredos no Git ou no chat.
- Fora de âmbito por agora: app web, app de telemóvel, Linux, assinatura paga dos instaladores.

## Decisões
| Decisão | Escolha | Porquê |
| --- | --- | --- |
| Nome | Remind | Escolha do utilizador; risco de marca (remind.com, app escolar) aceite conscientemente |
| Uso do REA | Sim, só no PC do utilizador, só para observar comportamento e arquitetura da app Notion (ex.: módulos Electron, IPC, área de transferência); análise JS estática, sem motor nativo | Pedido do utilizador. Limites: nenhum código, asset ou texto do Notion entra no repo; o código do Remind é escrito de raiz. O risco perante os Termos do Notion é do utilizador |
| Backend e contas | Better Auth em Vercel + Postgres no Supabase | OTP por email como 2FA nativo, Google e GitHub; stack que o utilizador já conhece |
| Envio de email | Gmail SMTP com password de app | Sem domínio próprio; limite ~500/dia, serve para beta. Trocar para Resend quando houver domínio |
| Âmbito | Fases 0–2 primeiro, paragem para o utilizador testar, depois Fase 3+ | Menos risco; .exe/.dmg usáveis cedo |

## Progresso
| Fase | Estado |
| --- | --- |
| 0 Provas de risco | em curso |
| 1 Contas | por começar |
| 2 Editor | por começar |
| 3 Bases de dados | por começar |
| 4 Colaboração | por começar |
| 5 Extras | por começar |
