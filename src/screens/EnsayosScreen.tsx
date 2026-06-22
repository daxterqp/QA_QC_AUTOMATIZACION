/**
 * EnsayosScreen — modos de llenado de protocolos (v31, Parte D).
 *
 * UNA pantalla para los 3 modos (param `mode`):
 *   - 'sector': sectores del proyecto como desplegables; dentro, los ensayos
 *     del sector + "Adicionar ensayo" (tipo + cantidad N).
 *   - 'type':   agrupados por tipo de ensayo (plantilla).
 *   - 'date':   agrupados por fecha del ensayo (ensayo_date, desc).
 *
 * v32 — Mejoras UI/UX:
 *   - Buscador de texto + FILTROS CRUZADOS arriba (fecha → calendario;
 *     sector/tipo → modal). Por defecto sin restricción ("todos").
 *   - Botón "Adicionar ensayo" outline, JUSTO debajo de la tarjeta del grupo.
 *   - Cards de ensayo más altas y legibles.
 *   - El modal de creación recolecta también la HORA de inicio (default: hora
 *     del sistema al guardar; editable).
 *
 * Las instancias creadas aquí NO llevan ubicación (location_id null); las 3
 * vistas leen las MISMAS instancias. El modo "por ubicación" sigue intacto.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, SectionList, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Alert,
} from 'react-native';
import AppHeader from '@components/AppHeader';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import {
  database,
  protocolTemplatesCollection,
  protocolsCollection,
  protocolItemsCollection,
  evidencesCollection,
  protocolApprovalsCollection,
  projectSectorsCollection,
  summaryRowsCollection,
  planAnnotationsCollection,
  annotationCommentsCollection,
  annotationCommentPhotosCollection,
  protocolEquipmentCollection,
  nonConformitiesCollection,
  samplesCollection,
  projectsCollection,
} from '@db/index';
import { parseFeatureFlagsJson } from '@utils/featureFlags';
import { Q } from '@nozbe/watermelondb';
import { Ionicons } from '@expo/vector-icons';
import { DateRangePicker } from '@components/DateRangePicker';
import { useAuth } from '@context/AuthContext';
import { createInstances } from '@services/ProtocolInstanceService';
import { enqueue as enqueueSync } from '@services/SyncQueueService';
import { todayEnsayoDate, parseEnsayoDate } from '@utils/protocolCode';
import { isValidTimeText } from '@utils/numericProtocol';
import type Protocol from '@models/Protocol';
import type { ProtocolStatus } from '@models/Protocol';
import { useTourStep } from '@hooks/useTourStep';
import { useTour } from '@context/TourContext';
import { useI18n } from '@i18n/index';
import { Colors, Radius, Shadow } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Ensayos'>;

const STATUS_COLORS: Record<ProtocolStatus, string> = {
  DRAFT: Colors.warning,
  IN_PROGRESS: Colors.warning,
  SUBMITTED: Colors.primary,
  APPROVED: Colors.success,
  REJECTED: Colors.danger,
};

const STATUS_LABELS: Record<ProtocolStatus, string> = {
  DRAFT: 'ensayos.status.inProgress',
  IN_PROGRESS: 'ensayos.status.inProgress',
  SUBMITTED: 'ensayos.status.inReview',
  APPROVED: 'ensayos.status.approved',
  REJECTED: 'ensayos.status.rejected',
};

const MODE_TITLES = {
  sector: 'ensayos.title.sector',
  type: 'ensayos.title.type',
  date: 'ensayos.title.date',
} as const;

interface TemplateLite { id: string; name: string; idProtocolo: string | null; isHidden: boolean }
interface SectorLite { id: string; name: string }

interface Group {
  key: string;
  label: string;
  /** Modo sector: id del sector. Modo type: id del template. Modo date: YYYY-MM-DD | null. */
  sectorId?: string;
  templateId?: string;
  ensayoDate?: string | null;
  /** v39 — tipo oculto: se muestra (tiene registros) pero NO permite crear nuevos. */
  hidden?: boolean;
}

const SIN_FECHA = '__sin_fecha__';

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtFecha(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd;
}

export default function EnsayosScreen({ navigation, route }: Props) {
  const { t } = useI18n();
  const { projectId, projectName, mode } = route.params;
  const { jumpToStep, isActive: tourActive, isContextual, dismissTour } = useTour();
  const ensSearchRef = useTourStep('ens_search');
  const ensFiltersRef = useTourStep('ens_filters');
  const ensGroupRef = useTourStep('ens_group');
  const { currentUser } = useAuth();
  const isJefe = currentUser?.role === 'RESIDENT';
  const isCreator = currentUser?.role === 'CREATOR';
  const isSupervisor = currentUser?.role === 'SUPERVISOR';
  const canAdd = isCreator || isSupervisor || isJefe;

  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [protos, setProtos] = useState<Protocol[]>([]);
  const [templates, setTemplates] = useState<TemplateLite[]>([]);
  const [sectorsLite, setSectorsLite] = useState<SectorLite[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // ── v32: buscador + filtros cruzados (default: todos) ────────────────────
  const [search, setSearch] = useState('');
  // Fecha: RANGO desde/hasta (mismo día = filtra solo ese día).
  const [filterFromMs, setFilterFromMs] = useState<number | null>(null);
  const [filterToMs, setFilterToMs] = useState<number | null>(null);
  // Tipo/Sector: MULTISELECCIÓN (vacío = todos).
  const [filterTemplateIds, setFilterTemplateIds] = useState<Set<string>>(new Set());
  const [filterSectorIds, setFilterSectorIds] = useState<Set<string>>(new Set());
  const [showFilterPicker, setShowFilterPicker] = useState<null | 'tipo' | 'sector' | 'muestra'>(null);
  // v43.2 — Filtros ocultos por defecto; se revelan con el toggle (como el Dosier).
  const [showFilters, setShowFilters] = useState(false);
  // v43.2 — Filtro por MUESTRA (solo si el proyecto tiene "ensayos por muestra" activo):
  // selección múltiple del listado + rango desde/hasta por correlativo de muestra.
  const [fillBySample, setFillBySample] = useState(false);
  const [samplesLite, setSamplesLite] = useState<{ id: string; code: string; seq: number }[]>([]);
  const [filterSampleIds, setFilterSampleIds] = useState<Set<string>>(new Set());
  const [sampleFrom, setSampleFrom] = useState('');
  const [sampleTo, setSampleTo] = useState('');

  // Modal "Adicionar ensayo"
  const [modalGroup, setModalGroup] = useState<Group | null>(null);
  const [selTemplateId, setSelTemplateId] = useState<string>('');
  const [countText, setCountText] = useState('1');
  const [fechaText, setFechaText] = useState(todayEnsayoDate());
  const [horaText, setHoraText] = useState(nowHHMM());
  const [horaTouched, setHoraTouched] = useState(false);
  const [creating, setCreating] = useState(false);

  // v32b — Modal de GESTIÓN del ensayo (long-press): editar fecha/hora + eliminar.
  const [manageProto, setManageProto] = useState<any | null>(null);
  const [editFecha, setEditFecha] = useState('');
  const [editHora, setEditHora] = useState('');
  const [managing, setManaging] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tmpls, allProtos, sectors, proj, smps] = await Promise.all([
        protocolTemplatesCollection.query(Q.where('project_id', projectId)).fetch(),
        protocolsCollection.query(Q.where('project_id', projectId)).fetch(),
        projectSectorsCollection.query(Q.where('project_id', projectId)).fetch(),
        projectsCollection.find(projectId).catch(() => null),
        samplesCollection.query(Q.where('project_id', projectId)).fetch().catch(() => [] as any[]),
      ]);
      const flags = parseFeatureFlagsJson((proj as any)?.featureFlags);
      setFillBySample(!!flags.fill_by_sample);
      setSamplesLite([...smps].sort((a: any, b: any) => (a.seq ?? 0) - (b.seq ?? 0))
        .map((s: any) => ({ id: s.id, code: s.sampleCode, seq: s.seq ?? 0 })));
      const tl: TemplateLite[] = tmpls.map((t: any) => ({
        id: t.id, name: t.name, idProtocolo: t.idProtocolo ?? null, isHidden: !!t.isHidden,
      })).sort((a, b) => (a.idProtocolo ?? a.name).localeCompare(b.idProtocolo ?? b.name));
      setTemplates(tl);
      setProtos(allProtos as Protocol[]);
      const sortedSectors = [...sectors].sort((a: any, b: any) =>
        (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || a.name.localeCompare(b.name));
      setSectorsLite(sortedSectors.map((s: any) => ({ id: s.id, name: s.name })));

      if (mode === 'sector') {
        setGroups(sortedSectors.map((s: any) => ({ key: `sec:${s.id}`, label: s.name, sectorId: s.id })));
      } else if (mode === 'type') {
        // v39 — un tipo oculto solo aparece si TIENE registros (para no perderlos);
        // su tarjeta no permitirá crear ensayos nuevos.
        const usedTpl = new Set((allProtos as any[]).map(p => p.templateId));
        setGroups(tl.filter(t => !t.isHidden || usedTpl.has(t.id)).map(t => ({
          key: `tpl:${t.id}`,
          label: t.idProtocolo ? `${t.idProtocolo} — ${t.name}` : t.name,
          templateId: t.id,
          hidden: t.isHidden,
        })));
      } else {
        // date: fechas distintas (desc) + "Sin fecha" si hay filas pre-v31
        const dates = new Set<string>();
        let hasNull = false;
        for (const p of allProtos as any[]) {
          if (p.ensayoDate) dates.add(p.ensayoDate);
          else hasNull = true;
        }
        const todayKey = todayEnsayoDate();
        dates.add(todayKey);   // hoy siempre visible (para adicionar)
        const ordered = Array.from(dates).sort((a, b) => b.localeCompare(a));
        const gs: Group[] = ordered.map(d => ({
          key: `date:${d}`,
          label: d === todayKey ? t('ensayos.dateToday', { date: fmtFecha(d) }) : fmtFecha(d),
          ensayoDate: d,
        }));
        if (hasNull) gs.push({ key: `date:${SIN_FECHA}`, label: t('ensayos.noDate'), ensayoDate: null });
        setGroups(gs);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, mode]);

  useEffect(() => {
    loadData();
    const unsubscribe = navigation.addListener('focus', loadData);
    return unsubscribe;
  }, [loadData, navigation]);

  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      if (tourActive && isContextual) dismissTour();
    });
    return unsub;
  }, [navigation, tourActive, isContextual, dismissTour]);

  // Conjunto de sample_ids permitidos por el filtro de muestra (selección + rango).
  const allowedSampleIds = useMemo(() => {
    const f = parseInt(sampleFrom, 10), t = parseInt(sampleTo, 10);
    const hasRange = !isNaN(f) || !isNaN(t);
    if (filterSampleIds.size === 0 && !hasRange) return null; // sin filtro de muestra
    const ids = new Set<string>(filterSampleIds);
    if (hasRange) for (const s of samplesLite) {
      if (!isNaN(f) && s.seq < f) continue;
      if (!isNaN(t) && s.seq > t) continue;
      ids.add(s.id);
    }
    return ids;
  }, [filterSampleIds, sampleFrom, sampleTo, samplesLite]);

  const filtersActive = search.trim() !== '' || filterFromMs != null || filterToMs != null
    || filterTemplateIds.size > 0 || filterSectorIds.size > 0 || allowedSampleIds != null;

  /** Ensayos del grupo, con buscador + filtros cruzados aplicados. */
  const protosOf = useCallback((g: Group): Protocol[] => {
    const q = search.trim().toLowerCase();
    const list = (protos as any[]).filter(p => {
      // Pertenencia al grupo
      if (g.sectorId != null) { if (p.sectorId !== g.sectorId) return false; }
      else if (g.templateId != null) { if (p.templateId !== g.templateId) return false; }
      else if (g.ensayoDate !== undefined) {
        if (g.ensayoDate === null ? !!p.ensayoDate : p.ensayoDate !== g.ensayoDate) return false;
      } else return false;
      // Filtros cruzados (los que NO son el agrupador del modo)
      if (filterFromMs != null || filterToMs != null) {
        const pMs = parseEnsayoDate(p.ensayoDate)?.getTime() ?? null;
        if (pMs == null) return false;
        if (filterFromMs != null && pMs < filterFromMs) return false;
        if (filterToMs != null && pMs > filterToMs) return false;
      }
      if (filterTemplateIds.size > 0 && !filterTemplateIds.has(p.templateId)) return false;
      if (filterSectorIds.size > 0 && !filterSectorIds.has(p.sectorId)) return false;
      if (allowedSampleIds != null && !(p.sampleId && allowedSampleIds.has(p.sampleId))) return false;
      // Buscador de texto
      if (q) {
        const hay = `${p.protocolCode ?? ''} ${p.protocolNumber ?? ''} ${p.locationReference ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Código desc (los más nuevos arriba), fallback creación desc.
    return list.sort((a, b) =>
      (b.protocolCode ?? '').localeCompare(a.protocolCode ?? '') ||
      (b._raw?.created_at ?? 0) - (a._raw?.created_at ?? 0)) as Protocol[];
  }, [protos, search, filterFromMs, filterToMs, filterTemplateIds, filterSectorIds, allowedSampleIds]);

  const toggleGroup = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const openProtocol = (p: any) => {
    const status: ProtocolStatus = p.status ?? 'DRAFT';
    const correctionsAllowed = p.correctionsAllowed ?? false;
    const canFillStatus = status === 'DRAFT' || status === 'IN_PROGRESS' || (status === 'REJECTED' && correctionsAllowed);
    // v32b — desde "Ensayos por sector" el sector va FIJO en el GPS del ensayo.
    const sectorLocked = mode === 'sector' && !!p.sectorId;
    if (isCreator || isSupervisor || isJefe) {
      if (canFillStatus) navigation.navigate('ProtocolFill', { protocolId: p.id, sectorLocked });
      else navigation.navigate('ProtocolAudit', { protocolId: p.id });
    } else {
      navigation.navigate('ProtocolFill', { protocolId: p.id, sectorLocked });
    }
  };

  const openAddModal = (g: Group) => {
    setModalGroup(g);
    setSelTemplateId(g.templateId ?? (templates.find(t => !t.isHidden)?.id ?? ''));
    setCountText('1');
    setFechaText(g.ensayoDate ?? todayEnsayoDate());
    setHoraText(nowHHMM());
    setHoraTouched(false);
  };

  const handleCreate = async () => {
    if (!modalGroup || creating) return;
    const template = templates.find(t => t.id === (modalGroup.templateId ?? selTemplateId));
    if (!template) { Alert.alert(t('ensayos.alert.missingType.title'), t('ensayos.alert.missingType.msg')); return; }
    if (template.isHidden) { Alert.alert(t('ensayos.alert.hiddenType.title'), t('ensayos.alert.hiddenType.msg')); return; }
    const count = Math.max(1, Math.min(50, parseInt(countText, 10) || 1));
    const fecha = fechaText.trim();
    if (!parseEnsayoDate(fecha)) {
      Alert.alert(t('ensayos.alert.invalidDate.title'), t('ensayos.alert.invalidDate.msg'));
      return;
    }
    // v32 — hora de inicio: si el usuario no la tocó, se toma la hora del
    // sistema EN ESTE MOMENTO (al guardar), igual que la fecha.
    const hora = horaTouched ? horaText.trim() : nowHHMM();
    if (horaTouched && !isValidTimeText(hora)) {
      Alert.alert(t('ensayos.alert.invalidTime.title'), t('ensayos.alert.invalidTime.msg'));
      return;
    }
    setCreating(true);
    try {
      const { codes, warnings } = await createInstances({
        projectId,
        template,
        count,
        locationId: null,
        sectorId: modalGroup.sectorId ?? null,
        sectorName: modalGroup.sectorId ? modalGroup.label : null,
        ensayoDate: fecha,
        ensayoTime: hora,
      });
      setModalGroup(null);
      await loadData();
      setExpanded(prev => new Set(prev).add(modalGroup.key));
      const assigned = codes.filter(Boolean);
      Alert.alert(
        t('ensayos.alert.created.title'),
        t('ensayos.alert.created.msg', { count, type: template.idProtocolo ?? template.name }) +
        (assigned.length > 0 ? t('ensayos.alert.created.codes', { codes: `${assigned[0]}${assigned.length > 1 ? ` … ${assigned[assigned.length - 1]}` : ''}` }) : '') +
        (warnings.length > 0 ? t('ensayos.alert.created.warning', { warning: warnings[0] }) : ''),
      );
    } catch (e: any) {
      Alert.alert(t('ensayos.alert.error.title'), e?.message ?? t('ensayos.alert.error.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  // ── v32b: gestión del ensayo (long-press) ─────────────────────────────────
  const openManageModal = (p: any) => {
    if (!canAdd) return;
    setManageProto(p);
    setEditFecha(p.ensayoDate ?? todayEnsayoDate());
    setEditHora(p.ensayoTime ?? '');
  };

  const manageLocked = manageProto
    ? (manageProto.status === 'SUBMITTED' || manageProto.status === 'APPROVED' || manageProto.isLocked)
    : false;

  const handleSaveManage = async () => {
    if (!manageProto || managing) return;
    const fecha = editFecha.trim();
    if (!parseEnsayoDate(fecha)) {
      Alert.alert(t('ensayos.alert.invalidDate.title'), t('ensayos.alert.invalidDate.msg'));
      return;
    }
    const hora = editHora.trim();
    if (hora !== '' && !isValidTimeText(hora)) {
      Alert.alert(t('ensayos.alert.invalidTime.title'), t('ensayos.alert.invalidTime.msg'));
      return;
    }
    setManaging(true);
    try {
      await database.write(async () => {
        // v32b — limpia un posible prepare huérfano (mismo caso que el delete)
        (manageProto as any)._preparedState = null;
        await manageProto.update((pr: any) => {
          pr.ensayoDate = fecha;
          pr.ensayoTime = hora || null;
        });
      });
      enqueueSync({ opType: 'PUSH_PROTOCOL_STATUS', entityId: manageProto.id, projectId }).catch(() => {});
      setManageProto(null);
      await loadData();
    } catch (e: any) {
      Alert.alert(t('ensayos.alert.error.title'), e?.message ?? t('ensayos.alert.saveFailed'));
    } finally {
      setManaging(false);
    }
  };

  const handleDeleteProto = () => {
    if (!manageProto || managing) return;
    // v43 — Permiso: solo Jefe (RESIDENT) o Creador pueden eliminar ensayos.
    if (!isJefe && !isCreator) {
      Alert.alert(t('ensayos.alert.noPermission.title'), t('ensayos.alert.noPermission.msg'));
      return;
    }
    const label = manageProto.protocolCode ?? manageProto.protocolNumber ?? t('ensayos.alert.delete.defaultLabel');
    Alert.alert(
      t('ensayos.alert.delete.title'),
      t('ensayos.alert.delete.msg', { label }),
      [
        { text: t('ensayos.btn.cancel'), style: 'cancel' },
        {
          text: t('ensayos.btn.delete'), style: 'destructive',
          onPress: async () => {
            setManaging(true);
            try {
              const pid = manageProto.id as string;
              // 1. Recolectar TODAS las filas locales del ensayo (sin dejar
              //    huérfanos en NINGÚN módulo: items, evidencias, approvals, NC,
              //    equipos, anotaciones + comentarios + fotos, y Tablas Resumen).
              const [itemRows, approvalRows, ncRows, equipRows, annRows, summaryRows] = await Promise.all([
                protocolItemsCollection.query(Q.where('protocol_id', pid)).fetch(),
                protocolApprovalsCollection.query(Q.where('protocol_id', pid)).fetch().catch(() => [] as any[]),
                nonConformitiesCollection.query(Q.where('protocol_id', pid)).fetch().catch(() => [] as any[]),
                protocolEquipmentCollection.query(Q.where('protocol_id', pid)).fetch().catch(() => [] as any[]),
                planAnnotationsCollection.query(Q.where('protocol_id', pid)).fetch().catch(() => [] as any[]),
                summaryRowsCollection.query(Q.where('protocol_id', pid)).fetch().catch(() => [] as any[]),
              ]);
              const itemIds = itemRows.map((r: any) => r.id);
              const evidenceRows = itemIds.length > 0
                ? await evidencesCollection.query(Q.where('protocol_item_id', Q.oneOf(itemIds))).fetch()
                : [];
              const annIds = (annRows as any[]).map(r => r.id);
              const commentRows = annIds.length > 0
                ? await annotationCommentsCollection.query(Q.where('annotation_id', Q.oneOf(annIds))).fetch().catch(() => [] as any[])
                : [];
              const commentIds = (commentRows as any[]).map(r => r.id);
              const photoRows = commentIds.length > 0
                ? await annotationCommentPhotosCollection.query(Q.where('annotation_comment_id', Q.oneOf(commentIds))).fetch().catch(() => [] as any[])
                : [];
              // 2. Borrado LOCAL ATÓMICO en UN solo batch (todo o nada): sin
              //    ventana de "medio borrado" si una fila fallara. Se limpia el
              //    prepare HUÉRFANO (pull interrumpido) antes de preparar el
              //    destroy, igual que antes pero sin loop de awaits sueltos.
              const prep = (rec: any) => { rec._preparedState = null; return rec.prepareDestroyPermanently(); };
              await database.write(async () => {
                await database.batch(
                  ...(photoRows as any[]).map(prep),
                  ...(commentRows as any[]).map(prep),
                  ...(annRows as any[]).map(prep),
                  ...evidenceRows.map(prep),
                  ...(equipRows as any[]).map(prep),
                  ...(ncRows as any[]).map(prep),
                  ...(approvalRows as any[]).map(prep),
                  ...itemRows.map(prep),
                  ...(summaryRows as any[]).map(prep),
                  prep(manageProto),
                );
              });
              // 3. Solo si el borrado local fue OK, encolar el borrado REMOTO
              //    (sobrevive offline). El worker copia el ensayo a la papelera y
              //    luego hace hard delete ATÓMICO en la nube (RPC transaccional).
              //    Si el encolado fallara, el ensayo sigue en la nube y un pull
              //    futuro lo restaura local → auto-recuperación, sin estado falso.
              await enqueueSync({
                opType: 'DELETE_PROTOCOL', entityId: pid, projectId,
                payload: { deletedById: currentUser?.id ?? null, deletedByName: currentUser?.name ?? null },
              });
              setManageProto(null);
              await loadData();
            } catch (e: any) {
              Alert.alert(t('ensayos.alert.error.title'), e?.message ?? t('ensayos.alert.delete.deleteFailed'));
            } finally {
              setManaging(false);
            }
          },
        },
      ],
    );
  };

  const sections = useMemo(() => groups.map((g, idx) => {
    const items = protosOf(g);
    const isOpen = expanded.has(g.key) || (filtersActive && items.length > 0);
    return { group: g, items, isOpen, groupIdx: idx, data: isOpen ? items : [] };
  }), [groups, protosOf, expanded, filtersActive]);

  // ── Filtros: qué chips mostrar según el modo ──────────────────────────────
  const showFechaFilter = mode !== 'date';
  const showTipoFilter = mode !== 'type';
  const showSectorFilter = mode !== 'sector' && sectorsLite.length > 0;

  const tipoFilterLabel = filterTemplateIds.size === 0
    ? t('ensayos.filters.type.all')
    : filterTemplateIds.size === 1
      ? (() => { const tpl = templates.find(x => filterTemplateIds.has(x.id)); return tpl ? (tpl.idProtocolo ?? tpl.name) : t('ensayos.filters.type.one'); })()
      : t('ensayos.filters.type.many', { count: filterTemplateIds.size });
  const sectorFilterLabel = filterSectorIds.size === 0
    ? t('ensayos.filters.sector.all')
    : filterSectorIds.size === 1
      ? (sectorsLite.find(s => filterSectorIds.has(s.id))?.name ?? t('ensayos.filters.sector.one'))
      : t('ensayos.filters.sector.many', { count: filterSectorIds.size });

  const toggleInSet = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  };

  const renderFilters = () => (
    <View style={styles.filtersWrap}>
      {/* Toggle: oculta/revela TODOS los filtros (mismo patrón del Dosier) */}
      <TouchableOpacity style={[styles.filterToggle, filtersActive && styles.filterToggleActive]} onPress={() => setShowFilters(v => !v)} activeOpacity={0.8}>
        <Ionicons name={filtersActive ? 'funnel' : 'funnel-outline'} size={15} color={filtersActive ? Colors.primary : Colors.textSecondary} />
        <Text style={[styles.filterToggleText, filtersActive && { color: Colors.primary }]}>{filtersActive ? t('ensayos.filters.labelActive') : t('ensayos.filters.label')}</Text>
        <View style={{ flex: 1 }} />
        {filtersActive && <TouchableOpacity onPress={() => { setSearch(''); setFilterFromMs(null); setFilterToMs(null); setFilterTemplateIds(new Set()); setFilterSectorIds(new Set()); setFilterSampleIds(new Set()); setSampleFrom(''); setSampleTo(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Text style={styles.filterClearLink}>{t('ensayos.filters.clear')}</Text></TouchableOpacity>}
        <Ionicons name={showFilters ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} style={{ marginLeft: 10 }} />
      </TouchableOpacity>
      {!showFilters ? null : (
      <>
      {/* Buscador */}
      <View ref={ensSearchRef} style={styles.searchRow}>
        <Ionicons name="search" size={15} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={t('ensayos.filters.searchPlaceholder')}
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
        />
        {search !== '' && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* v32 — Rango de fechas (desde/hasta, estilo calendario de vuelos) */}
      {showFechaFilter && (
        <DateRangePicker
          fromMs={filterFromMs}
          toMs={filterToMs}
          onChange={(from, to) => { setFilterFromMs(from); setFilterToMs(to); }}
        />
      )}

      {/* Chips de filtros cruzados (tipo/sector: multiselección) */}
      <View ref={ensFiltersRef} style={styles.chipsRow}>
        {showTipoFilter && (
          <TouchableOpacity
            style={[styles.filterChip, filterTemplateIds.size > 0 && styles.filterChipActive]}
            onPress={() => setShowFilterPicker('tipo')}
          >
            <Ionicons name="flask-outline" size={13} color={filterTemplateIds.size > 0 ? Colors.primary : Colors.textSecondary} />
            <Text style={[styles.filterChipText, filterTemplateIds.size > 0 && styles.filterChipTextActive]} numberOfLines={1}>
              {tipoFilterLabel}
            </Text>
            {filterTemplateIds.size > 0 && (
              <TouchableOpacity onPress={() => setFilterTemplateIds(new Set())} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}>
                <Ionicons name="close-circle" size={14} color={Colors.primary} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
        {showSectorFilter && (
          <TouchableOpacity
            style={[styles.filterChip, filterSectorIds.size > 0 && styles.filterChipActive]}
            onPress={() => setShowFilterPicker('sector')}
          >
            <Ionicons name="grid-outline" size={13} color={filterSectorIds.size > 0 ? Colors.primary : Colors.textSecondary} />
            <Text style={[styles.filterChipText, filterSectorIds.size > 0 && styles.filterChipTextActive]} numberOfLines={1}>
              {sectorFilterLabel}
            </Text>
            {filterSectorIds.size > 0 && (
              <TouchableOpacity onPress={() => setFilterSectorIds(new Set())} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}>
                <Ionicons name="close-circle" size={14} color={Colors.primary} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
        {/* Filtro por MUESTRA — solo si el proyecto tiene "ensayos por muestra" activo */}
        {fillBySample && (
          <TouchableOpacity
            style={[styles.filterChip, allowedSampleIds != null && styles.filterChipActive]}
            onPress={() => setShowFilterPicker('muestra')}
          >
            <Ionicons name="cube-outline" size={13} color={allowedSampleIds != null ? Colors.primary : Colors.textSecondary} />
            <Text style={[styles.filterChipText, allowedSampleIds != null && styles.filterChipTextActive]} numberOfLines={1}>
              {allowedSampleIds != null ? t('ensayos.filters.sample.many', { count: allowedSampleIds.size }) : t('ensayos.filters.sample')}
            </Text>
            {allowedSampleIds != null && (
              <TouchableOpacity onPress={() => { setFilterSampleIds(new Set()); setSampleFrom(''); setSampleTo(''); }} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}>
                <Ionicons name="close-circle" size={14} color={Colors.primary} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
      </View>
      </>
      )}
    </View>
  );

  const renderGroupHeader = (g: Group, items: Protocol[], isOpen: boolean, groupIdx: number) => {
    const approved = (items as any[]).filter(p => p.status === 'APPROVED').length;
    const submitted = (items as any[]).filter(p => p.status === 'SUBMITTED').length;
    return (
      <View>
        {/* v32 — Tarjeta principal NAVY (jerarquía sobre las cards de ensayo) */}
        <TouchableOpacity
          ref={groupIdx === 0 ? ensGroupRef : undefined}
          style={[styles.groupHeader, (mode === 'sector' || mode === 'type') && styles.groupHeaderTall, isOpen && styles.groupHeaderOpen]}
          onPress={() => toggleGroup(g.key)}
          activeOpacity={0.8}
        >
          <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={Colors.navy} />
          <Text style={styles.groupTitle} numberOfLines={2}>{g.label}</Text>
          <View style={styles.groupBadges}>
            {approved > 0 && <View style={[styles.badge, { backgroundColor: Colors.success }]}><Text style={styles.badgeText}>{approved}</Text></View>}
            {submitted > 0 && <View style={[styles.badge, { backgroundColor: Colors.secondary }]}><Text style={styles.badgeText}>{submitted}</Text></View>}
            <Text style={styles.groupCount}>{t('ensayos.group.count', { count: items.length })}</Text>
          </View>
        </TouchableOpacity>
        {/* v32 — Panel desplegado con fondo plomo (estilo "Planos"); el botón
            Adicionar (outline) va arriba del panel, bajo la tarjeta navy. */}
        {isOpen && (
          <View style={styles.panelTop}>
            {canAdd && g.hidden && (
              <Text style={styles.hiddenNote}>
                {t('ensayos.group.hiddenNote')}
              </Text>
            )}
            {canAdd && !g.hidden && (
              <TouchableOpacity style={styles.addBtn} onPress={() => openAddModal(g)} activeOpacity={0.7}>
                <Ionicons name="add-circle-outline" size={16} color={Colors.primary} />
                <Text style={styles.addBtnText}>{t('ensayos.group.addTest')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderProto = (p: any) => {
    const status: ProtocolStatus = p.status ?? 'DRAFT';
    return (
      <View style={styles.panelBody}>
      <TouchableOpacity
        key={p.id}
        style={styles.card}
        onPress={() => openProtocol(p)}
        onLongPress={() => openManageModal(p)}
        delayLongPress={350}
        activeOpacity={0.75}
      >
        <View style={styles.cardBody}>
          <View style={styles.cardTitleRow}>
            {p.protocolCode ? (
              <View style={styles.codeChip}><Text style={styles.codeChipText}>{p.protocolCode}</Text></View>
            ) : null}
            <View style={[styles.statusPill, { backgroundColor: STATUS_COLORS[status] + '18' }]}>
              <Text style={[styles.statusPillText, { color: STATUS_COLORS[status] }]}>{t(STATUS_LABELS[status])}</Text>
            </View>
          </View>
          <Text style={styles.cardName} numberOfLines={2}>{p.protocolNumber}</Text>
          <View style={styles.cardMetaRow}>
            <Ionicons name="calendar-clear-outline" size={12} color={Colors.textMuted} />
            <Text style={styles.cardMeta} numberOfLines={1}>
              {p.ensayoDate ? fmtFecha(p.ensayoDate) : '—'}
              {p.ensayoTime ? `  ·  ${p.ensayoTime}` : ''}
              {p.locationReference ? `  ·  ${p.locationReference}` : ''}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
      </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title={t(MODE_TITLES[mode])}
        subtitle={projectName}
        onBack={() => navigation.goBack()}
        rightContent={
          <TouchableOpacity onPress={() => jumpToStep('ens_search')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
          </TouchableOpacity>
        }
      />
      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator color={Colors.primary} /></View>
      ) : groups.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="albums-outline" size={36} color={Colors.textMuted} />
          <Text style={styles.emptyText}>
            {mode === 'sector'
              ? t('ensayos.empty.noSectors')
              : t('ensayos.empty.noTemplates')}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections as any}
          keyExtractor={(item: any) => item.id}
          ListHeaderComponent={renderFilters()}
          renderSectionHeader={({ section }: any) => renderGroupHeader(section.group, section.items, section.isOpen, section.groupIdx)}
          renderItem={({ item }: any) => renderProto(item)}
          renderSectionFooter={({ section }: any) => (
            section.isOpen ? (
              <View style={styles.panelBottom}>
                {section.items.length === 0 && (
                  <Text style={styles.emptyGroupText}>
                    {filtersActive ? t('ensayos.empty.noneMatch') : t('ensayos.empty.none')}
                  </Text>
                )}
              </View>
            ) : null
          )}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}

      {/* ── Modal: filtro MULTISELECT de tipo / sector ── */}
      <Modal visible={showFilterPicker != null} transparent animationType="fade" onRequestClose={() => setShowFilterPicker(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowFilterPicker(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.pickerCard} onPress={() => { /* swallow */ }}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>
                {showFilterPicker === 'tipo' ? t('ensayos.picker.title.type') : showFilterPicker === 'muestra' ? t('ensayos.picker.title.sample') : t('ensayos.picker.title.sector')}
              </Text>
              <TouchableOpacity onPress={() => setShowFilterPicker(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.pickerHint}>{t('ensayos.picker.hint')}</Text>
            {showFilterPicker === 'muestra' && (
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerHint}>{t('ensayos.picker.sampleFrom')}</Text>
                  <TextInput style={styles.rangeInput} value={sampleFrom} onChangeText={setSampleFrom} keyboardType="number-pad" placeholder="—" placeholderTextColor={Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerHint}>{t('ensayos.picker.sampleTo')}</Text>
                  <TextInput style={styles.rangeInput} value={sampleTo} onChangeText={setSampleTo} keyboardType="number-pad" placeholder="—" placeholderTextColor={Colors.textMuted} />
                </View>
              </View>
            )}
            <ScrollView style={{ maxHeight: 380 }}>
              <TouchableOpacity
                style={styles.pickerItem}
                onPress={() => {
                  if (showFilterPicker === 'tipo') setFilterTemplateIds(new Set());
                  else if (showFilterPicker === 'muestra') { setFilterSampleIds(new Set()); setSampleFrom(''); setSampleTo(''); }
                  else setFilterSectorIds(new Set());
                }}
              >
                <View style={styles.checkbox} />
                <Text style={[styles.pickerItemText, { fontStyle: 'italic', color: Colors.textSecondary }]}>{t('ensayos.picker.all')}</Text>
              </TouchableOpacity>
              {showFilterPicker === 'muestra' && (samplesLite.length === 0
                ? <Text style={[styles.pickerHint, { padding: 12 }]}>{t('ensayos.picker.noSamples')}</Text>
                : samplesLite.map(s => {
                  const sel = filterSampleIds.has(s.id);
                  return (
                    <TouchableOpacity key={s.id} style={[styles.pickerItem, sel && styles.pickerItemActive]} onPress={() => setFilterSampleIds(prev => toggleInSet(prev, s.id))}>
                      <View style={[styles.checkbox, sel && styles.checkboxActive]}>{sel && <Ionicons name="checkmark" size={12} color={Colors.white} />}</View>
                      <Text style={styles.pickerItemText} numberOfLines={1}>{s.code}</Text>
                    </TouchableOpacity>
                  );
                }))}
              {showFilterPicker === 'tipo' && templates.map(t => {
                const sel = filterTemplateIds.has(t.id);
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.pickerItem, sel && styles.pickerItemActive]}
                    onPress={() => setFilterTemplateIds(prev => toggleInSet(prev, t.id))}
                  >
                    <View style={[styles.checkbox, sel && styles.checkboxActive]}>
                      {sel && <Ionicons name="checkmark" size={12} color={Colors.white} />}
                    </View>
                    <Text style={styles.pickerItemText} numberOfLines={1}>
                      {t.idProtocolo ? `${t.idProtocolo} — ${t.name}` : t.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {showFilterPicker === 'sector' && sectorsLite.map(s => {
                const sel = filterSectorIds.has(s.id);
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.pickerItem, sel && styles.pickerItemActive]}
                    onPress={() => setFilterSectorIds(prev => toggleInSet(prev, s.id))}
                  >
                    <View style={[styles.checkbox, sel && styles.checkboxActive]}>
                      {sel && <Ionicons name="checkmark" size={12} color={Colors.white} />}
                    </View>
                    <Text style={styles.pickerItemText} numberOfLines={1}>{s.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.pickerApplyBtn} onPress={() => setShowFilterPicker(null)}>
              <Text style={styles.pickerApplyText}>{t('ensayos.picker.apply')}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── v32b: Modal de GESTIÓN del ensayo (long-press) ── */}
      <Modal visible={manageProto != null} transparent animationType="fade" onRequestClose={() => setManageProto(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setManageProto(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalBox} onPress={() => { /* swallow */ }}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {manageProto?.protocolCode ? `${manageProto.protocolCode} · ` : ''}{manageProto?.protocolNumber}
            </Text>

            {manageLocked ? (
              <Text style={styles.manageLockedText}>
                {t('ensayos.manage.locked', { state: manageProto?.status === 'APPROVED' ? t('ensayos.manage.locked.approved') : t('ensayos.manage.locked.inReview') })}
              </Text>
            ) : (
              <>
                <View style={styles.modalRow}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.fieldLabel}>{t('ensayos.field.testDate')}</Text>
                    <TextInput value={editFecha} onChangeText={setEditFecha} autoCapitalize="none"
                      style={styles.modalInput} placeholder="AAAA-MM-DD" placeholderTextColor={Colors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>{t('ensayos.field.time')}</Text>
                    <TextInput value={editHora} onChangeText={setEditHora} autoCapitalize="none"
                      keyboardType="numbers-and-punctuation"
                      style={styles.modalInput} placeholder="HH:MM" placeholderTextColor={Colors.textMuted} />
                  </View>
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setManageProto(null)} disabled={managing}>
                    <Text style={styles.cancelText}>{t('ensayos.btn.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.saveBtn, managing && { opacity: 0.6 }]} onPress={handleSaveManage} disabled={managing}>
                    <Text style={styles.saveText}>{managing ? t('ensayos.btn.saving') : t('ensayos.btn.save')}</Text>
                  </TouchableOpacity>
                </View>

                {/* v43 — Solo Jefe (RESIDENT) o Creador pueden eliminar ensayos. */}
                {(isJefe || isCreator) && (
                  <TouchableOpacity style={[styles.deleteBtn, managing && { opacity: 0.6 }]} onPress={handleDeleteProto} disabled={managing}>
                    <Ionicons name="trash-outline" size={15} color={Colors.danger} />
                    <Text style={styles.deleteBtnText}>{t('ensayos.manage.deleteTest')}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Modal "Adicionar ensayo" ── */}
      <Modal visible={modalGroup != null} transparent animationType="fade" onRequestClose={() => setModalGroup(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{modalGroup ? t('ensayos.add.titleGroup', { group: modalGroup.label }) : t('ensayos.add.title')}</Text>

            {mode !== 'type' && (
              <>
                <Text style={styles.fieldLabel}>{t('ensayos.field.testType')}</Text>
                <ScrollView style={styles.tplList} contentContainerStyle={{ gap: 4 }}>
                  {templates.filter(t => !t.isHidden).map(t => (
                    <TouchableOpacity key={t.id} style={[styles.tplRow, selTemplateId === t.id && styles.tplRowActive]}
                      onPress={() => setSelTemplateId(t.id)}>
                      <View style={[styles.radio, selTemplateId === t.id && styles.radioActive]}>
                        {selTemplateId === t.id && <View style={styles.radioInner} />}
                      </View>
                      <Text style={[styles.tplRowText, selTemplateId === t.id && { color: Colors.primary, fontWeight: '700' }]} numberOfLines={1}>
                        {t.idProtocolo ? `${t.idProtocolo} — ${t.name}` : t.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <View style={styles.modalRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('ensayos.field.quantity')}</Text>
                <TextInput value={countText} onChangeText={setCountText} keyboardType="number-pad"
                  style={styles.modalInput} placeholder="1" placeholderTextColor={Colors.textMuted} />
              </View>
              <View style={{ flex: 2 }}>
                <Text style={styles.fieldLabel}>{t('ensayos.field.testDate')}</Text>
                <TextInput value={fechaText} onChangeText={setFechaText} autoCapitalize="none"
                  style={styles.modalInput} placeholder="AAAA-MM-DD" placeholderTextColor={Colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('ensayos.field.time')}</Text>
                <TextInput
                  value={horaText}
                  onChangeText={t => { setHoraText(t); setHoraTouched(true); }}
                  autoCapitalize="none"
                  keyboardType="numbers-and-punctuation"
                  style={styles.modalInput} placeholder="HH:MM" placeholderTextColor={Colors.textMuted}
                />
              </View>
            </View>
            <Text style={styles.horaHint}>{t('ensayos.add.timeHint')}</Text>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalGroup(null)} disabled={creating}>
                <Text style={styles.cancelText}>{t('ensayos.btn.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, creating && { opacity: 0.6 }]} onPress={handleCreate} disabled={creating}>
                <Text style={styles.saveText}>{creating ? t('ensayos.btn.creating') : t('ensayos.btn.create')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  emptyText: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
  // v32b — paddingBottom generoso: la última tarjeta siempre puede subirse
  // por encima del borde inferior de la pantalla.
  listContent: { padding: 12, paddingBottom: 220 },

  // ── v32: buscador + filtros ──
  filtersWrap: { gap: 8, marginBottom: 4 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.white, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10,
  },
  searchInput: { flex: 1, fontSize: 13, color: Colors.textPrimary, paddingVertical: 9 },
  chipsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 180,
  },
  filterChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '0A' },
  filterChipText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, flexShrink: 1 },
  filterChipTextActive: { color: Colors.primary },

  // v32b — Tarjeta principal con la MISMA "cinta" de las tarjetas de la página
  // principal de proyectos: borde superior primary 3px + Radius.lg + sombra.
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.white, paddingVertical: 18, paddingHorizontal: 14,
    borderRadius: Radius.lg, overflow: 'hidden',
    borderLeftWidth: 3, borderLeftColor: Colors.secondary,   // v45 — listón al costado izquierdo (paridad con tarjetas del dossier)
    marginTop: 10, ...Shadow.card,
  },
  // v43.3 — Ensayos por sector/tipo: alto reducido 30% respecto a la versión alta previa.
  groupHeaderTall: { minHeight: 67, paddingVertical: 21, marginTop: 13 },
  groupHeaderOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  groupTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: Colors.navy, lineHeight: 19 },
  groupBadges: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  badge: { minWidth: 18, height: 18, borderRadius: 4, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, fontWeight: '900', color: Colors.white },
  groupCount: { fontSize: 10, color: Colors.textMuted, marginLeft: 2 },

  // v32 — Panel desplegado: fondo plomo tipo tapiz (estilo "Planos").
  panelTop: { backgroundColor: '#e6eaf0', paddingHorizontal: 10, paddingTop: 10 },
  panelBody: { backgroundColor: '#e6eaf0', paddingHorizontal: 10 },
  panelBottom: {
    backgroundColor: '#e6eaf0', paddingHorizontal: 10, paddingBottom: 10,
    borderBottomLeftRadius: Radius.md, borderBottomRightRadius: Radius.md,
  },

  emptyGroupText: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', paddingLeft: 6, paddingTop: 4 },
  // v32 — outline (borde de color, interior blanco), bajo la tarjeta del grupo
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.primary,
    borderRadius: Radius.sm, paddingVertical: 9,
  },
  addBtnText: { color: Colors.primary, fontSize: 12, fontWeight: '800' },
  hiddenNote: { color: Colors.textMuted, fontSize: 11, fontStyle: 'italic', textAlign: 'center', paddingVertical: 6, paddingHorizontal: 8 },

  // ── v32: card de ensayo más alta y aireada (vive sobre el panel plomo) ──
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.white, paddingVertical: 12, paddingHorizontal: 12,
    marginTop: 8,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    ...Shadow.subtle,
  },
  cardBody: { flex: 1, gap: 5 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardName: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, lineHeight: 17 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardMeta: { flex: 1, fontSize: 11, color: Colors.textMuted },
  codeChip: { backgroundColor: Colors.navy, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  codeChipText: { fontSize: 10.5, fontWeight: '900', color: Colors.white, letterSpacing: 0.4 },
  statusPill: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 },
  statusPillText: { fontSize: 10, fontWeight: '800' },

  // ── Modales ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(14,33,61,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  pickerCard: { width: '100%', maxWidth: 420, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 14 },
  pickerHint: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginBottom: 4 },
  rangeInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: Colors.textPrimary, backgroundColor: Colors.white },
  filterToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  filterToggleActive: { borderColor: Colors.primary },
  filterToggleText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  filterClearLink: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  pickerItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 10, borderRadius: Radius.sm },
  pickerItemActive: { backgroundColor: Colors.primary + '12' },
  pickerItemText: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  checkbox: {
    width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white,
  },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pickerApplyBtn: {
    marginTop: 10, paddingVertical: 11, borderRadius: Radius.sm,
    backgroundColor: Colors.primary, alignItems: 'center',
  },
  pickerApplyText: { color: Colors.white, fontSize: 13, fontWeight: '800' },

  modalBox: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 16, width: '100%', maxWidth: 440, gap: 8 },
  modalTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, marginTop: 4 },
  tplList: { maxHeight: 200 },
  tplRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8,
    borderRadius: 4, borderWidth: 1, borderColor: Colors.border,
  },
  tplRowActive: { borderColor: Colors.primary + '50', backgroundColor: Colors.primary + '08' },
  tplRowText: { flex: 1, fontSize: 12, color: Colors.textSecondary },
  radio: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: Colors.primary },
  radioInner: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.primary },
  modalRow: { flexDirection: 'row', gap: 10 },
  modalInput: {
    fontSize: 13, padding: 9, borderRadius: 4, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white, color: Colors.textPrimary, marginTop: 4,
  },
  horaHint: { fontSize: 10.5, color: Colors.textMuted, fontStyle: 'italic', marginTop: 2 },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  // v32b — gestión del ensayo
  manageLockedText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, paddingVertical: 6 },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: Colors.danger, borderRadius: Radius.sm,
    paddingVertical: 10, marginTop: 4, backgroundColor: Colors.white,
  },
  deleteBtnText: { color: Colors.danger, fontSize: 12.5, fontWeight: '800' },
  cancelBtn: { flex: 1, padding: 12, alignItems: 'center', borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textSecondary, fontWeight: '700', fontSize: 13 },
  saveBtn: { flex: 1, padding: 12, alignItems: 'center', borderRadius: Radius.sm, backgroundColor: Colors.primary },
  saveText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
});
