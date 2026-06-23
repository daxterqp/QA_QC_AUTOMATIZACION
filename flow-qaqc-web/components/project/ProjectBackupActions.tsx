'use client';

/**
 * ProjectBackupActions — Importar y Eliminar proyecto (SOLO CREATOR, web/desktop).
 *
 * ImportProjectButton: sube un .zip de respaldo → POST /api/projects/import
 *   (upsert idempotente + re-sube archivos a S3).
 *
 * DeleteProjectButton + DeleteProjectModal: borrado "de raíz" con las 4 LLAVES:
 *   (A) export local primero (lo hace el servidor: arma+verifica el .zip antes de borrar)
 *   (B) solo CREATOR (gate server-side)
 *   (C) escribir el nombre EXACTO del proyecto
 *   (D) confirmar el resumen de impacto
 * El borrado real es una RPC atómica + limpieza S3 por prefijo (sin huérfanos).
 */
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2, Upload, X, Loader2, AlertTriangle, Download, CheckCircle2 } from 'lucide-react';
import type { Project } from '@/types';

const fmtMB = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

// ── Importar proyecto ────────────────────────────────────────────────────────
export function ImportProjectButton() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) { setResult({ ok: false, text: 'Elegí un archivo .zip de respaldo de proyecto.' }); return; }
    setBusy(true); setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/projects/import', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudo importar.');
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project-metrics'] });
      const adj = j.adjusted && Object.keys(j.adjusted).length ? ` · ajustes: ${JSON.stringify(j.adjusted)}` : '';
      setResult({ ok: true, text: `Restaurado "${j.projectName}" · ${j.filesUploaded} archivo(s) a S3${adj}.` });
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-white border border-white/20 hover:bg-white/20 transition cursor-pointer"
        title="Importar/restaurar un proyecto desde su respaldo (.zip)"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
        Importar
        <input type="file" accept=".zip,application/zip" className="hidden" onChange={onFile} disabled={busy} />
      </label>
      {result && (
        <div className="fixed inset-0 z-[60] bg-navy/50 flex items-center justify-center p-4" onClick={() => setResult(null)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              {result.ok ? <CheckCircle2 className="text-emerald-600" size={20} /> : <AlertTriangle className="text-danger" size={20} />}
              <h3 className="text-base font-bold text-navy">{result.ok ? 'Importación completa' : 'No se pudo importar'}</h3>
            </div>
            <p className="text-sm text-textSecondary break-words">{result.text}</p>
            <div className="flex justify-end"><button onClick={() => setResult(null)} className="px-4 py-1.5 text-xs font-bold rounded bg-primary text-white hover:bg-primary/90">Cerrar</button></div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Eliminar proyecto (zona de peligro) ──────────────────────────────────────
export function DeleteProjectButton({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center bg-white border border-border rounded-md px-2.5 py-1.5 text-danger hover:border-danger hover:bg-danger/5 transition"
        title="Eliminar proyecto (de raíz, con respaldo)"
      >
        <Trash2 size={14} />
      </button>
      {open && <DeleteProjectModal project={project} onClose={() => setOpen(false)} />}
    </>
  );
}

type Impact = { projectName: string; counts: Record<string, number>; s3: { count: number; bytes: number } };
type DeleteResult = { zipPath: string; fileName: string; zipBytes: number; counts: Record<string, number>; s3FileCount: number; s3Deleted: number };

const COUNT_LABELS: Record<string, string> = {
  protocols: 'Ensayos', protocol_templates: 'Plantillas', plans: 'Planos', equipment: 'Equipos',
  work_sessions: 'Sesiones', samples: 'Muestras', locations: 'Ubicaciones', non_conformities: 'No conformidades',
};

function DeleteProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const qc = useQueryClient();
  const [impact, setImpact] = useState<Impact | null>(null);
  const [impactErr, setImpactErr] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<DeleteResult | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/impact?projectId=${encodeURIComponent(project.id)}`)
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Error'); return j; })
      .then(j => { if (alive) setImpact(j); })
      .catch(e => { if (alive) setImpactErr((e as Error).message); });
    return () => { alive = false; };
  }, [project.id]);

  const nameMatches = confirmName.trim() === (project.name ?? '').trim();
  const canDelete = nameMatches && ack && !busy && !done;

  async function doDelete() {
    if (!canDelete) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/projects/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, confirmName: confirmName.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudo eliminar.');
      setDone(j as DeleteResult);
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project-metrics'] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-navy/60 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-lg p-5 flex flex-col gap-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-danger" size={20} />
            <h3 className="text-base font-extrabold text-navy">Eliminar proyecto de raíz</h3>
          </div>
          {!busy && <button onClick={onClose} className="text-gray-400 hover:text-danger"><X size={18} /></button>}
        </div>

        {done ? (
          // ── Resultado ──
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 size={18} /> <span className="font-bold">Proyecto eliminado</span></div>
            <div className="bg-surface border border-border rounded-lg p-3 text-sm text-textSecondary flex flex-col gap-1">
              <p>✓ Respaldo guardado en:</p>
              <code className="text-[12px] bg-white border border-border rounded px-2 py-1 break-all">{done.zipPath}</code>
              <p className="mt-1">✓ {fmtMB(done.zipBytes)} · {done.s3Deleted} archivo(s) S3 borrados.</p>
            </div>
            <div className="flex justify-between gap-2">
              <a href={`/api/projects/download-export?file=${encodeURIComponent(done.fileName)}`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded border border-primary text-primary hover:bg-primary/5">
                <Download size={14} /> Descargar copia
              </a>
              <button onClick={onClose} className="px-4 py-1.5 text-xs font-bold rounded bg-primary text-white hover:bg-primary/90">Cerrar</button>
            </div>
          </div>
        ) : (
          <>
            {/* (D) Resumen de impacto */}
            <p className="text-sm text-textSecondary">Esta acción borra <b>de raíz</b> el proyecto y TODOS sus datos y archivos. Primero se guarda un respaldo local (.zip) restaurable.</p>
            <div className="bg-surface border border-border rounded-lg p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">Se eliminará</p>
              {impactErr ? <p className="text-xs text-danger">{impactErr}</p>
                : !impact ? <p className="text-xs text-muted flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Calculando…</p>
                : (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {Object.entries(impact.counts).filter(([, n]) => n > 0).map(([k, n]) => (
                      <div key={k} className="flex justify-between"><span className="text-textSecondary">{COUNT_LABELS[k] ?? k}</span><b className="text-navy">{n}</b></div>
                    ))}
                    <div className="flex justify-between col-span-2 border-t border-border mt-1 pt-1"><span className="text-textSecondary">Archivos en S3</span><b className="text-navy">{impact.s3.count} · {fmtMB(impact.s3.bytes)}</b></div>
                  </div>
                )}
            </div>

            {/* (C) Nombre exacto */}
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-600">Para confirmar, escribí el nombre exacto del proyecto:</span>
              <code className="text-[12px] text-navy bg-surface border border-border rounded px-2 py-1 self-start">{project.name}</code>
              <input value={confirmName} onChange={e => setConfirmName(e.target.value)} placeholder="Nombre del proyecto"
                className={`border rounded px-2 py-1.5 text-sm ${confirmName && !nameMatches ? 'border-danger' : 'border-border'}`} autoFocus />
            </label>

            {/* (A) ack del respaldo */}
            <label className="flex items-start gap-2 text-sm text-textSecondary cursor-pointer">
              <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="mt-0.5" />
              <span>Entiendo que esto elimina el proyecto de raíz. Se guardará un respaldo .zip en este equipo que puedo restaurar con “Importar proyecto”.</span>
            </label>

            {error && <p className="text-xs text-danger bg-danger/5 border border-danger/30 rounded p-2 break-words">{error}</p>}

            <div className="flex justify-end gap-2 mt-1">
              <button onClick={onClose} disabled={busy} className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:text-gray-800 disabled:opacity-40">Cancelar</button>
              <button onClick={doDelete} disabled={!canDelete}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded bg-danger text-white hover:bg-danger/90 disabled:opacity-40">
                {busy ? <><Loader2 size={14} className="animate-spin" /> Procesando…</> : <><Trash2 size={14} /> Exportar respaldo y eliminar</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
