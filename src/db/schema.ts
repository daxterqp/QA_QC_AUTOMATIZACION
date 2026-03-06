import { appSchema, tableSchema } from '@nozbe/watermelondb';

/**
 * Schema S-CUA MVP
 *
 * v1: tablas base
 * v2: partida_item, validation_method en protocol_items
 * v3: tabla locations, location_id en protocols
 * v4: tabla users, tabla non_conformities
 *     + signed_by_id, signed_at, corrections_allowed en protocols
 *     + ProtocolStatus ampliado: DRAFT | SUBMITTED | APPROVED | REJECTED
 */
export const schema = appSchema({
  version: 4,
  tables: [
    // ── users ────────────────────────────────────────────────────────────────
    tableSchema({
      name: 'users',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'role', type: 'string' },            // OPERATOR | SUPERVISOR | RESIDENT
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
        { name: 'created_by_id', type: 'string', isOptional: true },
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
        { name: 'reference_plan', type: 'string' },
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
        { name: 'status', type: 'string' },          // DRAFT | SUBMITTED | APPROVED | REJECTED
        { name: 'protocol_number', type: 'string' },
        { name: 'location_reference', type: 'string' },
        { name: 'latitude', type: 'number', isOptional: true },
        { name: 'longitude', type: 'number', isOptional: true },
        { name: 'is_locked', type: 'boolean' },
        { name: 'corrections_allowed', type: 'boolean' },  // Jefe autoriza correccion
        { name: 'signed_by_id', type: 'string', isOptional: true },
        { name: 'signed_at', type: 'number', isOptional: true },
        { name: 'upload_status', type: 'string' },
        { name: 'filled_by_id', type: 'string', isOptional: true },  // Supervisor que llenó
        { name: 'filled_at', type: 'number', isOptional: true },
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
        { name: 'is_compliant', type: 'boolean' },
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
  ],
});
