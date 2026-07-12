# Planes de animación — auditoría improve-animations (12 jul 2026)

Auditoría de motion de ambas apps (4 auditores paralelos, hallazgos veteados).
Commit base: ver `git log --oneline -1` al 2026-07-12. Personalidad objetivo:
**crisp profesional** con momentos de marca (agua/tiburón) — el motion confirma
y guía, nunca decora lo frecuente.

| Plan | Alcance | Estado |
|---|---|---|
| 001-movil-motion.md | Tokens Motion + fixes RN (tour, burbuja, toast, drawer, slider, avatar, reduce-motion, press feedback, OfflineBanner) | EJECUTADO |
| 002-web-motion.md | Tokens easing + reduced-motion + modales con entrada + toggle/barras/botones + stagger + refresh success | EJECUTADO |

Decisiones respetadas (NO tocar — settled):
- `contactPulse` (ProjectListScreen): el "Contáctanos" parpadeante es feature
  deliberada para VIEWERs (memoria del proyecto).
- `PulsingBadge` (ProjectListScreen): companion del mismo patrón — se respeta.
- Olas del header web y agua del login: identidad de marca; solo se gatean por
  `prefers-reduced-motion`, no se eliminan.
- Modales RN `animationType="slide"` de uso ocasional: budget estándar, OK.
