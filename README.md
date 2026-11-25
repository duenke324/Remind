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

**Actions → Instaladores → Run workflow** → ramo `main` → liga **Lançar versão** → **Run workflow**.

O workflow usa sempre o `main` atual, escolhe a versão seguinte à última Release (ou a que escreveres no
campo *Versão*), gera o `.exe` (Windows) e os `.dmg` (Mac Apple Silicon e Intel), verifica que o instalador
conhece o servidor e que a app do Mac está assinada, e só então cria a Release com os ficheiros (~12 min).
Não é preciso mudar a versão no `package.json`: o número entra na app durante o build.

Também funciona publicar uma Release à mão (**Releases → Draft a new release**): os instaladores são gerados
e anexados. Atenção: a Release usa o `main` do momento em que a página foi aberta.

### Servidor de contas dentro dos instaladores

Os instaladores ligam-se ao endereço em `apps/desktop/.env.production` (`MAIN_VITE_SERVER_URL`), hoje
`https://remind-server.vercel.app`. Em desenvolvimento (`npm run dev`) a app usa o servidor local.

### Downloads públicos (botões do site)

O repositório é público, por isso os botões do site apontam diretamente para a última Release deste
repositório (`releases/latest/download/...`): o download começa logo, sem passar por nenhuma página.
Cada versão lançada fica disponível nos botões do site logo que a Release tem os ficheiros.

Para gerar instaladores sem criar Release: **Run workflow** com **Lançar versão** desligado (ficam em "Artifacts").

> Os instaladores ainda não são assinados: o Windows mostra um aviso do SmartScreen ("Mais informações → Executar mesmo assim") e, no Mac, é preciso abrir em **Definições → Privacidade e segurança → Abrir mesmo assim** (a app tem assinatura ad-hoc, sem notarização da Apple).
