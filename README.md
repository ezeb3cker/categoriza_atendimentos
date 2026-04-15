# Categoriza atendimentos

Aplicação **React + Vite** usada na extensão (WlExtension) para consultar lead/campanha e **atualizar o status** do atendimento.

## Requisitos

- Node.js **18+** (recomendado 20 LTS)
- npm **9+**

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

O resultado da build fica em `dist/`.

---

## Publicar no GitHub (novo repositório)

1. No GitHub, crie um **repositório vazio** (sem README, sem `.gitignore` gerado pelo site, para evitar conflito no primeiro push).
2. No terminal, na pasta do projeto:

```bash
git status
git add .
git commit -m "chore: projeto inicial para deploy"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
git push -u origin main
```

Se o projeto **já tiver** um `origin` apontando para outro repositório:

```bash
git remote remove origin
git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
git push -u origin main
```

### O que não deve ir para o Git

O `.gitignore` já ignora `node_modules/`, `dist/`, `.vercel/`, `.env` e arquivos de log. Não faça commit dessas pastas.

---

## Deploy na Vercel

O repositório já inclui `vercel.json` com:

- **Framework**: Vite (`framework: vite`)
- **SPA**: rewrites para `index.html` (útil se no futuro houver rotas no client)

### Passo a passo

1. Faça login na [Vercel](https://vercel.com/) e conecte sua conta ao **GitHub**.
2. **Add New → Project** e importe o repositório deste app.
3. Deixe os padrões (a Vercel detecta Vite):
   - **Install Command**: `npm install`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Clique em **Deploy**.

Cada push na branch configurada (geralmente `main`) dispara um novo deploy.

### Variáveis de ambiente

Hoje as URLs da API estão fixas no código. Se no futuro você mover endpoints para variáveis, cadastre-as em **Project → Settings → Environment Variables** na Vercel e use `import.meta.env.VITE_...` no Vite.
