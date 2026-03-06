import { useCallback, useState } from 'react';
import { database, protocolsCollection, protocolItemsCollection } from '@db/index';
import {
  importExcelMaestro,
  ExcelImportError,
  type ExcelProtocolGroup,
} from '@services/ExcelImporter';

export type ImportState =
  | { status: 'idle' }
  | { status: 'picking' }
  | { status: 'importing'; current: number; total: number }
  | { status: 'success'; totalProtocols: number; totalActivities: number }
  | { status: 'error'; message: string; missingColumns?: string[] };

/**
 * Hook que orquesta la importacion del Excel maestro hacia WatermelonDB.
 *
 * Flujo:
 * 1. Abre el file picker
 * 2. Parsea y valida el Excel (ExcelImporter)
 * 3. Por cada protocolo unico del Excel, crea un registro en `protocols`
 * 4. Por cada actividad, crea un registro en `protocol_items`
 * 5. Todo en una sola transaccion batch para maxima velocidad
 *
 * @param projectId  ID del Project al que se asociaran los protocolos importados
 */
export function useExcelImport(projectId: string) {
  const [importState, setImportState] = useState<ImportState>({ status: 'idle' });

  const startImport = useCallback(async () => {
    setImportState({ status: 'picking' });

    try {
      // ── Paso 1: Seleccionar y parsear Excel ────────────────────────────────
      const result = await importExcelMaestro();

      if (!result) {
        // Usuario cancelo el picker
        setImportState({ status: 'idle' });
        return;
      }

      const { protocols } = result;
      setImportState({ status: 'importing', current: 0, total: protocols.length });

      // ── Paso 2: Escribir en WatermelonDB con batch ─────────────────────────
      let totalActivities = 0;

      await database.write(async () => {
        for (let i = 0; i < protocols.length; i++) {
          const group = protocols[i];
          setImportState({ status: 'importing', current: i + 1, total: protocols.length });
          await importProtocolGroup(group, projectId);
          totalActivities += group.activities.length;
        }
      });

      setImportState({
        status: 'success',
        totalProtocols: protocols.length,
        totalActivities,
      });
    } catch (err) {
      if (err instanceof ExcelImportError) {
        setImportState({
          status: 'error',
          message: err.message,
          missingColumns: err.missingColumns,
        });
      } else {
        setImportState({
          status: 'error',
          message: 'Error inesperado al importar el archivo.',
        });
        console.error('[useExcelImport]', err);
      }
    }
  }, [projectId]);

  const reset = useCallback(() => setImportState({ status: 'idle' }), []);

  return { importState, startImport, reset };
}

// ─── Helper interno ───────────────────────────────────────────────────────────

async function importProtocolGroup(
  group: ExcelProtocolGroup,
  projectId: string
): Promise<void> {
  // Crear el protocolo
  const protocol = await protocolsCollection.create((p) => {
    p.projectId = projectId;
    p.protocolNumber = group.protocolName;
    p.locationReference = '';   // El usuario puede completar despues en el formulario
    p.status = 'DRAFT';
    p.isLocked = false;
    p.uploadStatus = 'PENDING';
    p.latitude = null;
    p.longitude = null;
  });

  // Crear todos los items del protocolo
  for (const activity of group.activities) {
    await protocolItemsCollection.create((item) => {
      item.protocolId = protocol.id;
      item.partidaItem = activity.partidaItem || null;
      item.itemDescription = activity.actividadRealizada;
      item.validationMethod = activity.metodoValidacion || null;
      item.isCompliant = false;   // Estado inicial — el usuario completa en campo
      item.comments = activity.observaciones ?? null;
    });
  }
}
