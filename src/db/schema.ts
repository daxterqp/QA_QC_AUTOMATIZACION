import { appSchema, tableSchema } from '@nozbe/watermelondb';

/**
 * Schema S-CUA MVP
 * v18: plan_measurements (mediciones locales sobre planos)
 * v19: plan_annotations.priority (low | medium | high | null)
 * v20: protocols.general_comment (comentario general para protocolos numéricos)
 * v21: protocols.{external_id, imported_at, imported_by_id, is_historical} — soporte de carga histórica
 * v22: projects.feature_flags (JSON serializado de módulos activos por proyecto)
 * v23: tabla protocol_approvals para aprobaciones jerárquicas (1–3 niveles)
 * v24: tablas equipment + protocol_equipment para catálogo de equipos calibrados
 * v25: tabla sync_queue para outbox de sincronización offline (FASE OFFLINE)
 * v26: módulo GIS — coords y sector en protocols + tabla project_sectors + projects.map_tile_url
 * v27: módulo Trazabilidad Operacional — 9 tablas (activities, equipment_activities,
 *      work_shifts, session_form_templates, session_form_template_items,
 *      work_sessions, work_session_intervals, work_session_form_items,
 *      work_session_gps_points) + flags traceability_* en projects.feature_flags
 * v28: equipment.category (laboratorio | maquinaria_pesada) para distinguir
 *      catálogos de QA/QC vs maquinaria de Trazabilidad operacional.
 * v29: project_sectors.sort_order para respetar el orden del Excel al mostrar
 *      sectores en analytics/cronología/PDF de Trazabilidad.
 * v30: work_session_form_items con campos de checklist (is_compliant, is_na,
 *      has_answer) — espejo del modelo de protocol_items. evidences gana
 *      session_form_item_id (opcional) para asociar fotos a items del checklist
 *      sin abusar de protocol_item_id.
 */
export const schema = appSchema({
  version: 43,
  tables: [
    // ── users ────────────────────────────────────────────────────────────────
    tableSchema({
      name: 'users',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'apellido', type: 'string', isOptional: true },
        { name: 'role', type: 'string' },   // CREATOR | RESIDENT | SUPERVISOR | OPERATOR
        { name: 'password', type: 'string', isOptional: true },
        { name: 'pin', type: 'string', isOptional: true },
        { name: 'signature_uri', type: 'string', isOptional: true },
        { name: 'is_active', type: 'boolean', isOptional: true }, // v43 — soft-delete: false = inactivo (sin login, conserva firmas)
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── projects ─────────────────────────────────────────────────────────────
    tableSchema({
      name: 'projects',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'status', type: 'string' },          // ACTIVE | CLOSED
        { name: 'password', type: 'string', isOptional: true },
        { name: 'created_by_id', type: 'string', isOptional: true },
        { name: 'logo_s3_key', type: 'string', isOptional: true },
        { name: 'stamp_comment', type: 'string', isOptional: true },
        // v22 — feature flags por proyecto (JSON string serializado)
        { name: 'feature_flags', type: 'string', isOptional: true },
        { name: 'sample_identifier', type: 'string', isOptional: true }, // v43 — id de proyecto para el código de muestras (ej. "123")
        // v26 — URL custom de tile server para ortofoto (formato XYZ). Si null, mapa usa Google Maps default.
        { name: 'map_tile_url', type: 'string', isOptional: true },
        // v34 — Ortofoto liviana georreferenciada (imagen WebP en S3 + bbox WGS84).
        { name: 'orthophoto_s3_key', type: 'string', isOptional: true },
        { name: 'orthophoto_bounds_json', type: 'string', isOptional: true }, // JSON [[s,w],[n,e]]
        { name: 'orthophoto_system', type: 'string', isOptional: true },
        { name: 'orthophoto_tiles_json', type: 'string', isOptional: true },  // v37: JSON [{s3Key,bounds}]
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── user_project_access ───────────────────────────────────────────────────
    tableSchema({
      name: 'user_project_access',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── locations ────────────────────────────────────────────────────────────
    tableSchema({
      name: 'locations',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'location_only', type: 'string', isOptional: true }, // ej: "P1-Sector1"
        { name: 'specialty', type: 'string', isOptional: true },      // ej: "Cimiento"
        { name: 'reference_plan', type: 'string' },
        { name: 'template_ids', type: 'string', isOptional: true }, // IDs separados por coma: "1,2,3"
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── protocol_templates ───────────────────────────────────────────────────
    tableSchema({
      name: 'protocol_templates',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'id_protocolo', type: 'string' },    // ID único del Excel (ej: "1", "C1")
        { name: 'name', type: 'string' },            // Nombre del protocolo (columna "Protocolo")
        { name: 'summary_config_json', type: 'string', isOptional: true }, // v38 — config Tabla Resumen (hoja RESUMEN)
        { name: 'is_hidden', type: 'boolean', isOptional: true }, // v39 — tipo de ensayo oculto (no creable, registros siguen visibles)
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── protocol_template_items ──────────────────────────────────────────────
    tableSchema({
      name: 'protocol_template_items',
      columns: [
        { name: 'template_id', type: 'string', isIndexed: true },
        { name: 'partida_item', type: 'string', isOptional: true },
        { name: 'item_description', type: 'string' },
        { name: 'validation_method', type: 'string', isOptional: true },
        { name: 'section', type: 'string', isOptional: true },  // Agrupacion visual en protocolo
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── protocols ────────────────────────────────────────────────────────────
    tableSchema({
      name: 'protocols',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'location_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'template_id', type: 'string', isOptional: true, isIndexed: true }, // plantilla origen
        { name: 'status', type: 'string' },          // DRAFT | SUBMITTED | APPROVED | REJECTED
        { name: 'protocol_number', type: 'string' },
        { name: 'location_reference', type: 'string' },
        { name: 'latitude', type: 'number', isOptional: true },
        { name: 'longitude', type: 'number', isOptional: true },
        { name: 'is_locked', type: 'boolean' },
        { name: 'corrections_allowed', type: 'boolean' },
        { name: 'signed_by_id', type: 'string', isOptional: true },
        { name: 'signed_at', type: 'number', isOptional: true },
        { name: 'upload_status', type: 'string' },
        { name: 'filled_by_id', type: 'string', isOptional: true },
        { name: 'filled_at', type: 'number', isOptional: true },
        { name: 'submitted_at', type: 'number', isOptional: true },
        { name: 'rejection_reason', type: 'string', isOptional: true },
        { name: 'general_comment', type: 'string', isOptional: true }, // v20: comentario general (protocolos numéricos)
        { name: 'approval_reason', type: 'string', isOptional: true }, // v33: motivo al aprobar fuera de rango (override del jefe)
        // v21 — soporte de carga histórica
        { name: 'external_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'imported_at', type: 'number', isOptional: true },
        { name: 'imported_by_id', type: 'string', isOptional: true },
        { name: 'is_historical', type: 'boolean' },
        // v26 — Módulo GIS: coords + backup + sector asignado
        { name: 'coord_captured_at', type: 'number', isOptional: true },
        { name: 'coord_captured_by_id', type: 'string', isOptional: true },
        { name: 'coord_accuracy_m', type: 'number', isOptional: true },
        // v35 — captura de precisión por promediado de waypoints
        { name: 'coord_method', type: 'string', isOptional: true },          // 'single' | 'averaged' | 'rtk'
        { name: 'coord_sample_count', type: 'number', isOptional: true },
        { name: 'coord_precision_m', type: 'number', isOptional: true },
        { name: 'coord_backup_lat', type: 'number', isOptional: true },
        { name: 'coord_backup_lng', type: 'number', isOptional: true },
        { name: 'coord_backup_captured_at', type: 'number', isOptional: true },
        { name: 'sector_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'sector_assigned_manually', type: 'boolean' },
        // v31 — modos de llenado + codificación correlativa (Partes D+E)
        { name: 'protocol_code', type: 'string', isOptional: true, isIndexed: true },
        { name: 'ensayo_date', type: 'string', isOptional: true, isIndexed: true },
        // v43 — ensayo vinculado a una MUESTRA física (módulo "ensayos por muestra")
        { name: 'sample_id', type: 'string', isOptional: true, isIndexed: true },
        // v32 — hora de inicio del ensayo (HH:MM, editable al crear)
        { name: 'ensayo_time', type: 'string', isOptional: true },
        // v42 — snapshot de los llamados entre ensayos (@código.celda): mapa
        // {"código.celda":{sourceId,sourceUpdatedAt,value,status}} congelado al
        // ENVIAR. Habilita doble check (código→id) e indicador de "desactualizado".
        // TEXT local (JSONB en Supabase — parsear antes del push).
        { name: 'xref_snapshot_json', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── protocol_items ───────────────────────────────────────────────────────
    tableSchema({
      name: 'protocol_items',
      columns: [
        { name: 'protocol_id', type: 'string', isIndexed: true },
        { name: 'partida_item', type: 'string', isOptional: true },
        { name: 'item_description', type: 'string' },
        { name: 'validation_method', type: 'string', isOptional: true },
        { name: 'section', type: 'string', isOptional: true },  // Agrupacion visual en protocolo
        { name: 'is_compliant', type: 'boolean' },
        { name: 'is_na', type: 'boolean' },        // true = usuario respondió N/A
        { name: 'has_answer', type: 'boolean' },   // true = usuario respondió Si, No o N/A
        { name: 'comments', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── evidences ────────────────────────────────────────────────────────────
    tableSchema({
      name: 'evidences',
      columns: [
        { name: 'protocol_item_id', type: 'string', isIndexed: true },
        // v30 — Asociación opcional a item de checklist de Trazabilidad.
        // Si está set, protocol_item_id contendrá un marker convencional
        // (`CHECKLIST:<sessionId>`) para que las FK existentes no rompan.
        { name: 'session_form_item_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 's3_url_placeholder', type: 'string', isOptional: true },
        { name: 'local_uri', type: 'string' },
        { name: 'upload_status', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── non_conformities ─────────────────────────────────────────────────────
    tableSchema({
      name: 'non_conformities',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'protocol_id', type: 'string', isIndexed: true },
        { name: 'description', type: 'string' },
        { name: 'status', type: 'string' },          // OPEN | RESOLVED
        { name: 'raised_by_id', type: 'string' },
        { name: 'resolution_notes', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── plans ─────────────────────────────────────────────────────────────────
    tableSchema({
      name: 'plans',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'location_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'file_uri', type: 'string' },
        { name: 's3_key', type: 'string', isOptional: true },
        { name: 's3_etag', type: 'string', isOptional: true },
        { name: 'local_etag', type: 'string', isOptional: true },
        { name: 'uploaded_by_id', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── plan_annotations ──────────────────────────────────────────────────────
    tableSchema({
      name: 'plan_annotations',
      columns: [
        { name: 'plan_id', type: 'string', isIndexed: true },
        { name: 'protocol_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'rect_x', type: 'number' },
        { name: 'rect_y', type: 'number' },
        { name: 'rect_width', type: 'number' },
        { name: 'rect_height', type: 'number' },
        { name: 'comment', type: 'string', isOptional: true },
        { name: 'sequence_number', type: 'number' },
        { name: 'is_ok', type: 'boolean' },
        { name: 'status', type: 'string' },             // 'OPEN' | 'CLOSED'
        { name: 'page', type: 'number', isOptional: true }, // número de página del PDF (1-based)
        { name: 'priority', type: 'string', isOptional: true }, // 'low' | 'medium' | 'high' | null
        { name: 'created_by_id', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── annotation_comments ────────────────────────────────────────────────────
    tableSchema({
      name: 'annotation_comments',
      columns: [
        { name: 'annotation_id', type: 'string', isIndexed: true },
        { name: 'author_id', type: 'string' },
        { name: 'content', type: 'string', isOptional: true },
        { name: 'read_by_creator', type: 'boolean' },   // false = creador aun no leyó
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── annotation_comment_photos ──────────────────────────────────────────────
    tableSchema({
      name: 'annotation_comment_photos',
      columns: [
        { name: 'annotation_comment_id', type: 'string', isIndexed: true },
        { name: 'local_uri', type: 'string' },
        { name: 'storage_path', type: 'string', isOptional: true }, // clave S3 tras el upload
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── dashboard_notes ────────────────────────────────────────────────────────
    tableSchema({
      name: 'dashboard_notes',
      columns: [
        { name: 'project_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'content', type: 'string' },
        { name: 'created_by_id', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── phone_contacts ─────────────────────────────────────────────────────────
    tableSchema({
      name: 'phone_contacts',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'phone', type: 'string' },
        { name: 'role', type: 'string', isOptional: true },
        { name: 'sort_order', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── plan_measurements (tabla desde v18; push/pull a Supabase desde v19.1+) ───
    tableSchema({
      name: 'plan_measurements',
      columns: [
        { name: 'plan_id', type: 'string', isIndexed: true },
        { name: 'type', type: 'string' },               // 'line' | 'calibration' | 'polygon'
        { name: 'data', type: 'string' },                // JSON con coordenadas
        { name: 'calibration_scale', type: 'number' },   // px per meter
        { name: 'page', type: 'number' },                // página del PDF
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── protocol_approvals (v23) — aprobaciones jerárquicas 1–3 niveles ──────
    tableSchema({
      name: 'protocol_approvals',
      columns: [
        { name: 'protocol_id', type: 'string', isIndexed: true },
        { name: 'level', type: 'number' },                          // 1 | 2 | 3
        { name: 'signer_id', type: 'string', isOptional: true },
        { name: 'signed_at', type: 'number', isOptional: true },
        { name: 'status', type: 'string' },                         // PENDING | APPROVED | REJECTED
        { name: 'rejection_reason', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── equipment (v24) — catálogo de equipos calibrados por proyecto ─────────
    tableSchema({
      name: 'equipment',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'code', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'type', type: 'string' },                           // balanza | prensa | horno | tamiz | termometro | excavadora | compactador | motoniveladora | retroexcavadora | otros
        // v28 — Clasificación general: laboratorio | maquinaria_pesada
        { name: 'category', type: 'string', isIndexed: true },
        { name: 'brand', type: 'string', isOptional: true },
        { name: 'model', type: 'string', isOptional: true },
        { name: 'serial', type: 'string', isOptional: true },
        { name: 'capacity', type: 'string', isOptional: true },
        { name: 'resolution', type: 'string', isOptional: true },
        { name: 'last_calibration_at', type: 'number', isOptional: true },
        { name: 'next_calibration_at', type: 'number' },
        { name: 'calibration_certificate_s3', type: 'string', isOptional: true },
        { name: 'status', type: 'string' },                         // active | inactive | retired
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── protocol_equipment (v24) — vínculo protocolo ↔ equipo usado ───────────
    tableSchema({
      name: 'protocol_equipment',
      columns: [
        { name: 'protocol_id', type: 'string', isIndexed: true },
        { name: 'equipment_id', type: 'string', isIndexed: true },
        { name: 'used_at', type: 'number' },
        { name: 'created_at', type: 'number' },
      ],
    }),

    // ── sync_queue (v25) — outbox persistente de operaciones offline ──────────
    // Cada fila representa UNA operación pendiente de sincronizar con Supabase/S3.
    // El SyncWorker drena esta cola cuando hay red, con retry + backoff.
    tableSchema({
      name: 'sync_queue',
      columns: [
        // 'PUSH_PROTOCOL_ITEM' | 'PUSH_PROTOCOL_STATUS' | 'PUSH_APPROVAL'
        //   | 'UPLOAD_PHOTO' | 'PUSH_EVIDENCE' | 'PUSH_NC'
        { name: 'op_type', type: 'string', isIndexed: true },
        { name: 'entity_id', type: 'string', isIndexed: true },
        { name: 'project_id', type: 'string', isIndexed: true },
        /** JSON serializado con params adicionales del handler (opcional). */
        { name: 'payload_json', type: 'string', isOptional: true },
        { name: 'attempts', type: 'number' },
        { name: 'next_attempt_at', type: 'number', isIndexed: true },
        { name: 'last_error', type: 'string', isOptional: true },
        /** 'PENDING' | 'FAILED_PERMANENT' (después de 10 intentos sigue visible para retry manual). */
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── project_sectors (v26) — sectores/zonas del proyecto (con o sin polígono) ──
    // points_json = NULL → sector solo-nombre (selección manual). Si tiene puntos
    // (array JSON `[{lat,lng}, ...]` en WGS84), participa en auto-asignación por GPS.
    tableSchema({
      name: 'project_sectors',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'points_json', type: 'string', isOptional: true },
        { name: 'display_color', type: 'string', isOptional: true },
        { name: 'source_system', type: 'string', isOptional: true },
        // v29 — Orden del Excel (rowIndex+1 al importar). null/0 para legacy.
        { name: 'sort_order', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── v27 — Módulo Trazabilidad Operacional ────────────────────────────────
    tableSchema({
      name: 'activities',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        // 'productive' | 'maintenance' | 'transport' | 'other'
        { name: 'kind', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'equipment_activities',
      columns: [
        { name: 'equipment_id', type: 'string', isIndexed: true },
        { name: 'activity_id', type: 'string', isIndexed: true },
        { name: 'form_template_id', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'work_shifts',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'start_hour', type: 'number' },
        { name: 'end_hour', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'session_form_templates',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'session_form_template_items',
      columns: [
        { name: 'template_id', type: 'string', isIndexed: true },
        { name: 'partida_item', type: 'string', isOptional: true },
        { name: 'item_description', type: 'string' },
        { name: 'validation_method', type: 'string', isOptional: true },
        { name: 'section', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'work_sessions',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'equipment_id', type: 'string', isIndexed: true },
        { name: 'activity_id', type: 'string' },
        { name: 'sector_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'shift_id', type: 'string', isOptional: true },
        { name: 'started_at', type: 'number' },
        { name: 'ended_at', type: 'number', isOptional: true },
        // 'ACTIVE' | 'PAUSED' | 'CLOSED'
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'started_on_device_id', type: 'string', isOptional: true },
        { name: 'auto_closed', type: 'boolean' },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'work_session_intervals',
      columns: [
        { name: 'session_id', type: 'string', isIndexed: true },
        // 'active' | 'paused'
        { name: 'kind', type: 'string' },
        { name: 'started_at', type: 'number' },
        { name: 'ended_at', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'work_session_form_items',
      columns: [
        { name: 'session_id', type: 'string', isIndexed: true },
        { name: 'template_item_id', type: 'string', isOptional: true },
        { name: 'partida_item', type: 'string', isOptional: true },
        { name: 'item_description', type: 'string' },
        { name: 'validation_method', type: 'string', isOptional: true },
        { name: 'value_text', type: 'string', isOptional: true },
        { name: 'value_number', type: 'number', isOptional: true },
        { name: 'comments', type: 'string', isOptional: true },
        // v30 — checklist Sí/No/NA + flag de respondido
        { name: 'is_compliant', type: 'boolean', isOptional: true },
        { name: 'is_na', type: 'boolean', isOptional: true },
        { name: 'has_answer', type: 'boolean', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'work_session_gps_points',
      columns: [
        { name: 'session_id', type: 'string', isIndexed: true },
        // Fix P4: indice individual en captured_at para acelerar sort en timeline
        // y last-point queries (closeStaleSessions). WMDB no soporta indices
        // compuestos; session_id + captured_at indexados por separado es lo mas
        // cercano que el storage SQLite puede aprovechar.
        { name: 'captured_at', type: 'number', isIndexed: true },
        { name: 'latitude', type: 'number' },
        { name: 'longitude', type: 'number' },
        { name: 'accuracy_m', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
    // ── summary_rows (v37) — Tablas Resumen: 1 fila por ensayo, progresiva ──────
    tableSchema({
      name: 'summary_rows',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'template_id', type: 'string', isIndexed: true, isOptional: true },
        { name: 'protocol_id', type: 'string', isIndexed: true },
        { name: 'protocol_code', type: 'string', isOptional: true },
        { name: 'protocol_number', type: 'string', isOptional: true },
        { name: 'ensayo_date', type: 'string', isOptional: true },
        { name: 'sector_id', type: 'string', isOptional: true },
        { name: 'sector_name', type: 'string', isOptional: true },
        { name: 'location_id', type: 'string', isOptional: true },
        { name: 'location_name', type: 'string', isOptional: true },
        { name: 'status', type: 'string', isOptional: true },
        { name: 'values_json', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── lab_aux_tables (v40) — Tablas auxiliares de laboratorio a NIVEL PROYECTO.
    // Cada fila es un GRUPO (taras, moldes, fiolas, densidad-agua) con sus columnas
    // y filas (JSON) + una fecha de calibración compartida. Se sube una vez (hoja 2
    // del Excel del catálogo Lab.) y cualquier ficha la llama por `group_key` con
    // BUSCAR(@grupo, valor, "columna"). columns_json/rows_json son TEXT local (JSONB
    // en Supabase — parsear antes del push).
    tableSchema({
      name: 'lab_aux_tables',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'group_key', type: 'string', isIndexed: true }, // identificador, ej. 'taras'
        { name: 'name', type: 'string', isOptional: true },
        { name: 'columns_json', type: 'string' },   // ["Codigo","Malla","Abertura"]
        { name: 'rows_json', type: 'string' },       // [["1","N1","45"], ...]
        { name: 'last_calibration_at', type: 'number', isOptional: true },
        { name: 'next_calibration_at', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── recycle_bin (v41) — Papelera de Reciclaje (historial de respaldo) ──────
    // Copia estática y autocontenida de un ensayo ELIMINADO. Solo lectura, no
    // interactúa con el resto del sistema (sin FKs, sin cálculos). El
    // `protocol_code` puede repetirse (el correlativo del eliminado queda
    // liberado). `snapshot_json` = volcado completo (protocolo + items +
    // evidencias + approvals + NC + equipos + anotaciones + comentarios + resumen).
    tableSchema({
      name: 'recycle_bin',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'protocol_id', type: 'string', isOptional: true },
        { name: 'protocol_code', type: 'string', isOptional: true },
        { name: 'protocol_number', type: 'string', isOptional: true },
        { name: 'template_id', type: 'string', isOptional: true },
        { name: 'template_name', type: 'string', isOptional: true },
        { name: 'location_name', type: 'string', isOptional: true },
        { name: 'sector_name', type: 'string', isOptional: true },
        { name: 'status', type: 'string', isOptional: true },
        { name: 'ensayo_date', type: 'string', isOptional: true },
        { name: 'snapshot_json', type: 'string' },
        { name: 'deleted_at', type: 'number', isIndexed: true },
        { name: 'deleted_by_id', type: 'string', isOptional: true },
        { name: 'deleted_by_name', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── samples (v43) — Muestras físicas. Módulo "ensayos por muestra": cada
    // muestra agrupa varios protocolos (protocols.sample_id). Código correlativo
    // M{sample_identifier}{ddmmyy}-{seq:4} por proyecto. Coordenadas datum + E/N/Cota
    // + GPS (reusa la captura existente). Filas del formulario opcionales (nullable).
    tableSchema({
      name: 'samples',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'sample_code', type: 'string', isIndexed: true },
        { name: 'seq', type: 'number', isOptional: true },          // correlativo (4 díg.) para rango desde/hasta
        { name: 'sample_date', type: 'string', isOptional: true },  // fecha de la muestra (YYYY-MM-DD)
        { name: 'location_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'sector_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'material_type', type: 'string', isOptional: true },
        { name: 'condition', type: 'string', isOptional: true },    // ALTERADA | INALTERADA
        { name: 'depth_from', type: 'number', isOptional: true },
        { name: 'depth_to', type: 'number', isOptional: true },
        // Coordenadas: datum + Este/Norte/Cota + GPS (medición automática)
        { name: 'coord_system', type: 'string', isOptional: true }, // datum (WGS84_UTM, etc.)
        { name: 'latitude', type: 'number', isOptional: true },
        { name: 'longitude', type: 'number', isOptional: true },
        { name: 'coord_east', type: 'number', isOptional: true },
        { name: 'coord_north', type: 'number', isOptional: true },
        { name: 'coord_elevation', type: 'number', isOptional: true },
        { name: 'coord_captured_at', type: 'number', isOptional: true },
        { name: 'coord_accuracy_m', type: 'number', isOptional: true },
        { name: 'layer_info_json', type: 'string', isOptional: true }, // recojo automático de capas
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'created_by_id', type: 'string', isOptional: true },
        { name: 'upload_status', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
});
