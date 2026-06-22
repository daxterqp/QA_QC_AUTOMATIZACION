import * as XLSX from 'xlsx';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import type { GroupingPreset } from '@utils/featureFlags';
import { parseGroupingFilters, parseExcludeCodes } from '@utils/groupingFilters';

// ─── Columnas requeridas en el Excel maestro ─────────────────────────────────

export const REQUIRED_COLUMNS = [
  'ID_Protocolo',
  'Protocolo',
  'PartidaItem',
  'Actividad realizada',
  'Método de validación',
] as const;

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ExcelActivity {
  partidaItem: string;
  actividadRealizada: string;
  metodoValidacion: string;
  /** null = sin sección (columna vacía o "NA") */
  seccion: string | null;
}

export interface ExcelProtocolGroup {
  /** ID único del protocolo, ej: "1", "C1", "CIM-001" */
  idProtocolo: string;
  /** Nombre del protocolo, ej: "PROTOCOLO DE CIMENTACIÓN" */
  protocolName: string;
  activities: ExcelActivity[];
}

export interface ExcelImportResult {
  protocols: ExcelProtocolGroup[];
  totalRows: number;
  totalProtocols: number;
  fileUri: string;
  /** v45.3 — Agrupamientos (presets) sembrados desde la hoja AGRUPACIONES, por tipo de
   *  ficha (idProtocolo donde aparecen). Vacío si no hay hoja AGRUPACIONES. */
  groupingPresets?: Record<string, GroupingPreset[]>;
}

export class ExcelImportError extends Error {
  constructor(
    message: string,
    public readonly missingColumns?: string[]
  ) {
    super(message);
    this.name = 'ExcelImportError';
  }
}

// ─── Funcion principal ───────────────────────────────────────────────────────

/** Parsea un Excel maestro desde una URI local (sin file picker). */
export async function importExcelMaestroFromUri(uri: string): Promise<ExcelImportResult> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as const });
  const workbook = XLSX.read(base64, { type: 'base64' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new ExcelImportError('El archivo Excel no contiene hojas de calculo.');
  const worksheet = workbook.Sheets[firstSheetName];
  const rows: string[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (rows.length < 2) throw new ExcelImportError('El archivo Excel no tiene filas de datos.');
  const headers = rows[0].map((h) => String(h).trim());
  validateHeaders(headers);
  const colIndex = buildColumnIndex(headers);
  const protocolMap = new Map<string, { name: string; activities: ExcelActivity[] }>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const idProtocolo = String(row[colIndex['ID_Protocolo']] ?? '').trim();
    const protocolName = String(row[colIndex['Protocolo']] ?? '').trim();
    const partidaItem = String(row[colIndex['PartidaItem']] ?? '').trim();
    const actividadRealizada = String(row[colIndex['Actividad realizada']] ?? '').trim();
    const metodoValidacion = String(row[colIndex['Método de validación']] ?? '').trim();
    const seccionRaw = colIndex['Sección'] !== undefined ? String(row[colIndex['Sección']] ?? '').trim() : '';
    const seccion = (seccionRaw && seccionRaw.toUpperCase() !== 'NA') ? seccionRaw : null;
    if (!idProtocolo && !actividadRealizada) continue;
    if (!idProtocolo) { console.warn(`[Excel] Fila ${i + 1} ignorada: columna "ID_Protocolo" vacia.`); continue; }
    const existing = protocolMap.get(idProtocolo);
    if (!existing) {
      protocolMap.set(idProtocolo, { name: protocolName || idProtocolo, activities: [{ partidaItem, actividadRealizada, metodoValidacion, seccion }] });
    } else {
      if (protocolName && existing.name === idProtocolo) existing.name = protocolName;
      existing.activities.push({ partidaItem, actividadRealizada, metodoValidacion, seccion });
    }
  }
  const protocols: ExcelProtocolGroup[] = Array.from(protocolMap.entries()).map(
    ([idProtocolo, { name, activities }]) => ({ idProtocolo, protocolName: name, activities })
  );
  // Autoasignación de partida_item para filas de header `col-[…]` (vacías en Excel).
  for (const p of protocols) {
    let hdrCounter = 0;
    let sawData = false;
    for (const act of p.activities) {
      const m = (act.metodoValidacion ?? '').trim();
      const isHdr = /^col-\[/i.test(m);
      if (isHdr && !sawData) {
        hdrCounter++;
        if (hdrCounter > 3) console.warn(`[Excel] Protocolo "${p.idProtocolo}": solo se respetan los primeros 3 encabezados.`);
        if (!act.partidaItem) act.partidaItem = `__hdr${hdrCounter}__`;
      } else if (isHdr && sawData) {
        console.warn(`[Excel] Protocolo "${p.idProtocolo}": encabezado tras datos → cae al flujo clásico.`);
      } else if (!isHdr && !/^matrix-\[/i.test(m) && !/^val-\[/i.test(m)) {
        sawData = true;
      }
    }
  }
  // Autoasignación para matrices: matrix-[Mx] → __matrix_Mx__; val-[…] → __matrix_Mx_N__
  for (const p of protocols) {
    let currentMatrix: string | null = null;
    let rowCounter = 0;
    for (const act of p.activities) {
      const m = (act.metodoValidacion ?? '').trim();
      const mh = m.match(/^matrix-\[([A-Za-z0-9_-]+)\]/i);
      if (mh) {
        currentMatrix = mh[1];
        rowCounter = 0;
        if (!act.partidaItem) act.partidaItem = `__matrix_${currentMatrix}__`;
        continue;
      }
      if (/^val-\[/i.test(m)) {
        if (!currentMatrix) {
          console.warn(`[Excel] Protocolo "${p.idProtocolo}": fila val-[…] sin matriz → cae al clásico.`);
          continue;
        }
        rowCounter++;
        if (!act.partidaItem) act.partidaItem = `__matrix_${currentMatrix}_${rowCounter}__`;
      }
    }
  }
  // v25 — Autoasignación para directivas paramétricas (mirror del web).
  //  `repeat-[grupo:min:max:default]` → `__repeat_<grupo>__`. Las filas siguientes
  //  SIN partida_item se marcan `__template_<grupo>_<offset>__`. El bloque cierra
  //  al encontrar otra directiva o una partida explícita no-template.
  for (const p of protocols) {
    let currentGroup: string | null = null;
    let tmplOffset = 0;
    for (const act of p.activities) {
      const m = (act.metodoValidacion ?? '').trim();
      const repeatM = m.match(/^repeat-\[\s*([A-Za-z][A-Za-z0-9_-]*)\s*:/i);
      if (repeatM) {
        currentGroup = repeatM[1];
        tmplOffset = 0;
        if (!act.partidaItem) act.partidaItem = `__repeat_${currentGroup}__`;
        continue;
      }
      if (currentGroup && !act.partidaItem) {
        tmplOffset++;
        act.partidaItem = `__template_${currentGroup}_${tmplOffset}__`;
      } else if (act.partidaItem && !/^__(template|repeat)_/.test(act.partidaItem)) {
        currentGroup = null;
        tmplOffset = 0;
      }
    }
  }
  // Warnings de validación (no bloquean — solo console.warn).
  for (const p of protocols) {
    const seen = new Map<string, number>();
    for (const act of p.activities) {
      const k = (act.partidaItem ?? '').trim().toLowerCase();
      if (!k) continue;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    for (const [k, count] of seen) {
      if (count > 1) console.warn(`[Excel] Protocolo "${p.idProtocolo}": partida_item "${k}" duplicado (${count} veces).`);
    }
    for (const act of p.activities) {
      const m = (act.metodoValidacion ?? '').trim();
      if (/numerico-gr[12]\[/i.test(m) && m.includes('//')) {
        console.warn(`[Excel] Protocolo "${p.idProtocolo}", partida "${act.partidaItem}": gráfico no admite columnas múltiples (//) — caerá al flujo clásico.`);
      }
    }
  }
  const groupingPresets = parseAgrupacionesSheet(workbook);
  return { protocols, totalRows: rows.length - 1, totalProtocols: protocols.length, fileUri: uri, groupingPresets };
}

/** v45.3 — Normaliza una fecha de Excel a `YYYY-MM-DD` (acepta serial, YYYY-MM-DD o dd/mm/aaaa). */
function normalizeExcelDate(raw: unknown): string | undefined {
  const s = String(raw ?? '').trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const serial = Number(s);
  if (isFinite(serial) && serial > 20000 && serial < 80000) {   // serial de Excel (días desde 1899-12-30)
    const ms = Math.round((serial - 25569) * 86400000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  return undefined;
}

/** v45.3 — Parsea la hoja opcional `AGRUPACIONES` → presets por tipo de ficha (ID_Protocolo). */
function parseAgrupacionesSheet(wb: XLSX.WorkBook): Record<string, GroupingPreset[]> {
  const sheetName = wb.SheetNames.find(n => n.trim().toLowerCase() === 'agrupaciones');
  if (!sheetName) return {};
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
  if (rows.length < 2) return {};
  const headers = (rows[0] as unknown[]).map(h => String(h).trim().toLowerCase());
  const col = (...names: string[]) => { for (const n of names) { const i = headers.indexOf(n.toLowerCase()); if (i >= 0) return i; } return -1; };
  const ci = {
    id: col('ID_Protocolo'), nombre: col('Nombre'), tipo: col('Tipo_Fuente'),
    ultimosN: col('UltimosN'), desde: col('Desde'), hasta: col('Hasta'), ultimosDias: col('UltimosDias'),
    mismoSector: col('MismoSector'), mismaMuestra: col('MismaMuestra'), mismaUbic: col('MismaUbicacion'),
    etiqueta: col('Etiqueta'), orden: col('Orden'), filtros: col('Filtros'), excluir: col('Excluir'),
  };
  const cell = (r: unknown[], i: number) => (i >= 0 ? String(r[i] ?? '').trim() : '');
  const truthy = (s: string) => /^(x|s[ií]|true|1)$/i.test(s);
  const numOr = (s: string) => { const n = parseInt(s, 10); return isFinite(n) && n > 0 ? n : undefined; };
  const out: Record<string, GroupingPreset[]> = {};
  let seq = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const id = cell(r, ci.id);
    const nombre = cell(r, ci.nombre);
    if (!id || !nombre) continue;
    const filters = parseGroupingFilters(cell(r, ci.filtros));
    const exclude = parseExcludeCodes(cell(r, ci.excluir));
    const preset: GroupingPreset = {
      id: `xls-${id}-${++seq}`,
      name: nombre,
      ...(cell(r, ci.tipo) ? { source_tipo: cell(r, ci.tipo) } : {}),
      ...(numOr(cell(r, ci.ultimosN)) != null ? { last_n: numOr(cell(r, ci.ultimosN)) } : {}),
      ...(numOr(cell(r, ci.ultimosDias)) != null ? { last_days: numOr(cell(r, ci.ultimosDias)) } : {}),
      ...(normalizeExcelDate(cell(r, ci.desde)) ? { date_from: normalizeExcelDate(cell(r, ci.desde)) } : {}),
      ...(normalizeExcelDate(cell(r, ci.hasta)) ? { date_to: normalizeExcelDate(cell(r, ci.hasta)) } : {}),
      ...(truthy(cell(r, ci.mismoSector)) ? { same_sector: true } : {}),
      ...(truthy(cell(r, ci.mismaMuestra)) ? { same_sample: true } : {}),
      ...(truthy(cell(r, ci.mismaUbic)) ? { same_location: true } : {}),
      ...(cell(r, ci.etiqueta) ? { label: cell(r, ci.etiqueta) } : {}),
      ...(/antig/i.test(cell(r, ci.orden)) ? { order: 'antiguo' as const } : {}),
      ...(filters.length ? { filters } : {}),
      ...(exclude.length ? { exclude_codes: exclude } : {}),
    };
    if (!out[id]) out[id] = [];
    out[id].push(preset);
  }
  return out;
}

export async function importExcelMaestro(): Promise<ExcelImportResult | null> {
  // Android SAF se bloquea a "Recientes" con array de types — usar '*/*' y
  // validar extensión tras la selección.
  const pickerResult = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
  });

  if (pickerResult.canceled || !pickerResult.assets?.[0]) {
    return null;
  }

  const asset = pickerResult.assets[0];
  if (!/\.(xlsx?|csv)$/i.test(asset.name)) {
    throw new Error('Formato no válido. Selecciona un archivo .xlsx, .xls o .csv');
  }
  return importExcelMaestroFromUri(asset.uri);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validateHeaders(headers: string[]): void {
  const missing = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
  if (missing.length > 0) {
    throw new ExcelImportError(
      `El Excel maestro no tiene las columnas requeridas: ${missing.join(', ')}`,
      missing
    );
  }
}

function buildColumnIndex(headers: string[]): Record<string, number> {
  const index: Record<string, number> = {};
  headers.forEach((header, i) => { index[header] = i; });
  return index;
}
