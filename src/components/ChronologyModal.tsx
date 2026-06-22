/**
 * ChronologyModal — modal con TimelineBar arriba + lista cronológica abajo.
 * Usado desde BySectorView / ByEquipmentView en TraceabilityAnalyticsScreen.
 *
 * Implementación con FlatList (no ScrollView) — más confiable para listas
 * largas, evita problemas de layout/scroll en RN Modal.
 *
 * Reconstruye los huecos del rango como filas "No trabajado" en gris para que
 * el usuario vea TODO el periodo (no solo lo trabajado).
 */
import React, { useMemo } from 'react';
import { View, Text, Modal, SectionList, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '../theme/colors';
import { TimelineBar, colorAt, TIMELINE_EMPTY, type TimelineSegment } from './TimelineBar';
import { groupByDay } from '@utils/dateGrouping';

export interface ChronologyItem extends TimelineSegment {
  primary: string;
  secondary?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  fromMs: number;
  toMs: number;
  items: ChronologyItem[];
  legend?: Array<{ colorIdx: number; label: string }>;
}

type Row =
  | { kind: 'event'; startMs: number; endMs: number; colorIdx: number; primary: string; secondary?: string }
  | { kind: 'gap';   startMs: number; endMs: number };

function pad(n: number) { return String(n).padStart(2, '0'); }

function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDateTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${pad(m)}m`;
}

export function ChronologyModal({ visible, onClose, title, fromMs, toMs, items, legend }: Props) {
  // Eventos ordenados cronológicamente + huecos rellenados como "No trabajado".
  const events: Row[] = useMemo(() => {
    const sorted = [...items].sort((a, b) => a.startMs - b.startMs);
    const out: Row[] = [];
    let cursor = fromMs;
    for (const e of sorted) {
      const start = Math.max(e.startMs, fromMs);
      const end = Math.min(e.endMs, toMs);
      if (end <= start) continue;
      if (start > cursor) {
        out.push({ kind: 'gap', startMs: cursor, endMs: start });
      }
      out.push({
        kind: 'event',
        startMs: start,
        endMs: end,
        colorIdx: e.colorIdx,
        primary: e.primary,
        secondary: e.secondary,
      });
      cursor = Math.max(cursor, end);
    }
    if (cursor < toMs) out.push({ kind: 'gap', startMs: cursor, endMs: toMs });
    return out;
  }, [items, fromMs, toMs]);

  // v30 — Secciones por día para SectionList.
  const sections = useMemo(
    () => groupByDay(events, (e) => e.startMs),
    [events],
  );

  const sameDay = useMemo(() => {
    const a = new Date(fromMs);
    const b = new Date(toMs);
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }, [fromMs, toMs]);
  const fmt = sameDay ? fmtTime : fmtDateTime;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
        {/* Header fijo */}
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Lista scrolleable agrupada por día. Timeline + leyenda van en el ListHeader. */}
        <SectionList
          sections={sections}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator
          renderSectionHeader={({ section }) => (
            <View style={styles.dayHeader}>
              <Text style={styles.dayHeaderText}>{section.title}</Text>
            </View>
          )}
          ListHeaderComponent={
            <View>
              <View style={styles.section}>
                <TimelineBar fromMs={fromMs} toMs={toMs} segments={items} />
              </View>

              {legend && legend.length > 0 && (
                <View style={styles.legendWrap}>
                  {legend.map((l, i) => (
                    <View key={i} style={styles.legendRow}>
                      <View style={[styles.legendDot, { backgroundColor: colorAt(l.colorIdx) }]} />
                      <Text style={styles.legendText} numberOfLines={1}>{l.label}</Text>
                    </View>
                  ))}
                  <View style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: TIMELINE_EMPTY }]} />
                    <Text style={styles.legendText}>No trabajado</Text>
                  </View>
                </View>
              )}

              <Text style={styles.sectionTitle}>EVENTOS</Text>
            </View>
          }
          renderItem={({ item }) => {
            const dur = item.endMs - item.startMs;
            if (item.kind === 'gap') {
              return (
                <View style={[styles.row, styles.rowGap]}>
                  <View style={styles.rowTimes}>
                    <Text style={styles.timeText}>{fmt(item.startMs)}</Text>
                    <Text style={styles.timeArrow}>↓</Text>
                    <Text style={styles.timeText}>{fmt(item.endMs)}</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.gapText}>No trabajado</Text>
                    <Text style={styles.gapDur}>{fmtDuration(dur)}</Text>
                  </View>
                </View>
              );
            }
            return (
              <View style={styles.row}>
                <View style={styles.rowTimes}>
                  <Text style={styles.timeText}>{fmt(item.startMs)}</Text>
                  <Text style={styles.timeArrow}>↓</Text>
                  <Text style={styles.timeText}>{fmt(item.endMs)}</Text>
                </View>
                <View style={[styles.colorBar, { backgroundColor: colorAt(item.colorIdx) }]} />
                <View style={styles.rowBody}>
                  <Text style={styles.primaryText} numberOfLines={1}>{item.primary}</Text>
                  {item.secondary && <Text style={styles.secondaryText} numberOfLines={1}>{item.secondary}</Text>}
                  <Text style={styles.durText}>{fmtDuration(dur)}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>Sin actividad en el rango seleccionado.</Text>
            </View>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  title: { flex: 1, fontSize: 15, fontWeight: '800', color: Colors.textPrimary },

  listContent: { padding: 12, paddingBottom: 80, gap: 10 },

  section: {
    backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1,
    borderColor: Colors.border, padding: 12, marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 10, fontWeight: '800', color: Colors.textMuted,
    letterSpacing: 1, marginTop: 8, marginBottom: 4,
  },

  legendWrap: {
    backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1,
    borderColor: Colors.border, padding: 10, gap: 4, marginBottom: 4,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontSize: 12, color: Colors.textPrimary, flex: 1 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.white, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border, padding: 10, marginBottom: 4,
  },
  rowGap: { backgroundColor: Colors.surface, borderStyle: 'dashed' },
  rowTimes: { minWidth: 64, alignItems: 'flex-start' },
  timeText: { fontSize: 11, color: Colors.textPrimary, fontWeight: '700', fontVariant: ['tabular-nums'] },
  timeArrow: { fontSize: 10, color: Colors.textMuted, marginVertical: 1 },
  colorBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  rowBody: { flex: 1 },
  primaryText: { fontSize: 13, color: Colors.textPrimary, fontWeight: '700' },
  secondaryText: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  durText: { fontSize: 11, color: Colors.primary, fontWeight: '800', marginTop: 2 },
  gapText: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', fontWeight: '600' },
  gapDur: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  dayHeader: {
    marginTop: 8, marginBottom: 4, paddingVertical: 4, paddingHorizontal: 10,
    backgroundColor: Colors.surface, borderRadius: Radius.sm, alignSelf: 'center',
  },
  dayHeaderText: { fontSize: 10, fontWeight: '900', color: Colors.textSecondary, letterSpacing: 1 },
  empty: { alignItems: 'center', padding: 40, gap: 8 },
  emptyText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
});
