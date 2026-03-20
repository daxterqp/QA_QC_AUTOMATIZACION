import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { database, locationsCollection } from '@db/index';
import {
  importExcelLocations,
  LocationsImportError,
} from '@services/ExcelLocationsImporter';
import { uploadToS3 } from '@services/S3Service';
import { s3ProjectPrefix } from '@config/aws';

export type LocationsImportState =
  | { status: 'idle' }
  | { status: 'picking' }
  | { status: 'importing' }
  | { status: 'success'; totalLocations: number }
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

      const existing = await locationsCollection.query().fetch();
      const existingNames = new Set(
        existing
          .filter((l) => l.projectId === projectId)
          .map((l) => l.name.toLowerCase())
      );

      const toInsert = result.locations.filter(
        (loc) => !existingNames.has(loc.name.toLowerCase())
      );

      await database.write(async () => {
        for (const loc of toInsert) {
          await locationsCollection.create((record) => {
            record.projectId = projectId;
            record.name = loc.name;
            record.locationOnly = loc.locationOnly || null;
            record.specialty = loc.specialty || null;
            record.referencePlan = loc.referencePlan;
            record.templateIds = loc.templateIds || null;
          });
        }
      });

      setImportState({ status: 'success', totalLocations: toInsert.length });

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
