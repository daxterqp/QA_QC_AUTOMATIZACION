import { useCallback, useState } from 'react';
import { database, locationsCollection } from '@db/index';
import {
  importExcelLocations,
  LocationsImportError,
} from '@services/ExcelLocationsImporter';

export type LocationsImportState =
  | { status: 'idle' }
  | { status: 'picking' }
  | { status: 'importing' }
  | { status: 'success'; totalLocations: number }
  | { status: 'error'; message: string; missingColumns?: string[] };

/**
 * Hook que orquesta la importacion del Excel de Ubicaciones hacia WatermelonDB.
 *
 * Crea registros en la tabla `locations` asociados al proyecto.
 * Si la ubicacion ya existe (mismo nombre en el mismo proyecto), la omite
 * para evitar duplicados en re-importaciones.
 *
 * @param projectId  ID del Project al que pertenecen las ubicaciones
 */
export function useLocationsImport(projectId: string) {
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

      // Cargar ubicaciones existentes para evitar duplicados
      const existing = await locationsCollection
        .query()
        .fetch();
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
            record.referencePlan = loc.referencePlan;
          });
        }
      });

      setImportState({ status: 'success', totalLocations: toInsert.length });
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
