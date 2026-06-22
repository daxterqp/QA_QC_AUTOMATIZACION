import {
  schemaMigrations,
  addColumns,
  createTable,
  unsafeExecuteSql,
} from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'protocol_items',
          columns: [
            { name: 'partida_item', type: 'string', isOptional: true },
            { name: 'validation_method', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        createTable({
          name: 'locations',
          columns: [
            { name: 'project_id', type: 'string', isIndexed: true },
            { name: 'name', type: 'string' },
            { name: 'reference_plan', type: 'string' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        addColumns({
          table: 'protocols',
          columns: [
            { name: 'location_id', type: 'string', isOptional: true, isIndexed: true },
          ],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        createTable({
          name: 'users',
          columns: [
            { name: 'name', type: 'string' },
            { name: 'role', type: 'string' },
            { name: 'pin', type: 'string', isOptional: true },
            { name: 'signature_uri', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'non_conformities',
          columns: [
            { name: 'project_id', type: 'string', isIndexed: true },
            { name: 'protocol_id', type: 'string', isIndexed: true },
            { name: 'description', type: 'string' },
            { name: 'status', type: 'string' },
            { name: 'raised_by_id', type: 'string' },
            { name: 'resolution_notes', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        addColumns({
          table: 'protocols',
          columns: [
            { name: 'corrections_allowed', type: 'boolean' },
            { name: 'signed_by_id', type: 'string', isOptional: true },
            { name: 'signed_at', type: 'number', isOptional: true },
            { name: 'filled_by_id', type: 'string', isOptional: true },
            { name: 'filled_at', type: 'number', isOptional: true },
          ],
        }),
        addColumns({
          table: 'projects',
          columns: [
            { name: 'created_by_id', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      // v4 → v5: apellido + password en users, tablas plans, plan_annotations, dashboard_notes
      toVersion: 5,
      steps: [
        addColumns({
          table: 'users',
          columns: [
            { name: 'apellido', type: 'string', isOptional: true },
            { name: 'password', type: 'string', isOptional: true },
          ],
        }),
        addColumns({
          table: 'protocols',
          columns: [
            { name: 'submitted_at', type: 'number', isOptional: true },
          ],
        }),
        createTable({
          name: 'plans',
          columns: [
            { name: 'project_id', type: 'string', isIndexed: true },
            { name: 'location_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'name', type: 'string' },
            { name: 'file_uri', type: 'string' },
            { name: 'uploaded_by_id', type: 'string' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
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
            { name: 'created_by_id', type: 'string' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'dashboard_notes',
          columns: [
            { name: 'project_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'content', type: 'string' },
            { name: 'created_by_id', type: 'string' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      // v5 → v6: motivo de rechazo en protocols
      toVersion: 6,
      steps: [
        addColumns({
          table: 'protocols',
          columns: [
            { name: 'rejection_reason', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      // v6 → v7: plantillas de protocolo + template_ids en locations + template_id en protocols
      toVersion: 7,
      steps: [
        createTable({
          name: 'protocol_templates',
          columns: [
            { name: 'project_id', type: 'string', isIndexed: true },
            { name: 'id_protocolo', type: 'string' },
            { name: 'name', type: 'string' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'protocol_template_items',
          columns: [
            { name: 'template_id', type: 'string', isIndexed: true },
            { name: 'partida_item', type: 'string', isOptional: true },
            { name: 'item_description', type: 'string' },
            { name: 'validation_method', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        addColumns({
          table: 'locations',
          columns: [
            { name: 'template_ids', type: 'string', isOptional: true },
          ],
        }),
        addColumns({
          table: 'protocols',
          columns: [
            { name: 'template_id', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      // v7 → v8: has_answer en protocol_items
      toVersion: 8,
      steps: [
        addColumns({
          table: 'protocol_items',
          columns: [
            { name: 'has_answer', type: 'boolean' },
          ],
        }),
      ],
    },
    {
      // v8 → v9: section en template/protocol items; status en plan_annotations;
      //          tablas annotation_comments + annotation_comment_photos
      toVersion: 9,
      steps: [
        addColumns({
          table: 'protocol_template_items',
          columns: [{ name: 'section', type: 'string', isOptional: true }],
        }),
        addColumns({
          table: 'protocol_items',
          columns: [{ name: 'section', type: 'string', isOptional: true }],
        }),
        addColumns({
          table: 'plan_annotations',
          columns: [{ name: 'status', type: 'string' }],
        }),
        createTable({
          name: 'annotation_comments',
          columns: [
            { name: 'annotation_id', type: 'string', isIndexed: true },
            { name: 'author_id', type: 'string' },
            { name: 'content', type: 'string', isOptional: true },
            { name: 'read_by_creator', type: 'boolean' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'annotation_comment_photos',
          columns: [
            { name: 'annotation_comment_id', type: 'string', isIndexed: true },
            { name: 'local_uri', type: 'string' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      // v9 → v10: password en projects + tabla user_project_access
      toVersion: 10,
      steps: [
        addColumns({
          table: 'projects',
          columns: [
            { name: 'password', type: 'string', isOptional: true },
          ],
        }),
        createTable({
          name: 'user_project_access',
          columns: [
            { name: 'user_id', type: 'string', isIndexed: true },
            { name: 'project_id', type: 'string', isIndexed: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      // v10 → v11: storage_path en annotation_comment_photos (clave S3 de la foto)
      toVersion: 11,
      steps: [
        addColumns({
          table: 'annotation_comment_photos',
          columns: [
            { name: 'storage_path', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      // v11 → v12: location_only + specialty en locations
      toVersion: 12,
      steps: [
        addColumns({
          table: 'locations',
          columns: [
            { name: 'location_only', type: 'string', isOptional: true },
            { name: 'specialty', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      // v12 → v13: page en plan_annotations (soporte multi-página PDF)
      toVersion: 13,
      steps: [
        addColumns({
          table: 'plan_annotations',
          columns: [
            { name: 'page', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      // v13 → v14: is_na en protocol_items (respuesta N/A)
      toVersion: 14,
      steps: [
        addColumns({
          table: 'protocol_items',
          columns: [
            { name: 'is_na', type: 'boolean', isOptional: true },
          ],
        }),
      ],
    },
    {
      // v14 → v15: phone_contacts + logo_s3_key en projects
      toVersion: 15,
      steps: [
        addColumns({
          table: 'projects',
          columns: [
            { name: 'logo_s3_key', type: 'string', isOptional: true },
          ],
        }),
        createTable({
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
      ],
    },
    {
      // v15 → v16: s3_etag + s3_key en plans (detección de versiones nuevas)
      toVersion: 16,
      steps: [
        addColumns({
          table: 'plans',
          columns: [
            { name: 's3_key', type: 'string', isOptional: true },
            { name: 's3_etag', type: 'string', isOptional: true },
            { name: 'local_etag', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      // v16 → v17: stamp_comment en projects (compartido vía Supabase)
      toVersion: 17,
      steps: [
        addColumns({
          table: 'projects',
          columns: [
            { name: 'stamp_comment', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      // v17 → v18: plan_measurements (mediciones locales sobre planos)
      toVersion: 18,
      steps: [
        createTable({
          name: 'plan_measurements',
          columns: [
            { name: 'plan_id', type: 'string', isIndexed: true },
            { name: 'type', type: 'string' },
            { name: 'data', type: 'string' },
            { name: 'calibration_scale', type: 'number' },
            { name: 'page', type: 'number' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      // v18 → v19: priority opcional en plan_annotations
      toVersion: 19,
      steps: [
        addColumns({
          table: 'plan_annotations',
          columns: [
            { name: 'priority', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      // v19 → v20: general_comment en protocols (recuadro de observaciones generales
      // que usan los protocolos numéricos al final del formulario)
      toVersion: 20,
      steps: [
        addColumns({
          table: 'protocols',
          columns: [
            { name: 'general_comment', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      // v20 → v21: soporte de carga histórica
      //   - external_id: clave de dedup user-provided (único por proyecto, NULL para in-app)
      //   - imported_at / imported_by_id: trazabilidad del acto de import
      //   - is_historical: flag visible para badges/filtros UI
      toVersion: 21,
      steps: [
        addColumns({
          table: 'protocols',
          columns: [
            { name: 'external_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'imported_at', type: 'number', isOptional: true },
            { name: 'imported_by_id', type: 'string', isOptional: true },
            { name: 'is_historical', type: 'boolean' },
          ],
        }),
      ],
    },
    {
      // v21 → v22: feature_flags por proyecto (JSON serializado)
      //   - Habilita/deshabilita módulos avanzados por proyecto desde la config del CREATOR.
      //   - Default ON: clásicos, planos, normas, contactos.
      //   - Default OFF: numéricos, gráficos avanzados, históricos, equipos, vinculación, etc.
      toVersion: 22,
      steps: [
        addColumns({
          table: 'projects',
          columns: [
            { name: 'feature_flags', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      // v22 → v23: tabla protocol_approvals para aprobaciones jerárquicas (1–3 niveles)
      toVersion: 23,
      steps: [
        createTable({
          name: 'protocol_approvals',
          columns: [
            { name: 'protocol_id', type: 'string', isIndexed: true },
            { name: 'level', type: 'number' },
            { name: 'signer_id', type: 'string', isOptional: true },
            { name: 'signed_at', type: 'number', isOptional: true },
            { name: 'status', type: 'string' },
            { name: 'rejection_reason', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      // v23 → v24: catálogo de equipos calibrados + tabla puente con protocolos.
      toVersion: 24,
      steps: [
        createTable({
          name: 'equipment',
          columns: [
            { name: 'project_id', type: 'string', isIndexed: true },
            { name: 'code', type: 'string' },
            { name: 'name', type: 'string' },
            { name: 'type', type: 'string' },
            { name: 'brand', type: 'string', isOptional: true },
            { name: 'model', type: 'string', isOptional: true },
            { name: 'serial', type: 'string', isOptional: true },
            { name: 'capacity', type: 'string', isOptional: true },
            { name: 'resolution', type: 'string', isOptional: true },
            { name: 'last_calibration_at', type: 'number', isOptional: true },
            { name: 'next_calibration_at', type: 'number' },
            { name: 'calibration_certificate_s3', type: 'string', isOptional: true },
            { name: 'status', type: 'string' },
            { name: 'notes', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'protocol_equipment',
          columns: [
            { name: 'protocol_id', type: 'string', isIndexed: true },
            { name: 'equipment_id', type: 'string', isIndexed: true },
            { name: 'used_at', type: 'number' },
            { name: 'created_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      // v24 → v25: outbox de sincronización offline (sync_queue).
      // No destructiva — solo agrega la tabla nueva.
      toVersion: 25,
      steps: [
        createTable({
          name: 'sync_queue',
          columns: [
            { name: 'op_type', type: 'string', isIndexed: true },
            { name: 'entity_id', type: 'string', isIndexed: true },
            { name: 'project_id', type: 'string', isIndexed: true },
            { name: 'payload_json', type: 'string', isOptional: true },
            { name: 'attempts', type: 'number' },
            { name: 'next_attempt_at', type: 'number', isIndexed: true },
            { name: 'last_error', type: 'string', isOptional: true },
            { name: 'status', type: 'string', isIndexed: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      // v25 → v26: Módulo GIS — coords en protocols + tabla project_sectors + map_tile_url.
      toVersion: 26,
      steps: [
        addColumns({
          table: 'protocols',
          columns: [
            { name: 'coord_captured_at', type: 'number', isOptional: true },
            { name: 'coord_captured_by_id', type: 'string', isOptional: true },
            { name: 'coord_accuracy_m', type: 'number', isOptional: true },
            { name: 'coord_backup_lat', type: 'number', isOptional: true },
            { name: 'coord_backup_lng', type: 'number', isOptional: true },
            { name: 'coord_backup_captured_at', type: 'number', isOptional: true },
            { name: 'sector_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'sector_assigned_manually', type: 'boolean' },
          ],
        }),
        addColumns({
          table: 'projects',
          columns: [
            { name: 'map_tile_url', type: 'string', isOptional: true },
          ],
        }),
        createTable({
          name: 'project_sectors',
          columns: [
            { name: 'project_id', type: 'string', isIndexed: true },
            { name: 'name', type: 'string' },
            { name: 'points_json', type: 'string', isOptional: true },
            { name: 'display_color', type: 'string', isOptional: true },
            { name: 'source_system', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        // B7 — Backfill: `sector_assigned_manually` es un boolean no-opcional.
        // SQLite asigna NULL a las filas pre-existentes para columnas nuevas;
        // queries `Q.where('sector_assigned_manually', false)` NO matchean NULL,
        // así que los protocolos previos a v26 nunca participarían del
        // "Recalcular asignaciones automáticas". Forzamos 0 (false) inicial.
        unsafeExecuteSql('UPDATE protocols SET sector_assigned_manually = 0 WHERE sector_assigned_manually IS NULL;'),
      ],
    },
    {
      // v26 → v27: Módulo Trazabilidad Operacional — 9 tablas nuevas.
      toVersion: 27,
      steps: [
        createTable({
          name: 'activities',
          columns: [
            { name: 'project_id', type: 'string', isIndexed: true },
            { name: 'name', type: 'string' },
            { name: 'kind', type: 'string' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'equipment_activities',
          columns: [
            { name: 'equipment_id', type: 'string', isIndexed: true },
            { name: 'activity_id', type: 'string', isIndexed: true },
            { name: 'form_template_id', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
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
        createTable({
          name: 'session_form_templates',
          columns: [
            { name: 'project_id', type: 'string', isIndexed: true },
            { name: 'name', type: 'string' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
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
        createTable({
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
            { name: 'status', type: 'string', isIndexed: true },
            { name: 'started_on_device_id', type: 'string', isOptional: true },
            { name: 'auto_closed', type: 'boolean' },
            { name: 'notes', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'work_session_intervals',
          columns: [
            { name: 'session_id', type: 'string', isIndexed: true },
            { name: 'kind', type: 'string' },
            { name: 'started_at', type: 'number' },
            { name: 'ended_at', type: 'number', isOptional: true },
            { name: 'created_at', type: 'number' },
          ],
        }),
        createTable({
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
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'work_session_gps_points',
          columns: [
            { name: 'session_id', type: 'string', isIndexed: true },
            // Fix P4: indice individual en captured_at para timeline sort
            // y last-point lookup en closeStaleSessions (WMDB sin compuestos).
            { name: 'captured_at', type: 'number', isIndexed: true },
            { name: 'latitude', type: 'number' },
            { name: 'longitude', type: 'number' },
            { name: 'accuracy_m', type: 'number', isOptional: true },
            { name: 'created_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      // v27 → v28: equipment.category (laboratorio | maquinaria_pesada)
      // Distingue equipos de QA/QC vs maquinaria de Trazabilidad.
      toVersion: 28,
      steps: [
        addColumns({
          table: 'equipment',
          columns: [
            { name: 'category', type: 'string', isIndexed: true },
          ],
        }),
        // Backfill local: filas pre-v28 quedan en 'laboratorio' por default.
        unsafeExecuteSql("UPDATE equipment SET category = 'laboratorio' WHERE category IS NULL OR category = '';"),
      ],
    },
    {
      // v28 → v29: project_sectors.sort_order. Conserva orden del Excel para
      // que el análisis de Trazabilidad muestre los sectores tal como se
      // cargaron, no por duración descendente.
      toVersion: 29,
      steps: [
        addColumns({
          table: 'project_sectors',
          columns: [
            { name: 'sort_order', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      // v29 → v30: checklist en Trazabilidad — work_session_form_items con
      // Sí/No/N/A + flag de respondido (espejo de protocol_items). evidences
      // gana session_form_item_id para fotos asociadas a items del checklist.
      toVersion: 30,
      steps: [
        addColumns({
          table: 'work_session_form_items',
          columns: [
            { name: 'is_compliant', type: 'boolean', isOptional: true },
            { name: 'is_na', type: 'boolean', isOptional: true },
            { name: 'has_answer', type: 'boolean', isOptional: true },
          ],
        }),
        addColumns({
          table: 'evidences',
          columns: [
            { name: 'session_form_item_id', type: 'string', isOptional: true, isIndexed: true },
          ],
        }),
      ],
    },
    {
      // v30 → v31: modos de llenado + codificación correlativa (Partes D+E).
      // protocol_code: código correlativo del ensayo (PR-260032); índice único
      // parcial (project_id, protocol_code) en Supabase. ensayo_date: fecha del
      // ENSAYO (YYYY-MM-DD, ≠ fecha de carga) — agrupador del modo "por fecha".
      toVersion: 31,
      steps: [
        addColumns({
          table: 'protocols',
          columns: [
            { name: 'protocol_code', type: 'string', isOptional: true, isIndexed: true },
            { name: 'ensayo_date', type: 'string', isOptional: true, isIndexed: true },
          ],
        }),
      ],
    },
    {
      // v31 → v32: hora de INICIO del ensayo (HH:MM). Se recolecta al crear la
      // instancia (default: hora del sistema al guardar; editable en el modal).
      toVersion: 32,
      steps: [
        addColumns({
          table: 'protocols',
          columns: [
            { name: 'ensayo_time', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 33,
      steps: [
        addColumns({
          table: 'protocols',
          columns: [
            // v33 — motivo de aprobación cuando el jefe aprueba un ensayo fuera de rango.
            { name: 'approval_reason', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 34,
      steps: [
        addColumns({
          table: 'projects',
          columns: [
            // v34 — ortofoto liviana georreferenciada (para mostrarla en el mapa GIS del celular).
            { name: 'orthophoto_s3_key', type: 'string', isOptional: true },
            { name: 'orthophoto_bounds_json', type: 'string', isOptional: true },
            { name: 'orthophoto_system', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 35,
      steps: [
        addColumns({
          table: 'protocols',
          columns: [
            // v35 — captura GPS de precisión (promediado de waypoints).
            { name: 'coord_method', type: 'string', isOptional: true },
            { name: 'coord_sample_count', type: 'number', isOptional: true },
            { name: 'coord_precision_m', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 36,
      steps: [
        addColumns({
          table: 'projects',
          columns: [
            // teselado — teselas de la ortofoto activa (JSON [{s3Key,bounds}]).
            { name: 'orthophoto_tiles_json', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 37,
      steps: [
        // Tablas Resumen — 1 fila por ensayo, construida progresivamente al guardar.
        createTable({
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
      ],
    },
    {
      toVersion: 38,
      steps: [
        // v38 — config de Tabla Resumen embebida en la plantilla (hoja RESUMEN).
        addColumns({
          table: 'protocol_templates',
          columns: [{ name: 'summary_config_json', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 39,
      steps: [
        // v39 — ocultar tipo de ensayo: no aparece en selectores de ensayo NUEVO
        // ni se puede crear, pero los registros existentes siguen visibles.
        addColumns({
          table: 'protocol_templates',
          columns: [{ name: 'is_hidden', type: 'boolean', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 40,
      steps: [
        // v40 — tablas auxiliares de laboratorio a nivel proyecto (grupos: taras,
        // moldes, fiolas, densidad-agua), llamadas desde la ficha por group_key.
        createTable({
          name: 'lab_aux_tables',
          columns: [
            { name: 'project_id', type: 'string', isIndexed: true },
            { name: 'group_key', type: 'string', isIndexed: true },
            { name: 'name', type: 'string', isOptional: true },
            { name: 'columns_json', type: 'string' },
            { name: 'rows_json', type: 'string' },
            { name: 'last_calibration_at', type: 'number', isOptional: true },
            { name: 'next_calibration_at', type: 'number', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 41,
      steps: [
        // v41 — Papelera de Reciclaje: copia estática de ensayos eliminados
        // (hard delete + copia). Solo lectura; no interactúa con el sistema.
        createTable({
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
      ],
    },
    {
      toVersion: 42,
      steps: [
        // v42 — snapshot de llamados entre ensayos (@código.celda) congelado al enviar.
        addColumns({
          table: 'protocols',
          columns: [{ name: 'xref_snapshot_json', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 43,
      steps: [
        // v43 — Módulo "ensayos por muestra" + soft-delete de usuarios + id de muestras.
        addColumns({
          table: 'users',
          columns: [{ name: 'is_active', type: 'boolean', isOptional: true }],
        }),
        addColumns({
          table: 'projects',
          columns: [{ name: 'sample_identifier', type: 'string', isOptional: true }],
        }),
        addColumns({
          table: 'protocols',
          columns: [{ name: 'sample_id', type: 'string', isOptional: true, isIndexed: true }],
        }),
        createTable({
          name: 'samples',
          columns: [
            { name: 'project_id', type: 'string', isIndexed: true },
            { name: 'sample_code', type: 'string', isIndexed: true },
            { name: 'seq', type: 'number', isOptional: true },
            { name: 'sample_date', type: 'string', isOptional: true },
            { name: 'location_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'sector_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'material_type', type: 'string', isOptional: true },
            { name: 'condition', type: 'string', isOptional: true },
            { name: 'depth_from', type: 'number', isOptional: true },
            { name: 'depth_to', type: 'number', isOptional: true },
            { name: 'coord_system', type: 'string', isOptional: true },
            { name: 'latitude', type: 'number', isOptional: true },
            { name: 'longitude', type: 'number', isOptional: true },
            { name: 'coord_east', type: 'number', isOptional: true },
            { name: 'coord_north', type: 'number', isOptional: true },
            { name: 'coord_elevation', type: 'number', isOptional: true },
            { name: 'coord_captured_at', type: 'number', isOptional: true },
            { name: 'coord_accuracy_m', type: 'number', isOptional: true },
            { name: 'layer_info_json', type: 'string', isOptional: true },
            { name: 'notes', type: 'string', isOptional: true },
            { name: 'created_by_id', type: 'string', isOptional: true },
            { name: 'upload_status', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
  ],
});
