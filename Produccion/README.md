# Producción — el camino al mercado

Generado de la revisión exhaustiva pre-producción (12 jul 2026, 4 auditores
sobre el código real + auditoría de módulos nativos). Tres frentes, un orden.

| # | Documento | Qué resuelve |
|---|---|---|
| 01 | [PUBLICAR_WEB.md](01_PUBLICAR_WEB.md) | Los 4 bloqueadores + altas a corregir ANTES, y el flujo completo de publicación (VPS standalone — Vercel descartado con evidencia) |
| 02 | [INSTALADOR_ESCRITORIO.md](02_INSTALADOR_ESCRITORIO.md) | Los 3 bloqueadores del .exe (Node inexistente, D:\ hardcodeado, secretos en el instalador) + updates automáticos, firma y branding |
| 03 | [PLAN_IOS.md](03_PLAN_IOS.md) | Plan conceptual completo: módulos auditados (todos ✅ iOS), EAS Build sin Mac, permisos, App Review con respuestas listas, costos y disparador |

## El orden maestro (dependencias reales)

```
1. FIX S3 server-side (bloqueador compartido web+desktop: presigned URLs,
   bucket privado, rotar key IAM)        ← desbloquea TODO lo demás
2. Fase 0 restante de la web (gates desktop-only, límites, pulido)
3. PUBLICAR LA WEB (VPS + dominio + OAuth + smoke test)   ← primer hito público
4. Escritorio v1 (fixes del doc 02 §bloqueadores/altas + updater + firma)
   — su S3 consume la web YA publicada
5. iOS cuando se cumpla el disparador (1 cliente iPhone o piloto Android
   estable 1 mes)
```

## Resumen ejecutivo de bloqueadores (no publicar sin esto)

1. **Claves AWS en el bundle del navegador** (`NEXT_PUBLIC_AWS_SECRET_*`) —
   cualquier visitante accede al bucket entero, backups de la base incluidos.
2. **Bucket S3 requerido como público** por URLs sin firmar del cliente.
3. **Rutas de disco-local expuestas** (`orthophoto/process` lee rutas
   arbitrarias del servidor) — gatear a modo escritorio.
4. **Escritorio: `spawn('node')` + `D:\Flow-QAQC`** — el .exe instalado en la
   PC de un cliente no abre.

Todo lo demás (límites de upload, favicon/robots/errores, hora UTC de
reportes, versión visible, single-instance, firma, updater) está listado con
su fix en cada documento.
