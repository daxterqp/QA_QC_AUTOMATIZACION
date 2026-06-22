# Agrupamientos (presets) de protocolos — Guía para crear fichas

> Los **agrupamientos** son consultas guardadas que aparecen **arriba del selector** de llamadas entre
> fichas. Al tocar uno, **selecciona en bloque** los protocolos que cumplen el criterio (snapshot
> editable) y luego las celdas `get` calculan (ver `docs/fichas-llamadas-entre-fichas.md`).
> Se **siembran en masa** desde la hoja **`AGRUPACIONES`** del Excel maestro y el usuario los puede
> editar después. Se guardan en `feature_flags.grouping_presets` (por tipo de ficha, sin migración).

## Cómo funciona
- Un preset = **selección base** (tipo, contexto relativo, fechas, etiqueta) + **filtros** + **excepciones**.
- Resuelve **localmente** (sin costo de red) sobre los protocolos **APROBADOS** del proyecto.
- Es un **snapshot**: deja los códigos seleccionados; el técnico puede quitar/añadir antes de "Listo".
- Aparece cuando se llena una ficha cuyo `ID_Protocolo` coincide con la columna `ID_Protocolo` del preset.

## Hoja `AGRUPACIONES` del Excel maestro
Una **fila por preset**. Columnas (todas opcionales salvo `ID_Protocolo` y `Nombre`):

| Columna | Qué hace |
|---|---|
| **ID_Protocolo** | Tipo de ficha **donde aparece** el preset (la que llama). Obligatoria. |
| **Nombre** | Texto del botón del preset. Obligatoria. (El upsert al re-importar es por nombre.) |
| **Tipo_Fuente** | `id_protocolo` de los ensayos a traer (ej. `PRV5`). Si se omite, usa el tipo del selector. |
| **UltimosN** | Trae los últimos N (por fecha). Ej. `5`. |
| **UltimosDias** | Solo aprobados en los últimos N días. Ej. `30`. |
| **Desde** / **Hasta** | Rango de fechas absoluto (`AAAA-MM-DD` o `dd/mm/aaaa`). |
| **MismoSector** | `X` → solo ensayos del **mismo sector** que la ficha actual. |
| **MismaMuestra** | `X` → solo de la **misma muestra**. |
| **MismaUbicacion** | `X` → solo de la **misma ubicación**. |
| **Etiqueta** | Solo ensayos cuyo código/nombre/ubicación **contiene** este texto (grupo manual). |
| **Orden** | `reciente` (def) o `antiguo`. |
| **Filtros** | Mini-DSL de filtros (ver abajo). |
| **Excluir** | Códigos a excluir, separados por coma. Ej. `PRV5-260001, PRV5-260005`. |

### Mini-DSL de la columna `Filtros`
Cláusulas unidas por `&`. Cada una: `<campo> <op> <valor>`.
- **Campos de atributo:** `material`, `condicion`, `sector`, `fecha`, `codigo`.
- **Valor de celda del ensayo fuente:** `celda:<fila><col>` (ej. `celda:19A` = MDS del Proctor).
- **Operadores:** `=` `!=` `<` `<=` `>` `>=` `~` (`~` = contiene texto).

Ejemplos:
- `material=GP & condicion=INALTERADA` → solo grava pobremente gradada, inalterada.
- `celda:19A>=2.0` → solo Proctores con MDS ≥ 2.0.
- `material~grava` → material que contenga "grava".

## Ejemplos (hoja AGRUPACIONES de `PRUEBA_XREF_v5_Agrupamientos.xlsx`)
| ID_Protocolo | Nombre | Tipo_Fuente | UltimosN | UltimosDias | MismoSector | Filtros |
|---|---|---|---|---|---|---|
| DXP3 | Últimas 5 curvas Proctor | PRV5 | 5 | | | |
| DXP3 | Proctores del sector actual | PRV5 | | | X | |
| DXP3 | Proctores últimos 30 días | PRV5 | | 30 | | |
| DXP3 | Proctores con MDS ≥ 2.0 | PRV5 | | | | `celda:19A>=2.0` |
| DXP3 | Familia de grava (material) | PRV5 | | | | `material~grava` |

## Siembra y edición
- Al **importar** el Excel: los presets de la hoja `AGRUPACIONES` se **mergean por nombre** en
  `feature_flags.grouping_presets` (actualiza los del Excel, **conserva** los que el usuario añadió a
  mano). Aparece un aviso con cuántos se sembraron. **Nunca borra** presets existentes.
- (Pendiente Fase B) Editor visual en el apartado **Configuración** de "Cargar archivos" para que el
  usuario final ajuste/cree presets sin Excel.

## Reglas de robustez
- Solo ensayos **APROBADOS** del proyecto entran al cálculo.
- Un ensayo que no tenga la celda/atributo del filtro **se excluye** (no rompe el resultado).
- El merge respeta la persistencia de `feature_flags` (cloud-wins, sin pisar otros flags).

---
*(El cálculo posterior — promedio, más cercano, interpolación, etc. — se documenta en
`docs/fichas-llamadas-entre-fichas.md`.)*
