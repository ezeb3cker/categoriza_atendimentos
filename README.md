# Categorize Care

Aplicação React + Vite para categorização/finalização de atendimentos.

## Requisitos

- Node.js 18+ (recomendado Node 20 LTS)
- npm 9+

## Rodar localmente

```bash
npm install
npm run dev
```

## Build de produção

```bash
npm run build
npm run preview
```

## Deploy na Vercel

Este projeto já está pronto para Vercel com:

- `framework: vite` em `vercel.json`
- rewrite para SPA (`/(.*) -> /index.html`)
- `.gitignore` com `node_modules`, `dist` e `.vercel`

### Passo a passo

1. Suba este projeto para um repositório no GitHub.
2. Acesse a [Vercel](https://vercel.com/) e clique em **Add New Project**.
3. Importe o repositório do GitHub.
4. A Vercel detectará Vite automaticamente:
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Clique em **Deploy**.

## Publicar no GitHub (rápido)

No terminal do projeto:

```bash
git init
git add .
git commit -m "chore: prepare project for GitHub and Vercel"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
git push -u origin main
```

