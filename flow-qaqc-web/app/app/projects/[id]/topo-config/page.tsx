'use client';

/**
 * Configuración del módulo topográfico (web) — pestaña propia del módulo (se abre
 * con el engranaje en la pantalla de Carga). Aquí vive TODO el detalle (la config
 * general de módulos solo deja el on/off): visualización GPS/topo (+ recuadro de
 * cobertura), tabla compacta de columnas, procesamiento, y el botón de subir Excel
 * (Fórmulas + Tablas Auxiliares, 2 hojas → requiere .xlsx).
 */
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Settings, UploadCloud, Loader2, CheckCircle2, AlertTriangle, Table2, Save,
} from 'lucide-react';
import { useProjects, useProjectFlags, useUpdateProjectFlags } from '@hooks/useProjects';
import { useLabAuxTablesList } from '@hooks/useLabAuxTables';
import { useAuth } from '@lib/auth-context';
import { isTopoEnabled, type ProjectFeatureFlags, type TopoColumn } from '@/types';
import { createClient } from '@lib/supabase/client';
import { summarizeTopoCoverage, hasTopoData, type TopoCoverageItem } from '@lib/topoVisibility';
import { importTopoFormulasWorkbook, type TopoFormulasImportResult } from '@lib/topoFormulasImport';
import { TopoColumnsEditor } from '@components/topo/TopoColumnsEditor';
import PageHeader from '@components/PageHeader';
import { usePageRefresh } from '@hooks/usePageRefresh';

function Toggle({ label, description, value, onToggle, disabled }: {
  label: string; description: string; value: boolean; onToggle: () => void; disabled?: boolean;
}) {
  return (
    <button onClick={onToggle} disabled={disabled}
      className={`flex items-start gap-3 p-3 rounded-lg border text-left transition w-full ${value ? 'bg-primary/5 border-primary/30' : 'bg-white border-border hover:bg-surface'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${value ? 'bg-primary border-primary' : 'bg-white border-border'}`}>
        {value && <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5 L4 7 L8 3" stroke="white" strokeWidth="2" fill="none" /></svg>}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] font-bold ${value ? 'text-primary' : 'text-navy'}`}>{label}</p>
        <p className="text-[11px] text-muted leading-snug">{description}</p>
      </div>
    </button>
  );
}

export default function TopoConfigPage() {
  const { refreshing, onRefresh } = usePageRefresh();
  const { id: projectId } = useParams<{ id: string }>();
  const { currentUser } = useAuth();
  const { data: projects = [] } = useProjects();
  const project = projects.find((p) => p.id === projectId);
  const { data: serverFlags } = useProjectFlags(projectId);
  const { data: auxTables = [], refetch: refetchAux } = useLabAuxTablesList(projectId);
  const updateFlags = useUpdateProjectFlags(projectId);

  const canEdit = currentUser?.role === 'CREATOR';
  const [flags, setFlags] = useState<ProjectFeatureFlags | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [topoItems, setTopoItems] = useState<TopoCoverageItem[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TopoFormulasImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sincroniza el estado local desde el servidor (al cargar / tras importar).
  useEffect(() => { if (serverFlags && !dirty) setFlags(serverFlags); }, [serverFlags, dirty]);

  // Cobertura GPS/topo para el recuadro de alerta.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('protocols')
        .select('id, protocol_code, external_id, topo_coord_east, topo_coord_north, topo_coord_elevation, topo_values_json, latitude, longitude')
        .eq('project_id', projectId);
      if (cancelled) return;
      setTopoItems(((data ?? []) as Record<string, unknown>[]).map((p) => ({
        id: String(p.id),
        code: String(p.protocol_code ?? p.external_id ?? p.id),
        hasTopo: hasTopoData({
          east: p.topo_coord_east as number | null,
          north: p.topo_coord_north as number | null,
          elevation: p.topo_coord_elevation as number | null,
          valuesJson: p.topo_values_json == null ? null : JSON.stringify(p.topo_values_json),
        }),
        hasGps: p.latitude != null && p.longitude != null,
      })));
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const setFlag = <K extends keyof ProjectFeatureFlags>(key: K, value: ProjectFeatureFlags[K]) => {
    setFlags((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
  };
  const toggle = (key: keyof ProjectFeatureFlags) => setFlag(key, !(flags?.[key]) as never);

  const coverage = (flags && topoItems) ? summarizeTopoCoverage(topoItems, flags) : null;

  const save = async () => {
    if (!flags || !canEdit) return;
    setSaving(true);
    try {
      await updateFlags.mutateAsync({ kind: 'flags-only', flags } as never);
      setDirty(false);
    } catch (e) { window.alert((e as Error).message); }
    finally { setSaving(false); }
  };

  const onPick = () => fileRef.current?.click();
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !flags) return;
    setBusy(true); setError(null); setResult(null);
    try {
      // Guarda los cambios locales primero (para que el import los tome como base),
      // luego importa (re-lee FRESCO + mergea) y re-sincroniza el estado local.
      if (dirty) { await updateFlags.mutateAsync({ kind: 'flags-only', flags } as never); setDirty(false); }
      const buf = await file.arrayBuffer();
      const supabase = createClient();
      const res = await importTopoFormulasWorkbook(supabase, projectId, buf, flags);
      if (res.formulas.applied + res.formulas.created > 0) {
        await updateFlags.mutateAsync({ kind: 'flags-only', flags: res.mergedFlags } as never);
      }
      setFlags(res.mergedFlags); setDirty(false);
      await refetchAux();
      setResult(res);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  if (serverFlags && !isTopoEnabled(serverFlags)) {
    return (
      <div className="min-h-screen bg-surface flex flex-col">
        <PageHeader title="Configuración topográfica" subtitle={project?.name} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
          <Settings size={40} className="text-[#8896a5]" />
          <p className="text-muted text-sm max-w-sm">El módulo de Carga de datos topográficos está desactivado. Actívalo en Configurar módulos.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PageHeader
        title="Configuración topográfica"
        subtitle={project?.name}
        crumbs={[{ label: 'Proyectos', href: '/app/projects' }, { label: project?.name ?? '…' }]}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />

      <div className="flex-1 p-4 flex flex-col gap-4 pb-28 max-w-3xl w-full mx-auto">
        {!flags ? (
          <div className="flex items-center gap-2 text-muted text-sm"><Loader2 size={16} className="animate-spin" /> Cargando…</div>
        ) : (
          <>
            {/* Visualización GPS / Topo */}
            <div className="bg-white rounded-xl shadow-subtle p-5 flex flex-col gap-2">
              <h2 className="text-navy font-bold text-[15px] mb-1">Coordenadas en la ficha</h2>
              <Toggle label="Reemplazar coordenadas GPS"
                description="En las fichas se oculta la tarjeta de Coordenadas GPS y se usan SOLO las topográficas."
                value={!!flags.topo_replace_gps} onToggle={() => toggle('topo_replace_gps')} disabled={!canEdit} />
              {flags.topo_replace_gps && (
                <Toggle label="Seguir usando GPS cuando sea posible"
                  description="Para los ensayos SIN datos topográficos, usar la tarjeta de coordenadas GPS como respaldo."
                  value={!!flags.topo_keep_gps_fallback} onToggle={() => toggle('topo_keep_gps_fallback')} disabled={!canEdit} />
              )}
              {flags.topo_replace_gps && flags.topo_keep_gps_fallback && coverage && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 flex gap-2">
                  <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-900 leading-snug flex flex-col gap-0.5">
                    <span><b>{coverage.withoutTopo.length}</b> de <b>{coverage.total}</b> ensayos no tienen coordenadas topográficas.</span>
                    <span><b>{coverage.usingGps.length}</b> usarán las coordenadas GPS como respaldo.</span>
                    {coverage.withoutTopo.length > coverage.usingGps.length && (
                      <span className="text-amber-700">{coverage.withoutTopo.length - coverage.usingGps.length} quedarán sin ninguna coordenada.</span>
                    )}
                    {coverage.withoutTopo.length > 0 && (
                      <span className="text-amber-700/90 mt-0.5">
                        Sin topo: {coverage.withoutTopo.slice(0, 8).map((i) => i.code).join(', ')}
                        {coverage.withoutTopo.length > 8 ? `, +${coverage.withoutTopo.length - 8}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Tabla de columnas */}
            <div className="bg-white rounded-xl shadow-subtle p-5">
              <TopoColumnsEditor columns={flags.topo_columns} onChange={(cols) => setFlag('topo_columns', cols)} />
            </div>

            {/* Fórmulas + Tablas auxiliares (el procesamiento siempre está activo:
                si no se usa ninguna fórmula/área, simplemente no calcula nada). */}
            <div className="bg-white rounded-xl shadow-subtle p-5 flex flex-col gap-3">
              <h2 className="text-navy font-bold text-[15px]">Fórmulas y tablas auxiliares</h2>
              <div className="flex flex-col gap-3 pl-1">
                <p className="text-[12px] text-muted leading-snug">
                  Sube un <b>.xlsx</b> con dos hojas (un .csv solo tiene una). <b>Hoja 1 «Fórmulas»</b>: filas
                  {' '}<code>Columna | Fórmula</code> (se asigna a la columna por nombre). <b>Hoja 2 «Tablas Auxiliares»</b>:
                  {' '}<code>tabla-&lt;nombre&gt; | columna | valor1 | valor2 …</code> (para <code>BUSCAR</code>).
                </p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFile} className="hidden" />
                <button onClick={onPick} disabled={!canEdit || busy}
                  className="self-start flex items-center gap-2 bg-primary text-white rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50 hover:bg-primary/90 transition">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
                  {busy ? 'Procesando…' : 'Subir Excel (Fórmulas + Tablas)'}
                </button>
                {error && (
                  <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 flex gap-2 text-[12px] text-danger">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}
                  </div>
                )}
                {result && (
                  <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold text-[12px]"><CheckCircle2 size={15} /> Importación completada</div>
                    <p className="text-[11px] text-emerald-900">Fórmulas: {result.formulas.applied} asignadas · {result.formulas.created} nuevas · Tablas: {result.auxTables.upserted}</p>
                    {result.warnings.map((w, i) => <p key={i} className="text-[11px] text-amber-700">⚠ {w}</p>)}
                  </div>
                )}
                {/* Tablas auxiliares cargadas */}
                <div className="flex flex-col gap-1.5 mt-1">
                  <div className="flex items-center gap-2 text-[12px] font-bold text-muted"><Table2 size={14} /> Tablas auxiliares</div>
                  {auxTables.length === 0 ? (
                    <p className="text-[11px] text-muted">Ninguna cargada.</p>
                  ) : auxTables.map((t) => {
                    const colsArr = Array.isArray(t.columns_json) ? (t.columns_json as string[]) : [];
                    const rowsArr = Array.isArray(t.rows_json) ? (t.rows_json as string[][]) : [];
                    return (
                      <div key={t.id} className="border border-border rounded-md px-2.5 py-1.5">
                        <p className="text-[12px] text-navy font-bold">{t.name ?? t.group_key}</p>
                        <p className="text-[10px] text-muted">{colsArr.join(' · ')} — {rowsArr.length} fila{rowsArr.length !== 1 ? 's' : ''}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer guardar */}
      {flags && canEdit && (
        <div className="sticky bottom-0 bg-white border-t border-border px-4 py-3 flex justify-end">
          <button onClick={save} disabled={!dirty || saving}
            className="flex items-center gap-2 bg-primary text-white rounded-lg px-5 py-2 text-sm font-bold disabled:opacity-50 hover:bg-primary/90 transition">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? 'Guardando…' : dirty ? 'Guardar configuración' : 'Guardado'}
          </button>
        </div>
      )}
    </div>
  );
}
