/**
 * Flags de herramientas de DESARROLLO.
 *
 * SHOW_DEV_TOOLS — expone utilidades de debug (p. ej. el botón "Autollenar (dev)"
 * de la tabla numérica) incluso en builds standalone/release, donde `__DEV__` es
 * `false`. Se dejó en `true` para la APK de pruebas (v42e).
 *
 * ⚠️ PRODUCCIÓN: poner en `false` antes de publicar una release real — así el
 * autollenado y demás herramientas dev quedan ocultas para el usuario final.
 */
export const SHOW_DEV_TOOLS = true;
