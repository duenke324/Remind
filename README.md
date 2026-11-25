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

O repositório é público, por isso os botões do site apontam diretamente para a última Release deste
repositório (`releases/latest/download/...`): o download começa logo, sem passar por nenhuma página.
Cada Release publicada (tag `vX.Y.Z`) gera os instaladores e anexa-os automaticamente.

Se um dia o código passar a privado, os instaladores podem ir para um repositório público à parte
(`remind-downloads`): basta criar o segredo `DOWNLOADS_TOKEN` (token com **Contents: Read and write** só nesse
repositório) e mudar `VITE_DOWNLOAD_BASE` no site.

Para gerar instaladores sem criar Release: **Actions → Instaladores → Run workflow** (ficam em "Artifacts").

> Os instaladores ainda não são assinados: o Windows mostra um aviso do SmartScreen ("Mais informações → Executar mesmo assim") e, no Mac, é preciso abrir em **Definições → Privacidade e segurança → Abrir mesmo assim** (a app tem assinatura ad-hoc, sem notarização da Apple).
