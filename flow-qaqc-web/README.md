# Flow-QA/QC — Web

Landing page del sistema Flow-QA/QC con infografía y walkthrough interactivo.

## Instalación

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

## Deploy en Vercel

### Opción 1 — Vercel CLI (recomendado)
```bash
npm install -g vercel
vercel
```

### Opción 2 — GitHub + Vercel
1. Sube este proyecto a GitHub
2. Entra a [vercel.com](https://vercel.com)
3. Importa el repositorio
4. Click en Deploy — listo

## Estructura

```
app/
├── page.tsx              ← Página de inicio
├── infografia/
│   └── page.tsx          ← Infografía de las 7 funcionalidades
└── walkthrough/
    ├── page.tsx           ← Flujo de uso completo
    ├── WalkthroughClient.tsx
    └── walkthroughContent.ts  ← HTML + imágenes base64 embebidas
```

## Rutas

- `/` → Inicio con acceso a las dos secciones
- `/infografia` → Infografía vertical de Flow-QA/QC
- `/walkthrough` → Product walkthrough con pantallas reales
