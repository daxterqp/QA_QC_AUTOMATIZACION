/**
 * TraceabilityExcelImporter (móvil) — espejo del parser web `parseTraceabilityExcel`.
 *
 * Lee un Excel multi-hoja de trazabilidad:
 *   - Equipos                  (catálogo de equipos)
 *   - Actividades              (catálogo de actividades)
 *   - Equipo-Actividad         (relación M:N con plantilla opcional)
 *   - Turnos                   (work_shifts)
 *   - Plantillas Formulario    (session_form_templates + items)
 *
 * Cada hoja es opcional; las que falten generan warning y se omiten.
 * Persistencia local + encola PUSH_* a Supabase via SyncQueueService.
 */

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';
import {
  database,
  activitiesCollection, equipmentCollection, equipmentActivitiesCollection,
  workShiftsCollection, sessionFormTemplatesCollection, sessionFormTemplateItemsCollection,
  labAuxTablesCollection,
} from '@db/index';
import { Q } from '@nozbe/watermelondb';
import { supabase } from '@config/supabase';
import { enqueue as enqueueSync } from '@services/SyncQueueService';
import type { EquipmentType, EquipmentCategory } from '@models/Equipment';
import type { ActivityKind } from '@models/Activity';
import { importEquipmentLocally } from '@services/EquipmentExcelImporter';
import {
  pushActivityStrict, pushWorkShiftStrict, pushEquipmentActivityStrict,
  pushSessionFormTemplateStrict, pushSessionFormTemplateItemStrict,
} from '@services/SupabaseSyncService';

export class TraceabilityImportError extends Error {}
/** Lanzada cuando el usuario cancela el DocumentPicker — el caller debe
 *  diferenciarla de un error real para no mostrar UI roja innecesaria. */
export class TraceabilityImportCancelled extends Error {
  constructor() { super('Cancelado por el usuario.'); }
}

// ── Tipos exportados ─────────────────────────────────────────────────────────

export interface ParsedEquipment {
  code: string; name: string; type: EquipmentType; category: EquipmentCategory;
  brand: string | null; model: string | null; serial: string | null;
  capacity: string | null; resolution: string | null;
  lastCalibrationAt: number | null; nextCalibrationAt: number | null;
  notes: string | null;
}
export interface ParsedActivity { name: string; kind: ActivityKind }
export interface ParsedEquipActivity { equipmentCode: string; activityName: string; templateName: string | null }
export interface ParsedShift { name: string; startHour: number; endHour: number }
export interface ParsedTemplateItem {
  templateName: string;
  partidaItem: string | null;
  itemDescription: string;
  validationMethod: string | null;
  section: string | null;
}

/** v41 — Tabla auxiliar de laboratorio (hoja "Tablas auxiliares"). */
export interface ParsedAuxTable {
  groupKey: string;
  name: string;
  columns: string[];
  rows: string[][];
}

export interface TraceabilityParseResult {
  equipos: ParsedEquipment[];
  actividades: ParsedActivity[];
  equipoActividad: ParsedEquipActivity[];
  turnos: ParsedShift[];
  plantillas: ParsedTemplateItem[];
  auxTables: ParsedAuxTable[];
  warnings: string[];
}

/** v41 — Parsea la hoja "Tablas auxiliares": `A=tabla-<nombre> | B=<columna> | C,D,E…=valores`
 *  (un valor por celda). Agrupa por nombre; 1ª columna = LLAVE. Espejo del web. */
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
    const values = r.slice(2).map(v => String(v ?? '').trim());
    while (values.length && values[values.length - 1] === '') values.pop();
    const key = current.toLowerCase();
    if (!groups.has(key)) groups.set(key, { name: current, fields: [] });
    groups.get(key)!.fields.push({ col: b, values });
  }
  const out: ParsedAuxTable[] = [];
  for (const g of Array.from(groups.values())) {
    const columns = g.fields.map(f => f.col);
    if (columns.length === 0) continue;
    const nRows = g.fields.reduce((mx, f) => Math.max(mx, f.values.length), 0);
    const rowsOut: string[][] = [];
    for (let i = 0; i < nRows; i++) {
      const row = g.fields.map(f => f.values[i] ?? '');
      if ((row[0] ?? '') === '') continue;
      rowsOut.push(row);
    }
    out.push({ groupKey: g.name.toLowerCase(), name: g.name, columns, rows: rowsOut });
  }
  return out;
}

export interface TraceabilityImportSummary {
  equipment:     { added: number; modified: number; skipped: number; deduped?: number };
  activities:    { added: number; modified: number };
  links:         { added: number; modified: number; skipped: number };
  shifts:        { added: number; modified: number };
  templates:     { added: number; modified: number };
  templateItems: { added: number };
  warnings:      string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MACHINERY = new Set<string>([
  'excavadora', 'compactador', 'motoniveladora', 'retroexcavadora',
  'cargador_frontal', 'volquete', 'cisterna', 'rodillo',
]);
const VALID_EQUIPMENT_TYPES: EquipmentType[] = [
  'balanza', 'prensa', 'horno', 'tamiz', 'termometro',
  'excavadora', 'compactador', 'motoniveladora', 'retroexcavadora',
  'cargador_frontal', 'volquete', 'cisterna', 'rodillo', 'otros',
];

const KIND_MAP: Record<string, ActivityKind> = {
  productiva: 'productive', productivas: 'productive', productive: 'productive',
  mantenimiento: 'maintenance', maintenance: 'maintenance',
  transporte: 'transport', transport: 'transport',
  otro: 'other', otros: 'other', other: 'other',
};

// Rango Combining Diacritical Marks (U+0300..U+036F). Construido vía escapes
// para evitar dependencia visual de los marcadores literales en el archivo.
const DIACRITICS_RE = /[̀-ͯ]/g;
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(DIACRITICS_RE, '').trim();
}
function normalizeKey(s: string): string {
  return normalize(s).replace(/\s+/g, '_');
}

function parseExcelDate(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && isFinite(raw)) {
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    return isFinite(ms) ? ms : null;
  }
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    const d = new Date(Date.UTC(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10)));
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function parseHour(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    if (raw >= 0 && raw <= 1) return Math.floor(raw * 24) % 24;
    if (raw > 1 && raw <= 24) return Math.min(23, Math.floor(raw));
    return null;
  }
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})(?::\d{1,2})?/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  if (!Number.isFinite(h) || h < 0 || h > 23) return null;
  return h;
}

function readSheet(wb: XLSX.WorkBook, candidates: string[]): (string | number)[][] | null {
  for (const sn of wb.SheetNames) {
    const k = normalize(sn);
    if (candidates.some(c => normalize(c) === k)) {
      return XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[sn], { header: 1, defval: '' });
    }
  }
  return null;
}

// ── Parser principal ────────────────────────────────────────────────────────

/** Abre selector de archivos, lee el .csv/.xls/.xlsx y devuelve el parsed result.
 *  Detecta automáticamente:
 *   - .csv o xlsx con una sola hoja → solo equipos
 *   - xlsx multi-hoja → procesa todas las hojas reconocidas */
export async function pickAndParseTraceability(): Promise<TraceabilityParseResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) throw new TraceabilityImportCancelled();
  const asset = result.assets[0];
  if (!/\.(xlsx?|csv)$/i.test(asset.name)) {
    throw new TraceabilityImportError('Formato no válido. Selecciona .csv, .xls o .xlsx');
  }

  const isCsv = /\.csv$/i.test(asset.name);
  let wb: XLSX.WorkBook;
  if (isCsv) {
    const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
    wb = XLSX.read(text, { type: 'string' });
  } else {
    const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    const raw = atob(b64);
    const buf = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    wb = XLSX.read(buf.buffer, { type: 'array', cellDates: false });
  }

  const warnings: string[] = [];

  // ── Hoja Equipos ────────────────────────────────────────────────────────
  // Fallback para CSV/xlsx de 1 hoja sin nombre canónico: si solo hay UNA
  // hoja y sus headers parecen de equipos, la tratamos como hoja "Equipos".
  const equipos: ParsedEquipment[] = [];
  let equiposRows = readSheet(wb, ['Equipos', 'Equipment']);
  if (!equiposRows && wb.SheetNames.length === 1) {
    const onlySheet = XLSX.utils.sheet_to_json<(string | number)[]>(
      wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }
    );
    const headers = (onlySheet[0] ?? []).map(h => String(h ?? '').trim());
    if (['Código', 'Nombre', 'Tipo'].every(c => headers.includes(c))) {
      equiposRows = onlySheet;
      warnings.push(`Formato simple detectado — solo se importarán equipos desde "${wb.SheetNames[0]}".`);
    }
  }
  if (equiposRows && equiposRows.length >= 2) {
    const headers = equiposRows[0].map(h => String(h ?? '').trim());
    const REQUIRED = ['Código', 'Nombre', 'Tipo'];
    const missing = REQUIRED.filter(c => !headers.includes(c));
    if (missing.length > 0) {
      warnings.push(`Hoja "Equipos" omitida: faltan columnas ${missing.join(', ')}.`);
    } else {
      const idx: Record<string, number> = {};
      headers.forEach((h, i) => { idx[h] = i; });
      const get = (r: (string|number)[], c: string) => {
        const i = idx[c]; return i == null ? '' : String(r[i] ?? '').trim();
      };
      for (let i = 1; i < equiposRows.length; i++) {
        const row = equiposRows[i];
        const code = get(row, 'Código');
        if (!code) continue;
        const tipoNorm = normalizeKey(get(row, 'Tipo'));
        const catRaw = normalizeKey(get(row, 'Categoría'));
        const category: EquipmentCategory =
          catRaw === 'maquinaria_pesada' || catRaw === 'maquinaria' ? 'maquinaria_pesada'
          : catRaw === 'laboratorio' ? 'laboratorio'
          : (MACHINERY.has(tipoNorm) ? 'maquinaria_pesada' : 'laboratorio');
        let nextMs: number | null = null;
        if (idx['Próxima calibración'] != null) {
          nextMs = parseExcelDate(row[idx['Próxima calibración']]);
          if (nextMs == null && category === 'laboratorio') {
            warnings.push(`Equipos fila ${i + 1}: "Próxima calibración" inválida — omitida.`); continue;
          }
        } else if (category === 'laboratorio') {
          warnings.push(`Equipos: falta columna "Próxima calibración" para laboratorio — fila ${i + 1} omitida.`); continue;
        }
        const lastMs = idx['Última calibración'] != null ? parseExcelDate(row[idx['Última calibración']]) : null;
        const tipo = (VALID_EQUIPMENT_TYPES.includes(tipoNorm as EquipmentType) ? tipoNorm : 'otros') as EquipmentType;
        equipos.push({
          code, name: get(row, 'Nombre') || code, type: tipo, category,
          brand: get(row, 'Marca') || null, model: get(row, 'Modelo') || null,
          serial: get(row, 'Serie') || null, capacity: get(row, 'Capacidad') || null,
          resolution: get(row, 'Resolución') || null,
          lastCalibrationAt: lastMs, nextCalibrationAt: nextMs,
          notes: get(row, 'Notas') || null,
        });
      }
    }
  }

  // ── Hoja Actividades ────────────────────────────────────────────────────
  const actividades: ParsedActivity[] = [];
  const actsRows = readSheet(wb, ['Actividades', 'Activities']);
  if (actsRows && actsRows.length >= 2) {
    const headers = actsRows[0].map(h => String(h ?? '').trim().toLowerCase());
    const iName = headers.findIndex(h => ['nombre', 'name', 'actividad'].includes(h));
    const iKind = headers.findIndex(h => ['tipo', 'kind', 'categoria'].includes(h));
    if (iName === -1) {
      warnings.push('Hoja "Actividades": falta columna "Nombre".');
    } else {
      const seen = new Set<string>();
      for (let i = 1; i < actsRows.length; i++) {
        const row = actsRows[i];
        const name = String(row[iName] ?? '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) { warnings.push(`Actividad "${name}" duplicada — omitida.`); continue; }
        seen.add(key);
        const kindRaw = iKind !== -1 ? normalize(String(row[iKind] ?? '')) : 'productive';
        const kind = KIND_MAP[kindRaw] ?? 'other';
        actividades.push({ name, kind });
      }
    }
  }

  // ── Hoja Equipo-Actividad ───────────────────────────────────────────────
  const equipoActividad: ParsedEquipActivity[] = [];
  const eaRows = readSheet(wb, ['Equipo-Actividad', 'EquipoActividad', 'Equipment-Activity']);
  if (eaRows && eaRows.length >= 2) {
    const headers = eaRows[0].map(h => String(h ?? '').trim().toLowerCase());
    const iCode = headers.findIndex(h => h.includes('codigo') || h.includes('código') || h === 'code');
    const iAct  = headers.findIndex(h => h === 'actividad' || h === 'activity');
    const iTmpl = headers.findIndex(h => h.includes('plantilla') || h.includes('template') || h.includes('formulario'));
    if (iCode === -1 || iAct === -1) {
      warnings.push('Hoja "Equipo-Actividad" omitida: requiere "Código Equipo" y "Actividad".');
    } else {
      for (let i = 1; i < eaRows.length; i++) {
        const row = eaRows[i];
        const code = String(row[iCode] ?? '').trim();
        const act = String(row[iAct] ?? '').trim();
        if (!code || !act) continue;
        const tmpl = iTmpl !== -1 ? (String(row[iTmpl] ?? '').trim() || null) : null;
        equipoActividad.push({ equipmentCode: code, activityName: act, templateName: tmpl });
      }
    }
  }

  // ── Hoja Turnos ─────────────────────────────────────────────────────────
  const turnos: ParsedShift[] = [];
  const shiftRows = readSheet(wb, ['Turnos', 'Shifts', 'WorkShifts']);
  if (shiftRows && shiftRows.length >= 2) {
    const headers = shiftRows[0].map(h => String(h ?? '').trim().toLowerCase());
    const iName = headers.findIndex(h => h === 'nombre' || h === 'name');
    const iStart = headers.findIndex(h => h.includes('inicio') || h.includes('start'));
    const iEnd = headers.findIndex(h => h.includes('fin') || h.includes('end'));
    if (iName === -1 || iStart === -1 || iEnd === -1) {
      warnings.push('Hoja "Turnos" omitida: requiere "Nombre", "Hora Inicio", "Hora Fin".');
    } else {
      for (let i = 1; i < shiftRows.length; i++) {
        const row = shiftRows[i];
        const name = String(row[iName] ?? '').trim();
        if (!name) continue;
        const startH = parseHour(row[iStart]);
        const endH = parseHour(row[iEnd]);
        if (startH == null || endH == null) {
          warnings.push(`Turno "${name}": hora inválida — omitido.`); continue;
        }
        turnos.push({ name, startHour: startH, endHour: endH });
      }
    }
  }

  // ── Hoja Plantillas Formulario ──────────────────────────────────────────
  const plantillas: ParsedTemplateItem[] = [];
  const tmplRows = readSheet(wb, ['Plantillas Formulario', 'Plantillas', 'Form Templates', 'FormTemplates']);
  if (tmplRows && tmplRows.length >= 2) {
    const headers = tmplRows[0].map(h => String(h ?? '').trim());
    const iTmpl = headers.findIndex(h => /plantilla|template/i.test(h));
    const iPart = headers.findIndex(h => /partida/i.test(h) && !/item/i.test(h));
    // Excluye "PartidaItem" — el header de item debe ser exactamente "Item" o "Actividad realizada".
    const iItem = headers.findIndex(h => /^item$|actividad realizada/i.test(h.trim()));
    const iVal  = headers.findIndex(h => /m[eé]todo|validaci[oó]n/i.test(h));
    const iSec  = headers.findIndex(h => /secci[oó]n|section/i.test(h));
    if (iTmpl === -1 || iItem === -1) {
      warnings.push('Hoja "Plantillas Formulario" omitida: requiere "Plantilla" y "Item".');
    } else {
      for (let i = 1; i < tmplRows.length; i++) {
        const row = tmplRows[i];
        const templateName = String(row[iTmpl] ?? '').trim();
        const itemDescription = String(row[iItem] ?? '').trim();
        if (!templateName || !itemDescription) continue;
        plantillas.push({
          templateName,
          partidaItem: iPart !== -1 ? (String(row[iPart] ?? '').trim() || null) : null,
          itemDescription,
          validationMethod: iVal !== -1 ? (String(row[iVal] ?? '').trim() || null) : null,
          section: iSec !== -1 ? (String(row[iSec] ?? '').trim() || null) : null,
        });
      }
    }
  }

  // v41 — hoja "Tablas auxiliares" (grupos de laboratorio: taras, moldes, agua…).
  const auxTables = parseAuxTablesSheet(wb);

  if (equipos.length === 0 && actividades.length === 0 && turnos.length === 0 && plantillas.length === 0 && auxTables.length === 0) {
    throw new TraceabilityImportError(
      'No se encontraron datos válidos. Sube equipos (columnas "Código, Nombre, Tipo") o una hoja "Tablas auxiliares" (filas tabla-<nombre> | columna | valores…).'
    );
  }

  return { equipos, actividades, equipoActividad, turnos, plantillas, auxTables, warnings };
}

// ── Upsert local + encola sync ───────────────────────────────────────────────

const newId = (prefix: string) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9).toString(36)}`;

/** Persiste todo el bundle en WatermelonDB local y encola PUSH_* a Supabase. */
export async function importTraceabilityLocally(
  projectId: string,
  parsed: TraceabilityParseResult,
  // v40 — categoría forzada por la sección que importa (Lab. / Maquinaria).
  forceCategory?: import('@models/Equipment').EquipmentCategory,
): Promise<TraceabilityImportSummary> {
  console.log('[traz-import] START projectId=', projectId,
    'equipos=', parsed.equipos.length,
    'actividades=', parsed.actividades.length,
    'ea=', parsed.equipoActividad.length,
    'turnos=', parsed.turnos.length,
    'plantillas=', parsed.plantillas.length);
  const warnings = [...parsed.warnings];

  // 1. Equipos — reusa importer existente (también encola sync vía batch del proyecto).
  let eqSummary = { added: 0, modified: 0, skipped: 0 };
  if (parsed.equipos.length > 0) {
    eqSummary = await importEquipmentLocally(projectId, parsed.equipos, forceCategory);
  }

  // 1b. Tablas auxiliares (v41) — upsert local por (project, group_key) + push DIRECTO
  // a Supabase con los JSONB como ARRAYS (no por el push masivo, que serializaría
  // string→escalar). Es la única ruta donde el móvil ESCRIBE lab_aux_tables.
  if (parsed.auxTables.length > 0) {
    const existingAux = await labAuxTablesCollection.query(Q.where('project_id', projectId)).fetch();
    const auxByKey = new Map<string, any>();
    for (const t of existingAux as any[]) auxByKey.set(String(t.groupKey).toLowerCase(), t);
    // v41 (fix) — Resolver el id CANÓNICO remoto ANTES de crear local. Si la tabla
    // ya existe en Supabase (creada por la web u otro dispositivo) reusamos su id,
    // para que el upsert no pise el id remoto y NO se dupliquen filas en otros
    // dispositivos (el pull empareja por id). Si no existe, el id local es canónico.
    const remoteIdByKey = new Map<string, string>();
    try {
      const { data } = await supabase
        .from('lab_aux_tables').select('id, group_key').eq('project_id', projectId)
        .in('group_key', parsed.auxTables.map(t => t.groupKey));
      for (const r of (data ?? []) as any[]) remoteIdByKey.set(String(r.group_key).toLowerCase(), r.id);
    } catch { /* offline: usamos id local */ }

    const idByKey = new Map<string, string>();
    await database.write(async () => {
      const ops: any[] = [];
      for (const t of parsed.auxTables) {
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
    // Push directo a Supabase con el MISMO id canónico (arrays → jsonb). Best-effort.
    for (const t of parsed.auxTables) {
      supabase.from('lab_aux_tables').upsert({
        id: idByKey.get(t.groupKey),
        project_id: projectId, group_key: t.groupKey, name: t.name,
        columns_json: t.columns, rows_json: t.rows, updated_at: Date.now(),
      }, { onConflict: 'project_id,group_key' }).then(({ error }) => {
        if (error) console.warn('[traz-import] push lab_aux_tables falló (¿v41?):', error.message);
      });
    }
  }

  // 2. Actividades — upsert por (project_id, name)
  const existingActs = await activitiesCollection.query(Q.where('project_id', projectId)).fetch();
  const actsByName = new Map<string, any>();
  for (const a of existingActs as any[]) actsByName.set(normalize(a.name), a);
  let actAdded = 0, actModified = 0;
  const toEnqueueActs: any[] = [];
  await database.write(async () => {
    const ops: any[] = [];
    for (const a of parsed.actividades) {
      const prev = actsByName.get(normalize(a.name));
      if (!prev) {
        const rec = activitiesCollection.prepareCreate((r: any) => {
          r._raw.id = newId('act');
          r.projectId = projectId;
          r.name = a.name;
          r.kind = a.kind;
        });
        ops.push(rec);
        actsByName.set(normalize(a.name), rec);
        toEnqueueActs.push(rec);
        actAdded++;
      } else if (prev.kind !== a.kind) {
        ops.push(prev.prepareUpdate((r: any) => { r.kind = a.kind; }));
        toEnqueueActs.push(prev);
        actModified++;
      }
    }
    if (ops.length > 0) await database.batch(ops);
  });
  await Promise.all(toEnqueueActs.map(r => enqueueSync({
    opType: 'PUSH_ACTIVITY', entityId: r.id, projectId,
  })));

  // 3. Turnos — upsert por (project_id, name)
  const existingShifts = await workShiftsCollection.query(Q.where('project_id', projectId)).fetch();
  const shiftsByName = new Map<string, any>();
  for (const s of existingShifts as any[]) shiftsByName.set(normalize(s.name), s);
  let shiftAdded = 0, shiftModified = 0;
  const toEnqueueShifts: any[] = [];
  await database.write(async () => {
    const ops: any[] = [];
    for (const sh of parsed.turnos) {
      const prev = shiftsByName.get(normalize(sh.name));
      if (!prev) {
        const rec = workShiftsCollection.prepareCreate((r: any) => {
          r._raw.id = newId('shift');
          r.projectId = projectId;
          r.name = sh.name;
          r.startHour = sh.startHour;
          r.endHour = sh.endHour;
        });
        ops.push(rec);
        toEnqueueShifts.push(rec);
        shiftAdded++;
      } else if (prev.startHour !== sh.startHour || prev.endHour !== sh.endHour) {
        ops.push(prev.prepareUpdate((r: any) => {
          r.startHour = sh.startHour;
          r.endHour = sh.endHour;
        }));
        toEnqueueShifts.push(prev);
        shiftModified++;
      }
    }
    if (ops.length > 0) await database.batch(ops);
  });
  await Promise.all(toEnqueueShifts.map(r => enqueueSync({
    opType: 'PUSH_WORK_SHIFT', entityId: r.id, projectId,
  })));

  // 4. Plantillas + items — DELETE+INSERT items al re-importar (orden y completitud)
  let tmplAdded = 0, tmplModified = 0, tmplItemAdded = 0;
  const tmplsByName = new Map<string, any>();
  const toEnqueueTmpls: any[] = [];
  const toEnqueueItems: any[] = [];
  if (parsed.plantillas.length > 0) {
    const existingTmpls = await sessionFormTemplatesCollection.query(Q.where('project_id', projectId)).fetch();
    for (const t of existingTmpls as any[]) tmplsByName.set(normalize(t.name), t);

    const tmplNames = Array.from(new Set(parsed.plantillas.map(p => p.templateName)));
    // Re-import: borrar items previos de plantillas que ya existen. Hacemos el
    // fetch ANTES del database.write para no bloquear la transacción con N
    // queries seriales (una por plantilla existente).
    const existingTmplIds: string[] = tmplNames
      .map(name => tmplsByName.get(normalize(name))?.id)
      .filter((id: string | undefined): id is string => !!id);
    const oldItemsToDestroy = existingTmplIds.length > 0
      ? await sessionFormTemplateItemsCollection.query(
          Q.where('template_id', Q.oneOf(existingTmplIds)),
        ).fetch()
      : [];
    await database.write(async () => {
      const ops: any[] = [];
      for (const it of oldItemsToDestroy as any[]) ops.push(it.prepareDestroyPermanently());
      for (const name of tmplNames) {
        const prev = tmplsByName.get(normalize(name));
        if (!prev) {
          const rec = sessionFormTemplatesCollection.prepareCreate((r: any) => {
            r._raw.id = newId('tmpl');
            r.projectId = projectId;
            r.name = name;
          });
          ops.push(rec);
          tmplsByName.set(normalize(name), rec);
          toEnqueueTmpls.push(rec);
          tmplAdded++;
        } else {
          toEnqueueTmpls.push(prev);
          tmplModified++;
        }
      }
      if (ops.length > 0) await database.batch(ops);
    });
    await Promise.all(toEnqueueTmpls.map(r => enqueueSync({
      opType: 'PUSH_SESSION_FORM_TEMPLATE', entityId: r.id, projectId,
    })));

    // Items
    await database.write(async () => {
      const ops: any[] = [];
      for (const item of parsed.plantillas) {
        const tmpl = tmplsByName.get(normalize(item.templateName));
        if (!tmpl) continue;
        const rec = sessionFormTemplateItemsCollection.prepareCreate((r: any) => {
          r._raw.id = newId('tmplitem');
          r.templateId = tmpl.id;
          r.partidaItem = item.partidaItem;
          r.itemDescription = item.itemDescription;
          r.validationMethod = item.validationMethod;
          r.section = item.section;
        });
        ops.push(rec);
        toEnqueueItems.push(rec);
        tmplItemAdded++;
      }
      if (ops.length > 0) await database.batch(ops);
    });
    await Promise.all(toEnqueueItems.map(r => enqueueSync({
      opType: 'PUSH_SESSION_FORM_TEMPLATE_ITEM', entityId: r.id, projectId,
    })));
  }

  // 5. Equipo-Actividad — resolución FK por nombre
  let linkAdded = 0, linkModified = 0, linkSkipped = 0;
  const toEnqueueLinks: any[] = [];
  if (parsed.equipoActividad.length > 0) {
    const equipNow = await equipmentCollection.query(Q.where('project_id', projectId)).fetch();
    const equipByCode = new Map<string, any>();
    for (const e of equipNow as any[]) equipByCode.set(normalize(e.code), e);

    // Guard contra Q.oneOf([]) — produce `IN ()` que es SQL syntax error en SQLite.
    const linksNow = equipNow.length === 0 ? [] : await equipmentActivitiesCollection.query(
      Q.where('equipment_id', Q.oneOf(equipNow.map(e => e.id))),
    ).fetch();
    const linkKey = (eqId: string, actId: string) => `${eqId}::${actId}`;
    const linkByKey = new Map<string, any>();
    for (const l of linksNow as any[]) linkByKey.set(linkKey(l.equipmentId, l.activityId), l);

    await database.write(async () => {
      const ops: any[] = [];
      for (const ea of parsed.equipoActividad) {
        const eq = equipByCode.get(normalize(ea.equipmentCode));
        const act = actsByName.get(normalize(ea.activityName));
        if (!eq || !act) {
          warnings.push(`Equipo-Actividad "${ea.equipmentCode} / ${ea.activityName}": ${!eq ? 'equipo no encontrado' : 'actividad no encontrada'} — omitido.`);
          linkSkipped++; continue;
        }
        const tmpl = ea.templateName ? tmplsByName.get(normalize(ea.templateName)) : null;
        if (ea.templateName && !tmpl) {
          warnings.push(`Equipo-Actividad "${ea.equipmentCode}/${ea.activityName}": plantilla "${ea.templateName}" no encontrada — vínculo creado sin plantilla.`);
        }
        const tmplId = tmpl?.id ?? null;
        const prev = linkByKey.get(linkKey(eq.id, act.id));
        if (!prev) {
          const rec = equipmentActivitiesCollection.prepareCreate((r: any) => {
            r._raw.id = newId('eqact');
            r.equipmentId = eq.id;
            r.activityId = act.id;
            r.formTemplateId = tmplId;
          });
          ops.push(rec);
          toEnqueueLinks.push(rec);
          linkAdded++;
        } else if (prev.formTemplateId !== tmplId) {
          ops.push(prev.prepareUpdate((r: any) => { r.formTemplateId = tmplId; }));
          toEnqueueLinks.push(prev);
          linkModified++;
        }
      }
      if (ops.length > 0) await database.batch(ops);
    });
    await Promise.all(toEnqueueLinks.map(r => enqueueSync({
      opType: 'PUSH_EQUIPMENT_ACTIVITY', entityId: r.id, projectId,
    })));
  }

  // v29 — Push inmediato a Supabase via helpers _pushStrict (upsert por id,
  // idempotente). Importante: empujamos TODO lo local del proyecto, no solo las
  // entidades recién creadas/modificadas. Esto cubre el caso en que el usuario
  // importó antes con código viejo (sin push) y ahora las entidades existen
  // localmente pero no en Supabase.
  const allActs   = await activitiesCollection.query(Q.where('project_id', projectId)).fetch();
  const allShifts = await workShiftsCollection.query(Q.where('project_id', projectId)).fetch();
  const allTmpls  = await sessionFormTemplatesCollection.query(Q.where('project_id', projectId)).fetch();
  const allTmplItemIds = allTmpls.length === 0 ? [] :
    (await sessionFormTemplateItemsCollection.query(
      Q.where('template_id', Q.oneOf(allTmpls.map((t: any) => t.id))),
    ).fetch());
  const allEquip = await equipmentCollection.query(Q.where('project_id', projectId)).fetch();
  const allLinks = allEquip.length === 0 ? [] :
    (await equipmentActivitiesCollection.query(
      Q.where('equipment_id', Q.oneOf(allEquip.map((e: any) => e.id))),
    ).fetch());

  const pushOps: Array<{ kind: string; id: string; fn: (id: string) => Promise<void> }> = [];
  for (const r of allActs)        pushOps.push({ kind: 'activity',                    id: r.id, fn: pushActivityStrict });
  for (const r of allShifts)      pushOps.push({ kind: 'work_shift',                  id: r.id, fn: pushWorkShiftStrict });
  for (const r of allTmpls)       pushOps.push({ kind: 'session_form_template',       id: r.id, fn: pushSessionFormTemplateStrict });
  for (const r of allTmplItemIds) pushOps.push({ kind: 'session_form_template_item',  id: r.id, fn: pushSessionFormTemplateItemStrict });
  for (const r of allLinks)       pushOps.push({ kind: 'equipment_activity',          id: r.id, fn: pushEquipmentActivityStrict });

  console.log('[traz-import] PUSH START', pushOps.length, 'ops · acts=', allActs.length,
    'shifts=', allShifts.length, 'tmpls=', allTmpls.length, 'items=', allTmplItemIds.length, 'links=', allLinks.length);

  let pushErrors = 0;
  const errSamples: string[] = [];
  await Promise.all(pushOps.map(op => op.fn(op.id).catch(e => {
    pushErrors++;
    const msg = `${op.kind}: ${(e as Error).message}`;
    if (errSamples.length < 5) errSamples.push(msg);
    console.log('[traz-import] PUSH ERR', op.kind, op.id, (e as Error).message);
  })));
  console.log('[traz-import] PUSH DONE total=', pushOps.length, 'errors=', pushErrors);
  if (pushErrors > 0) {
    warnings.push(`Push errores (${pushErrors}/${pushOps.length}). Reintentos automáticos en cola.`);
    warnings.push(...errSamples);
  }

  return {
    equipment: eqSummary,
    activities: { added: actAdded, modified: actModified },
    links: { added: linkAdded, modified: linkModified, skipped: linkSkipped },
    shifts: { added: shiftAdded, modified: shiftModified },
    templates: { added: tmplAdded, modified: tmplModified },
    templateItems: { added: tmplItemAdded },
    warnings,
  };
}
