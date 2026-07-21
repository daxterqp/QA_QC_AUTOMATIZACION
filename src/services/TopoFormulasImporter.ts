/**
 * TopoFormulasImporter (móvil) — importa el Excel de "Fórmulas y Tablas Auxiliares"
 * del módulo topográfico. Espejo conceptual de flow-qaqc-web/lib/topoFormulasImport.ts.
 *
 * Un solo .xlsx (o .csv) con dos hojas:
 *   - "Fórmulas": filas `Columna | Fórmula` → se asignan a las columnas de config
 *     por NOMBRE (las nuevas se agregan). Se persisten en feature_flags.topo_columns
 *     vía mergeAndSaveFeatureFlags (merge contra la nube).
 *   - "Tablas Auxiliares": filas `tabla-<nombre> | columna | v1 | v2 …` → upsert en
 *     lab_aux_tables (local + push directo con arrays→jsonb). Reusa el patrón de
 *     TraceabilityExcelImporter (única ruta donde el móvil ESCRIBE lab_aux_tables).
 */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { Q } from '@nozbe/watermelondb';
import { database, labAuxTablesCollection, projectsCollection } from '@db/index';
import { supabase } from '@config/supabase';
import { mergeAndSaveFeatureFlags } from '@services/SupabaseSyncService';
import { parseFeatureFlagsJson, mergeFeatureFlags, topoColumns } from '@utils/featureFlags';
import { applyTopoFormulas, type TopoFormulaEntry } from '@utils/topoFormula';

export class TopoFormulasImportError extends Error {}
export class TopoFormulasImportCancelled extends Error {
  constructor() { super('Cancelado por el usuario.'); }
}

export interface TopoFormulasImportSummary {
  formulas: { applied: number; created: number };
  auxTables: { upserted: number; names: string[] };
  warnings: string[];
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function readSheet(wb: XLSX.WorkBook, candidates: string[]): (string | number)[][] | null {
  for (const sn of wb.SheetNames) {
    const k = normalize(sn);
    if (candidates.some((c) => normalize(c) === k)) {
      return XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[sn], { header: 1, defval: '' });
    }
  }
  return null;
}

interface ParsedAuxTable { groupKey: string; name: string; columns: string[]; rows: string[][] }

/** Espejo de parseAuxTablesSheet (web + TraceabilityExcelImporter). */
function parseAuxTablesSheet(wb: XLSX.WorkBook): ParsedAuxTable[] {
  const rows = readSheet(wb, ['Tablas auxiliares', 'Tablas Auxiliares', 'Tablas', 'Auxiliares', 'Aux']);
  if (!rows) return [];
  const TABLA_RE = /^tabla-(.+)$/i;
  const groups = new Map<string, { name: string; fields: { col: string; values: string[] }[] }>();
  let current: string | null = null;
  for (const r of rows) {
    const a = String(r[0] ?? '').trim();
    const b = String(r[1] ?? '').trim();
    const m = a.match(TABLA_RE);
    if (m) current = m[1].trim();
    else if (a !== '') { current = null; continue; }
    if (!current || !b) continue;
    const values = r.slice(2).map((v) => String(v ?? '').trim());
    while (values.length && values[values.length - 1] === '') values.pop();
    const key = current.toLowerCase();
    if (!groups.has(key)) groups.set(key, { name: current, fields: [] });
    groups.get(key)!.fields.push({ col: b, values });
  }
  const out: ParsedAuxTable[] = [];
  for (const g of Array.from(groups.values())) {
    const columns = g.fields.map((f) => f.col);
    if (columns.length === 0) continue;
    const nRows = g.fields.reduce((mx, f) => Math.max(mx, f.values.length), 0);
    const rowsOut: string[][] = [];
    for (let i = 0; i < nRows; i++) {
      const row = g.fields.map((f) => f.values[i] ?? '');
      if ((row[0] ?? '') === '') continue;
      rowsOut.push(row);
    }
    out.push({ groupKey: g.name.toLowerCase(), name: g.name, columns, rows: rowsOut });
  }
  return out;
}

/** Espejo de parseTopoFormulasSheet (web). Filas `Columna | Fórmula`. */
function parseTopoFormulasSheet(wb: XLSX.WorkBook): { entries: TopoFormulaEntry[]; warnings: string[] } {
  const rows = readSheet(wb, ['Fórmulas', 'Formulas', 'Fórmula', 'Formula', 'Topo Fórmulas', 'Topo Formulas']);
  if (!rows) return { entries: [], warnings: [] };
  const entries: TopoFormulaEntry[] = [];
  const warnings: string[] = [];
  const HEADER = new Set(['columna', 'nombre', 'tipo', 'campo', 'column', 'name']);
  for (const r of rows) {
    const name = String(r[0] ?? '').trim();
    const formula = String(r[1] ?? '').trim();
    if (!name) continue;
    if (HEADER.has(name.toLowerCase()) && (!formula || HEADER.has(formula.toLowerCase()))) continue;
    if (!formula) { warnings.push(`Columna "${name}": sin fórmula — omitida.`); continue; }
    const key = name.toLowerCase();
    const prevIdx = entries.findIndex((e) => e.name.toLowerCase() === key);
    if (prevIdx >= 0) { warnings.push(`Columna "${name}": duplicada — se usa la última.`); entries.splice(prevIdx, 1); }
    entries.push({ name, formula });
  }
  return { entries, warnings };
}

const newId = (prefix: string) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9).toString(36)}`;

/** Abre el selector, lee el archivo, importa fórmulas + tablas auxiliares. */
export async function pickAndImportTopoFormulas(projectId: string): Promise<TopoFormulasImportSummary> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) throw new TopoFormulasImportCancelled();
  const asset = result.assets[0];
  if (!/\.(xlsx?|csv)$/i.test(asset.name)) {
    throw new TopoFormulasImportError('Formato no válido. Selecciona .csv, .xls o .xlsx');
  }

  let wb: XLSX.WorkBook;
  if (/\.csv$/i.test(asset.name)) {
    const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
    wb = XLSX.read(text, { type: 'string' });
  } else {
    const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    const raw = atob(b64);
    const buf = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    wb = XLSX.read(buf.buffer, { type: 'array', cellDates: false });
  }

  const tables = parseAuxTablesSheet(wb);
  const { entries, warnings: fW } = parseTopoFormulasSheet(wb);
  const warnings = [...fW];

  if (tables.length === 0 && entries.length === 0) {
    throw new TopoFormulasImportError('No se encontraron hojas "Fórmulas" ni "Tablas Auxiliares" con datos.');
  }

  // ── Fórmulas → topo_columns (lee flags autoritativos: nube > local) ─────────
  let applied = 0, created = 0;
  if (entries.length > 0) {
    const local: any = await projectsCollection.find(projectId).catch(() => null);
    let flags = local ? parseFeatureFlagsJson(local.featureFlags) : mergeFeatureFlags(null);
    try {
      const { data } = await supabase.from('projects').select('feature_flags').eq('id', projectId).maybeSingle();
      const ff = (data as any)?.feature_flags;
      if (ff != null) flags = typeof ff === 'string' ? parseFeatureFlagsJson(ff) : mergeFeatureFlags(ff);
    } catch { /* offline → flags locales */ }
    const res = applyTopoFormulas(topoColumns(flags), entries);
    applied = res.applied; created = res.created;
    warnings.push(...res.warnings);
    if (applied + created > 0) await mergeAndSaveFeatureFlags(projectId, { topo_columns: res.columns });
  }

  // ── Tablas auxiliares → upsert local + push directo (arrays→jsonb) ──────────
  const auxNames: string[] = [];
  if (tables.length > 0) {
    const existingAux = await labAuxTablesCollection.query(Q.where('project_id', projectId)).fetch();
    const auxByKey = new Map<string, any>();
    for (const t of existingAux as any[]) auxByKey.set(String(t.groupKey).toLowerCase(), t);
    const remoteIdByKey = new Map<string, string>();
    try {
      const { data } = await supabase
        .from('lab_aux_tables').select('id, group_key').eq('project_id', projectId)
        .in('group_key', tables.map((t) => t.groupKey));
      for (const r of (data ?? []) as any[]) remoteIdByKey.set(String(r.group_key).toLowerCase(), r.id);
    } catch { /* offline */ }

    const idByKey = new Map<string, string>();
    await database.write(async () => {
      const ops: any[] = [];
      for (const t of tables) {
        const prev = auxByKey.get(t.groupKey);
        const colsStr = JSON.stringify(t.columns);
        const rowsStr = JSON.stringify(t.rows);
        if (prev) {
          idByKey.set(t.groupKey, prev.id);
          ops.push(prev.prepareUpdate((r: any) => { r.name = t.name; r.columnsJson = colsStr; r.rowsJson = rowsStr; }));
        } else {
          const id = remoteIdByKey.get(t.groupKey) ?? newId('aux');
          idByKey.set(t.groupKey, id);
          ops.push(labAuxTablesCollection.prepareCreate((r: any) => {
            r._raw.id = id;
            r.projectId = projectId; r.groupKey = t.groupKey; r.name = t.name;
            r.columnsJson = colsStr; r.rowsJson = rowsStr;
          }));
        }
      }
      await database.batch(ops);
    });
    // Push AWAIT-eado: el resumen solo cuenta las que subieron a la nube. Si una
    // falla (RLS / falta v41 / sin red) va a `warnings` y NO se cuenta como subida
    // (la escritura local sí quedó; otros dispositivos la verán al reintentar).
    const pushes = await Promise.allSettled(tables.map((t) =>
      supabase.from('lab_aux_tables').upsert({
        id: idByKey.get(t.groupKey),
        project_id: projectId, group_key: t.groupKey, name: t.name,
        columns_json: t.columns, rows_json: t.rows, updated_at: Date.now(),
      }, { onConflict: 'project_id,group_key' }).then(({ error }) => {
        if (error) throw new Error(error.message);
      }),
    ));
    pushes.forEach((res, i) => {
      const t = tables[i];
      if (res.status === 'fulfilled') auxNames.push(t.name);
      else warnings.push(`Tabla auxiliar "${t.name}" guardada local pero NO en la nube: ${(res.reason as Error)?.message ?? 'error'}`);
    });
  }

  return { formulas: { applied, created }, auxTables: { upserted: auxNames.length, names: auxNames }, warnings };
}
