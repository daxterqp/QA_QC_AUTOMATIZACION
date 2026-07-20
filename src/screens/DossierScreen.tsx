import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity, Alert, ActivityIndicator, ScrollView,
  Modal, Switch, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '@components/AppHeader';
import { Colors, Radius, Shadow } from '../theme/colors';
import {
  database, protocolsCollection, usersCollection, projectsCollection,
  locationsCollection, protocolTemplatesCollection, projectSectorsCollection,
  protocolItemsCollection, labAuxTablesCollection,
} from '@db/index';
import { isProtocolConforming } from '@utils/protocolConformance';
import { isNumericProtocol } from '@utils/numericProtocol';
import type { AuxTables } from '@utils/formulaEval';
import { DateRangePicker } from '@components/DateRangePicker';
import { useAuth } from '@context/AuthContext';
import { useNetwork } from '@context/NetworkContext';
import { useTour } from '@context/TourContext';
import { useTourStep } from '@hooks/useTourStep';
import { Q } from '@nozbe/watermelondb';
import type Protocol from '@models/Protocol';
import { exportDossierPdf, exportSingleProtocolPdf } from '@services/DossierExportService';
import { pushProtocolStatus, mergeAndSaveFeatureFlags, pullProjectFromCloud } from '@services/SupabaseSyncService';
// v99 — blindaje de la aprobación/rechazo inline (auditoría 19-jul): retry
// offline, notificaciones, firma, frescura de xrefs y CAS de estado.
import { enqueue as enqueueSync } from '@services/SyncQueueService';
import { SyncWorker } from '@services/SyncWorker';
import { notifyProtocolApproved, notifyProtocolRejected } from '@services/NotificationService';
import { checkProtocolXrefStale } from '@services/XrefRefresh';
import { getOrDownloadSignatureUri } from '@services/UserSignatureService';
import { useRealtimeProjectPull } from '@hooks/useRealtimeProjectPull';
import { parseFeatureFlagsJson, getTemplatePrintConfig, PRINT_HEADER_COLORS, DEFAULT_HEADER_COLOR, PRINT_HEADER_FIELDS, CROQUIS_MAP_TYPES, CROQUIS_PLACEMENTS, type TemplatePrintConfig, type PrintFontLevel, type PrintGraphSize, type PrintHeaderSize } from '@utils/featureFlags';
import { upsertSummaryRow } from '@services/SummaryRowService';
import { buildProtocolCroquisSpecs, type CroquisResult } from '@services/CroquisService';
import { useCroquisCapture } from '@context/CroquisCaptureContext';
import { useI18n } from '@i18n/index';

interface Props {
  projectId: string;
  projectName: string;
  onBack: () => void;
  onOpenProtocol: (protocolId: string, status: string) => void;
  onPreviewPdf?: (pdfUri: string, pdfConfig?: { protocolId: string; projectId: string; idProtocolo: string }) => void;
  /** v77 — FLOW abre el dossier con filtros ya aplicados. */
  initialFilters?: { desde?: string; hasta?: string; templateId?: string; sectorId?: string; estado?: string };
}

interface DaySection {
  title: string;   // fecha formateada
  data: Protocol[];
}

function formatDay(date: Date): string {
  return date.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default function DossierScreen({ projectId, projectName, onBack, onOpenProtocol, onPreviewPdf, initialFilters }: Props) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const { isOnline } = useNetwork();
  const [allProtocols, setAllProtocols] = useState<Protocol[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  // Bug-fix — conformidad por protocolo SUBMITTED: si NO es conforme (algún "No"
  // / fuera de rango) la aprobación desde el Dossier debe exigir observación,
  // igual que en la pantalla de revisión. `true` por defecto = conforme.
  const [conformingById, setConformingById] = useState<Record<string, boolean>>({});
  // Conteo de ítems por protocolo CLÁSICO: correctos (Sí/N/A) y observados (No).
  // `classic` distingue clásico de numérico (los numéricos no llevan badge).
  const [countsById, setCountsById] = useState<Record<string, { ok: number; obs: number; classic: boolean }>>({});
  // Permite aprobar con observación directo desde la lista (flag del proyecto).
  const [observeInline, setObserveInline] = useState(false);
  // Modal de "Aprobar con observación" (motivo obligatorio) desde el Dossier.
  const [observeProtocol, setObserveProtocol] = useState<Protocol | null>(null);
  const [observeReason, setObserveReason] = useState('');
  // v99 — modal de RECHAZO con motivo obligatorio (antes era un Alert sin motivo).
  const [rejectTarget, setRejectTarget] = useState<Protocol | null>(null);
  const [rejectReasonDossier, setRejectReasonDossier] = useState('');
  // Catálogos para los filtros (dinámicos según configuración del proyecto).
  const [typeOptions, setTypeOptions] = useState<{ id: string; label: string }[]>([]);
  const [locOptions, setLocOptions] = useState<{ id: string; label: string }[]>([]);
  const [sectorOptions, setSectorOptions] = useState<{ id: string; label: string }[]>([]);

  // Estado de filtros — multiselección (Set) + rango de fechas en ms.
  // v77 — FLOW puede abrir el dossier con filtros ya aplicados (initialFilters):
  // se siembran como estado inicial y el bloque de filtros arranca visible.
  const ymdToLocalMs = (s?: string): number | null => {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  };
  const [showFilters, setShowFilters] = useState(!!initialFilters);
  const [dateFromMs, setDateFromMs] = useState<number | null>(ymdToLocalMs(initialFilters?.desde));
  const [dateToMs, setDateToMs] = useState<number | null>(ymdToLocalMs(initialFilters?.hasta));
  const VALID_STATUS = ['APPROVED', 'SUBMITTED', 'REJECTED'];
  const seedStatus = (estado?: string) =>
    new Set(estado && VALID_STATUS.includes(estado) ? [estado] : VALID_STATUS);
  const [statusFilter, setStatusFilter] = useState<Set<string>>(seedStatus(initialFilters?.estado));
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set(initialFilters?.templateId ? [initialFilters.templateId] : []));
  const [locFilter, setLocFilter] = useState<Set<string>>(new Set());
  const [sectorFilter, setSectorFilter] = useState<Set<string>>(new Set(initialFilters?.sectorId ? [initialFilters.sectorId] : []));
  // Si el Dossier YA estaba montado en el stack y FLOW navega con filtros
  // nuevos, React Navigation solo actualiza los params: re-sembrar aquí.
  const appliedFiltersRef = useRef<string>(JSON.stringify(initialFilters ?? null));
  useEffect(() => {
    const sig = JSON.stringify(initialFilters ?? null);
    if (sig === appliedFiltersRef.current || !initialFilters) return;
    appliedFiltersRef.current = sig;
    setShowFilters(true);
    setDateFromMs(ymdToLocalMs(initialFilters.desde));
    setDateToMs(ymdToLocalMs(initialFilters.hasta));
    setTypeFilter(new Set(initialFilters.templateId ? [initialFilters.templateId] : []));
    setSectorFilter(new Set(initialFilters.sectorId ? [initialFilters.sectorId] : []));
    setStatusFilter(seedStatus(initialFilters.estado));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFilters]);
  // Modal multiselección de Tipo / Ubicación / Sector.
  const [showFilterPicker, setShowFilterPicker] = useState<null | 'tipo' | 'ubicacion' | 'sector'>(null);

  const toggleInSet = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); return next;
  };
  // Rango de fechas en formato YYYY-MM-DD para comparar con protocolDayKey.
  const ymd = (ms: number | null): string => {
    if (ms == null) return '';
    const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const dateFrom = ymd(dateFromMs);
  const dateTo = ymd(dateToMs);

  const isJefe = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';
  const isCreator = currentUser?.role === 'CREATOR';
  const worksByLocations = locOptions.length > 0;
  const worksBySectors = sectorOptions.length > 0;

  // v43.4 — Config de impresión PDF por TIPO de ensayo (solo Creador).
  const [showPrintCfg, setShowPrintCfg] = useState(false);
  const [printTemplates, setPrintTemplates] = useState<{ idProtocolo: string; name: string }[]>([]);
  const [printCfgs, setPrintCfgs] = useState<Record<string, TemplatePrintConfig>>({});
  const [printHeaderColor, setPrintHeaderColor] = useState<string>(DEFAULT_HEADER_COLOR);
  const [expandedType, setExpandedType] = useState<string | null>(null);   // tarjeta de ensayo desplegada
  const [showCustomColor, setShowCustomColor] = useState(false);           // cajetín de color hex visible
  const [printSearch, setPrintSearch] = useState('');                      // filtro de texto de tipos de ensayo
  const openPrintConfig = useCallback(async () => {
    try {
      const [tmpls, projRows] = await Promise.all([
        protocolTemplatesCollection.query(Q.where('project_id', projectId)).fetch(),
        projectsCollection.query(Q.where('id', projectId)).fetch(),
      ]);
      const seen = new Set<string>();
      const list: { idProtocolo: string; name: string }[] = [];
      for (const t of tmpls as any[]) {
        if (t.isHidden) continue;
        const id = (t.idProtocolo ?? '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        list.push({ idProtocolo: id, name: t.name ?? id });
      }
      list.sort((a, b) => a.idProtocolo.localeCompare(b.idProtocolo));
      setPrintTemplates(list);
      const flags = parseFeatureFlagsJson((projRows[0] as any)?.featureFlags);
      setPrintCfgs({ ...(flags.print_configs ?? {}) });
      const hc = (flags as any).print_header_color || DEFAULT_HEADER_COLOR;
      setPrintHeaderColor(hc);
      setShowCustomColor(!PRINT_HEADER_COLORS.some(col => col.value === hc));   // color fuera de paleta → custom
      setExpandedType(null);   // todas las tarjetas colapsadas al abrir
      setShowPrintCfg(true);
    } catch (e: any) {
      Alert.alert(t('dossier.error'), e?.message ?? t('dossier.openPrintConfigError'));
    }
  }, [projectId]);
  const setCfgField = (idp: string, patch: Partial<TemplatePrintConfig>) =>
    setPrintCfgs(prev => ({ ...prev, [idp]: { ...getTemplatePrintConfig({ print_configs: prev } as any, idp), ...prev[idp], ...patch } }));
  // v43.5 — Merge dentro del sub-objeto croquis (c = config resuelta del tipo).
  const setCroquisField = (idp: string, c: ReturnType<typeof getTemplatePrintConfig>, patch: Partial<TemplatePrintConfig['croquis']>) =>
    setCfgField(idp, { croquis: { ...c.croquis, ...patch } as TemplatePrintConfig['croquis'] });
  const savePrintConfig = async () => {
    setShowPrintCfg(false);
    await mergeAndSaveFeatureFlags(projectId, { print_configs: printCfgs, print_header_color: printHeaderColor });
  };
  // v43.6 — Salir con la X (o botón Atrás) GUARDA; solo "Cancelar" descarta los cambios.
  const cancelPrintConfig = () => setShowPrintCfg(false);

  const { captureMany } = useCroquisCapture();

  const { isActive: tourActive, currentStep: tourStep, nextStep: tourNextStep, jumpToStep } = useTour();

  // Tour refs
  const dossierExportBtnRef = useTourStep('dossier_export_btn');
  const dossierItem0Ref = useTourStep('dossier_item_0');
  const [exporting, setExporting] = useState(false);
  const [exportingProtocolId, setExportingProtocolId] = useState<string | null>(null);

  /** v25 — Si el usuario está offline, mostramos advertencia ANTES de exportar.
   *  La generación SÍ procede (decisión del usuario en el plan), usando datos
   *  locales que pueden no estar al día con Supabase. */
  const confirmOfflineThenRun = async (onConfirm: () => Promise<void>) => {
    if (isOnline) { await onConfirm(); return; }
    Alert.alert(
      t('dossier.offlineTitle'),
      t('dossier.offlineMessage'),
      [
        { text: t('dossier.cancel'), style: 'cancel' },
        { text: t('dossier.generateAnyway'), onPress: () => { onConfirm().catch(() => {}); } },
      ],
    );
  };

  /** v43.5 — Construye specs de croquis para los protocolos a exportar y los captura
   *  (mapa→PNG) vía el overlay del provider. Devuelve { protocolId: { img, legend } }. */
  const captureCroquisForExport = async (filteredIds: string[] | null): Promise<Record<string, CroquisResult>> => {
    try {
      const [projRows, tmpls] = await Promise.all([
        projectsCollection.query(Q.where('id', projectId)).fetch(),
        protocolTemplatesCollection.query(Q.where('project_id', projectId)).fetch(),
      ]);
      const flags = parseFeatureFlagsJson((projRows[0] as any)?.featureFlags);
      const idpByTid = new Map<string, string | null>();
      for (const t of tmpls as any[]) idpByTid.set(t.id, (t.idProtocolo ?? null));
      const set = filteredIds ? new Set(filteredIds) : null;
      const exportProtocols = set ? allProtocols.filter(p => set.has(p.id)) : allProtocols;
      const fmtDate = (d: any) => (typeof d === 'string' && d.length >= 10) ? d.slice(0, 10).split('-').reverse().join('/') : undefined;
      const inputs = exportProtocols.map(p => ({
        id: p.id,
        idProtocolo: idpByTid.get((p as any).templateId) ?? null,
        lat: (p as any).latitude ?? null,
        lng: (p as any).longitude ?? null,
        label: (p as any).protocolCode ?? p.protocolNumber ?? undefined,
        date: fmtDate((p as any).ensayoDate),
      }));
      const { specs, legends } = await buildProtocolCroquisSpecs(projectId, inputs, flags);
      if (specs.length === 0) return {};
      const imgs = await captureMany(specs);
      const out: Record<string, CroquisResult> = {};
      for (const id of Object.keys(imgs)) out[id] = { img: imgs[id], legend: legends[id] };
      return out;
    } catch {
      return {};   // croquis es opcional; nunca bloquea el PDF
    }
  };

  const handleExportPdf = async () => {
    if (!currentUser) return;
    await confirmOfflineThenRun(async () => {
      setExporting(true);
      if (tourActive && tourStep?.id === 'dossier_export_btn') tourNextStep();
      try {
        // Si hay filtros activos, exporta SOLO los protocolos visibles (coinciden con el rango/estado/tipo…).
        const filteredIds = hasActiveFilters ? sections.flatMap(s => s.data.map(p => p.id)) : null;
        // v43.5 — Capturar croquis (mapas→PNG) de los tipos con croquis activado, antes del PDF.
        const croquisByProtocol = await captureCroquisForExport(filteredIds);
        const uri = await exportDossierPdf(projectId, projectName, currentUser.id, filteredIds, croquisByProtocol);
        if (onPreviewPdf) {
          onPreviewPdf(uri);
        }
      } catch (e) {
        Alert.alert(t('dossier.error'), t('dossier.exportPdfError', { error: String(e) }));
      } finally {
        setExporting(false);
      }
    });
  };

  const handleExportSingleProtocol = async (protocol: Protocol) => {
    if (!currentUser) return;
    setExportingProtocolId(protocol.id);
    try {
      const croquisMap = await captureCroquisForExport([protocol.id]);
      const uri = await exportSingleProtocolPdf(protocol.id, projectId, projectName, currentUser.id, croquisMap[protocol.id] ?? null);
      // v100 — Resuelve idProtocolo del tipo para habilitar el panel de config
      // del PDF (por-tipo) dentro de la vista previa del ensayo único.
      let idProtocolo: string | null = null;
      try {
        const tpl = await protocolTemplatesCollection.find((protocol as any).templateId).catch(() => null);
        idProtocolo = (tpl as any)?.idProtocolo ?? null;
      } catch { /* sin tipo → la vista previa se abre sin panel */ }
      const pdfConfig = idProtocolo ? { protocolId: protocol.id, projectId, idProtocolo } : undefined;
      if (onPreviewPdf) onPreviewPdf(uri, pdfConfig);
    } catch (e) {
      Alert.alert(t('dossier.error'), t('dossier.exportPdfError', { error: String(e) }));
    } finally {
      setExportingProtocolId(null);
    }
  };

  const loadData = useCallback(async () => {
    const protocols = await protocolsCollection
      .query(
        Q.where('project_id', projectId),
        Q.where('status', Q.oneOf(['SUBMITTED', 'APPROVED', 'REJECTED']))
      )
      .fetch();

    const allUsers = await usersCollection.query().fetch();
    const names: Record<string, string> = {};
    allUsers.forEach((u) => { names[u.id] = u.fullName; });
    setUserNames(names);
    setAllProtocols(protocols);

    // Catálogos para los filtros dinámicos.
    const [templates, locs, secs] = await Promise.all([
      protocolTemplatesCollection.query(Q.where('project_id', projectId)).fetch().catch(() => []),
      locationsCollection.query(Q.where('project_id', projectId)).fetch().catch(() => []),
      projectSectorsCollection.query(Q.where('project_id', projectId)).fetch().catch(() => []),
    ]);
    // Tipo: solo plantillas que aparecen en los protocolos del dossier.
    const presentTids = new Set(protocols.map(p => (p as any).templateId).filter(Boolean));
    const tlabel = new Map<string, string>();
    for (const t of templates as any[]) tlabel.set(t.id, t.idProtocolo || t.name || 'Tipo');
    setTypeOptions(Array.from(presentTids).map(id => ({ id: id as string, label: tlabel.get(id as string) ?? 'Tipo' }))
      .sort((a, b) => a.label.localeCompare(b.label)));
    setLocOptions((locs as any[]).map(l => ({ id: l.id, label: l.name })));
    setSectorOptions((secs as any[]).map(s => ({ id: s.id, label: s.name })));

    // Flag del proyecto: aprobar con observación directo desde la lista.
    try {
      const projRows = await projectsCollection.query(Q.where('id', projectId)).fetch();
      const flags = parseFeatureFlagsJson((projRows[0] as any)?.featureFlags);
      setObserveInline(!!(flags as any).dossier_observe_inline);
    } catch { /* deja el valor previo */ }

    // Conteo de ítems (TODAS las tarjetas clásicas) + conformidad (solo SUBMITTED,
    // que son los únicos con botón Aprobar): carga los ítems en UNA query + tablas
    // auxiliares una vez. La conformidad reusa el mismo helper que la revisión.
    if (protocols.length > 0) {
      try {
        const ids = protocols.map(p => p.id);
        const CHUNK = 90; // límite práctico de Q.oneOf
        const items: any[] = [];
        for (let i = 0; i < ids.length; i += CHUNK) {
          const part = await protocolItemsCollection.query(Q.where('protocol_id', Q.oneOf(ids.slice(i, i + CHUNK)))).fetch();
          items.push(...part);
        }
        const itemsByProto = new Map<string, any[]>();
        for (const it of items) {
          const k = (it as any).protocolId;
          const arr = itemsByProto.get(k); if (arr) arr.push(it); else itemsByProto.set(k, [it]);
        }
        const tbls = await labAuxTablesCollection.query(Q.where('project_id', projectId)).fetch().catch(() => []);
        const auxMap: AuxTables = {};
        for (const tt of tbls as any[]) { try { auxMap[String(tt.groupKey).toLowerCase()] = { columns: JSON.parse(tt.columnsJson ?? '[]'), rows: JSON.parse(tt.rowsJson ?? '[]') }; } catch { /* corrupta */ } }
        const conf: Record<string, boolean> = {};
        const counts: Record<string, { ok: number; obs: number; classic: boolean }> = {};
        for (const p of protocols) {
          const its = itemsByProto.get(p.id) ?? [];
          // Solo protocolos CLÁSICOS llevan badge de ítems correctos/observados.
          const classic = !isNumericProtocol(its.map((it: any) => ({ validation_method: it.validationMethod ?? null })));
          if (classic) {
            const ok = its.filter((i: any) => i.hasAnswer && (i.isCompliant || i.isNa === true)).length;
            const obs = its.filter((i: any) => i.hasAnswer && !i.isCompliant && i.isNa !== true).length;
            counts[p.id] = { ok, obs, classic: true };
          } else {
            counts[p.id] = { ok: 0, obs: 0, classic: false };
          }
          // Conformidad solo para los SUBMITTED (los que muestran botón Aprobar).
          if (p.status === 'SUBMITTED') conf[p.id] = isProtocolConforming(its, auxMap);
        }
        setConformingById(conf);
        setCountsById(counts);
      } catch { setConformingById({}); setCountsById({}); }
    } else {
      setConformingById({});
      setCountsById({});
    }
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Fecha representativa (YYYY-MM-DD): prioriza ensayoDate; si no, submittedAt/updatedAt.
  const protocolDayKey = (p: Protocol): string => {
    const ed = (p as any).ensayoDate;
    if (ed && typeof ed === 'string' && ed.length >= 10) return ed.slice(0, 10);
    const ts = (p as any).submittedAt ?? p.updatedAt;
    return toDateKey(new Date(typeof ts === 'number' ? ts : ts?.getTime?.() ?? Date.now()));
  };

  const hasActiveFilters = dateFromMs != null || dateToMs != null || typeFilter.size > 0 || locFilter.size > 0 || sectorFilter.size > 0 || statusFilter.size !== 3;
  const clearFilters = () => {
    setDateFromMs(null); setDateToMs(null); setTypeFilter(new Set()); setLocFilter(new Set()); setSectorFilter(new Set());
    setStatusFilter(new Set(['APPROVED', 'SUBMITTED', 'REJECTED']));
  };
  const toggleStatus = (k: string) => setStatusFilter(prev => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  // Secciones derivadas de la lista YA filtrada (lo que se ve = lo que se exporta).
  const sections = useMemo<DaySection[]>(() => {
    const filtered = allProtocols.filter(p => {
      if (!statusFilter.has(p.status)) return false;
      if (typeFilter.size > 0 && !typeFilter.has((p as any).templateId)) return false;
      if (worksByLocations && locFilter.size > 0 && !locFilter.has((p as any).locationId)) return false;
      if (worksBySectors && sectorFilter.size > 0 && !sectorFilter.has((p as any).sectorId)) return false;
      if (dateFrom || dateTo) {
        const day = protocolDayKey(p);
        if (dateFrom && day < dateFrom) return false;
        if (dateTo && day > dateTo) return false;
      }
      return true;
    });
    const grouped: Record<string, Protocol[]> = {};
    for (const p of filtered) {
      const day = protocolDayKey(p);
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(p);
    }
    return Object.keys(grouped).sort((a, b) => b.localeCompare(a)).map(day => ({
      title: formatDay(new Date(day + 'T12:00:00')),
      data: grouped[day].sort((a, b) => {
        const ta = (a as any).submittedAt ?? a.updatedAt;
        const tb = (b as any).submittedAt ?? b.updatedAt;
        return (typeof tb === 'number' ? tb : tb?.getTime?.() ?? 0) -
               (typeof ta === 'number' ? ta : ta?.getTime?.() ?? 0);
      }),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allProtocols, statusFilter, typeFilter, locFilter, sectorFilter, dateFrom, dateTo, worksByLocations, worksBySectors]);

  // Recargar al volver de ProtocolAudit u otras pantallas
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // #7B — Pull-to-refresh: baja cambios de la nube (estados aprobado/rechazado de
  // otros equipos) y recarga local.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await pullProjectFromCloud(projectId); await loadData(); }
    catch { /* ignore */ }
    finally { setRefreshing(false); }
  }, [projectId, loadData]);

  // #7C — Tiempo real: si otro equipo aprueba/rechaza/envía un ensayo, se baja y
  // recarga solo (sin tocar nada) mientras esta pantalla está abierta.
  useRealtimeProjectPull(projectId, loadData);

  /** Aplica la aprobación. `reason` != null → aprobado CON observación (no conforme).
   *  v99 — blindada (paridad con doApprove del audit): firma disponible, xrefs
   *  frescos, CAS de estado (no pisar decisiones ajenas), correctionsAllowed
   *  apagado, retry offline (enqueue) y notificación push al equipo. */
  const applyApproval = async (protocol: Protocol, reason: string | null) => {
    // Gate 1: el aprobador debe tener firma registrada (el PDF la estampa).
    if (currentUser?.id) {
      const sig = await getOrDownloadSignatureUri(currentUser.id).catch(() => null);
      if (!sig) { Alert.alert(t('dossier.noSignatureTitle'), t('dossier.noSignatureMsg')); return; }
    }
    // Gate 2: llamados entre ensayos desactualizados → revisar en el audit.
    try {
      const s = await checkProtocolXrefStale(protocol.id);
      if (s.stale) { Alert.alert(t('dossier.xrefStaleTitle'), t('dossier.xrefStaleMsg')); return; }
    } catch { /* sin xrefs → sigue */ }

    let updated: Protocol | null = null;
    let raced = false;
    await database.write(async () => {
      // CAS: re-leer DENTRO del write — si otro jefe ya decidió, abortar.
      const fresh: any = await protocolsCollection.find(protocol.id);
      if (fresh.status !== 'SUBMITTED') { raced = true; return; }
      updated = await fresh.update((p: any) => {
        p.status = 'APPROVED';
        p.isLocked = true;
        p.correctionsAllowed = false;
        p.signedById = currentUser?.id ?? null;
        p.signedAt = Date.now();
        p.approvalReason = reason;
        // Bug-fix — al aprobar, el motivo de rechazo previo queda levantado.
        p.rejectionReason = null;
      });
    });
    if (raced) {
      Alert.alert(t('dossier.alreadyProcessedTitle'), t('dossier.alreadyProcessedMsg'));
      await loadData();
      return;
    }
    if (updated) {
      pushProtocolStatus(updated).catch(() => {});
      enqueueSync({ opType: 'PUSH_PROTOCOL_STATUS', entityId: protocol.id, projectId })
        .then(() => SyncWorker.forceTick())
        .catch(() => {});
    }
    upsertSummaryRow(protocol.id).catch(() => {});
    const protName = ((protocol as any).protocolCode ? `${(protocol as any).protocolCode} · ` : '') + ((protocol as any).protocolNumber ?? '');
    notifyProtocolApproved(projectId, '', null, null, protName, protocol.id);
    await loadData();
  };

  // Solo se invoca para protocolos CONFORMES (aprobar y firmar directo). El
  // ruteo del caso no conforme (modal vs abrir) lo decide el botón de la tarjeta.
  const handleApprove = (protocol: Protocol) => {
    Alert.alert(t('dossier.approveTitle'), t('dossier.approveMessage', { number: protocol.protocolNumber }), [
      { text: t('dossier.cancel'), style: 'cancel' },
      { text: t('protoAudit.approveAndSign'), onPress: () => { applyApproval(protocol, null).catch(() => {}); } },
    ]);
  };

  const confirmObserve = async () => {
    const reason = observeReason.trim();
    if (!reason) {
      Alert.alert(t('protoAudit.reasonRequiredTitle'), t('protoAudit.approve.reasonRequiredMsg'));
      return;
    }
    const proto = observeProtocol;
    setObserveProtocol(null);
    setObserveReason('');
    if (proto) await applyApproval(proto, reason);
  };

  // v99 — el rechazo inline ahora exige MOTIVO (modal espejo del de observación;
  // el audit siempre lo exigió) y queda blindado igual que applyApproval.
  const handleReject = (protocol: Protocol) => {
    setRejectTarget(protocol);
    setRejectReasonDossier('');
  };

  const confirmRejectDossier = async () => {
    const reason = rejectReasonDossier.trim();
    if (!reason) {
      Alert.alert(t('protoAudit.reasonRequiredTitle'), t('protoAudit.reject.reasonRequiredMsg'));
      return;
    }
    const protocol = rejectTarget;
    setRejectTarget(null);
    setRejectReasonDossier('');
    if (!protocol) return;

    let updated: Protocol | null = null;
    let raced = false;
    await database.write(async () => {
      const fresh: any = await protocolsCollection.find(protocol.id);
      if (fresh.status !== 'SUBMITTED') { raced = true; return; }
      updated = await fresh.update((p: any) => {
        p.status = 'REJECTED';
        p.correctionsAllowed = true;
        p.rejectionReason = reason;
      });
    });
    if (raced) {
      Alert.alert(t('dossier.alreadyProcessedTitle'), t('dossier.alreadyProcessedMsg'));
      await loadData();
      return;
    }
    if (updated) {
      pushProtocolStatus(updated).catch(() => {});
      enqueueSync({ opType: 'PUSH_PROTOCOL_STATUS', entityId: protocol.id, projectId })
        .then(() => SyncWorker.forceTick())
        .catch(() => {});
    }
    upsertSummaryRow(protocol.id).catch(() => {});
    const protName = ((protocol as any).protocolCode ? `${(protocol as any).protocolCode} · ` : '') + ((protocol as any).protocolNumber ?? '');
    notifyProtocolRejected(projectId, '', null, null, protName, protocol.id);
    await loadData();
  };

  const statusColor: Record<string, string> = {
    SUBMITTED: '#394e7d', // en revisión = primary (igual que la tarjeta del Dossier)
    APPROVED: '#1e8e3e',
    REJECTED: '#d93025',
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title={t('dossier.title')}
        subtitle={projectName}
        onBack={onBack}
        rightContent={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {isJefe && (
              <TouchableOpacity
                ref={dossierExportBtnRef}
                onPress={handleExportPdf}
                disabled={exporting}
                style={styles.exportBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {exporting
                  ? <ActivityIndicator color={Colors.white} size="small" />
                  : <Ionicons name="document-text-outline" size={24} color={Colors.white} />
                }
              </TouchableOpacity>
            )}
            {isCreator && (
              <TouchableOpacity onPress={openPrintConfig} style={styles.exportBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="settings-outline" size={22} color={Colors.white} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => jumpToStep('dossier_protocol_list')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
            </TouchableOpacity>
          </View>
        }
      />

      {/* v43.3 — Disparador de filtros DENTRO de la pantalla (estandarizado con las
          demás pestañas), ya no en el encabezado. */}
      <TouchableOpacity style={[styles.dossierFilterToggle, hasActiveFilters && { borderColor: Colors.primary }]} onPress={() => setShowFilters(v => !v)} activeOpacity={0.8}>
        <Ionicons name={hasActiveFilters ? 'funnel' : 'funnel-outline'} size={15} color={hasActiveFilters ? Colors.primary : Colors.textSecondary} />
        <Text style={[styles.dossierFilterToggleText, hasActiveFilters && { color: Colors.primary }]}>{t('dossier.filters')}{hasActiveFilters ? t('dossier.filtersActiveSuffix') : ''}</Text>
        <View style={{ flex: 1 }} />
        <Ionicons name={showFilters ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
      </TouchableOpacity>

      {showFilters && (
        <View style={styles.filterPanel}>
          <View style={styles.filterHeaderRow}>
            <Text style={styles.filterTitle}>{t('dossier.filters')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={styles.filterCount}>{sections.reduce((n, s) => n + s.data.length, 0)} / {allProtocols.length}</Text>
              {hasActiveFilters && (
                <TouchableOpacity onPress={clearFilters}><Text style={styles.filterClear}>{t('dossier.clear')}</Text></TouchableOpacity>
              )}
            </View>
          </View>

          {/* Estado — ghost chips (solo borde de color, interior blanco) */}
          <Text style={styles.filterLabel}>{t('dossier.status')}</Text>
          <View style={styles.chipRow}>
            {[['APPROVED', t('dossier.statusApproved'), '#1e8e3e'], ['SUBMITTED', t('dossier.statusInReview'), '#e37400'], ['REJECTED', t('dossier.statusRejected'), '#d93025']].map(([k, lbl, col]) => {
              const on = statusFilter.has(k);
              return (
                <TouchableOpacity key={k} onPress={() => toggleStatus(k)}
                  style={[styles.ghostChip, { borderColor: on ? col : Colors.border }]}>
                  <Text style={[styles.ghostChipText, { color: on ? col : Colors.textMuted }]}>{lbl}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Tipo / Ubicación / Sector — botones que abren un modal multiselección */}
          <Text style={styles.filterLabel}>{t('dossier.testType')}{worksByLocations ? ` · ${t('dossier.location')}` : ''}{worksBySectors ? ` · ${t('dossier.sector')}` : ''}</Text>
          <View style={styles.chipRow}>
            {typeOptions.length > 0 && (
              <FilterPickerChip
                icon="flask-outline"
                active={typeFilter.size > 0}
                label={typeFilter.size === 0 ? t('dossier.testType') : typeFilter.size === 1 ? (typeOptions.find(o => typeFilter.has(o.id))?.label ?? t('dossier.testType')) : `${t('dossier.testType')} (${typeFilter.size})`}
                onPress={() => setShowFilterPicker('tipo')}
                onClear={() => setTypeFilter(new Set())}
              />
            )}
            {worksByLocations && (
              <FilterPickerChip
                icon="location-outline"
                active={locFilter.size > 0}
                label={locFilter.size === 0 ? t('dossier.location') : locFilter.size === 1 ? (locOptions.find(o => locFilter.has(o.id))?.label ?? t('dossier.location')) : `${t('dossier.location')} (${locFilter.size})`}
                onPress={() => setShowFilterPicker('ubicacion')}
                onClear={() => setLocFilter(new Set())}
              />
            )}
            {worksBySectors && (
              <FilterPickerChip
                icon="grid-outline"
                active={sectorFilter.size > 0}
                label={sectorFilter.size === 0 ? t('dossier.sector') : sectorFilter.size === 1 ? (sectorOptions.find(o => sectorFilter.has(o.id))?.label ?? t('dossier.sector')) : `${t('dossier.sector')} (${sectorFilter.size})`}
                onPress={() => setShowFilterPicker('sector')}
                onClear={() => setSectorFilter(new Set())}
              />
            )}
          </View>

          {/* Rango de fechas (Desde / Hasta) con calendario */}
          <Text style={styles.filterLabel}>{t('dossier.dateFrom')} · {t('dossier.dateTo')}</Text>
          <DateRangePicker
            fromMs={dateFromMs}
            toMs={dateToMs}
            onChange={(from, to) => { setDateFromMs(from); setDateToMs(to); }}
          />
        </View>
      )}

      <View style={{ flex: 1 }}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.empty}>{t('dossier.empty')}</Text>
            <Text style={styles.emptyHint}>
              {t('dossier.emptyHint')}
            </Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle}>{section.title}</Text>
            <Text style={styles.dayCount}>{t('dossier.protocolCount', { count: section.data.length })}</Text>
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const isFirst = index === 0 && sections[0]?.title === section.title;
          const filledBy = item.filledById ? userNames[item.filledById] : t('dossier.unknownUser');
          const signedBy = item.signedById ? userNames[item.signedById] : null;
          const color = statusColor[item.status] ?? '#666';
          const isPending = item.status === 'SUBMITTED';

          return (
            <TouchableOpacity
              ref={isFirst ? dossierItem0Ref : undefined}
              style={[styles.card, { borderLeftColor: color }]}
              onPress={() => {
                if (isFirst && tourActive && tourStep?.id === 'dossier_protocol_list') tourNextStep();
                onOpenProtocol(item.id, item.status);
              }}
              activeOpacity={0.8}
            >
              <View style={styles.cardTop}>
                <Text style={styles.protocolNumber}>{(item as any).protocolCode ? `${(item as any).protocolCode} · ` : ''}{item.protocolNumber}</Text>
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation?.(); handleExportSingleProtocol(item); }}
                  disabled={exportingProtocolId === item.id}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {exportingProtocolId === item.id
                    ? <ActivityIndicator size="small" color={Colors.primary} />
                    : <Ionicons name="document-text-outline" size={18} color={Colors.primary} />
                  }
                </TouchableOpacity>
              </View>

              {/* Supervisor (con ✓ ítems correctos a la misma altura, solo clásicos) */}
              <View style={styles.metaRow}>
                <Text style={[styles.filledBy, { flex: 1 }]}>
                  {t('dossier.supervisor', { name: filledBy })}
                </Text>
                {countsById[item.id]?.classic && (
                  <View style={styles.itemBadge}>
                    <Ionicons name="checkmark-circle" size={15} color="#1e8e3e" />
                    <Text style={[styles.itemBadgeText, { color: '#1e8e3e' }]}>{countsById[item.id].ok}</Text>
                  </View>
                )}
              </View>
              {/* Ubicación (con ✗ ítems observados a la misma altura, solo si hay) */}
              {item.locationReference && (
                <View style={styles.metaRow}>
                  <Text style={[styles.location, { flex: 1 }]}>{t('dossier.locationLine', { ref: item.locationReference })}</Text>
                  {countsById[item.id]?.classic && countsById[item.id].obs > 0 && (
                    <View style={styles.itemBadge}>
                      <Ionicons name="close-circle" size={15} color="#d93025" />
                      <Text style={[styles.itemBadgeText, { color: '#d93025' }]}>{countsById[item.id].obs}</Text>
                    </View>
                  )}
                </View>
              )}
              {signedBy && (
                <Text style={styles.signedBy}>{t('dossier.approvedBy', { name: signedBy })}</Text>
              )}

              {isJefe && isPending && (() => {
                // Espera a que la conformidad esté calculada para evitar el parpadeo
                // verde→ámbar (antes el botón salía verde y luego cambiaba).
                const confKnown = item.id in conformingById;
                if (!confKnown) {
                  return (
                    <View style={styles.actions}>
                      <View style={[styles.approveBtn, styles.btnSkeleton]} />
                      <View style={[styles.rejectBtn, styles.btnSkeleton]} />
                    </View>
                  );
                }
                const needsObs = conformingById[item.id] === false;
                return (
                <View style={styles.actions}>
                  <TouchableOpacity
                    // Estándar: el botón de aprobar es más ancho que Rechazar (flex 1.7 vs 1)
                    // para que "Aprobar con observación" entre en una línea sin achicar la letra.
                    style={[styles.approveBtn, needsObs && styles.approveObsBtn]}
                    onPress={() => {
                      if (!needsObs) { handleApprove(item); return; }
                      // No conforme: con la opción ON aprueba con observación directo
                      // (modal); con OFF (default) hay que ABRIR el protocolo.
                      if (observeInline) { setObserveReason(''); setObserveProtocol(item); }
                      else { onOpenProtocol(item.id, item.status); }
                    }}
                  >
                    <Text style={[styles.approveBtnText, needsObs && styles.approveObsBtnText]} numberOfLines={1}>
                      {needsObs ? t('protoAudit.approveWithObservation') : t('protoAudit.approveAndSign')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectBtn}
                    onPress={() => handleReject(item)}
                  >
                    <Text style={styles.rejectBtnText}>{t('dossier.reject')}</Text>
                  </TouchableOpacity>
                </View>
                );
              })()}
            </TouchableOpacity>
          );
        }}
      />
      </View>

      {/* Bug-fix — Aprobar con observación desde el Dossier (motivo obligatorio
          cuando el protocolo no es conforme), espejo de la pantalla de revisión. */}
      <Modal visible={!!observeProtocol} transparent animationType="fade" onRequestClose={() => setObserveProtocol(null)}>
        <View style={styles.obsOverlay}>
          <View style={styles.obsCard}>
            <Text style={styles.obsTitle}>{t('protoAudit.approveWithObservation')}</Text>
            <Text style={styles.obsHint}>{t('protoAudit.approve.reasonRequiredMsg')}</Text>
            <TextInput
              style={styles.obsInput}
              placeholder={t('protoAudit.approve.reasonRequiredMsg')}
              placeholderTextColor={Colors.textMuted}
              value={observeReason}
              onChangeText={setObserveReason}
              multiline
              autoFocus
            />
            <View style={styles.obsActions}>
              <TouchableOpacity style={styles.obsCancelBtn} onPress={() => { setObserveProtocol(null); setObserveReason(''); }} activeOpacity={0.7}>
                <Text style={styles.obsCancelText}>{t('dossier.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.obsConfirmBtn} onPress={() => { confirmObserve().catch(() => {}); }} activeOpacity={0.7}>
                <Text style={styles.obsConfirmText}>{t('protoAudit.approveWithObservation')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* v99 — Rechazar desde el Dossier con MOTIVO OBLIGATORIO (espejo del audit). */}
      <Modal visible={!!rejectTarget} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View style={styles.obsOverlay}>
          <View style={styles.obsCard}>
            <Text style={styles.obsTitle}>{t('dossier.rejectTitle')}</Text>
            <Text style={styles.obsHint}>{t('protoAudit.reject.reasonRequiredMsg')}</Text>
            <TextInput
              style={styles.obsInput}
              placeholder={t('protoAudit.reject.reasonRequiredMsg')}
              placeholderTextColor={Colors.textMuted}
              value={rejectReasonDossier}
              onChangeText={setRejectReasonDossier}
              multiline
              autoFocus
            />
            <View style={styles.obsActions}>
              <TouchableOpacity style={styles.obsCancelBtn} onPress={() => { setRejectTarget(null); setRejectReasonDossier(''); }} activeOpacity={0.7}>
                <Text style={styles.obsCancelText}>{t('dossier.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.obsConfirmBtn, { backgroundColor: Colors.danger }]} onPress={() => { confirmRejectDossier().catch(() => {}); }} activeOpacity={0.7}>
                <Text style={styles.obsConfirmText}>{t('dossier.reject')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal multiselección de Tipo / Ubicación / Sector (patrón de Ensayos) */}
      <Modal visible={showFilterPicker != null} transparent animationType="fade" onRequestClose={() => setShowFilterPicker(null)}>
        <TouchableOpacity style={styles.pickOverlay} activeOpacity={1} onPress={() => setShowFilterPicker(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.pickCard} onPress={() => { /* swallow */ }}>
            <View style={styles.pickHeaderRow}>
              <Text style={styles.pickTitle}>
                {showFilterPicker === 'tipo' ? t('dossier.testType') : showFilterPicker === 'ubicacion' ? t('dossier.location') : t('dossier.sector')}
              </Text>
              <TouchableOpacity onPress={() => setShowFilterPicker(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {(() => {
              const opts = showFilterPicker === 'tipo' ? typeOptions : showFilterPicker === 'ubicacion' ? locOptions : sectorOptions;
              const sel = showFilterPicker === 'tipo' ? typeFilter : showFilterPicker === 'ubicacion' ? locFilter : sectorFilter;
              const setSel = showFilterPicker === 'tipo' ? setTypeFilter : showFilterPicker === 'ubicacion' ? setLocFilter : setSectorFilter;
              return (
                <ScrollView style={{ maxHeight: 380 }}>
                  <TouchableOpacity style={styles.pickItem} onPress={() => setSel(new Set())}>
                    <View style={styles.pickCheckbox} />
                    <Text style={[styles.pickItemText, { fontStyle: 'italic', color: Colors.textSecondary }]}>
                      {showFilterPicker === 'ubicacion' ? t('dossier.allFem') : t('dossier.allMasc')}
                    </Text>
                  </TouchableOpacity>
                  {opts.map(o => {
                    const on = sel.has(o.id);
                    return (
                      <TouchableOpacity key={o.id} style={[styles.pickItem, on && styles.pickItemActive]} onPress={() => setSel(prev => toggleInSet(prev, o.id))}>
                        <View style={[styles.pickCheckbox, on && styles.pickCheckboxActive]}>
                          {on && <Ionicons name="checkmark" size={12} color={Colors.white} />}
                        </View>
                        <Text style={styles.pickItemText} numberOfLines={1}>{o.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              );
            })()}
            <TouchableOpacity style={styles.pickApplyBtn} onPress={() => setShowFilterPicker(null)}>
              <Text style={styles.pickApplyText}>{t('dossier.applyFilter')}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* v43.4 — Config de impresión PDF por TIPO de ensayo (solo Creador) */}
      <Modal visible={showPrintCfg} transparent animationType="slide" onRequestClose={savePrintConfig}>
        <View style={styles.pcOverlay}>
          <View style={styles.pcCard}>
            <View style={styles.pcHeader}>
              <Text style={styles.pcTitle}>{t('dossier.printConfigTitle')}</Text>
              {/* La X guarda automáticamente (salir = guardar). Solo "Cancelar" descarta. */}
              <TouchableOpacity onPress={savePrintConfig} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="close" size={22} color={Colors.white} /></TouchableOpacity>
            </View>
            <Text style={styles.pcHint}>{t('dossier.printConfigHint')}</Text>
            <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ padding: 14, gap: 14 }}>
              {/* Color de encabezados: GLOBAL (uno para TODOS los ensayos). Dentro del
                  scroll (no congelado) para que se desplace con el resto. */}
              <View style={{ gap: 6 }}>
                <Text style={styles.pcLabel}>{t('dossier.headerColorLabel')}</Text>
                <View style={styles.pcSwatches}>
                  {PRINT_HEADER_COLORS.map(col => (
                    <TouchableOpacity key={col.value} onPress={() => { setPrintHeaderColor(col.value); setShowCustomColor(false); }}
                      style={[styles.pcSwatch, { backgroundColor: col.value }, printHeaderColor === col.value && styles.pcSwatchOn]}>
                      {printHeaderColor === col.value ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                    </TouchableOpacity>
                  ))}
                  {/* v43.6 — Color personalizado: círculo multicolor → abre cajetín hex. */}
                  {(() => {
                    const isCustom = !PRINT_HEADER_COLORS.some(col => col.value === printHeaderColor);
                    return (
                      <TouchableOpacity onPress={() => setShowCustomColor(true)}
                        style={[styles.pcSwatch, styles.pcSwatchCustom, (isCustom || showCustomColor) && styles.pcSwatchOn]}>
                        <View style={styles.pcSwatchQuad}>
                          <View style={{ width: '50%', height: '50%', backgroundColor: '#e11d48' }} />
                          <View style={{ width: '50%', height: '50%', backgroundColor: '#16a34a' }} />
                          <View style={{ width: '50%', height: '50%', backgroundColor: '#2563eb' }} />
                          <View style={{ width: '50%', height: '50%', backgroundColor: '#f59e0b' }} />
                        </View>
                        {isCustom ? <View style={styles.pcSwatchCheck}><Ionicons name="checkmark" size={14} color="#fff" /></View> : null}
                      </TouchableOpacity>
                    );
                  })()}
                </View>
                {showCustomColor ? (
                  <View style={styles.pcHexRow}>
                    <Text style={styles.pcLabel}>{t('dossier.hexColorLabel')}</Text>
                    <View style={[styles.pcHexPreview, { backgroundColor: printHeaderColor }]} />
                    <TextInput
                      style={styles.pcHexInput}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      defaultValue={printHeaderColor}
                      maxLength={7}
                      placeholder="#0E213D"
                      placeholderTextColor={Colors.textMuted}
                      onChangeText={(txt) => {
                        const v = txt.startsWith('#') ? txt : `#${txt}`;
                        if (/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(v)) setPrintHeaderColor(v);
                      }}
                    />
                  </View>
                ) : null}
              </View>
              {/* Buscador de tipos de ensayo / protocolo (filtra las tarjetas de abajo) */}
              {printTemplates.length > 3 && (
                <View style={styles.pcSearchRow}>
                  <Ionicons name="search" size={15} color={Colors.textMuted} />
                  <TextInput
                    style={styles.pcSearchInput}
                    value={printSearch}
                    onChangeText={setPrintSearch}
                    placeholder={t('dossier.searchTypePlaceholder')}
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                  />
                  {printSearch !== '' && (
                    <TouchableOpacity onPress={() => setPrintSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {(() => {
                const q = printSearch.trim().toLowerCase();
                const list = q ? printTemplates.filter(tt => `${tt.idProtocolo} ${tt.name}`.toLowerCase().includes(q)) : printTemplates;
                if (printTemplates.length === 0) return <Text style={styles.pcEmpty}>{t('dossier.noTestTypes')}</Text>;
                if (list.length === 0) return <Text style={styles.pcEmpty}>{t('dossier.noTypeMatch')}</Text>;
                return list.map(tpl => {
                const c = getTemplatePrintConfig({ print_configs: printCfgs } as any, tpl.idProtocolo);
                const isOpen = expandedType === tpl.idProtocolo;
                return (
                  <View key={tpl.idProtocolo} style={styles.pcType}>
                    <TouchableOpacity style={styles.pcTypeHeader} activeOpacity={0.7}
                      onPress={() => setExpandedType(prev => prev === tpl.idProtocolo ? null : tpl.idProtocolo)}>
                      <Text style={[styles.pcTypeName, { flex: 1 }]} numberOfLines={2}>{tpl.idProtocolo} — {tpl.name}</Text>
                      <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textSecondary} />
                    </TouchableOpacity>
                    {isOpen ? (<>
                    <View style={styles.pcRow}><Text style={styles.pcLabel}>{t('dossier.twoColumns')}</Text><Switch value={c.two_column} onValueChange={v => setCfgField(tpl.idProtocolo, { two_column: v })} /></View>
                    <Text style={styles.pcLabel}>{t('dossier.tableFont')}</Text>
                    <View style={styles.pcSeg}>
                      {(['normal', 'compact', 'xcompact'] as PrintFontLevel[]).map(lv => (
                        <TouchableOpacity key={lv} style={[styles.pcSegBtn, c.font_level === lv && styles.pcSegBtnOn]} onPress={() => setCfgField(tpl.idProtocolo, { font_level: lv })}>
                          <Text style={[styles.pcSegText, c.font_level === lv && styles.pcSegTextOn]}>{lv === 'normal' ? t('dossier.sizeNormal') : lv === 'compact' ? t('dossier.sizeCompact') : t('dossier.sizeXCompact')}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={styles.pcLabel}>{t('dossier.graphSize')}</Text>
                    <View style={styles.pcSeg}>
                      {(['normal', 'compact', 'xcompact'] as PrintGraphSize[]).map(sz => (
                        <TouchableOpacity key={sz} style={[styles.pcSegBtn, c.graph_size === sz && styles.pcSegBtnOn]} onPress={() => setCfgField(tpl.idProtocolo, { graph_size: sz })}>
                          <Text style={[styles.pcSegText, c.graph_size === sz && styles.pcSegTextOn]}>{sz === 'normal' ? t('dossier.sizeNormal') : sz === 'compact' ? t('dossier.sizeCompact') : t('dossier.sizeXCompact')}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={styles.pcRow}><Text style={styles.pcLabel}>{t('dossier.includePhotoPanels')}</Text><Switch value={c.show_photos} onValueChange={v => setCfgField(tpl.idProtocolo, { show_photos: v })} /></View>
                    <Text style={styles.pcLabel}>{t('dossier.headerRows')}</Text>
                    <View style={styles.pcSeg}>
                      {(['normal', 'compact', 'xcompact'] as PrintHeaderSize[]).map(hs => (
                        <TouchableOpacity key={hs} style={[styles.pcSegBtn, c.header_size === hs && styles.pcSegBtnOn]} onPress={() => setCfgField(tpl.idProtocolo, { header_size: hs })}>
                          <Text style={[styles.pcSegText, c.header_size === hs && styles.pcSegTextOn]}>{hs === 'normal' ? t('dossier.headerRows3') : hs === 'compact' ? t('dossier.headerRows2') : t('dossier.headerRows1')}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={styles.pcLabel}>{t('dossier.headerFields')}</Text>
                    {PRINT_HEADER_FIELDS.map(f => {
                      const sel = (c.header_fields ?? []).includes(f.key);
                      return (
                        <TouchableOpacity key={f.key} style={styles.pcFieldRow} onPress={() => {
                          const cur = c.header_fields ?? [];
                          const want = sel ? cur.filter(k => k !== f.key) : [...cur, f.key];
                          // Mantener el orden del catálogo.
                          const next = PRINT_HEADER_FIELDS.map(x => x.key).filter(k => want.includes(k));
                          setCfgField(tpl.idProtocolo, { header_fields: next });
                        }}>
                          <Ionicons name={sel ? 'checkbox' : 'square-outline'} size={18} color={sel ? Colors.primary : Colors.textMuted} />
                          <Text style={styles.pcFieldLabel}>{f.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    <View style={styles.pcRow}><Text style={styles.pcLabel}>{t('dossier.showQr')}</Text><Switch value={c.show_qr} onValueChange={v => setCfgField(tpl.idProtocolo, { show_qr: v })} /></View>
                    <View style={styles.pcRow}><Text style={styles.pcLabel}>{t('dossier.splitTables')}</Text><Switch value={c.split_tables} onValueChange={v => setCfgField(tpl.idProtocolo, { split_tables: v })} /></View>
                    {/* v43.6 — Presupuesto de altura por columna (editable por ensayo). */}
                    <View style={styles.pcRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pcLabel}>{t('dossier.colBudgetLabel')}</Text>
                        <Text style={styles.pcBudgetHint}>{t('dossier.colBudgetHint')}</Text>
                      </View>
                      <TextInput
                        style={styles.pcNumInput}
                        keyboardType="number-pad"
                        defaultValue={String(c.col_budget)}
                        maxLength={2}
                        // onChangeText (no onEndEditing): se guarda en cada tecla, así no
                        // se pierde el valor al tocar "Guardar" sin salir del campo. El
                        // acotado 12–80 se hace al leer (getTemplatePrintConfig).
                        onChangeText={(text) => {
                          const n = parseInt(text, 10);
                          if (Number.isFinite(n)) setCfgField(tpl.idProtocolo, { col_budget: n });
                        }}
                      />
                    </View>

                    {/* v43.5 — Croquis (mapa con sectores + ensayo ploteado) */}
                    <View style={styles.pcDivider} />
                    <View style={styles.pcRow}><Text style={styles.pcLabel}>{t('dossier.croquisToggle')}</Text><Switch value={c.croquis.show} onValueChange={v => setCroquisField(tpl.idProtocolo, c, { show: v })} /></View>
                    {c.croquis.show ? (
                      <>
                        <Text style={styles.pcLabel}>{t('dossier.mapLayer')}</Text>
                        <View style={styles.pcSeg}>
                          {CROQUIS_MAP_TYPES.map(mt => (
                            <TouchableOpacity key={mt.value} style={[styles.pcSegBtn, c.croquis.map_type === mt.value && styles.pcSegBtnOn]} onPress={() => setCroquisField(tpl.idProtocolo, c, { map_type: mt.value })}>
                              <Text style={[styles.pcSegText, c.croquis.map_type === mt.value && styles.pcSegTextOn]}>{mt.label}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <Text style={styles.pcLabel}>{t('dossier.pdfPlacement')}</Text>
                        <View style={styles.pcSeg}>
                          {CROQUIS_PLACEMENTS.map(pl => (
                            <TouchableOpacity key={pl.value} style={[styles.pcSegBtn, c.croquis.placement === pl.value && styles.pcSegBtnOn]} onPress={() => setCroquisField(tpl.idProtocolo, c, { placement: pl.value })}>
                              <Text style={[styles.pcSegText, c.croquis.placement === pl.value && styles.pcSegTextOn]}>{pl.label}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <View style={styles.pcRow}><Text style={styles.pcLabel}>Mapa completo (leyenda debajo)</Text><Switch value={c.croquis.full_width} onValueChange={v => setCroquisField(tpl.idProtocolo, c, { full_width: v })} /></View>
                        <View style={styles.pcRow}><Text style={styles.pcLabel}>{t('dossier.overlayOrthophoto')}</Text><Switch value={c.croquis.show_orthophoto} onValueChange={v => setCroquisField(tpl.idProtocolo, c, { show_orthophoto: v })} /></View>
                        <Text style={styles.pcLabel}>{t('dossier.dimBaseLayer', { pct: Math.round(c.croquis.base_opacity * 100) })}</Text>
                        <View style={styles.pcSeg}>
                          {[1, 0.8, 0.6, 0.4].map(op => (
                            <TouchableOpacity key={op} style={[styles.pcSegBtn, Math.abs(c.croquis.base_opacity - op) < 0.01 && styles.pcSegBtnOn]} onPress={() => setCroquisField(tpl.idProtocolo, c, { base_opacity: op })}>
                              <Text style={[styles.pcSegText, Math.abs(c.croquis.base_opacity - op) < 0.01 && styles.pcSegTextOn]}>{Math.round(op * 100)}%</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <Text style={styles.pcLabel}>{t('dossier.testIconSize', { size: c.croquis.point_size })}</Text>
                        <View style={styles.pcSeg}>
                          {[10, 14, 18, 24, 30].map(sz => (
                            <TouchableOpacity key={sz} style={[styles.pcSegBtn, c.croquis.point_size === sz && styles.pcSegBtnOn]} onPress={() => setCroquisField(tpl.idProtocolo, c, { point_size: sz })}>
                              <Text style={[styles.pcSegText, c.croquis.point_size === sz && styles.pcSegTextOn]}>{sz}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    ) : null}
                    </>) : null}
                  </View>
                );
                });
              })()}
            </ScrollView>
            {/* v43.6 — Cancelar (descarta) + Guardar, ambos ghost. La X / Atrás guardan. */}
            <View style={styles.pcActions}>
              <TouchableOpacity style={styles.pcGhostBtn} onPress={cancelPrintConfig} activeOpacity={0.7}>
                <Ionicons name="close-outline" size={18} color={Colors.textSecondary} />
                <Text style={styles.pcGhostText}>{t('dossier.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.pcGhostBtn, styles.pcGhostBtnPrimary]} onPress={savePrintConfig} activeOpacity={0.7}>
                <Ionicons name="checkmark-outline" size={18} color={Colors.primary} />
                <Text style={[styles.pcGhostText, styles.pcGhostTextPrimary]}>{t('dossier.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Chip que abre un modal de selección múltiple (Tipo/Ubicación/Sector). */
function FilterPickerChip({ icon, active, label, onPress, onClear }: {
  icon: any; active: boolean; label: string; onPress: () => void; onClear: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.pickerChip, active && styles.pickerChipActive]} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={13} color={active ? Colors.primary : Colors.textSecondary} />
      <Text style={[styles.pickerChipText, active && styles.pickerChipTextActive]} numberOfLines={1}>{label}</Text>
      {active && (
        <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}>
          <Ionicons name="close-circle" size={14} color={Colors.primary} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  dossierFilterToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginHorizontal: 12, marginTop: 10 },
  dossierFilterToggleText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  filterPanel: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  filterHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  filterTitle: { fontSize: 11, fontWeight: '800', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  filterCount: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  filterClear: { fontSize: 11, fontWeight: '800', color: Colors.primary },
  filterLabel: { fontSize: 10, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', marginTop: 6, marginBottom: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  ghostChip: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.white },
  ghostChipText: { fontSize: 11, fontWeight: '800' },
  choiceChip: { borderWidth: 1, borderColor: Colors.border, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.white },
  choiceChipOn: { borderColor: Colors.primary, backgroundColor: Colors.primary + '12' },
  choiceChipText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, maxWidth: 160 },
  choiceChipTextOn: { color: Colors.primary, fontWeight: '800' },
  list: { padding: 16, paddingBottom: 40, gap: 8 },
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.light, borderRadius: Radius.md, padding: 10, marginBottom: 4,
  },
  dayTitle: { fontSize: 12, fontWeight: '700', color: Colors.navy, textTransform: 'capitalize' },
  dayCount: { fontSize: 11, color: Colors.primary },
  card: {
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 14, gap: 6,
    borderLeftWidth: 3, ...Shadow.subtle,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  protocolNumber: { fontSize: 15, fontWeight: '700', color: Colors.navy },
  statusBadge: { borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { color: Colors.white, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  filledBy: { fontSize: 13, color: Colors.textSecondary },
  location: { fontSize: 12, color: Colors.textMuted },
  signedBy: { fontSize: 12, color: Colors.success, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  approveBtn: {
    flex: 1.7, backgroundColor: '#eaf7ee', borderRadius: Radius.md,
    padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#1e8e3e',
  },
  approveBtnText: { color: '#1e8e3e', fontWeight: '700', fontSize: 12, letterSpacing: 0.3, textAlign: 'center' },
  // Skeleton de los botones de acción hasta calcular conformidad (evita parpadeo).
  btnSkeleton: { backgroundColor: Colors.border, opacity: 0.4, borderColor: Colors.border, minHeight: 38 },
  // Fila Supervisor/Ubicación con su badge alineado a la derecha (✓ / ✗).
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  itemBadgeText: { fontSize: 14, fontWeight: '800' },
  // Chip que abre el modal de filtro multiselección.
  pickerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 180,
  },
  pickerChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '0A' },
  pickerChipText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, flexShrink: 1 },
  pickerChipTextActive: { color: Colors.primary },
  // Modal multiselección
  pickOverlay: { flex: 1, backgroundColor: 'rgba(14,33,61,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  pickCard: { width: '100%', maxWidth: 420, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 14 },
  pickHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  pickTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  pickItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 10, borderRadius: Radius.sm },
  pickItemActive: { backgroundColor: Colors.primary + '12' },
  pickItemText: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  pickCheckbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white },
  pickCheckboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pickApplyBtn: { marginTop: 10, paddingVertical: 11, borderRadius: Radius.sm, backgroundColor: Colors.primary, alignItems: 'center' },
  pickApplyText: { color: Colors.white, fontSize: 13, fontWeight: '800' },
  // Aprobar con observación (no conforme): ámbar, igual que la revisión.
  approveObsBtn: { backgroundColor: '#fef7e8', borderColor: '#e37400' },
  approveObsBtnText: { color: '#b06000' },
  // Modal de observación
  obsOverlay: { flex: 1, backgroundColor: 'rgba(14,33,61,0.55)', justifyContent: 'center', padding: 24 },
  obsCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 18, gap: 10 },
  obsTitle: { fontSize: 16, fontWeight: '800', color: Colors.navy },
  obsHint: { fontSize: 12, color: Colors.textSecondary },
  obsInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: 10, fontSize: 14, color: Colors.textPrimary, minHeight: 80, textAlignVertical: 'top', backgroundColor: Colors.white },
  obsActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  obsCancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white },
  obsCancelText: { fontSize: 14, fontWeight: '800', color: Colors.textSecondary },
  obsConfirmBtn: { flex: 1.4, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: Radius.md, backgroundColor: '#e37400' },
  obsConfirmText: { fontSize: 13, fontWeight: '800', color: Colors.white, textAlign: 'center' },
  rejectBtn: {
    flex: 1, backgroundColor: '#fdf0ef', borderRadius: Radius.md,
    padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#d93025',
  },
  rejectBtnText: { color: '#d93025', fontWeight: '700', fontSize: 12, letterSpacing: 0.3 },
  exportBtn: { padding: 4 },
  // v43.4 — Modal config de impresión por tipo
  pcOverlay: { flex: 1, backgroundColor: 'rgba(14,33,61,0.55)', justifyContent: 'flex-end' },
  pcCard: { backgroundColor: Colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden', maxHeight: '92%' },
  pcHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.navy, paddingHorizontal: 16, paddingVertical: 13 },
  pcTitle: { color: Colors.white, fontWeight: '800', fontSize: 16 },
  pcHint: { fontSize: 12, color: Colors.textSecondary, paddingHorizontal: 16, paddingTop: 10 },
  pcSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  pcSearchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary, padding: 0 },
  pcEmpty: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', padding: 20 },
  pcType: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: 12, gap: 10, borderWidth: 1, borderColor: Colors.border },
  pcDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 2 },
  pcBudgetHint: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  pcNumInput: { width: 56, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingVertical: 6, paddingHorizontal: 8, textAlign: 'center', fontSize: 15, fontWeight: '800', color: Colors.navy, backgroundColor: Colors.white },
  pcTypeName: { fontSize: 14, fontWeight: '800', color: Colors.navy },
  pcTypeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pcRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pcLabel: { fontSize: 13, color: Colors.textPrimary, flexShrink: 1 },
  pcSeg: { flexDirection: 'row', gap: 6 },
  pcSegBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  pcSegBtnOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pcSegText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  pcSegTextOn: { color: Colors.white },
  pcPctInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 7, fontSize: 14, color: Colors.textPrimary, backgroundColor: Colors.white, width: 72, textAlign: 'center' },
  pcFieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  pcFieldLabel: { fontSize: 13, color: Colors.textPrimary },
  pcSwatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pcSwatch: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  pcSwatchOn: { borderColor: Colors.textPrimary },
  pcSwatchCustom: { overflow: 'hidden', padding: 0 },
  pcSwatchQuad: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', flexWrap: 'wrap' },
  pcSwatchCheck: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  pcHexRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  pcHexPreview: { width: 26, height: 26, borderRadius: 6, borderWidth: 1, borderColor: Colors.border },
  pcHexInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 7, fontSize: 14, fontWeight: '700', color: Colors.navy, backgroundColor: Colors.white, width: 110, textAlign: 'center' },
  pcActions: { flexDirection: 'row', gap: 10, margin: 14 },
  pcGhostBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white },
  pcGhostBtnPrimary: { borderColor: Colors.primary },
  pcGhostText: { fontSize: 14, fontWeight: '800', color: Colors.textSecondary },
  pcGhostTextPrimary: { color: Colors.primary },
  pcSave: { backgroundColor: Colors.primary, paddingVertical: 14, alignItems: 'center', margin: 14, borderRadius: Radius.md },
  pcSaveText: { color: Colors.white, fontWeight: '800', fontSize: 15 },
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 10 },
  empty: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  emptyHint: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 32 },
});
