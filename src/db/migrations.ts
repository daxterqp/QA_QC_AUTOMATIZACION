import {
  schemaMigrations,
  addColumns,
  createTable,
} from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    {
      // v1 → v2: partida_item y validation_method en protocol_items
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
      // v2 → v3: tabla locations + FK location_id en protocols
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
      // v3 → v4: usuarios, no conformidades, campos adicionales en protocols y projects
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
  ],
});
