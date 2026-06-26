/**
 * topoFormulasImport.ts (web) — Importa el Excel de "Fórmulas y Tablas Auxiliares"
 * del módulo topográfico (procesamiento). Un solo .xlsx con dos hojas:
 *   - "Fórmulas": filas `Columna | Fórmula` → se asignan a las columnas de config
 *     por NOMBRE (las nuevas se agregan). Devuelve el nuevo topo_columns; la página
 *     lo persiste en feature_flags.
 *   - "Tablas Auxiliares": filas `tabla-<nombre> | columna | v1 | v2 …` → upsert en
 *     lab_aux_tables (reusa parseAuxTablesSheet + el patrón de useFileUpload).
 */
import * as XLSX from 'xlsx';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseAuxTablesSheet, parseTopoFormulasSheet } from '@lib/excelParser';
import { applyTopoFormulas } from '@lib/topoFormula';
import { topoColumns, type ProjectFeatureFlags, type TopoColumn } from '@/types';

export interface TopoFormulasImportResult {
  auxTables: { upserted: number; names: string[] };
  formulas: { applied: number; created: number };
  /** Nuevo arreglo de columnas (la página lo guarda en feature_flags). */
  newColumns: TopoColumn[];
  warnings: string[];
}

export async function importTopoFormulasWorkbook(
  supabase: SupabaseClient,
  projectId: string,
  fileBuf: ArrayBuffer,
  flags: ProjectFeatureFlags,
): Promise<TopoFormulasImportResult> {
  const wb = XLSX.read(fileBuf, { type: 'array', cellDates: false });
  const { tables, warnings: auxW } = parseAuxTablesSheet(wb);
  const { entries, warnings: fW } = parseTopoFormulasSheet(wb);
  const warnings = [...auxW, ...fW];

  // ── Tablas auxiliares → upsert por (project_id, group_key) ──────────────────
  const auxNames: string[] = [];
  if (tables.length > 0) {
    const { data: existingAux } = await supabase
      .from('lab_aux_tables').select('id, group_key').eq('project_id', projectId);
    const auxByKey = new Map<string, string>(
      ((existingAux ?? []) as { id: string; group_key: string }[]).map((t) => [t.group_key, t.id]),
    );
    for (const t of tables) {
      const now = Date.now();
      const prevId = auxByKey.get(t.groupKey);
      const { error } = await supabase.from('lab_aux_tables').upsert({
        id: prevId ?? crypto.randomUUID(),
        project_id: projectId,
        group_key: t.groupKey,
        name: t.name,
        columns_json: t.columns,
        rows_json: t.rows,
        ...(prevId ? {} : { created_at: now }),
        updated_at: now,
      }, { onConflict: 'project_id,group_key' });
      if (error) { warnings.push(`Tabla auxiliar "${t.name}": ${error.message}`); continue; }
      auxNames.push(t.name);
    }
  }

  // ── Fórmulas → asignar a columnas de config por nombre ──────────────────────
  const cols = topoColumns(flags);
  const { columns: newColumns, applied, created, warnings: applyW } = applyTopoFormulas(cols, entries);
  warnings.push(...applyW);

  if (tables.length === 0 && entries.length === 0) {
    warnings.push('No se encontraron hojas "Fórmulas" ni "Tablas Auxiliares" con datos.');
  }

  return {
    auxTables: { upserted: auxNames.length, names: auxNames },
    formulas: { applied, created },
    newColumns,
    warnings,
  };
}
