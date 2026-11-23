# Remind

App de desktop (Windows e macOS) para escrever e organizar tudo em páginas feitas de blocos: notas, documentos, tarefas e bases de dados, com contas na cloud e sincronização.

> Estado: em desenvolvimento (Fase 0 — provas de risco). Ver [`plans/PLANO.md`](plans/PLANO.md).

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

Os instaladores (.exe e .dmg) são gerados pelo GitHub Actions e publicados nas Releases.
