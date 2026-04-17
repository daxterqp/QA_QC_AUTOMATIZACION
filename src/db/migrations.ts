import {
  schemaMigrations,
  addColumns,
  createTable,
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
  ],
});
