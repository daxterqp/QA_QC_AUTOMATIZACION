# Plan 002 — Motion web (Next.js + Tailwind)

Valores canónicos (AUDIT.md):
- `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`
- `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`
- `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`
- Modales: opacity 0→1 + scale(0.96→1), 200–250ms ease-out; overlay fade 200ms.
- Bottom-sheets (calculadoras, `items-end`): translateY(16px)→0 + fade.
- Press: `active:scale-[0.98]` transform 120ms.
- Reduced motion: conservar opacidad/color, quitar movimiento.

## Pasos

1. **Tokens** — `app/globals.css` `:root`: las 3 vars de arriba.
   `tailwind.config.ts` → `transitionTimingFunction: { smooth: 'var(--ease-out)',
   'smooth-in-out': 'var(--ease-in-out)', drawer: 'var(--ease-drawer)' }`.
2. **Entradas de modal** — en globals.css: `@keyframes modalIn` (opacity 0 +
   scale(.96) → 1) y `@keyframes overlayIn` (opacity) + clases `.modal-overlay-in`
   (200ms ease-out both) y `.modal-panel-in` (220ms var(--ease-out) both);
   `.sheet-panel-in` (translateY(16px)+opacity, 260ms var(--ease-drawer)).
   Aplicar a: ProjectConfigModal:115, LabelPrintModal:86, MatricesModal:23,
   UserResolutionModal:75, ImportSummaryModal:33, TopoCargaModal:147 (panel+overlay)
   y a las 4 calculadoras bottom-sheet (TileCalculator:62, VolumeCalculator:42,
   BrickCalculator:77, RepeatPromptModal:43) con `.sheet-panel-in` en `items-end`.
3. **prefers-reduced-motion** (ALTA) — bloque en globals.css: bajo
   `@media (prefers-reduced-motion: reduce)` apagar `.flow-a1..a3/.flow-b1..b3`
   (waves), `spin-slow`, `float-drift`, `pulse-glow`, `grid-reveal`,
   `sweep-right`, `shine-swipe`, `flowPulseGlow/flowSparkle` (animation: none)
   y acortar `.modal-panel-in/.sheet-panel-in` a solo opacity.
4. **Toggle file-upload:869,939** — `left-[22px]/left-0.5 + transition-all` →
   `left-0.5` fijo + `translate-x-[17px]/translate-x-0` +
   `transition-transform duration-150 ease-smooth`.
5. **Barras dashboard:90,96,354,358 + historical:92,98,363,367** —
   `transition-all` → `transition-[width,left] duration-300 ease-smooth-in-out`.
   (scaleX distorsionaría el texto DENTRO de los segmentos — compromiso
   consciente: propiedad acotada + curva token, no transform.)
6. **me/page.tsx:136** — `transition-all` → `transition-[width,background-color]
   duration-200 ease-smooth`.
7. **login/page.tsx:170** — `transition-all` → `transition-[background-color,box-shadow]`.
8. **flowPulseGlow duplicado** (PageHeader:51, projects:76) — clase compartida
   `.flow-pulse-glow` en globals.css; reemplazar ambos inline styles.
9. **Press feedback global** — en globals.css:
   `button:not(:disabled):active { transform: scale(0.98); }` +
   `button { transition: transform 120ms var(--ease-out); }` (scoped a button;
   no toca links).
10. **Stagger del grid de proyectos** (oportunidad #2) — projects/page.tsx:
    clase `animate-[fadeSlideUp_.35s_var(--ease-out)_both]` con
    `animationDelay: min(i,8)*40ms` en cada ProjectCard wrapper.
11. **Refresh success** (oportunidad #4) — PageHeader: al terminar `refreshing`,
    mostrar `Check` verde 1s antes de volver a `RefreshCw`.

## Verificación
`npx tsc --noEmit` = 0 + `next build` OK. Feel-check: modales entran con
escala sutil, calculadoras suben como sheet, toggle desliza, reduce motion ON
(DevTools → Rendering) congela olas/login manteniendo colores.
