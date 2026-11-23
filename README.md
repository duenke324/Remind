# Remind

App de desktop (Windows e macOS) para escrever e organizar tudo em páginas feitas de blocos: notas, documentos, tarefas e bases de dados, com contas na cloud e sincronização.

> Estado: v0.1.0 — contas com verificação em dois passos por email, editor de blocos, sincronização offline. Ver [`plans/PLANO.md`](plans/PLANO.md).

## Estrutura

```
apps/desktop   app Electron + React + TypeScript (gera o .exe e o .dmg)
apps/server    backend de contas (Better Auth) — Vercel + Postgres no Supabase
plans/         plano e decisões do projeto
```

## Comandos

```bash
npm install          # instala tudo (workspaces)
npm run dev          # abre a app em modo desenvolvimento
npm test             # corre os testes
npm run lint         # verifica tipos
```

## Publicar uma versão

1. Sobe a versão em `apps/desktop/package.json` (ex.: `0.2.0`) e junta ao `main`.
2. No GitHub: **Releases → Draft a new release**, cria a tag `v0.2.0` a partir do `main` e carrega em **Publish release**.
3. O workflow **Instaladores** gera o `.exe` (Windows) e os `.dmg` (Mac Apple Silicon e Intel) e anexa-os à Release (~3 min).

### Servidor de contas dentro dos instaladores

Os instaladores ligam-se ao endereço em `apps/desktop/.env.production` (`MAIN_VITE_SERVER_URL`), hoje
`https://remind-server.vercel.app`. Em desenvolvimento (`npm run dev`) a app usa o servidor local.

### Downloads públicos (botões do site)

O código é privado; os instaladores ficam no repositório **público** `duenke324/remind-downloads`, para onde
apontam os botões do site (o download começa logo, sem passar por nenhuma página).

Configuração (uma vez):
1. Criar o repositório público `remind-downloads` com um README.
2. Criar um token *fine-grained* com acesso só a esse repositório e permissão **Contents: Read and write**.
3. Em `remind` → Settings → Secrets and variables → Actions, criar o segredo `DOWNLOADS_TOKEN` com esse token.

A partir daí, cada Release publicada aparece também nos downloads públicos. Para publicar a versão atual
sem criar Release: **Actions → Instaladores → Run workflow → Publicar nos downloads públicos**.

Para gerar instaladores sem criar Release: **Actions → Instaladores → Run workflow** (ficam em "Artifacts").

> Os instaladores ainda não são assinados: o Windows mostra um aviso do SmartScreen ("Mais informações → Executar mesmo assim") e, no Mac, é preciso abrir em **Definições → Privacidade e segurança → Abrir mesmo assim**.
