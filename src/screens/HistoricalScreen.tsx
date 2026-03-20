import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TouchableWithoutFeedback,
  TextInput, Modal, Dimensions,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { Colors, Radius, Shadow } from '../theme/colors';
import {
  database, protocolsCollection, usersCollection, dashboardNotesCollection,
  projectsCollection, plansCollection, planAnnotationsCollection, locationsCollection,
} from '@db/index';
import { useAuth } from '@context/AuthContext';
import { Q } from '@nozbe/watermelondb';
import type Protocol from '@models/Protocol';
import type User from '@models/User';
import type DashboardNote from '@models/DashboardNote';
import type Project from '@models/Project';
import type Plan from '@models/Plan';
import type PlanAnnotation from '@models/PlanAnnotation';
import type Location from '@models/Location';

type Props = NativeStackScreenProps<RootStackParamList, 'Historical'>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTs(val: any): number {
  if (typeof val === 'number') return val;
  if (val instanceof Date) return val.getTime();
  return 0;
}


function getWeekBoundaries(projectStart: Date): Array<{ start: number; end: number }> {
  const now = Date.now();
  const day = projectStart.getDay();
  const daysToSunday = day === 0 ? 0 : 7 - day;
  const week1End = new Date(projectStart);
  week1End.setDate(projectStart.getDate() + daysToSunday);
  week1End.setHours(23, 59, 59, 999);

  const weeks: Array<{ start: number; end: number }> = [
    { start: projectStart.getTime(), end: week1End.getTime() },
  ];

  let wkStart = new Date(week1End.getTime() + 1);
  wkStart.setHours(0, 0, 0, 0);

  while (wkStart.getTime() <= now) {
    const wkEnd = new Date(wkStart);
    wkEnd.setDate(wkStart.getDate() + 6);
    wkEnd.setHours(23, 59, 59, 999);
    weeks.push({ start: wkStart.getTime(), end: wkEnd.getTime() });
    wkStart = new Date(wkEnd.getTime() + 1);
    wkStart.setHours(0, 0, 0, 0);
  }

  return weeks;
}

// ── Calendario desplegable (Modal) ───────────────────────────────────────────

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;

function CalendarPicker({ value, onChange, label }: {
  value: string; onChange: (d: string) => void; label: string;
}) {
  const init = value ? new Date(value + 'T12:00:00') : new Date();
  const [open, setOpen] = useState(false);
  const [vy, setVy] = useState(init.getFullYear());
  const [vm, setVm] = useState(init.getMonth());
  const [btnLayout, setBtnLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const btnRef = useRef<any>(null);

  const firstDay = new Date(vy, vm, 1);
  let offset = firstDay.getDay() - 1;
  if (offset < 0) offset = 6;
  const daysInMonth = new Date(vy, vm + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(offset).fill(null)];
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selY = value ? +value.split('-')[0] : -1;
  const selM = value ? +value.split('-')[1] - 1 : -1;
  const selD = value ? +value.split('-')[2] : -1;

  const select = (d: number) => {
    onChange(`${vy}-${String(vm + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
    setOpen(false);
  };
  const prev = () => { if (vm === 0) { setVm(11); setVy(y => y-1); } else setVm(m => m-1); };
  const next = () => { if (vm === 11) { setVm(0); setVy(y => y+1); } else setVm(m => m+1); };

  const openCalendar = () => {
    (btnRef.current as any)?.measureInWindow((x: number, y: number, w: number, h: number) => {
      setBtnLayout({ x, y, width: w, height: h });
      setOpen(true);
    });
  };

  const dropdownW = Math.min(SCREEN_W - 32, 320);
  const dropdownLeft = btnLayout ? Math.max(8, Math.min(btnLayout.x, SCREEN_W - dropdownW - 8)) : 8;
  const spaceBelow = btnLayout ? SCREEN_H - (btnLayout.y + btnLayout.height) - 8 : 300;
  const dropdownTop = btnLayout
    ? spaceBelow > 280 ? btnLayout.y + btnLayout.height + 4 : btnLayout.y - 284
    : 100;

  return (
    <View style={cal.wrap}>
      <Text style={cal.label}>{label}</Text>
      <TouchableOpacity ref={btnRef} style={cal.input} onPress={openCalendar} activeOpacity={0.8}>
        <Text style={[cal.inputTxt, !value && cal.placeholder]}>{value || 'Seleccionar'}</Text>
        <Text style={cal.caret}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} activeOpacity={1}>
          <View
            style={[cal.dropdown, { position: 'absolute', top: dropdownTop, left: dropdownLeft, width: dropdownW }]}
            onStartShouldSetResponder={() => true}
            onTouchEnd={e => e.stopPropagation()}
          >
            <View style={cal.nav}>
              <TouchableOpacity onPress={prev} style={cal.navBtn}><Text style={cal.navTxt}>◀</Text></TouchableOpacity>
              <Text style={cal.monthTxt}>{MONTHS[vm]} {vy}</Text>
              <TouchableOpacity onPress={next} style={cal.navBtn}><Text style={cal.navTxt}>▶</Text></TouchableOpacity>
            </View>
            <View style={cal.dayNames}>
              {['Lu','Ma','Mi','Ju','Vi','Sa','Do'].map(n => (
                <Text key={n} style={cal.dayName}>{n}</Text>
              ))}
            </View>
            <View style={cal.grid}>
              {cells.map((d, i) => {
                const sel = d !== null && d === selD && vm === selM && vy === selY;
                return (
                  <TouchableOpacity
                    key={i} style={[cal.day, sel && cal.daySel]}
                    onPress={() => d && select(d)} disabled={!d} activeOpacity={0.7}
                  >
                    <Text style={[cal.dayTxt, sel && cal.dayTxtSel, !d && { opacity: 0 }]}>{d ?? 0}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!!value && (
              <TouchableOpacity style={cal.clear} onPress={() => { onChange(''); setOpen(false); }}>
                <Text style={cal.clearTxt}>Limpiar fecha</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── Tarjeta de análisis (gráfico de proporción) ───────────────────────────────

function AnalysisCard({ title, a, b, labelA, labelB, colorA, colorB, onLongPress }: {
  title: string; a: number; b: number;
  labelA: string; labelB: string; colorA: string; colorB: string;
  onLongPress?: () => void;
}) {
  const total = a + b;
  const pctA = total > 0 ? Math.round((a / total) * 100) : 0;
  const pctB = 100 - pctA;
  return (
    <TouchableWithoutFeedback onLongPress={onLongPress} delayLongPress={500}>
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>{title}</Text>
        {onLongPress && (
          <Text style={styles.longPressHint}>Mantén para ver detalle</Text>
        )}
        {total === 0 ? (
          <Text style={styles.noData}>Sin datos</Text>
        ) : (
          <>
            <View style={styles.propBar}>
              <View style={[styles.propSegA, { flex: Math.max(a, 0.01), backgroundColor: colorA }]}>
                {pctA >= 12 && <Text style={styles.propLabel}>{pctA}%</Text>}
              </View>
              <View style={[styles.propSegB, { flex: Math.max(b, 0.01), backgroundColor: colorB }]}>
                {pctB >= 12 && <Text style={styles.propLabel}>{pctB}%</Text>}
              </View>
            </View>
            <View style={styles.analysisLegend}>
              <View style={styles.legItem}>
                <View style={[styles.legDot, { backgroundColor: colorA }]} />
                <Text style={styles.legTxt}>{labelA}: <Text style={styles.legCount}>{a}</Text></Text>
              </View>
              <View style={styles.legItem}>
                <View style={[styles.legDot, { backgroundColor: colorB }]} />
                <Text style={styles.legTxt}>{labelB}: <Text style={styles.legCount}>{b}</Text></Text>
              </View>
            </View>
          </>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
}

// ── Gráfico de barras semanal (vertical) ─────────────────────────────────────

function WeeklyBarChart({ protocols, projectStart, locations, locMap }: {
  protocols: Protocol[]; projectStart: Date; locations: Location[];
  locMap: Record<string, Location>;
}) {
  const [selectedSpecialty, setSelectedSpecialty] = useState('');
  const [weekModal, setWeekModal] = useState<{ label: string; items: Protocol[] } | null>(null);

  const uniqueSpecialties = useMemo(
    () => [...new Set(locations.map(l => l.specialty).filter(Boolean))] as string[],
    [locations]
  );

  const filteredLocations = useMemo(() =>
    selectedSpecialty ? locations.filter(l => l.specialty === selectedSpecialty) : locations,
    [locations, selectedSpecialty]
  );

  const total = useMemo(() =>
    filteredLocations.reduce((sum, loc) => {
      const count = loc.templateIds
        ? loc.templateIds.split(',').filter(s => s.trim()).length : 0;
      return sum + count;
    }, 0)
  , [filteredLocations]);

  const filteredLocIds = useMemo(
    () => new Set(filteredLocations.map(l => l.id)),
    [filteredLocations]
  );

  const filteredProtocols = useMemo(() =>
    selectedSpecialty
      ? protocols.filter(p => p.locationId != null && filteredLocIds.has(p.locationId))
      : protocols,
    [protocols, selectedSpecialty, filteredLocIds]
  );

  const weeks = useMemo(() => getWeekBoundaries(projectStart), [projectStart]);

  const weekProtocols = useMemo(() =>
    weeks.map(({ start, end }) =>
      filteredProtocols.filter(p => {
        if (p.status !== 'APPROVED') return false;
        const ts = p.signedAt ?? getTs(p.updatedAt);
        return ts >= start && ts <= end;
      })
    ), [filteredProtocols, weeks]);

  const counts = weekProtocols.map(wps => wps.length);
  const maxCount = Math.max(...counts, 1);
  const approved = filteredProtocols.filter(p => p.status === 'APPROVED').length;
  const CHART_H = 140;
  const BAR_W = 42;

  return (
    <View style={styles.weekCard}>
      <View style={styles.weekHeader}>
        <View style={styles.weekBadge}>
          <Text style={styles.weekBadgeNum}>{approved}/{total}</Text>
          <Text style={styles.weekBadgeLbl}>completados</Text>
        </View>
        <Text style={styles.sectionTitle}>Avance semanal</Text>
        <View style={{ width: 70 }} />
      </View>

      {/* Filtro por especialidad */}
      {uniqueSpecialties.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
          <TouchableOpacity
            style={[styles.specChip, !selectedSpecialty && styles.specChipActive]}
            onPress={() => setSelectedSpecialty('')}
          >
            <Text style={[styles.specChipTxt, !selectedSpecialty && styles.specChipTxtActive]}>Todas</Text>
          </TouchableOpacity>
          {uniqueSpecialties.map(sp => (
            <TouchableOpacity
              key={sp}
              style={[styles.specChip, selectedSpecialty === sp && styles.specChipActive]}
              onPress={() => setSelectedSpecialty(sp)}
            >
              <Text style={[styles.specChipTxt, selectedSpecialty === sp && styles.specChipTxtActive]}>{sp}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: CHART_H + 36, gap: 4 }}>
          {counts.map((cnt, i) => {
            const barH = cnt > 0 ? Math.max((cnt / maxCount) * CHART_H, 6) : 4;
            return (
              <TouchableOpacity
                key={i}
                style={{ width: BAR_W, alignItems: 'center', justifyContent: 'flex-end', height: CHART_H + 36 }}
                onLongPress={() => setWeekModal({
                  label: `Semana ${i + 1}`,
                  items: weekProtocols[i],
                })}
                delayLongPress={500}
                activeOpacity={0.85}
              >
                <Text style={styles.weekCount}>{cnt > 0 ? cnt : ''}</Text>
                <View style={[styles.weekBarBg, { height: CHART_H }]}>
                  <View style={[styles.weekBarFill, { height: barH }]} />
                </View>
                <Text style={styles.weekLabel}>S{i + 1}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Modal detalle semana */}
      <Modal visible={!!weekModal} transparent animationType="fade" onRequestClose={() => setWeekModal(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setWeekModal(null)}>
          <View style={styles.weekDetailCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.weekDetailTitle}>{weekModal?.label} — Protocolos aprobados</Text>
            {(weekModal?.items.length ?? 0) === 0 ? (
              <Text style={styles.weekDetailEmpty}>Sin protocolos aprobados esta semana.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                {weekModal?.items.map((p, idx) => {
                  const loc = p.locationId ? locMap[p.locationId] : null;
                  const ts = p.signedAt ?? getTs(p.updatedAt);
                  return (
                    <View key={p.id} style={styles.weekDetailRow}>
                      <Text style={styles.weekDetailNum}>{idx + 1}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.weekDetailProtocol}>{p.protocolNumber}</Text>
                        {loc && <Text style={styles.weekDetailLoc}>{loc.name}</Text>}
                        <Text style={styles.weekDetailDate}>{new Date(ts).toLocaleDateString('es-PE')}</Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.weekDetailClose} onPress={() => setWeekModal(null)}>
              <Text style={styles.weekDetailCloseTxt}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── Gráfico horizontal por especialidad ──────────────────────────────────────

function SpecialtyBarChart({ protocols, locations }: { protocols: Protocol[]; locations: Location[] }) {
  const [specModal, setSpecModal] = useState<{ name: string; items: Protocol[] } | null>(null);

  const locSpecMap = useMemo(() => {
    const m: Record<string, string> = {};
    locations.forEach(l => { if (l.specialty) m[l.id] = l.specialty; });
    return m;
  }, [locations]);

  const locNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    locations.forEach(l => { m[l.id] = l.name; });
    return m;
  }, [locations]);

  // Todos los protocolos agrupados por especialidad (para el modal)
  // Solo usa locSpecMap para que las claves coincidan exactamente con las del gráfico
  const specProtocols = useMemo(() => {
    const m: Record<string, Protocol[]> = {};
    protocols.forEach(p => {
      if (!p.locationId) return;
      const sp = locSpecMap[p.locationId];
      if (!sp) return;
      if (!m[sp]) m[sp] = [];
      m[sp].push(p);
    });
    return m;
  }, [protocols, locSpecMap]);

  const data = useMemo(() => {
    const specTotals: Record<string, number> = {};
    locations.forEach(loc => {
      const sp = loc.specialty?.trim();
      if (!sp) return;
      const count = loc.templateIds
        ? loc.templateIds.split(',').filter(s => s.trim()).length : 0;
      if (count > 0) specTotals[sp] = (specTotals[sp] ?? 0) + count;
    });

    const specApproved: Record<string, number> = {};
    const specRejected: Record<string, number> = {};
    protocols.forEach(p => {
      if (!p.locationId) return;
      const sp = locSpecMap[p.locationId];
      if (!sp) return;
      if (p.status === 'APPROVED') specApproved[sp] = (specApproved[sp] ?? 0) + 1;
      if (p.status === 'REJECTED') specRejected[sp] = (specRejected[sp] ?? 0) + 1;
    });

    return Object.entries(specTotals)
      .map(([name, total]) => ({
        name, total,
        approved: specApproved[name] ?? 0,
        rejected: specRejected[name] ?? 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [protocols, locations, locSpecMap]);

  if (data.length === 0) return null;

  return (
    <View style={styles.specCard}>
      <Text style={styles.sectionTitle}>Avance por especialidad</Text>
      <View style={styles.specLegendRow}>
        <View style={styles.specLegItem}><View style={[styles.specDot, { backgroundColor: '#c8d0db' }]} /><Text style={styles.specLegTxt}>Pendiente</Text></View>
        <View style={styles.specLegItem}><View style={[styles.specDot, { backgroundColor: Colors.success }]} /><Text style={styles.specLegTxt}>Aprobados</Text></View>
        <View style={styles.specLegItem}><View style={[styles.specDot, { backgroundColor: Colors.danger }]} /><Text style={styles.specLegTxt}>Rechazados</Text></View>
      </View>
      {data.map(({ name, total, approved, rejected }) => {
        const appPct = total > 0 ? Math.min((approved / total) * 100, 100) : 0;
        const rejPct = total > 0 ? Math.min((rejected / total) * 100, 100 - appPct) : 0;
        return (
          <TouchableOpacity
            key={name}
            style={styles.specRow}
            onLongPress={() => setSpecModal({ name, items: specProtocols[name] ?? [] })}
            delayLongPress={500}
            activeOpacity={0.85}
          >
            <Text style={styles.specName} numberOfLines={2}>{name}</Text>
            <View style={{ flex: 1 }}>
              {/* Barra gris = 100% (mismo ancho para todas) */}
              <View style={{ width: '100%', height: 26, borderRadius: 4, backgroundColor: '#c8d0db', overflow: 'hidden' }}>
                {approved > 0 && (
                  <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${appPct}%`, backgroundColor: Colors.success }} />
                )}
                {rejected > 0 && (
                  <View style={{ position: 'absolute', left: `${appPct}%`, top: 0, bottom: 0, width: `${rejPct}%`, backgroundColor: Colors.danger }} />
                )}
                <Text style={styles.specBarRightLbl}>{approved}/{total}</Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
      <Text style={styles.longPressHint}>Mantén presionada una barra para ver detalle</Text>

      {/* Modal detalle especialidad */}
      <Modal visible={!!specModal} transparent animationType="fade" onRequestClose={() => setSpecModal(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSpecModal(null)}>
          <View style={styles.weekDetailCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.weekDetailTitle}>{specModal?.name} — Protocolos</Text>
            {(specModal?.items.length ?? 0) === 0 ? (
              <Text style={styles.weekDetailEmpty}>Sin protocolos en esta especialidad.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {specModal?.items
                  .slice()
                  .sort((a, b) => {
                    const order = (s: string) => s === 'APPROVED' ? 0 : s === 'REJECTED' ? 1 : 2;
                    return order(a.status) - order(b.status);
                  })
                  .map((p, idx) => {
                    const locName = p.locationId ? locNameMap[p.locationId] : null;
                    const isApproved = p.status === 'APPROVED';
                    const isRejected = p.status === 'REJECTED';
                    return (
                      <View key={p.id} style={styles.weekDetailRow}>
                        <Text style={styles.weekDetailNum}>{idx + 1}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.weekDetailProtocol}>{p.protocolNumber}</Text>
                          {locName && <Text style={styles.weekDetailLoc}>{locName}</Text>}
                        </View>
                        {(isApproved || isRejected) && (
                          <View style={[styles.specStatusBadge, { backgroundColor: isApproved ? Colors.success : Colors.danger }]}>
                            <Text style={styles.specStatusTxt}>{isApproved ? 'Aprobado' : 'Rechazado'}</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.weekDetailClose} onPress={() => setSpecModal(null)}>
              <Text style={styles.weekDetailCloseTxt}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── Pantalla principal ────────────────────────────────────────────────────────

export default function HistoricalScreen({ navigation, route }: Props) {
  const { currentUser } = useAuth();
  const initialProjectId = route.params?.projectId ?? null;
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialProjectId);
  const [projects, setProjects] = useState<Project[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [allAnnotations, setAllAnnotations] = useState<PlanAnnotation[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [notes, setNotes] = useState<DashboardNote[]>([]);
  const [noteText, setNoteText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    const sub = projectsCollection.query().observe().subscribe(setProjects);
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    const q = selectedProjectId
      ? protocolsCollection.query(Q.where('project_id', selectedProjectId))
      : protocolsCollection.query();
    const sub1 = q.observe().subscribe(setProtocols);
    const sub2 = usersCollection.query().observe().subscribe(setUsers);
    const sub3 = dashboardNotesCollection
      .query(selectedProjectId ? Q.where('project_id', selectedProjectId) : Q.where('project_id', Q.notEq('')))
      .observe().subscribe(setNotes);
    return () => { sub1.unsubscribe(); sub2.unsubscribe(); sub3.unsubscribe(); };
  }, [selectedProjectId]);

  useEffect(() => {
    const sub = plansCollection.query().observe().subscribe(setPlans);
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    const sub = planAnnotationsCollection.query().observe().subscribe(setAllAnnotations);
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    const q = selectedProjectId
      ? locationsCollection.query(Q.where('project_id', selectedProjectId))
      : locationsCollection.query();
    const sub = q.observe().subscribe(setLocations);
    return () => sub.unsubscribe();
  }, [selectedProjectId]);

  const annotations = useMemo(() => {
    if (!selectedProjectId) return allAnnotations;
    const planIds = new Set(plans.filter(p => p.projectId === selectedProjectId).map(p => p.id));
    return allAnnotations.filter(a => planIds.has(a.planId));
  }, [allAnnotations, plans, selectedProjectId]);

  const selectedProject = useMemo(
    () => projects.find(p => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const fromMs = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : null;
  const toMs   = dateTo   ? new Date(dateTo   + 'T23:59:59').getTime() : null;

  const filteredProtocols = useMemo(() => {
    return protocols.filter(p => {
      const ts = getTs(p.updatedAt);
      if (fromMs && ts < fromMs) return false;
      if (toMs && ts > toMs) return false;
      return true;
    });
  }, [protocols, fromMs, toMs]);

  const filteredAnnotations = useMemo(() => {
    return annotations.filter(a => {
      const ts = getTs(a.createdAt);
      if (fromMs && ts < fromMs) return false;
      if (toMs && ts > toMs) return false;
      return true;
    });
  }, [annotations, fromMs, toMs]);

  const approved  = filteredProtocols.filter(p => p.status === 'APPROVED').length;
  const rejected  = filteredProtocols.filter(p => p.status === 'REJECTED').length;
  const obsOpen   = filteredAnnotations.filter(a => a.status === 'OPEN').length;
  const obsClosed = filteredAnnotations.filter(a => a.status === 'CLOSED').length;

  const saveNote = async () => {
    if (!noteText.trim() || !currentUser) return;
    await database.write(async () => {
      await dashboardNotesCollection.create(n => {
        n.projectId = selectedProjectId ?? null;
        n.content = noteText.trim();
        n.createdById = currentUser.id;
      });
    });
    setNoteText('');
  };

  const projectStart = useMemo(() => {
    if (!selectedProject) return null;
    const ts = getTs(selectedProject.createdAt);
    return ts > 0 ? new Date(ts) : null;
  }, [selectedProject]);

  // Mapa locationId → Location para uso en WeeklyBarChart
  const locMap = useMemo(() => {
    const m: Record<string, Location> = {};
    locations.forEach(l => { m[l.id] = l; });
    return m;
  }, [locations]);

  const selectedProjectName = selectedProject?.name ?? '';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Histórico</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Filtro por proyecto */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={styles.projectScroll} contentContainerStyle={styles.projectContent}>
          <TouchableOpacity
            style={[styles.chip, selectedProjectId === null && styles.chipActive]}
            onPress={() => setSelectedProjectId(null)}>
            <Text style={[styles.chipTxt, selectedProjectId === null && styles.chipTxtActive]}>Todos</Text>
          </TouchableOpacity>
          {projects.map(p => (
            <TouchableOpacity key={p.id}
              style={[styles.chip, selectedProjectId === p.id && styles.chipActive]}
              onPress={() => setSelectedProjectId(p.id)}>
              <Text style={[styles.chipTxt, selectedProjectId === p.id && styles.chipTxtActive]} numberOfLines={1}>
                {p.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Filtros de fecha */}
        <View style={styles.filterCard}>
          <Text style={styles.filterTitle}>Filtros por fecha</Text>
          <Text style={styles.filterNote}>Afectan: aprobados/rechazados y observaciones</Text>
          <View style={styles.filterRow}>
            <CalendarPicker label="Fecha inicial" value={dateFrom} onChange={setDateFrom} />
            <CalendarPicker label="Fecha final" value={dateTo} onChange={setDateTo} />
          </View>
        </View>

        {/* Análisis */}
        <View style={styles.chartsRow}>
          <AnalysisCard
            title="Aprobados vs Rechazados"
            a={approved} b={rejected}
            labelA="Aprobados" labelB="Rechazados"
            colorA={Colors.success} colorB={Colors.danger}
            onLongPress={
              selectedProjectId
                ? () => navigation.navigate('Dossier', {
                    projectId: selectedProjectId,
                    projectName: selectedProjectName,
                  })
                : undefined
            }
          />
          <AnalysisCard
            title="Obs. Abiertas vs Resueltas"
            a={obsOpen} b={obsClosed}
            labelA="Abiertas" labelB="Resueltas"
            colorA="#e37400" colorB={Colors.secondary}
            onLongPress={
              selectedProjectId
                ? () => navigation.navigate('AnnotationComments', {
                    projectId: selectedProjectId,
                    projectName: selectedProjectName,
                  })
                : undefined
            }
          />
        </View>

        {/* Gráfico semanal */}
        {projectStart && selectedProjectId && (
          <WeeklyBarChart
            protocols={protocols}
            projectStart={projectStart}
            locations={locations}
            locMap={locMap}
          />
        )}

        {/* Gráfico por especialidad */}
        {selectedProjectId && (locations.length > 0 || protocols.length > 0) && (
          <SpecialtyBarChart protocols={protocols} locations={locations} />
        )}

        {/* Anotaciones */}
        <View style={styles.notesSection}>
          <Text style={styles.sectionTitle}>Anotaciones</Text>
          <View style={styles.noteInputRow}>
            <TextInput
              style={styles.noteInput}
              placeholder="Escribe una anotación..."
              value={noteText}
              onChangeText={setNoteText}
              multiline
            />
            <TouchableOpacity
              style={[styles.noteSaveBtn, !noteText.trim() && styles.btnDisabled]}
              onPress={saveNote} disabled={!noteText.trim()}>
              <Text style={styles.noteSaveBtnText}>Guardar</Text>
            </TouchableOpacity>
          </View>
          {notes.map(note => {
            const nameMap: Record<string, string> = {};
            users.forEach(u => { nameMap[u.id] = u.fullName; });
            const t = getTs(note.createdAt);
            return (
              <View key={note.id} style={styles.noteCard}>
                <Text style={styles.noteContent}>{note.content}</Text>
                <Text style={styles.noteMeta}>
                  {nameMap[note.createdById] ?? '—'} · {new Date(t).toLocaleString('es-CL')}
                </Text>
              </View>
            );
          })}
          {notes.length === 0 && (
            <View style={styles.emptyNote}>
              <Text style={styles.emptyNoteText}>Sin anotaciones aún.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ── Estilos principales ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 16,
    backgroundColor: Colors.navy,
  },
  backBtn: { padding: 4, minWidth: 60 },
  backText: { color: Colors.light, fontSize: 14, fontWeight: '600' },
  title: { fontSize: 14, fontWeight: '700', color: Colors.white, letterSpacing: 1 },
  scroll: { padding: 16, gap: 16, paddingBottom: 48 },

  projectScroll: { marginBottom: -4 },
  projectContent: { gap: 8, paddingBottom: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  chipTxt: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTxtActive: { color: Colors.white },

  filterCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 16, gap: 8, ...Shadow.subtle },
  filterTitle: { fontSize: 12, fontWeight: '700', color: Colors.navy, letterSpacing: 0.5 },
  filterNote: { fontSize: 10, color: Colors.textMuted },
  filterRow: { flexDirection: 'row', gap: 12 },

  chartsRow: { flexDirection: 'row', gap: 12 },
  chartCard: { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 14, gap: 8, ...Shadow.subtle },
  chartTitle: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary, textAlign: 'center', letterSpacing: 0.5 },
  longPressHint: { fontSize: 8, color: Colors.textMuted, textAlign: 'center', fontStyle: 'italic' },
  noData: { textAlign: 'center', color: Colors.textMuted, fontSize: 11, paddingVertical: 12 },
  propBar: { height: 28, flexDirection: 'row', borderRadius: Radius.sm, overflow: 'hidden' },
  propSegA: { justifyContent: 'center', alignItems: 'center' },
  propSegB: { justifyContent: 'center', alignItems: 'center' },
  propLabel: { fontSize: 9, fontWeight: '700', color: Colors.white },
  analysisLegend: { gap: 4 },
  legItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legDot: { width: 8, height: 8, borderRadius: 4 },
  legTxt: { fontSize: 10, color: Colors.textSecondary },
  legCount: { fontWeight: '700', color: Colors.textPrimary },

  // Gráfico semanal
  weekCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 16, gap: 12, ...Shadow.subtle },
  weekHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekBadge: { backgroundColor: Colors.navy, borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', minWidth: 70 },
  weekBadgeNum: { fontSize: 13, fontWeight: '900', color: Colors.white },
  weekBadgeLbl: { fontSize: 8, color: Colors.light, letterSpacing: 0.5 },
  weekCount: { fontSize: 10, fontWeight: '700', color: Colors.primary, marginBottom: 2 },
  weekBarBg: { width: 28, backgroundColor: Colors.surface, borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  weekBarFill: { width: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
  weekLabel: { fontSize: 9, color: Colors.textMuted, marginTop: 4, fontWeight: '600' },

  // Chips especialidad en WeeklyBarChart
  specChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  specChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  specChipTxt: { fontSize: 10, fontWeight: '600', color: Colors.textSecondary },
  specChipTxtActive: { color: Colors.white },

  // Modal detalle semana
  modalOverlay: { flex: 1, backgroundColor: 'rgba(14,33,61,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  weekDetailCard: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: 20, width: '100%', gap: 12 },
  weekDetailTitle: { fontSize: 14, fontWeight: '800', color: Colors.navy },
  weekDetailEmpty: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: 16 },
  weekDetailRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  weekDetailNum: { width: 20, fontSize: 11, fontWeight: '700', color: Colors.primary, paddingTop: 2 },
  weekDetailProtocol: { fontSize: 13, fontWeight: '700', color: Colors.navy },
  weekDetailLoc: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  weekDetailDate: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  weekDetailClose: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.primary, borderRadius: Radius.md },
  weekDetailCloseTxt: { color: Colors.white, fontWeight: '700', fontSize: 13 },

  // Gráfico especialidades
  specCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 16, gap: 12, ...Shadow.subtle },
  specLegendRow: { flexDirection: 'row', gap: 16 },
  specLegItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  specDot: { width: 10, height: 10, borderRadius: 5 },
  specLegTxt: { fontSize: 11, color: Colors.textSecondary },
  specRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  specName: { width: 72, fontSize: 11, fontWeight: '700', color: Colors.textPrimary, textAlign: 'right' },
  specBarRightLbl: {
    position: 'absolute', right: 6, top: 0, bottom: 0,
    fontSize: 10, fontWeight: '700', color: Colors.navy,
    textAlignVertical: 'center', lineHeight: 26,
  },
  specStatusBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6, alignSelf: 'center' },
  specStatusTxt: { fontSize: 9, fontWeight: '700', color: Colors.white },

  // Summary (unused but kept for reference)
  summary: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  summaryCard: { flex: 1, minWidth: '45%', backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 14, alignItems: 'center', borderTopWidth: 3, ...Shadow.subtle },
  summaryCount: { fontSize: 28, fontWeight: '900' },
  summaryLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  // Tabla
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.navy, letterSpacing: 0.5 },
  tableSection: { gap: 4 },
  tableHeader: { flexDirection: 'row', backgroundColor: Colors.light, borderRadius: Radius.md, padding: 8, gap: 4 },
  th: { fontSize: 10, fontWeight: '700', color: Colors.primary },
  thId: { width: 24 },
  thName: { flex: 1, fontSize: 10 },
  tableRow: { flexDirection: 'row', padding: 8, gap: 4, backgroundColor: Colors.white, borderRadius: Radius.sm },
  tableRowAlt: { backgroundColor: Colors.surface },
  td: { fontSize: 11, color: Colors.textPrimary },
  emptyTable: { textAlign: 'center', color: Colors.textMuted, padding: 20 },

  // Anotaciones
  notesSection: { gap: 8 },
  noteInputRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  noteInput: { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.md, padding: 12, fontSize: 13, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, minHeight: 60, textAlignVertical: 'top' },
  noteSaveBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, padding: 12, alignItems: 'center' },
  btnDisabled: { backgroundColor: Colors.light },
  noteSaveBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  noteCard: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: 14, borderLeftWidth: 3, borderLeftColor: Colors.primary, ...Shadow.subtle },
  noteContent: { fontSize: 13, color: Colors.textPrimary },
  noteMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  emptyNote: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: 20, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  emptyNoteText: { color: Colors.textMuted, fontSize: 13 },
});

// ── Estilos del calendario ────────────────────────────────────────────────────

const cal = StyleSheet.create({
  wrap: { flex: 1 },
  label: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1, marginBottom: 4 },
  input: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border },
  inputTxt: { fontSize: 13, color: Colors.textPrimary, fontWeight: '500' },
  placeholder: { color: Colors.textMuted },
  caret: { fontSize: 10, color: Colors.textMuted },
  dropdown: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 12, ...Shadow.card },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  navBtn: { padding: 6 },
  navTxt: { fontSize: 12, color: Colors.primary, fontWeight: '700' },
  monthTxt: { fontSize: 12, fontWeight: '700', color: Colors.navy },
  dayNames: { flexDirection: 'row', marginBottom: 4 },
  dayName: { flex: 1, textAlign: 'center', fontSize: 9, fontWeight: '700', color: Colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  day: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 20 },
  daySel: { backgroundColor: Colors.primary },
  dayTxt: { fontSize: 11, color: Colors.textPrimary },
  dayTxtSel: { color: Colors.white, fontWeight: '700' },
  clear: { marginTop: 8, alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.divider },
  clearTxt: { fontSize: 11, color: Colors.danger, fontWeight: '600' },
});
