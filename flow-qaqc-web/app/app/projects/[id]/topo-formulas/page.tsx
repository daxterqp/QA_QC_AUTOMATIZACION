'use client';

/**
 * Administrar Fórmulas y Tablas Auxiliares (web) — sube un .xlsx con dos hojas:
 *   - "Fórmulas": filas `Columna | Fórmula` → se asignan a las columnas de config
 *     por NOMBRE (las que no existan se agregan).
 *   - "Tablas Auxiliares": filas `tabla-<nombre> | columna | v1 | v2 …` → upsert en
 *     lab_aux_tables (para BUSCAR en las fórmulas).
 * Solo visible cuando el procesamiento topográfico está habilitado.
 */
import { useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { FunctionSquare, Table2, UploadCloud, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useProjects, useProjectFlags, useUpdateProjectFlags } from '@hooks/useProjects';
import { useLabAuxTablesList } from '@hooks/useLabAuxTables';
import { useAuth } from '@lib/auth-context';
import { isTopoEnabled, topoColumns } from '@/types';
import { createClient } from '@lib/supabase/client';
import { importTopoFormulasWorkbook, type TopoFormulasImportResult } from '@lib/topoFormulasImport';
import PageHeader from '@components/PageHeader';
import { usePageRefresh } from '@hooks/usePageRefresh';

export default function TopoFormulasPage() {
  const { refreshing, onRefresh } = usePageRefresh();
  const { id: projectId } = useParams<{ id: string }>();
  const { currentUser } = useAuth();
  const { data: projects = [] } = useProjects();
  const project = projects.find((p) => p.id === projectId);
  const { data: flags } = useProjectFlags(projectId);
  const { data: auxTables = [], refetch: refetchAux } = useLabAuxTablesList(projectId);
  const updateFlags = useUpdateProjectFlags(projectId);

  const canEdit = currentUser?.role === 'CREATOR';
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TopoFormulasImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cols = flags ? topoColumns(flags) : [];
  const formulaCols = cols.filter((c) => c.source === 'formula');

  const processingOff = flags && (!isTopoEnabled(flags) || !flags.topo_processing_enabled);

  const onPick = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-subir el mismo archivo
    if (!file || !flags) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const supabase = createClient();
      const res = await importTopoFormulasWorkbook(supabase, projectId, buf, flags);
      // Persistir las columnas (fórmulas) si cambiaron. mergedFlags ya viene de la
      // nube FRESCA con solo topo_columns reemplazado (no pisa flags concurrentes).
      if (res.formulas.applied + res.formulas.created > 0) {
        await updateFlags.mutateAsync({ kind: 'flags-only', flags: res.mergedFlags } as never);
      }
      await refetchAux();
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (processingOff) {
    return (
      <div className="min-h-screen bg-surface flex flex-col">
        <PageHeader title="Fórmulas y Tablas Auxiliares" subtitle={project?.name} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
          <FunctionSquare size={40} className="text-[#8896a5]" />
          <p className="text-muted text-sm max-w-sm">
            El procesamiento de datos topográficos está desactivado. Actívalo en Configurar módulos → Carga de datos topográficos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PageHeader
        title="Fórmulas y Tablas Auxiliares"
        subtitle={project?.name}
        crumbs={[{ label: 'Proyectos', href: '/app/projects' }, { label: project?.name ?? '…' }]}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />

      <div className="flex-1 p-4 flex flex-col gap-4 pb-24 max-w-3xl w-full mx-auto">
        {/* Subir Excel */}
        <div className="bg-white rounded-xl shadow-subtle p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <UploadCloud size={18} className="text-primary" />
            <h2 className="text-navy font-bold text-[15px]">Subir Excel (.xlsx)</h2>
          </div>
          <p className="text-[12px] text-muted leading-snug">
            Un solo archivo con dos hojas. <b>Fórmulas</b>: filas <code>Columna | Fórmula</code> (la fórmula se asigna
            a la columna de config por nombre; usa el motor existente: <code>BUSCAR(tabla, #1A, &quot;Columna&quot;)</code>).{' '}
            <b>Tablas Auxiliares</b>: filas <code>tabla-&lt;nombre&gt; | columna | valor1 | valor2 …</code> (la 1ª columna es la llave).
          </p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="hidden" />
          <button
            onClick={onPick}
            disabled={!canEdit || busy}
            className="self-start flex items-center gap-2 bg-primary text-white rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50 hover:bg-primary/90 transition"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
            {busy ? 'Procesando…' : 'Seleccionar archivo'}
          </button>
          {!canEdit && <p className="text-[11px] text-amber-600">Solo el rol CREATOR puede subir fórmulas/tablas.</p>}
        </div>

        {/* Resultado */}
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 flex gap-2 text-[13px] text-danger">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
          </div>
        )}
        {result && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-[13px]">
              <CheckCircle2 size={16} /> Importación completada
            </div>
            <ul className="text-[12px] text-emerald-900 list-disc ml-5">
              <li>Fórmulas asignadas: <b>{result.formulas.applied}</b> · columnas nuevas: <b>{result.formulas.created}</b></li>
              <li>Tablas auxiliares actualizadas: <b>{result.auxTables.upserted}</b>{result.auxTables.names.length > 0 ? ` (${result.auxTables.names.join(', ')})` : ''}</li>
            </ul>
            {result.warnings.length > 0 && (
              <div className="mt-1 text-[11px] text-amber-700">
                {result.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
              </div>
            )}
          </div>
        )}

        {/* Columnas con fórmula (estado actual) */}
        <div className="bg-white rounded-xl shadow-subtle p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <FunctionSquare size={18} className="text-primary" />
            <h2 className="text-navy font-bold text-[15px]">Columnas con fórmula</h2>
          </div>
          {formulaCols.length === 0 ? (
            <p className="text-[12px] text-muted">Ninguna columna usa fórmula todavía.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {formulaCols.map((c) => (
                <div key={c.id} className="py-2 flex items-center justify-between gap-3">
                  <span className="text-[13px] text-navy font-semibold">{c.name}</span>
                  <code className="text-[11px] text-muted bg-surface rounded px-2 py-1 max-w-[60%] truncate" title={c.formula}>{c.formula}</code>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tablas auxiliares (estado actual) */}
        <div className="bg-white rounded-xl shadow-subtle p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Table2 size={18} className="text-primary" />
            <h2 className="text-navy font-bold text-[15px]">Tablas auxiliares</h2>
          </div>
          {auxTables.length === 0 ? (
            <p className="text-[12px] text-muted">No hay tablas auxiliares cargadas.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {auxTables.map((t) => {
                const colsArr = Array.isArray(t.columns_json) ? (t.columns_json as string[]) : [];
                const rowsArr = Array.isArray(t.rows_json) ? (t.rows_json as string[][]) : [];
                return (
                  <div key={t.id} className="border border-border rounded-lg px-3 py-2">
                    <p className="text-[13px] text-navy font-bold">{t.name ?? t.group_key}</p>
                    <p className="text-[11px] text-muted">{colsArr.join(' · ')} — {rowsArr.length} fila{rowsArr.length !== 1 ? 's' : ''}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
