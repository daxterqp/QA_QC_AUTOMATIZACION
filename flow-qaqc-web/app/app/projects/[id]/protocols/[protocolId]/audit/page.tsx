'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle, Loader2, ShieldCheck, ShieldX,
  AlertTriangle, ZoomIn, Pencil, Plus, Trash2, Map, RefreshCw,
} from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { useProtocolFill, freezeProtocolItems } from '@hooks/useProtocolFill';
import { useApproveProtocol, useRejectProtocol, useProtocolApprovals, useApproveLevel, useRejectLevel, ensureApprovalRows } from '@hooks/useProtocolAudit';
import { useEquipment, useProtocolEquipment, useLinkProtocolEquipment } from '@hooks/useEquipment';
import { useXrefValues, fetchXrefResolution, compareXrefMeta } from '@hooks/useXrefs';
import { useLabAuxTables } from '@hooks/useFileUpload';
import { QRCodeBadge } from '@components/QRCodeBadge';
import { calibrationState, isEquipmentCatalogEnabled, DEFAULT_FEATURE_FLAGS } from '@/types';
import { useProjectFlags } from '@hooks/useProjects';
import { useAuth } from '@lib/auth-context';
import { cn } from '@lib/utils';
import { applyStamp } from '@lib/stamp';
import { uploadBlobToS3, sanitizeFilename, seq, s3ProjectPrefix } from '@lib/s3-upload';
import { usePlansByReference } from '@hooks/usePlanViewer';
import { createClient } from '@lib/supabase/client';
import { isNumericProtocol, parseNumericRow, parseNumeric, inRange, splitRowComments, colLetter, scopeKeyFor, extractMatrices, diagnoseInvalidNumericItems, isValidDateText, isValidTimeText,
} from '@lib/numericProtocol';
import { resolveScopeCells, extractRefs, type ScopeCell } from '@lib/formulaEval';
import { NumericTable } from '@components/numeric/NumericTable';
import { useTemplateNorm } from '@hooks/useTemplateNorm';
import { useI18n, tx } from '@lib/i18n';
import type { ProtocolItem, Evidence } from '@/types';

const supabase = createClient();

// ── helpers ───────────────────────────────────────────────────────────────────
function s3Url(key: string) {
  const B = process.env.NEXT_PUBLIC_AWS_BUCKET;
  const R = process.env.NEXT_PUBLIC_AWS_REGION;
  return `https://${B}.s3.${R}.amazonaws.com/${key}`;
}

function evidenceUrl(ev: Evidence): string | null {
  if (ev.s3_url_placeholder) return `/api/s3-image?key=${encodeURIComponent(ev.s3_url_placeholder)}`;
  return null;
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    DRAFT: tx('webProto.statusDraft'), IN_PROGRESS: tx('webProto.statusInProgress'), SUBMITTED: tx('webProto.statusSubmitted'),
    APPROVED: tx('webProto.statusApproved'), REJECTED: tx('webProto.statusRejected'),
  };
  return map[status] ?? status;
}

function statusClasses(status: string) {
  const map: Record<string, string> = {
    DRAFT: 'bg-gray-400 text-white',
    IN_PROGRESS: 'bg-warning text-white',
    SUBMITTED: 'bg-primary text-white',
    APPROVED: 'bg-success text-white',
    REJECTED: 'bg-danger text-white',
  };
  return map[status] ?? 'bg-gray-400 text-white';
}

function itemResultBadge(item: ProtocolItem) {
  if (item.is_na) return { label: 'N/A', cls: 'bg-orange-50 text-orange-600' };
  if (item.is_compliant === true)  return { label: '✓', cls: 'bg-green-50 text-success' };
  if (item.is_compliant === false) return { label: '✗', cls: 'bg-red-50 text-danger' };
  return { label: '—', cls: 'bg-surface text-muted' };
}

// Celda compacta del grid del encabezado (replica .proto-info-cell del PDF)
function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 min-w-[120px] bg-[#f4f6f9] rounded-md px-2.5 py-1.5">
      <div className="text-[9px] font-bold text-[#888] tracking-wider uppercase mb-0.5">{label}</div>
      <div className="text-[12px] font-bold text-[#1a1a2e] line-clamp-2">{value}</div>
    </div>
  );
}

// Hook ligero para datos extra del encabezado tipo Dossier
function useAuditMeta(filledById: string | null, signedById: string | null, templateId: string | null) {
  return useQuery({
    queryKey: ['audit-meta', filledById, signedById, templateId],
    queryFn: async () => {
      const result = { filledByName: '—', signedByName: '—', idProtocolo: '' };
      const [filled, signed, tmpl] = await Promise.all([
        filledById  ? supabase.from('users').select('name, apellido').eq('id', filledById).single() : Promise.resolve({ data: null }),
        signedById  ? supabase.from('users').select('name, apellido').eq('id', signedById).single() : Promise.resolve({ data: null }),
        templateId  ? supabase.from('protocol_templates').select('id_protocolo').eq('id', templateId).single() : Promise.resolve({ data: null }),
      ]);
      if (filled?.data) result.filledByName = [filled.data.name, filled.data.apellido].filter(Boolean).join(' ').trim() || '—';
      if (signed?.data) result.signedByName = [signed.data.name, signed.data.apellido].filter(Boolean).join(' ').trim() || '—';
      if (tmpl?.data?.id_protocolo) result.idProtocolo = tmpl.data.id_protocolo;
      return result;
    },
    enabled: !!(filledById || signedById || templateId),
  });
}

// ── types ─────────────────────────────────────────────────────────────────────
type SectionHeader = { type: 'section'; title: string };
type ItemRow = { type: 'item'; item: ProtocolItem; idx: number };
type Row = SectionHeader | ItemRow;

// ── main component ────────────────────────────────────────────────────────────
export default function ProtocolAuditPage() {
  const { t } = useI18n();
  const { id: projectId, protocolId } = useParams<{ id: string; protocolId: string }>();
  const router = useRouter();
  const { currentUser } = useAuth();

  const { data: fillData, isLoading } = useProtocolFill(protocolId);
  const approveProtocol = useApproveProtocol(protocolId);
  const rejectProtocol = useRejectProtocol(protocolId);
  // v23 — Aprobaciones jerárquicas. Si project.feature_flags.multi_level_approval=true
  //       y approval_levels > 1, usamos el flujo nuevo; si no, legacy.
  const { data: projectFlags } = useProjectFlags(projectId);
  const { data: approvals = [] } = useProtocolApprovals(protocolId);
  const approveLevel = useApproveLevel(protocolId);
  const rejectLevel = useRejectLevel(protocolId);
  const multiLevelEnabled = !!(projectFlags?.multi_level_approval && projectFlags.approval_levels > 1);
  const totalLevels = projectFlags?.approval_levels ?? 1;
  const currentPendingLevel = (approvals.find(a => a.status === 'PENDING')?.level ?? 1) as 1 | 2 | 3;

  // v29 — protocol_linking deprecated, siempre activo.
  const xrefsEnabled = true;
  const { data: xrefValuesForAudit } = useXrefValues(
    projectId,
    fillData?.items ?? [],
    xrefsEnabled,
  );
  const { data: auxTablesForAudit } = useLabAuxTables(projectId); // v41 — BUSCAR()

  // v24 — Equipos calibrados. Si el flag está activo, mostramos selector y
  //       bloqueamos la firma cuando hay equipos NO firmables asociados:
  //       (a) vencidos (next_calibration_at < now) o
  //       (b) retired / inactive (status !== 'active').
  // v29 — Usar helper padre-hijo: equipment_catalog solo cuenta si
  // traceability_module también está ON (evita estado zombi).
  const equipmentEnabled = isEquipmentCatalogEnabled(projectFlags ?? DEFAULT_FEATURE_FLAGS);
  const { data: catalog = [] } = useEquipment(equipmentEnabled ? projectId : '');
  const { data: linked = [] } = useProtocolEquipment(equipmentEnabled ? protocolId : '');
  const linkEquipment = useLinkProtocolEquipment(protocolId);
  const expiredLinked = linked.filter(l =>
    l.equipment && (
      calibrationState(l.equipment) === 'expired'
      || l.equipment.status !== 'active'
    ),
  );
  const equipmentBlock = equipmentEnabled && expiredLinked.length > 0;
  const referencePlan = fillData?.location?.reference_plan;
  const { data: locationPlans = [] } = usePlansByReference(projectId, referencePlan);
  const numericMode = !!fillData && isNumericProtocol(fillData.items);
  // Diagnóstico: si NO es numericMode pero algunos items intentaron sintaxis numérica.
  const invalidNumericItems = (fillData && !numericMode) ? diagnoseInvalidNumericItems(fillData.items) : [];
  const protoAny = fillData?.protocol as any;

  // v42 — Frescura de los llamados entre ensayos (@código): badge "desactualizado".
  const qc = useQueryClient();
  const [xrefStale, setXrefStale] = useState(false);
  const [refreshingXref, setRefreshingXref] = useState(false);
  useEffect(() => {
    if (!fillData || !numericMode) { setXrefStale(false); return; }
    const raw = protoAny?.xref_snapshot_json;
    const stored = !raw ? null : (typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw);
    if (!stored || Object.keys(stored).length === 0) { setXrefStale(false); return; }
    let cancelled = false;
    fetchXrefResolution(projectId, fillData.items)
      .then(({ meta }) => { if (!cancelled) setXrefStale(compareXrefMeta(stored, meta).stale); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectId, fillData, numericMode, protoAny]);

  const handleRefreshXref = async () => {
    setRefreshingXref(true);
    try {
      // Guarda anti-pérdida: no recongelar si una fuente que tenía valor ya no
      // resuelve (borrada/des-aprobada/ambigua) → borraría datos buenos.
      const raw = protoAny?.xref_snapshot_json;
      const stored = !raw ? null : (typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw);
      if (stored && fillData) {
        const { meta } = await fetchXrefResolution(projectId, fillData.items);
        for (const k of Object.keys(stored)) {
          if (stored[k]?.value != null && meta[k]?.value == null) {
            alert(t('webProto.xrefSourceUnavailable'));
            return;
          }
        }
      }
      const { upsertSummaryRowWeb } = await import('@lib/summaryRow');
      const xv = await freezeProtocolItems(protocolId);
      await upsertSummaryRowWeb(protocolId, xv);
      await qc.invalidateQueries({ queryKey: ['protocol-fill', protocolId] });
      setXrefStale(false);
    } catch { /* noop */ } finally { setRefreshingXref(false); }
  };

  const { data: meta } = useAuditMeta(
    protoAny?.filled_by_id ?? null,
    protoAny?.signed_by_id ?? null,
    protoAny?.template_id ?? null,
  );
  const { data: normUrl } = useTemplateNorm(
    numericMode ? (fillData?.project?.name ?? null) : null,
    numericMode ? (meta?.idProtocolo ?? null) : null,
  );

  const [lightbox, setLightbox] = useState<string | null>(null);
  // approve modal
  const [showApproveModal, setShowApproveModal] = useState(false);
  // reject modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [approvalReason, setApprovalReason] = useState(''); // v33 — motivo al aprobar fuera de rango
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [extraPhotos, setExtraPhotos] = useState<string[]>([]);
  const [uploadingExtra, setUploadingExtra] = useState(false);
  const extraFileRef = useRef<HTMLInputElement>(null);

  const isJefe = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';

  // Load extra photos from S3
  useEffect(() => {
    if (!fillData) return;
    const { protocol, location, project } = fillData;
    if (!project) return;
    const prefix = `${s3ProjectPrefix(project.name)}/photos/`;
    const protoSeg = sanitizeFilename(protocol.protocol_number ?? protocol.id);
    const locSeg = location ? sanitizeFilename(location.name) : 'SIN_UBICACION';
    const extraPrefix = `${prefix}${protoSeg}-${locSeg}-extra-`;

    fetch(`/api/s3-list?prefix=${encodeURIComponent(extraPrefix)}`)
      .then(r => r.ok ? r.json() : { keys: [] })
      .then(({ keys }) => setExtraPhotos(keys as string[]))
      .catch(() => {});
  }, [fillData]);

  async function handleExtraPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !fillData) return;
    e.target.value = '';
    setUploadingExtra(true);
    try {
      const { protocol, location, project } = fillData;
      const blobUrl = URL.createObjectURL(file);
      const logoKey = project?.logo_s3_key ?? (project?.id ? `logos/project_${project.id}/logo.jpg` : null);
      const logoUrl = logoKey ? `/api/s3-image-nocache?key=${encodeURIComponent(logoKey)}` : null;
      const stampedBlob = await applyStamp({ imageUrl: blobUrl, logoUrl, comment: project?.stamp_comment ?? null });
      URL.revokeObjectURL(blobUrl);

      const projPrefix = s3ProjectPrefix(project?.name ?? projectId);
      const locSeg = location ? sanitizeFilename(location.name) : 'SIN_UBICACION';
      const protoSeg = sanitizeFilename(protocol.protocol_number ?? protocol.id);
      const pos = extraPhotos.length + 1;
      const s3Key = `${projPrefix}/photos/${protoSeg}-${locSeg}-extra-F${seq(pos)}.jpg`;

      await uploadBlobToS3(stampedBlob, s3Key, 'image/jpeg');
      setExtraPhotos(prev => [...prev, s3Key]);
    } catch (err) {
      console.error('Error subiendo foto extra:', err);
    } finally {
      setUploadingExtra(false);
    }
  }

  async function handleDeleteExtra(s3Key: string) {
    if (!confirm(t('webProto.confirmDeleteExtraPhoto'))) return;
    try {
      await fetch('/api/s3-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: s3Key }),
      });
      setExtraPhotos(prev => prev.filter(k => k !== s3Key));
    } catch (err) {
      console.error('Error eliminando foto extra:', err);
    }
  }

  // ── guard: loading ───────────────────────────────────────────────────────
  if (isLoading || !fillData) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen bg-surface">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const { protocol, items, evidenceMap, location, project } = fillData;
  const p = protocol as any;
  const status: string = p.status ?? 'DRAFT';

  // Summary counts (paridad con móvil: Cumple, No cumple, Sin responder, Total)
  const okCount   = items.filter(i => !i.is_na && i.is_compliant === true).length;
  const nokCount  = items.filter(i => !i.is_na && i.is_compliant === false && i.has_answer).length;
  const naCount   = items.filter(i => i.is_na).length;
  const pendCount = Math.max(0, items.length - okCount - nokCount - naCount);

  // canApprove: para protocolos clásicos, todos respondidos y ninguno es No.
  // Para numéricos, recomputamos en vivo desde el scope (sin depender del snapshot
  // en DB) — así si el supervisor corrige un valor fuera de rango y vuelve a entrar
  // al audit, el botón Aprobar reaparece sin necesidad de re-enviar.
  // v33 — `isConforming` = cumple TODAS las restricciones (en rango, lleno, sin
  // errores). El botón Aprobar está SIEMPRE disponible (ver `canApprove` abajo);
  // si NO es conforme, al aprobar se exige un motivo (override del jefe).
  let isConforming: boolean;
  if (numericMode) {
    // Construir celdas planas (multi-columna) y resolver scope live
    const scopeCells: ScopeCell[] = [];
    const parsedRows = items.map(it => ({ item: it, spec: parseNumericRow(it.validation_method) }));
    const { matrices } = extractMatrices(parsedRows);
    for (const { item, spec } of parsedRows) {
      if (spec?.kind !== 'row') continue;
      const partida = item.partida_item ?? '';
      const cellVals = splitRowComments(item.comments, spec.cells.length);
      for (let i = 0; i < spec.cells.length; i++) {
        const cell = spec.cells[i];
        const key = scopeKeyFor(partida, i);
        // Mismo mapeo de kinds que NumericTable (v32). `val` FALTABA: fórmulas
        // que referencian tamices fijos daban "Referencia desconocida" y el
        // botón Aprobar quedaba bloqueado para siempre en granulometrías.
        if (cell.kind === 'manual' || cell.kind === 'percent' || cell.kind === 'bool' || cell.kind === 'free') scopeCells.push({ key, kind: 'manual', raw: cellVals[i] ?? '' });
        else if (cell.kind === 'list' || cell.kind === 'date' || cell.kind === 'time' || cell.kind === 'equipment' || cell.kind === 'text') scopeCells.push({ key, kind: 'list', raw: cellVals[i] ?? '' });
        else if (cell.kind === 'lookup') scopeCells.push({ key, kind: 'lookup', refKey: cell.refKey, matrixId: cell.matrixId, searchCol: cell.searchCol, returnCol: cell.returnCol });
        else if (cell.kind === 'formula') scopeCells.push({ key, kind: 'formula', expr: cell.expr });
        else if (cell.kind === 'val') scopeCells.push({ key, kind: 'manual', raw: cell.literal });
      }
    }
    const { scope, errors, textValues } = resolveScopeCells(scopeCells, matrices, xrefValuesForAudit, auxTablesForAudit);

    let ok = items.length > 0;
    outer:
    for (const { item, spec } of parsedRows) {
      if (!spec) {
        // Items SIN método (encabezados de sección, v31) no bloquean la
        // aprobación — solo bloquea un método presente que NO parsea.
        if ((item.validation_method ?? '').trim() !== '') { ok = false; break; }
        continue;
      }
      if (spec.kind !== 'row') continue; // graph, header, matrix-* no afectan canApprove
      const partida = item.partida_item ?? '';
      for (let i = 0; i < spec.cells.length; i++) {
        const cell = spec.cells[i];
        const key = scopeKeyFor(partida, i);
        if (cell.hidden) continue;   // v34 — celdas de cálculo ocultas no bloquean
        if (errors[key]) { ok = false; break outer; }
        const v = scope[key];
        if (cell.kind === 'manual' || cell.kind === 'percent') {
          if (v == null) { ok = false; break outer; }
          if (!inRange(v, cell.range)) { ok = false; break outer; }
        } else if (cell.kind === 'list' || cell.kind === 'bool' || cell.kind === 'equipment') {
          // Requieren valor (selección, Sí/No marcado, código de equipo)
          if (!textValues[key]) { ok = false; break outer; }
        } else if (cell.kind === 'date' || cell.kind === 'time') {
          const txt = textValues[key];
          if (!txt) { ok = false; break outer; }
          if (!(cell.kind === 'date' ? isValidDateText(txt) : isValidTimeText(txt))) { ok = false; break outer; }
        } else if (cell.kind === 'lookup') {
          // Lookup: requiere resultado (texto o número)
          if (!textValues[key] && v == null) { ok = false; break outer; }
        } else if (cell.kind === 'formula') {
          if (v == null) { ok = false; break outer; }
          let depsFilled = true;
          try {
            const deps = extractRefs(cell.expr);
            depsFilled = deps.every(d => scope[d] != null);
          } catch { depsFilled = false; }
          if (!depsFilled) { ok = false; break outer; }
          if (cell.range && !inRange(v, cell.range)) { ok = false; break outer; }
        }
      }
    }
    isConforming = ok;
  } else {
    isConforming =
      items.length > 0 &&
      items.every(i => i.has_answer) &&
      nokCount === 0;
  }
  // v33 — El botón Aprobar SIEMPRE está disponible (aunque haya valores fuera de
  // rango): el jefe puede aprobar con justificación. Solo los equipos
  // descalibrados (v24) siguen bloqueando la firma como salvaguarda de calibración.
  const canApprove = !equipmentBlock;
  const requiresApprovalReason = !isConforming;

  // Build section-interleaved rows
  const rows: Row[] = [];
  let lastSection = '';
  items.forEach((item, idx) => {
    const section = item.section ?? '';
    if (section && section !== lastSection) {
      rows.push({ type: 'section', title: section });
      lastSection = section;
    }
    rows.push({ type: 'item', item, idx });
  });

  // ── handlers ─────────────────────────────────────────────────────────────
  // v31 — Instancias de los modos nuevos no tienen ubicación: la ruta de
  // retorno se ramifica (sector → ensayos/sector, fecha → ensayos/date, menú).
  const backRoute = protocol?.location_id
    ? `/app/projects/${projectId}/locations/${protocol.location_id}/protocols`
    : (protocol as { sector_id?: string | null } | null)?.sector_id
      ? `/app/projects/${projectId}/ensayos/sector`
      : (protocol as { ensayo_date?: string | null } | null)?.ensayo_date
        ? `/app/projects/${projectId}/ensayos/date`
        : `/app/projects/${projectId}/menu`;

  async function handleApprove() {
    if (!currentUser) return;
    // v33 — si el ensayo NO cumple, el motivo de aprobación es OBLIGATORIO.
    const reason = requiresApprovalReason ? approvalReason.trim() : null;
    if (requiresApprovalReason && !reason) {
      setSaveError(t('webProto.approvalReasonRequired'));
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (multiLevelEnabled) {
        // Garantiza filas (idempotente) y aprueba el nivel pendiente actual
        await ensureApprovalRows(protocolId, totalLevels);
        await approveLevel.mutateAsync({ signerId: currentUser.id, level: currentPendingLevel, reason });
      } else {
        await approveProtocol.mutateAsync({ signedById: currentUser.id, reason });
      }
      setShowApproveModal(false);
      setApprovalReason('');
      router.push(backRoute);
    } catch (e: any) {
      setSaveError(e?.message ?? t('webProto.errApprove'));
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim() || !currentUser) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (multiLevelEnabled) {
        await ensureApprovalRows(protocolId, totalLevels);
        await rejectLevel.mutateAsync({ signerId: currentUser.id, level: currentPendingLevel, reason: rejectReason.trim() });
      } else {
        await rejectProtocol.mutateAsync(rejectReason.trim());
      }
      setShowRejectModal(false);
      setRejectReason('');
      router.push(backRoute);
    } catch (e: any) {
      setSaveError(e?.message ?? t('webProto.errReject'));
    } finally {
      setSaving(false);
    }
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <PageHeader
        title={p.id_protocolo ?? p.protocol_number ?? t('webProto.protocol')}
        subtitle={location?.name ?? t('webProto.noLocation')}
        crumbs={[
          { label: t('webProto.protocols'), href: backRoute },
          { label: p.id_protocolo ?? t('webProto.protocol') },
        ]}
        rightContent={
          <div className="flex items-center gap-2">
            {numericMode && normUrl && (
              <a
                href={normUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-white border border-white/20 hover:bg-white/20 transition"
              >
                <Map size={12} />
                {t('webProto.viewStandard')}
              </a>
            )}
            {!numericMode && locationPlans.length > 0 && (
              <button
                onClick={() => router.push(`/app/projects/${projectId}/plans/${locationPlans[0].id}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-white border border-white/20 hover:bg-white/20 transition"
              >
                <Map size={12} />
                {t('webProto.plans')}
              </button>
            )}
            {['CREATOR', 'RESIDENT'].includes(currentUser?.role ?? '') && (status === 'SUBMITTED' || status === 'APPROVED') && (
              <button
                onClick={() => router.push(`/app/projects/${projectId}/protocols/${protocolId}/fill?edit=true`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-white border border-white/20 hover:bg-white/20 transition"
              >
                <Pencil size={12} />
                {t('webProto.edit')}
              </button>
            )}
            <span className={cn('text-xs font-bold px-3 py-1 rounded-full', statusClasses(status))}>
              {statusLabel(status)}
            </span>
          </div>
        }
      />

      <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-5 flex flex-col gap-3">

        {/* ── Encabezado tipo Dossier PDF ────────────────────────────────── */}
        <div className="bg-white rounded-md p-3.5 border border-border shadow-subtle flex flex-col gap-3">
          {/* Top bar: nombre del protocolo + estado */}
          <div className="flex items-center gap-2.5 pb-2.5 border-b-2 border-border">
            <div className="flex-1 min-w-0">
              <h2 className="text-[18px] font-extrabold text-navy tracking-tight">{p.protocol_number ?? p.id_protocolo ?? '—'}</h2>
              {project?.name && <p className="text-[11px] font-semibold text-muted mt-0.5">{project.name}</p>}
            </div>
            <span className={cn('px-2.5 py-1 rounded-md text-[10px] font-extrabold tracking-wider', statusClasses(status))}>
              {statusLabel(status).toUpperCase()}
            </span>
          </div>

          {/* Grid de información — mismo orden que el Dossier PDF */}
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap gap-1.5">
              <InfoCell label={t('webProto.project')} value={project?.name ?? '—'} />
              <InfoCell label={t('webProto.date')} value={new Date().toLocaleDateString('es-PE')} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <InfoCell label={t('webProto.supervisor')} value={meta?.filledByName ?? '—'} />
              <InfoCell
                label={t('webProto.realizationDate')}
                value={p.filled_at ? new Date(p.filled_at).toLocaleString('es-PE')
                  : p.updated_at ? new Date(p.updated_at).toLocaleString('es-PE') : '—'}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <InfoCell label={t('webProto.approver')} value={meta?.signedByName ?? '—'} />
              <InfoCell
                label={t('webProto.approvalDate')}
                value={p.signed_at ? new Date(p.signed_at).toLocaleString('es-PE') : '—'}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <InfoCell label={t('webProto.idProtocol')} value={meta?.idProtocolo || p.protocol_number || '—'} />
              <InfoCell label={t('webProto.location')} value={(location as any)?.location_only ?? location?.name ?? '—'} />
              {(location as any)?.specialty && (
                <InfoCell label={t('webProto.specialty')} value={(location as any).specialty} />
              )}
            </div>
            {p.rejection_reason && status !== 'APPROVED' && (
              <div className="bg-[#fce8e6] rounded-md px-2.5 py-2 mt-1 flex flex-col gap-0.5">
                <span className="text-[9px] font-extrabold text-[#d93025] tracking-wider">{t('webProto.rejectionReason')}</span>
                <span className="text-[12px] font-bold text-[#d93025] leading-snug">{p.rejection_reason}</span>
              </div>
            )}
            {/* v33 — motivo de aprobación cuando se aprobó fuera de rango (override). */}
            {p.approval_reason && status === 'APPROVED' && (
              <div className="bg-amber-50 border border-warning/40 rounded-md px-2.5 py-2 mt-1 flex flex-col gap-0.5">
                <span className="text-[9px] font-extrabold text-amber-800 tracking-wider">{t('webProto.approvalReasonOutOfRange')}</span>
                <span className="text-[12px] font-bold text-amber-800 leading-snug">{p.approval_reason}</span>
              </div>
            )}
          </div>

          {/* Stat strip — solo para protocolos clásicos (numéricos tienen su propio resumen) */}
          {!numericMode && (
            <div className="flex items-center bg-surface rounded-md py-2">
              <StatCell value={okCount}    label={t('webProto.statCompliant')}    className="text-success" />
              <div className="w-px h-7 bg-border" />
              <StatCell value={nokCount}   label={t('webProto.statNonCompliant')} className="text-danger" />
              <div className="w-px h-7 bg-border" />
              <StatCell value={pendCount + naCount} label={t('webProto.statUnanswered')} className="text-muted" />
              <div className="w-px h-7 bg-border" />
              <StatCell value={items.length} label={t('webProto.statTotal')}       className="text-primary" />
            </div>
          )}

          {/* v26 (FASE 7) — QR del protocolo. v29: qr_codes deprecated, siempre activo */}
          {true && (
            <div className="flex justify-end">
              <QRCodeBadge
                idProtocolo={meta?.idProtocolo ?? null}
                externalId={(protoAny?.external_id as string | null) ?? null}
                protocolUuid={protocolId}
                protocolName={protoAny?.protocol_number ?? null}
                projectName={fillData?.project?.name ?? null}
                locationName={fillData?.location?.location_only ?? fillData?.location?.name ?? null}
                specialty={fillData?.location?.specialty ?? null}
                labelExtras={[
                  ...(protoAny?.external_id ? [{ label: 'ExtID', value: String(protoAny.external_id) }] : []),
                  ...(meta?.filledByName && meta.filledByName !== '—' ? [{ label: t('webProto.supervisor'), value: meta.filledByName }] : []),
                ]}
              />
            </div>
          )}

          {/* v24 — Equipos calibrados usados en este protocolo */}
          {equipmentEnabled && (
            <EquipmentSection
              catalog={catalog}
              linked={linked}
              expired={expiredLinked}
              readOnly={p.status === 'APPROVED' || p.is_locked === true}
              onSave={async (equipmentIds) => {
                try { await linkEquipment.mutateAsync({ equipmentIds }); }
                catch (e) { alert(t('webProto.errSavingEquipment', { msg: (e as Error).message })); }
              }}
            />
          )}

          {/* v23 — Panel de aprobaciones jerárquicas (solo si flag activo + niveles > 1) */}
          {multiLevelEnabled && (
            <div className="bg-[#f4f6f9] rounded-md p-3 flex flex-col gap-1.5">
              <p className="text-[10px] font-extrabold tracking-wider uppercase text-muted">{t('webProto.levelApprovals')}</p>
              <div className="flex gap-2 flex-wrap">
                {Array.from({ length: totalLevels }, (_, i) => {
                  const lvl = (i + 1) as 1 | 2 | 3;
                  const row = approvals.find(a => a.level === lvl);
                  const isCurrent = row?.status === 'PENDING' && currentPendingLevel === lvl;
                  return (
                    <div key={lvl} className={cn(
                      'flex-1 min-w-[120px] rounded-md px-2 py-1.5 border',
                      row?.status === 'APPROVED' ? 'bg-green-50 border-success/30'
                      : row?.status === 'REJECTED' ? 'bg-red-50 border-danger/30'
                      : isCurrent ? 'bg-amber-50 border-warning/40'
                      : 'bg-white border-border',
                    )}>
                      <p className="text-[9px] font-extrabold tracking-wider text-muted">{t('webProto.level', { n: lvl, total: totalLevels })}</p>
                      <p className={cn('text-[11px] font-bold',
                        row?.status === 'APPROVED' ? 'text-success'
                        : row?.status === 'REJECTED' ? 'text-danger'
                        : isCurrent ? 'text-warning' : 'text-muted',
                      )}>
                        {row?.status === 'APPROVED' ? (row.signer_name ?? t('webProto.signedNamePlaceholder'))
                          : row?.status === 'REJECTED' ? t('webProto.statusRejected')
                          : isCurrent ? t('webProto.waitingSignature') : t('webProto.pending')}
                      </p>
                      {row?.signed_at && (
                        <p className="text-[9px] text-muted">{new Date(row.signed_at).toLocaleString('es-PE')}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Banner: items numéricos malformados forzaron el modo clásico */}
        {invalidNumericItems.length > 0 && (
          <div className="rounded-md border border-warning/40 bg-amber-50 px-3 py-2.5 text-xs">
            <p className="font-bold text-warning mb-1">
              {t('webProto.invalidNumericTitle', { n: invalidNumericItems.length, s: invalidNumericItems.length !== 1 ? 's' : '' })}
            </p>
            <p className="text-textPrimary mb-1.5"
              dangerouslySetInnerHTML={{ __html: t('webProto.invalidNumericClassicAudit') }}
            />
            <ul className="list-disc pl-4 text-[11px] text-textSecondary leading-relaxed">
              {invalidNumericItems.slice(0, 5).map(it => (
                <li key={it.idx}>
                  <b>{t('webProto.invalidNumericItem', { partida: it.partidaItem ?? t('webProto.invalidNumericItemFallback', { idx: it.idx }) })}</b>: <code className="text-danger font-mono">{it.method ?? t('webProto.invalidNumericEmpty')}</code>
                </li>
              ))}
              {invalidNumericItems.length > 5 && <li>{t('webProto.invalidNumericMore', { n: invalidNumericItems.length - 5 })}</li>}
            </ul>
          </div>
        )}

        {/* v42 — Aviso de llamados entre ensayos desactualizados (frescura híbrida). */}
        {xrefStale && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-md p-3 mb-3">
            <RefreshCw size={18} className="text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">{t('webProto.xrefStaleTitle')}</p>
              <p className="text-xs text-amber-700">{isJefe ? t('webProto.xrefStaleBodyJefe') : t('webProto.xrefStaleBodyOther')}</p>
            </div>
            {isJefe && (
              <button onClick={handleRefreshXref} disabled={refreshingXref}
                className="flex items-center gap-2 px-3 py-2 text-xs font-bold rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
                {refreshingXref && <Loader2 size={13} className="animate-spin" />} {t('webProto.update')}
              </button>
            )}
          </div>
        )}

        {/* ── Tabla de items (formato Dossier) ───────────────────────────── */}
        {numericMode ? (
          <>
            <NumericTable
              protocolCode={(protocol as { protocol_code?: string | null } | null)?.protocol_code ?? null}
              items={items}
              readOnly
              frozen={true /* v41 — Audit SIEMPRE congelado: muestra el snapshot del envío, no recalcula */}
              projectId={projectId}
              enableXrefs={true /* v29 — protocol_linking deprecated */}
            />
            {p.general_comment && (
              <div className="bg-white rounded-md border border-border shadow-subtle p-4">
                <p className="text-[10px] font-extrabold text-muted tracking-wider uppercase mb-1.5">{t('webProto.generalComments')}</p>
                <p className="text-[13px] text-textPrimary leading-relaxed whitespace-pre-wrap">{p.general_comment}</p>
              </div>
            )}
          </>
        ) : (
        <div className="bg-white rounded-md border border-border shadow-subtle overflow-hidden">
          {/* Cabecera tipo navy */}
          <div className="flex items-center bg-navy px-2 py-2">
            <div className="w-7 text-center text-white text-[10px] font-extrabold tracking-wider uppercase">#</div>
            <div className="flex-1 px-1.5 text-white text-[10px] font-extrabold tracking-wider uppercase">{t('webProto.colDescription')}</div>
            <div className="w-[62px] text-center text-white text-[10px] font-extrabold tracking-wider uppercase">{t('webProto.colCompliant')}</div>
          </div>

          {rows.map((row, ri) => {
            if (row.type === 'section') {
              return (
                <div key={`sec-${ri}`} className="bg-[#eef2fa] px-2.5 py-1.5 border-b border-border">
                  <span className="text-[11px] font-extrabold text-primary tracking-wider uppercase">{row.title}</span>
                </div>
              );
            }
            const { item, idx } = row;
            const evs: Evidence[] = evidenceMap[item.id] ?? [];
            const badge = itemResultBadge(item);
            const hasExtras = !!item.comments || evs.length > 0;
            const altBg = idx % 2 === 1 ? 'bg-[#fafbfd]' : 'bg-white';

            return (
              <div key={item.id} className={cn('border-b border-divider last:border-b-0', altBg)}>
                {/* Fila principal */}
                <div className="flex items-center px-2 py-3">
                  <div className="w-7 text-center text-primary text-[12px] font-bold">{idx + 1}</div>
                  <div className="flex-1 px-1.5 text-[12px] text-textPrimary leading-snug">{item.item_description}</div>
                  <div className="w-[62px] flex items-center justify-center">
                    <span className={cn('rounded px-2 py-0.5 text-[14px] font-extrabold min-w-[30px] text-center', badge.cls)}>
                      {badge.label}
                    </span>
                  </div>
                </div>
                {/* Sub-fila: comentarios + fotos */}
                {hasExtras && (
                  <div className="px-3 pb-2.5 flex flex-col gap-1.5">
                    {item.comments && (
                      <div className="flex items-start gap-1.5">
                        <span className="text-[10px] font-extrabold text-muted tracking-wider mt-0.5">{t('webProto.obsAbbrev')}</span>
                        <span className="flex-1 text-[12px] italic text-textSecondary leading-snug">{item.comments}</span>
                      </div>
                    )}
                    {evs.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {evs.map(ev => {
                          const url = evidenceUrl(ev);
                          if (!url) return null;
                          return (
                            <button key={ev.id} onClick={() => setLightbox(url)}
                              className="relative w-[72px] h-[72px] rounded-md overflow-hidden bg-surface group">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt="evidencia" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <ZoomIn className="w-4 h-4 text-white" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}

        {/* ── Extra photos ──────────────────────────────────────────────── */}
        {isJefe && (
          <div className="bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-700">{t('webProto.extraPhotoEvidence')}</p>
              <button
                onClick={() => extraFileRef.current?.click()}
                disabled={uploadingExtra}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                           border border-primary/30 text-primary hover:bg-primary/5 transition disabled:opacity-50"
              >
                {uploadingExtra ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                {t('webProto.addPhoto')}
              </button>
            </div>
            {extraPhotos.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {extraPhotos.map(key => {
                  const url = `/api/s3-image?key=${encodeURIComponent(key)}`;
                  return (
                    <div key={key} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt="extra"
                        className="w-20 h-20 object-cover rounded-lg border border-border cursor-pointer hover:opacity-90 transition"
                        onClick={() => setLightbox(url)}
                      />
                      <button
                        onClick={() => handleDeleteExtra(key)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger text-white rounded-full
                                   flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400">{t('webProto.noExtraPhotos')}</p>
            )}
          </div>
        )}

        {/* ── Signed banner ─────────────────────────────────────────────── */}
        {status === 'APPROVED' && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex flex-col
                          items-center gap-1 text-center">
            <CheckCircle className="w-6 h-6 text-success" />
            <p className="text-sm font-bold text-success">{t('webProto.signedDigitally')}</p>
            {p.signed_at && (
              <p className="text-xs text-gray-500">
                {new Date(p.signed_at).toLocaleString('es-PE')}
              </p>
            )}
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {saveError && (
          <p className="text-xs text-danger text-center font-medium">{saveError}</p>
        )}

        {/* ── Action buttons — only jefe + status SUBMITTED ─────────────── */}
        {isJefe && (status === 'SUBMITTED' || status === 'IN_PROGRESS') && (
          <div className="flex gap-3 pt-2 pb-6">
            {canApprove && (
              <button
                onClick={() => setShowApproveModal(true)}
                disabled={saving}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-bold text-sm transition-colors disabled:opacity-50',
                  requiresApprovalReason
                    ? 'border-warning bg-amber-50 text-amber-700 hover:bg-amber-100'
                    : 'border-success bg-green-50 text-success hover:bg-green-100',
                )}
              >
                <ShieldCheck className="w-5 h-5" />
                {requiresApprovalReason ? t('webProto.approveWithObservation') : t('webProto.approveSign')}
              </button>
            )}
            <button
              onClick={() => setShowRejectModal(true)}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                         border-2 border-danger bg-red-50 text-danger font-bold text-sm
                         hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              <ShieldX className="w-5 h-5" />
              {t('webProto.reject')}
            </button>
          </div>
        )}
      </div>

      {/* Hidden file input for extra photos */}
      <input
        ref={extraFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleExtraPhoto}
      />

      {/* ── Lightbox ──────────────────────────────────────────────────────── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="foto"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* ── Approve confirmation modal ────────────────────────────────────── */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 bg-navy/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4 shadow-modal">
            <div className="flex items-center gap-3">
              <ShieldCheck className={cn('w-7 h-7 shrink-0', requiresApprovalReason ? 'text-warning' : 'text-success')} />
              <div>
                <h3 className="text-base font-bold text-gray-900">{t('webProto.approveSign')}</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {t('webProto.approveConfirmQuestion')}
                </p>
              </div>
            </div>
            {/* v33 — Override: si el ensayo NO cumple, exigir motivo de aprobación. */}
            {requiresApprovalReason && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-warning/40 bg-amber-50 p-3">
                <p className="text-xs font-bold text-amber-800">
                  {t('webProto.approveNotCompliantNotice')}
                </p>
                <label className="text-xs font-bold text-gray-700">{t('webProto.approvalReasonLabel')}</label>
                <textarea
                  value={approvalReason}
                  onChange={(e) => setApprovalReason(e.target.value)}
                  placeholder={t('webProto.approvalReasonPlaceholder')}
                  autoFocus
                  rows={3}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-gray-800
                             placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-warning/30 focus:border-warning"
                />
              </div>
            )}
            {saveError && (
              <p className="text-xs text-danger font-medium">{saveError}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowApproveModal(false)}
                disabled={saving}
                className="px-4 py-2 text-sm text-gray-600 font-semibold hover:text-gray-800
                           transition-colors disabled:opacity-50"
              >
                {t('webProto.cancel')}
              </button>
              <button
                onClick={handleApprove}
                disabled={saving || (requiresApprovalReason && !approvalReason.trim())}
                className="px-5 py-2 rounded-lg bg-success text-white text-sm font-bold
                           hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('webProto.approveSign')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject modal ──────────────────────────────────────────────────── */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 bg-navy/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4 shadow-modal">
            <div>
              <h3 className="text-base font-bold text-danger">{t('webProto.rejectReasonTitle')}</h3>
              <p className="text-sm text-gray-500 mt-1">
                {t('webProto.rejectReasonSubtitle')}
              </p>
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t('webProto.rejectReasonPlaceholder')}
              autoFocus
              rows={4}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2
                         text-sm text-gray-800 placeholder-gray-400 resize-none
                         focus:outline-none focus:ring-2 focus:ring-danger/30 focus:border-danger"
            />
            {saveError && (
              <p className="text-xs text-danger font-medium">{saveError}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                disabled={saving}
                className="px-4 py-2 text-sm text-gray-600 font-semibold hover:text-gray-800
                           transition-colors disabled:opacity-50"
              >
                {t('webProto.cancel')}
              </button>
              <button
                onClick={handleReject}
                disabled={saving || !rejectReason.trim()}
                className="px-5 py-2 rounded-lg bg-danger text-white text-sm font-bold
                           hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('webProto.confirmReject')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-component: summary card (legacy, aún usado en otros puntos) ──────────
function SummaryCard({
  value, label, color, border,
}: { value: number; label: string; color: string; border: string }) {
  return (
    <div className={cn('bg-white rounded-xl shadow-subtle border-2 p-3 flex flex-col items-center gap-1 w-28', border)}>
      <span className={cn('text-2xl font-black', color)}>{value}</span>
      <span className="text-[10px] text-gray-400 font-medium text-center leading-tight">{label}</span>
    </div>
  );
}

// ── Sub-component: stat cell compacto (barra de estadísticas del audit) ──────
function StatCell({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 border-r border-divider last:border-r-0 px-1">
      <span className={cn('text-xl font-black leading-none', className)}>{value}</span>
      <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider leading-tight">{label}</span>
    </div>
  );
}

// ── Sub-component: panel de equipos calibrados usados en el protocolo ────────
function EquipmentSection({ catalog, linked, expired, readOnly, onSave }: {
  catalog: import('@/types').Equipment[];
  linked: import('@hooks/useEquipment').ProtocolEquipmentWithDetails[];
  expired: import('@hooks/useEquipment').ProtocolEquipmentWithDetails[];
  readOnly: boolean;
  onSave: (equipmentIds: string[]) => Promise<void>;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(linked.map(l => l.equipment_id)));
  const [saving, setSaving] = useState(false);

  // Mantener `selected` sincronizado cuando llega data fresca y NO estamos editando.
  useEffect(() => {
    if (!editing) setSelected(new Set(linked.map(l => l.equipment_id)));
  }, [linked, editing]);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    await onSave(Array.from(selected));
    setSaving(false);
    setEditing(false);
  }

  const activeCatalog = catalog.filter(eq => eq.status === 'active' || selected.has(eq.id));

  return (
    <div className="bg-[#f4f6f9] rounded-md p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-extrabold tracking-wider uppercase text-muted">{t('webProto.equipmentUsed')}</p>
        {!readOnly && (
          editing
            ? <div className="flex gap-2">
                <button onClick={() => setEditing(false)} disabled={saving} className="text-[10px] font-bold text-textSecondary hover:text-textPrimary">{t('webProto.cancel')}</button>
                <button onClick={handleSave} disabled={saving} className="text-[10px] font-bold text-primary hover:underline">{saving ? t('webProto.saving') : t('webProto.save')}</button>
              </div>
            : <button onClick={() => setEditing(true)} className="text-[10px] font-bold text-primary hover:underline">{t('webProto.edit')}</button>
        )}
      </div>

      {expired.length > 0 && (
        <div className="bg-red-50 border border-danger/30 rounded px-2.5 py-1.5 text-[11px] text-danger font-bold flex items-start gap-1.5">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>
            {t('webProto.equipmentExpiredWarning', { n: expired.length, s: expired.length !== 1 ? 's' : '' })}
          </span>
        </div>
      )}

      {editing ? (
        <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
          {activeCatalog.length === 0 && (
            <p className="text-[11px] text-textSecondary">{t('webProto.noEquipmentCatalog')}</p>
          )}
          {activeCatalog.map(eq => {
            const cs = calibrationState(eq);
            const isChecked = selected.has(eq.id);
            return (
              <label key={eq.id} className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer border border-transparent',
                isChecked ? 'bg-white border-primary/30' : 'hover:bg-white/60',
              )}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(eq.id)}
                  className="accent-primary"
                />
                <span className="text-[11px] font-bold flex-1">{eq.code} — {eq.name}</span>
                {cs === 'expired' && <span className="text-[9px] font-bold uppercase text-danger bg-danger/10 px-1.5 py-0.5 rounded">{t('webProto.calibExpired')}</span>}
                {cs === 'soon'    && <span className="text-[9px] font-bold uppercase text-warning bg-warning/10 px-1.5 py-0.5 rounded">{t('webProto.calibSoon')}</span>}
              </label>
            );
          })}
        </div>
      ) : linked.length === 0 ? (
        <p className="text-[11px] text-textSecondary italic">{t('webProto.noEquipmentLinked')}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {linked.map(l => {
            const eq = l.equipment;
            if (!eq) return null;
            const cs = calibrationState(eq);
            return (
              <div key={l.id} className={cn(
                'rounded px-2 py-1 text-[11px] flex items-center gap-1.5',
                cs === 'expired' ? 'bg-danger/10 text-danger border border-danger/30'
                : cs === 'soon'  ? 'bg-warning/10 text-warning border border-warning/30'
                                 : 'bg-white border border-border',
              )}>
                <span className="font-bold">{eq.code}</span>
                <span className="text-muted">·</span>
                <span>{eq.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
