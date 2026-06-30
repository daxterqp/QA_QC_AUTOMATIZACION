# Mapa de Flags del proyecto (feature_flags)

> Referencia rápida de TODOS los flags por proyecto. Se guardan en `projects.feature_flags`
> (JSON) y se propagan a todos los usuarios del proyecto. Fuente de verdad:
> `src/utils/featureFlags.ts` (`ProjectFeatureFlags` + `DEFAULT_FEATURE_FLAGS`).
>
> **Dónde se activan** (móvil): mantener presionado el proyecto → **Configurar módulos**
> (pantalla `ProjectConfigScreen`). En web: Configuración del proyecto (`ProjectConfigModal`).
> Algunos viven en otras tuercas (impresión = tuerca del Dossier; topo detallado = engranaje
> del módulo topográfico). El **Creador** los edita; se propagan a todos.

---

## 🧪 Configuración de Protocolos
| Flag | Qué hace | Default |
|---|---|---|
| `classic_protocols` | Habilita ensayos clásicos (Sí/No/NA). | ON |
| `numeric_protocols` | Habilita ensayos numéricos (tablas, fórmulas, gráficas). | OFF (ON en proyectos creados desde móvil) |
| `parametric_templates` | Plantillas paramétricas. | OFF |
| `historical_import` | Carga histórica de ensayos. | OFF |
| `multi_level_approval` | Aprobación por varios niveles. | OFF |
| `approval_levels` | N° de niveles de aprobación (1/2/3). | 1 |
| `dossier_observe_inline` | Permite **aprobar con observación** directo desde la LISTA del Dossier (sin abrir el protocolo). OFF = hay que entrar. | OFF |

## 📝 Llenado de protocolos (conviven entre sí; "por ubicación" siempre activo)
| Flag | Qué hace | Default |
|---|---|---|
| `module_protocols_by_location` | Llenado por **ubicación** (modo clásico). | ON |
| `fill_by_sector` | Llenado por **sector**. | OFF |
| `fill_by_type` | Llenado por **tipo** de ensayo. | OFF |
| `fill_by_date` | Llenado por **fecha**. | OFF |
| `fill_by_sample` | Ensayos por **muestra** física (módulo Muestras). | OFF |

## 🔢 Codificación / numeración de ensayos
| Flag | Qué hace | Default |
|---|---|---|
| `protocol_codes` | Activa el **código correlativo** (ej. PR-260032). | OFF |
| `coding_mask_default` | Máscara global del código: `{TIPO}{AA}{AAAA}{MM}{DD}{SEQ:n}{SECTOR}`. | `{TIPO}-{AA}{SEQ:4}` |
| `coding_mask_by_type` | Máscara específica por tipo de ficha (id_protocolo). | (usa la global) |
| `coding_seq_reset` | Ámbito de reinicio del correlativo: `year` / `year_sector` / `year_month`. | `year` |
| `deletion_mode` | Borrado: `last_only` (solo el último, sin huecos), `in_list_immutable` (cualquiera, huecos permanentes), `in_list_reassignable` (cualquiera + "Restablecer numeración"). | `last_only` |

## 📦 Módulos opcionales (visibilidad en el menú del proyecto)
| Flag | Qué hace | Default |
|---|---|---|
| `module_plans` | Módulo de **Planos**. | OFF |
| `module_contacts` | Módulo de **Contactos** del proyecto. | OFF |
| `module_summary_tables` | Módulo de **Tablas Resumen**. | OFF |
| `module_email_reports` | Módulo de **Reportes por Correo** (panel web). | OFF |
| `module_topo` | Módulo **Carga de datos topográficos** (web + móvil). | OFF |

## 🗺️ Topográfico (hijos de `module_topo`)
| Flag | Qué hace | Default |
|---|---|---|
| `topo_replace_gps` | En las fichas oculta la tarjeta GPS y **fuerza solo coordenadas topográficas**. | OFF |
| `topo_keep_gps_fallback` | Con `topo_replace_gps` ON: para ensayos SIN topo, permite usar la tarjeta GPS. | OFF |
| `topo_processing_enabled` | Enciende el **motor de cálculo** (fórmulas + áreas) sobre los datos topográficos. | OFF |
| `topo_columns` | Columnas configuradas del módulo topográfico. | — |

## 📍 Geolocalización / GPS (padre + hijos)  ← PARA ACTIVAR COORDENADAS
| Flag | Qué hace | Default |
|---|---|---|
| `map_enabled` | **PADRE** de Geolocalización. Si está OFF, los hijos GPS se ignoran. | OFF |
| `gps_capture_subjective` | Captura GPS en ensayos **clásicos**. | OFF |
| `gps_capture_numeric` | Captura GPS en ensayos **numéricos**. | OFF |
| `coordinate_system` | Sistema de coordenadas (`WGS84_LATLNG`, UTM, etc.). | `WGS84_LATLNG` |

> **Para capturar coordenadas con el GPS del celular en un ensayo:**
> 1) `map_enabled` ON → 2) `gps_capture_numeric` ON (numéricos) y/o `gps_capture_subjective` ON (clásicos).

## 🚶 Trazabilidad (padre + hijos)
| Flag | Qué hace | Default |
|---|---|---|
| `traceability_module` | **PADRE** de Trazabilidad. Si OFF, los hijos se ignoran. | OFF |
| `equipment_catalog` | Catálogo de equipos. | OFF |
| `traceability_gps_polling` | Rastreo GPS de la jornada: `off` / `foreground` / `background`. (Background quitado del build de Play — solo foreground.) | `off` |
| `traceability_gps_interval_seconds` | Intervalo de captura (seg). | 3 |
| `anonymize_traceability` | (oculto en UI) | OFF |

## 🖨️ Impresión PDF (se editan en la TUERCA del Dossier, no en Configurar módulos)
| Flag | Qué hace |
|---|---|
| `print_configs` | Config de impresión por TIPO de ensayo (datos generales, filas del encabezado, gráficos, croquis, etc.). |
| `print_header_color` | Color de encabezados de ficha (global). |

## 📋 Muestras
| Flag | Qué hace |
|---|---|
| `sample_form_rows` | Filas activas del formulario de muestra (material, condition, depth, coords, layers). |
| `sample_materials` | Catálogo editable de "tipo de material". |
| `grouping_presets` | Agrupamientos del selector de llamadas entre fichas (xref). |

## 🚫 @deprecated — siempre se consideran ON, no se muestran en la UI
`plans_pdf`, `advanced_charts`, `normas`, `phone_contacts`, `qr_codes`, `protocol_linking`.
