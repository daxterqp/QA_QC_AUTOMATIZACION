import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { database, locationsCollection } from '@db/index';
import {
  importExcelLocations,
  LocationsImportError,
} from '@services/ExcelLocationsImporter';
import { uploadToS3 } from '@services/S3Service';
import { s3ProjectPrefix } from '@config/aws';
import { pushProjectToSupabase } from '@services/SupabaseSyncService';
import { Q } from '@nozbe/watermelondb';
import type Location from '@db/models/Location';

export type LocationsImportState =
  | { status: 'idle' }
  | { status: 'picking' }
  | { status: 'importing' }
  | { status: 'success'; totalLocations: number; modifiedLocations: number }
  | { status: 'error'; message: string; missingColumns?: string[] };

export function useLocationsImport(projectId: string, projectName: string) {
  const [importState, setImportState] = useState<LocationsImportState>({ status: 'idle' });

  const startImport = useCallback(async () => {
    setImportState({ status: 'picking' });

    try {
      const result = await importExcelLocations();

      if (!result) {
        setImportState({ status: 'idle' });
        return;
      }

      setImportState({ status: 'importing' });

      // Cargar ubicaciones existentes del proyecto
      const existingLocations = await locationsCollection
        .query(Q.where('project_id', projectId))
        .fetch() as Location[];

      // Map de name.toLowerCase() → Location
      const locationByName = new Map<string, Location>(
        existingLocations.map((l) => [l.name.toLowerCase().trim(), l])
      );

      let addedLocations = 0;
      let modifiedLocations = 0;

      await database.write(async () => {
        for (const loc of result.locations) {
          const nameKey = loc.name.toLowerCase().trim();
          const existing = locationByName.get(nameKey);

          if (existing) {
            // Actualizar si algún campo cambió
            const needsUpdate =
              existing.locationOnly !== (loc.locationOnly || null) ||
              existing.specialty !== (loc.specialty || null) ||
              existing.referencePlan !== loc.referencePlan ||
              existing.templateIds !== (loc.templateIds || null);

            if (needsUpdate) {
              await existing.update((record) => {
                record.locationOnly = loc.locationOnly || null;
                record.specialty = loc.specialty || null;
                record.referencePlan = loc.referencePlan;
                record.templateIds = loc.templateIds || null;
              });
              modifiedLocations++;
            }
          } else {
            // Insertar nueva ubicación
            const newLoc = await locationsCollection.create((record) => {
              record.projectId = projectId;
              record.name = loc.name;
              record.locationOnly = loc.locationOnly || null;
              record.specialty = loc.specialty || null;
              record.referencePlan = loc.referencePlan;
              record.templateIds = loc.templateIds || null;
            }) as Location;
            locationByName.set(nameKey, newLoc);
            addedLocations++;
          }
        }
      });

      setImportState({
        status: 'success',
        totalLocations: addedLocations,
        modifiedLocations,
      });

      // Push a Supabase (no bloquea si falla)
      pushProjectToSupabase(projectId).catch(() => {});

      // Subir a S3 (no bloquea si falla)
      try {
        await uploadToS3(
          result.fileUri,
          `${s3ProjectPrefix(projectName)}/locations/${result.fileUri.split('/').pop() ?? 'locations.xlsx'}`,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
      } catch (e) {
        Alert.alert('S3 Error', String(e));
      }
    } catch (err) {
      if (err instanceof LocationsImportError) {
        setImportState({
          status: 'error',
          message: err.message,
          missingColumns: err.missingColumns,
        });
      } else {
        setImportState({ status: 'error', message: 'Error inesperado al importar ubicaciones.' });
        console.error('[useLocationsImport]', err);
      }
    }
  }, [projectId]);

  const reset = useCallback(() => setImportState({ status: 'idle' }), []);

  return { importState, startImport, reset };
}
