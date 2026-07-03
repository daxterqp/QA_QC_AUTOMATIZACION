# Impresión de etiquetas de Muestras y Ensayos (impresora térmica YHD-9260)

**Fecha:** 2026-07-03 · **Estado:** Fase 1 implementada · Fase 2 en espera de prueba de campo

## Contexto
El usuario tiene una impresora térmica **YHD-9260** (203 dpi, papel adhesivo hasta 110 mm,
USB/Bluetooth/WiFi, comandos **TSPL**/CPCL/ESC-POS, con app nativa Android ya instalada y
configurada en *Bluetooth + TSPL*, según captura de su pantalla de Configuración). Rollo
elegido: **50×50 mm**. La etiqueta lleva **QR (deep-link `flow://`) + texto** (código, fecha,
tipo/material, lugar, proyecto). La app ya genera QR (`src/utils/qrCode.ts`, SVG inline
probado en los PDF) y ya usa `expo-print` + `expo-sharing`.

## Decisiones de UI (confirmadas con el usuario)
- **Muestra** (`SampleDetailScreen`): ícono imprimir junto al de compartir-PDF.
- **Ensayo numérico** (`ProtocolFillScreen` + `ProtocolAuditScreen`, header de zoom):
  el **candado se elimina** (no se usaba) y su lugar lo ocupa el botón imprimir
  (`ZoomControls.tsx` → prop `onPrint`).
- **Ensayo clásico** (`ProtocolAuditScreen`, header no-numérico): la **píldora de estado**
  del header (redundante — el estado ya aparece dentro de la ficha) se reemplaza por el
  botón "Etiqueta", debajo del botón Planos.

## Evaluación de transportes
1. **Diálogo de impresión del sistema (`Print.printAsync`)** — DESCARTADO: Android solo
   lista impresoras con Print Service (Mopria/IPP WiFi); las térmicas Bluetooth SPP chinas
   no se registran ahí.
2. **FASE 1 — PDF-etiqueta → share sheet → app nativa de la impresora** ✅ implementada.
   Cero dependencias nuevas ni rebuild (todo JS): PDF del tamaño EXACTO del rollo
   (50×50 mm = 142 pt) y `Sharing.shareAsync`. El usuario elige la app de la impresora,
   que lo imprime. Probable fricción: 2 toques extra por etiqueta.
3. **FASE 2 — TSPL directo por Bluetooth Classic** (un toque, sin app intermedia).
   Se activa si la Fase 1 resulta incómoda en campo. Diseño:
   - Lib `react-native-bluetooth-classic` (SPP; mantenida, verificada jul-2026). Rebuild +
     permisos runtime `BLUETOOTH_CONNECT`/`BLUETOOTH_SCAN` (Android 12+), patrón nativo-primero.
   - Render: MISMO layout que la Fase 1 → `react-native-view-shot` (ya es dep) captura la
     etiqueta como PNG → umbral a monocromo 1-bit → `SIZE 50 mm,50 mm / GAP / DENSITY / CLS /
     BITMAP x,y,anchoBytes,alto,0,<bytes> / PRINT 1` (0 = modo OVERWRITE; bits 0=negro).
   - Selección de impresora: `getBondedDevices()` (emparejadas del sistema), se recuerda la
     dirección en AsyncStorage del dispositivo. Sin pantalla de configuración dedicada.
   - `LabelPrintService` conserva la MISMA API pública (`printSampleLabel` /
     `printProtocolLabel`); solo cambia el transporte interno (share → BT).

## Fase 1 — Implementación (hecha)
- **`src/services/LabelPrintService.ts`** (nuevo): `LABEL_MM=50` parametrizado;
  `printSampleLabel()` / `printProtocolLabel()` → HTML 142×142 pt (QR 62 pt arriba-izq,
  código en negrita, líneas de datos, proyecto al pie) → `printToFileAsync({width,height})`
  → `shareAsync(pdf)`.
- `ZoomControls.tsx`: candado eliminado (`locked`/`toggleLock` fuera del hook);
  `ZoomHeaderButtons` acepta `onPrint`/`printing`.
- `ProtocolFillScreen` (miniHeader numérico), `ProtocolAuditScreen` (header numérico y
  clásico), `SampleDetailScreen` (header): botón imprimir conectado.

## Criterio de éxito de la prueba de campo (decide Fase 2)
Etiqueta imprime a tamaño real 50×50 con QR escaneable por la propia app (deep-link abre la
muestra/ensayo). Si la app nativa de la impresora no acepta el PDF o el flujo share resulta
incómodo, se implementa la Fase 2 (TSPL directo).
