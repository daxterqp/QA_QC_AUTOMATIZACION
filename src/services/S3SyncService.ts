import * as FileSystem from 'expo-file-system';
import { Q } from '@nozbe/watermelondb';
import {
  database,
  protocolTemplatesCollection,
  protocolTemplateItemsCollection,
  locationsCollection,
  plansCollection,
} from '@db/index';
import { downloadFromS3, listS3Keys } from './S3Service';
import { importExcelMaestroFromUri } from './ExcelImporter';
import { importExcelLocationsFromUri } from './ExcelLocationsImporter';
import { s3ProjectPrefix } from '@config/aws';
import { pushPlansToSupabase } from './SupabaseSyncService';

export interface S3SyncResult {
  activities: { imported: number; skipped: number; error?: string };
  locations: { imported: number; skipped: number; error?: string };
  plans: { downloaded: number; error?: string };
}

export async function syncProjectFromS3(
  projectId: string,
  projectName: string,
  uploadedById: string
): Promise<S3SyncResult> {
  const result: S3SyncResult = {
    activities: { imported: 0, skipped: 0 },
    locations: { imported: 0, skipped: 0 },
    plans: { downloaded: 0 },
  };

  const prefix = s3ProjectPrefix(projectName);

  // ── 1. Actividades ────────────────────────────────────────────────────────
  try {
    const activityKeys = await listS3Keys(`${prefix}/activities/`);
    for (const actKey of activityKeys) {
      const localUri = `${FileSystem.cacheDirectory}s3_act_${projectId}_${Date.now()}.xlsx`;
      try {
        await downloadFromS3(actKey, localUri);
        const parsed = await importExcelMaestroFromUri(localUri);

        const existing = await protocolTemplatesCollection
          .query(Q.where('project_id', projectId))
          .fetch();
        const existingIds = new Set(existing.map((t) => t.idProtocolo));

        await database.write(async () => {
          for (const group of parsed.protocols) {
            if (existingIds.has(group.idProtocolo)) {
              result.activities.skipped++;
              continue;
            }
            const template = await protocolTemplatesCollection.create((t) => {
              t.projectId = projectId;
              t.idProtocolo = group.idProtocolo;
              t.name = group.protocolName;
            });
            for (const activity of group.activities) {
              await protocolTemplateItemsCollection.create((item) => {
                item.templateId = template.id;
                item.partidaItem = activity.partidaItem || null;
                item.itemDescription = activity.actividadRealizada;
                item.validationMethod = activity.metodoValidacion || null;
                (item as any).section = activity.seccion ?? null;
              });
            }
            result.activities.imported++;
          }
        });
      } catch { /* archivo individual falla, continuar con siguiente */ }
    }
  } catch (e) {
    result.activities.error = String(e);
  }

  // ── 2. Ubicaciones ────────────────────────────────────────────────────────
  try {
    const locationKeys = await listS3Keys(`${prefix}/locations/`);
    for (const locKey of locationKeys) {
      const localUri = `${FileSystem.cacheDirectory}s3_loc_${projectId}_${Date.now()}.xlsx`;
      try {
        await downloadFromS3(locKey, localUri);
        const parsed = await importExcelLocationsFromUri(localUri);

        const existing = await locationsCollection
          .query(Q.where('project_id', projectId))
          .fetch();
        const existingNames = new Set(existing.map((l) => l.name.toLowerCase()));
        const toInsert = parsed.locations.filter(
          (loc) => !existingNames.has(loc.name.toLowerCase())
        );

        await database.write(async () => {
          for (const loc of toInsert) {
            await locationsCollection.create((record) => {
              record.projectId = projectId;
              record.name = loc.name;
              record.referencePlan = loc.referencePlan;
              (record as any).templateIds = loc.templateIds || null;
            });
          }
        });
        result.locations.imported += toInsert.length;
        result.locations.skipped += parsed.locations.length - toInsert.length;
      } catch { /* archivo individual falla, continuar con siguiente */ }
    }
  } catch (e) {
    result.locations.error = String(e);
  }

  // ── 3. Planos ─────────────────────────────────────────────────────────────
  try {
    const planKeys = await listS3Keys(`${prefix}/plans/`);
    const destDir = `${FileSystem.documentDirectory}plans/`;
    await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });

    const existingPlans = await plansCollection
      .query(Q.where('project_id', projectId))
      .fetch();
    const existingPlanNames = new Set(existingPlans.map((p) => p.name.toLowerCase()));
    const freshLocations = await locationsCollection
      .query(Q.where('project_id', projectId))
      .fetch();

    for (const key of planKeys) {
      const fileName = key.split('/').pop();
      if (!fileName) continue;
      const planName = fileName.replace(/\.pdf$/i, '');
      if (existingPlanNames.has(planName.toLowerCase())) continue;

      const localUri = `${destDir}${fileName}`;
      await downloadFromS3(key, localUri);

      const matchingLocs = freshLocations.filter((loc) => {
        const refs = ((loc as any).referencePlan ?? '') as string;
        return refs
          .split(/[,;]/)
          .map((s) => s.trim().toLowerCase())
          .includes(planName.toLowerCase().trim());
      });

      await database.write(async () => {
        if (matchingLocs.length > 0) {
          for (const loc of matchingLocs) {
            await plansCollection.create((p) => {
              p.projectId = projectId;
              p.locationId = loc.id;
              p.name = planName;
              p.fileUri = localUri;
              p.uploadedById = uploadedById;
            });
          }
        } else {
          await plansCollection.create((p) => {
            p.projectId = projectId;
            p.locationId = null;
            p.name = planName;
            p.fileUri = localUri;
            p.uploadedById = uploadedById;
          });
        }
      });
      result.plans.downloaded++;
    }
    if (result.plans.downloaded > 0) {
      pushPlansToSupabase(projectId).catch(() => {});
    }
  } catch (e) {
    result.plans.error = String(e);
  }

  return result;
}

// ── Descarga solo planos desde S3 (para botón en PlansManagementScreen) ──────

export interface S3PlansResult {
  downloaded: number;
  skipped: number;
  error?: string;
}

export async function downloadPlansFromS3(
  projectId: string,
  projectName: string,
  uploadedById: string
): Promise<S3PlansResult> {
  const result: S3PlansResult = { downloaded: 0, skipped: 0 };
  const prefix = s3ProjectPrefix(projectName);

  try {
    const planKeys = await listS3Keys(`${prefix}/plans/`);
    const destDir = `${FileSystem.documentDirectory}plans/`;
    await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });

    const existingPlans = await plansCollection
      .query(Q.where('project_id', projectId))
      .fetch();
    const existingPlanNames = new Set(existingPlans.map((p) => p.name.toLowerCase()));
    const freshLocations = await locationsCollection
      .query(Q.where('project_id', projectId))
      .fetch();

    for (const key of planKeys) {
      const fileName = key.split('/').pop();
      if (!fileName) continue;
      const planName = fileName.replace(/\.pdf$/i, '');
      if (existingPlanNames.has(planName.toLowerCase())) {
        result.skipped++;
        continue;
      }

      const localUri = `${destDir}${fileName}`;
      await downloadFromS3(key, localUri);

      const matchingLocs = freshLocations.filter((loc) => {
        const refs = ((loc as any).referencePlan ?? '') as string;
        return refs
          .split(/[,;]/)
          .map((s) => s.trim().toLowerCase())
          .includes(planName.toLowerCase().trim());
      });

      await database.write(async () => {
        if (matchingLocs.length > 0) {
          for (const loc of matchingLocs) {
            await plansCollection.create((p) => {
              p.projectId = projectId;
              p.locationId = loc.id;
              p.name = planName;
              p.fileUri = localUri;
              p.uploadedById = uploadedById;
            });
          }
        } else {
          await plansCollection.create((p) => {
            p.projectId = projectId;
            p.locationId = null;
            p.name = planName;
            p.fileUri = localUri;
            p.uploadedById = uploadedById;
          });
        }
      });
      result.downloaded++;
    }
    if (result.downloaded > 0) {
      pushPlansToSupabase(projectId).catch(() => {});
    }
  } catch (e) {
    result.error = String(e);
  }

  return result;
}

// ── Descarga solo DWG desde S3 ────────────────────────────────────────────────

export interface S3DwgResult {
  downloaded: number;
  skipped: number;
  error?: string;
}

export async function downloadDwgFromS3(
  projectName: string,
  destDir: string
): Promise<S3DwgResult> {
  const result: S3DwgResult = { downloaded: 0, skipped: 0 };
  const prefix = s3ProjectPrefix(projectName);
  try {
    const keys = await listS3Keys(`${prefix}/plansdwg/`);
    await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
    const existing = await FileSystem.readDirectoryAsync(destDir).catch(() => [] as string[]);
    const existingSet = new Set(existing.map((f) => f.toLowerCase()));
    for (const key of keys) {
      const fileName = key.split('/').pop();
      if (!fileName) continue;
      if (existingSet.has(fileName.toLowerCase())) { result.skipped++; continue; }
      await downloadFromS3(key, `${destDir}${fileName}`);
      result.downloaded++;
    }
  } catch (e) {
    result.error = String(e);
  }
  return result;
}
