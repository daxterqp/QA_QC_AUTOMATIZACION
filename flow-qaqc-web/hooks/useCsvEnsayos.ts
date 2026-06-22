/**
 * useCsvEnsayos — orquestador I/O del módulo CSV de ensayos numéricos.
 *
 * IMPORT (formato ancho, 1 fila = 1 ensayo): decodifica el archivo (BOM/utf-8
 * con fallback windows-1252), parsea con csvEnsayos, valida con el pipeline
 * histórico EXISTENTE y devuelve el mismo `ParseAndValidateResult` — de modo
 * que `resolveUsers` + `executeImport` de useHistoricalImport se reusan tal
 * cual (los ensayos quedan APPROVED + is_historical + is_locked).
 *
 * EXPORT: todas las instancias del template (cualquier estado) → CSV ancho
 * con columnas calculadas. SIEMPRE se descarga con BOM UTF-8.
 */

import { useState, useCallback } from 'react';
import { createClient } from '@lib/supabase/client';
import { parseEnsayosCsv, generateCsvTemplate, CSV_BOM, type CsvDefaults } from '@lib/csvEnsayos';
import { buildExportCsv, type ExportProtocolRow } from '@lib/csvExport';
import { validateImport, type TemplateContext } from '@lib/historicalImport';
import { loadProjectImportCatalog, type ParseAndValidateResult } from './useHistoricalImport';

const supabase = createClient();

// ─────────────────────────── Helpers compartidos ─────────────────────────────

/** Descarga un CSV SIEMPRE con BOM UTF-8 (Excel + acentos/ñ). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([CSV_BOM + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Decodifica el archivo: BOM→utf-8; sin BOM intenta utf-8 estricto y cae a
 *  windows-1252 (Excel "CSV delimitado por comas" viejo es ANSI). */
async function decodeCsvFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(buf);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

// ───────────────────────────────── Hook ──────────────────────────────────────

export function useCsvEnsayos(projectId: string) {
  const [isParsing, setIsParsing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  /** IMPORT fase 1: decode + parse wide + validación (pipeline histórico). */
  const parseAndValidateCsv = useCallback(async (
    file: File,
    templateIdProtocolo: string,
    defaults: CsvDefaults,
  ): Promise<ParseAndValidateResult> => {
    setIsParsing(true);
    try {
      const text = await decodeCsvFile(file);
      const catalog = await loadProjectImportCatalog(projectId);
      const template = catalog.templates.get(templateIdProtocolo);
      if (!template) throw new Error(`Template "${templateIdProtocolo}" no existe en este proyecto`);

      const { instances, errors: parseErrors, warnings: parseWarnings } =
        parseEnsayosCsv(text, template, defaults);

      const validation = validateImport(instances, catalog.templates, catalog.locationNames, catalog.existingUserKeys);
      validation.errors = [...parseErrors, ...validation.errors];
      validation.warnings = [...parseWarnings, ...validation.warnings];

      return { ...validation, templates: catalog.templates, existingExternalIds: catalog.existingExternalIds };
    } finally {
      setIsParsing(false);
    }
  }, [projectId]);

  /** Plantilla CSV descargable del template elegido. */
  const downloadCsvTemplate = useCallback(async (templateIdProtocolo: string): Promise<void> => {
    const { templates } = await loadProjectImportCatalog(projectId);
    const template = templates.get(templateIdProtocolo);
    if (!template) throw new Error(`Template "${templateIdProtocolo}" no existe en este proyecto`);
    downloadCsv(`ensayos-${templateIdProtocolo}-plantilla.csv`, generateCsvTemplate(template));
  }, [projectId]);

  /** EXPORT: todas las instancias del template → CSV ancho con BOM. */
  const exportCsv = useCallback(async (templateIdProtocolo: string): Promise<{ rowCount: number }> => {
    setIsExporting(true);
    try {
      const { templates } = await loadProjectImportCatalog(projectId);
      const template: TemplateContext | undefined = templates.get(templateIdProtocolo);
      if (!template) throw new Error(`Template "${templateIdProtocolo}" no existe en este proyecto`);

      // Protocolos del template (cualquier estado)
      const { data: protosData, error: pErr } = await supabase
        .from('protocols')
        .select('id, external_id, protocol_code, protocol_number, status, filled_at, signed_at, location_id, location_reference, created_at')
        .eq('project_id', projectId)
        .eq('template_id', template.id)
        .order('created_at', { ascending: true });
      if (pErr) throw new Error(pErr.message);
      const protos = (protosData ?? []) as {
        id: string; external_id: string | null; protocol_code: string | null; protocol_number: string | null; status: string;
        filled_at: number | null; signed_at: number | null; location_id: string | null;
        location_reference: string | null; created_at: number;
      }[];
      if (protos.length === 0) return { rowCount: 0 };

      // Ubicaciones (id → name)
      const { data: locsData } = await supabase
        .from('locations').select('id, name').eq('project_id', projectId);
      const locName = new Map(((locsData ?? []) as { id: string; name: string }[]).map(l => [l.id, l.name]));

      // Items por chunks (límite de URL del .in())
      const itemsByProtocol = new Map<string, Map<string, { comments: string | null }>>();
      const ids = protos.map(p => p.id);
      const CHUNK = 100;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { data: itemsData, error: iErr } = await supabase
          .from('protocol_items')
          .select('protocol_id, partida_item, comments')
          .in('protocol_id', ids.slice(i, i + CHUNK));
        if (iErr) throw new Error(iErr.message);
        for (const it of (itemsData ?? []) as { protocol_id: string; partida_item: string | null; comments: string | null }[]) {
          const partida = (it.partida_item ?? '').trim();
          if (!partida) continue;
          let m = itemsByProtocol.get(it.protocol_id);
          if (!m) { m = new Map(); itemsByProtocol.set(it.protocol_id, m); }
          m.set(partida, { comments: it.comments });
        }
      }

      const rows: ExportProtocolRow[] = protos.map(p => ({
        external_id: p.external_id,
        protocol_code: p.protocol_code,
        protocol_number: p.protocol_number,
        location_name: (p.location_id && locName.get(p.location_id)) || p.location_reference || '',
        status: p.status,
        filled_at: p.filled_at,
        signed_at: p.signed_at,
        itemsByPartida: itemsByProtocol.get(p.id) ?? new Map(),
      }));

      // v41 — Tablas auxiliares del proyecto para recomputar BUSCAR() en el CSV.
      const auxTables: import('@lib/formulaEval').AuxTables = {};
      try {
        const { data: tbls } = await supabase
          .from('lab_aux_tables').select('group_key, columns_json, rows_json').eq('project_id', projectId);
        for (const t of (tbls ?? []) as { group_key: string; columns_json: unknown; rows_json: unknown }[]) {
          auxTables[String(t.group_key).toLowerCase()] = {
            columns: Array.isArray(t.columns_json) ? (t.columns_json as string[]) : [],
            rows: Array.isArray(t.rows_json) ? (t.rows_json as string[][]) : [],
          };
        }
      } catch { /* sin tablas → BUSCAR vacío en CSV */ }

      const csv = buildExportCsv(template, rows, auxTables);
      const stamp = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      downloadCsv(
        `ensayos-${templateIdProtocolo}-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}.csv`,
        csv,
      );
      return { rowCount: rows.length };
    } finally {
      setIsExporting(false);
    }
  }, [projectId]);

  return { parseAndValidateCsv, downloadCsvTemplate, exportCsv, isParsing, isExporting };
}
