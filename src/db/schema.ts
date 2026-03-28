import { appSchema, tableSchema } from '@nozbe/watermelondb';

/**
 * Schema S-CUA MVP
 * v14: is_na en protocol_items (respuesta N/A)
 */
export const schema = appSchema({
  version: 14,
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
  ],
});
