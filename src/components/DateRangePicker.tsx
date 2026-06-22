/**
 * DateRangePicker — 2 chips "Desde / Hasta" que abren un calendario modal.
 * Usado en TraceabilityAnalyticsScreen (v29).
 *
 * Props:
 *   fromMs, toMs: rango actual (null = sin filtro).
 *   onChange:     callback con (fromMs, toMs).
 *
 * UX:
 *   - Chip vacío muestra "Desde …" / "Hasta …".
 *   - Chip con valor muestra fecha en formato dd/mm/yyyy + X para limpiar.
 *   - Tap → modal con Calendar (react-native-calendars). Selección de UN día.
 *   - Si seleccionas "Desde" después de "Hasta" más antigua → swap automático.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { Colors, Radius } from '../theme/colors';
import { useI18n } from '@i18n/index';

// Locale español para los nombres de mes/día del calendario.
LocaleConfig.locales.es = {
  monthNames: ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
  monthNamesShort: ['Ene.','Feb.','Mar.','Abr.','May.','Jun.','Jul.','Ago.','Sep.','Oct.','Nov.','Dic.'],
  dayNames: ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'],
  dayNamesShort: ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'],
  today: 'Hoy',
};
LocaleConfig.defaultLocale = 'es';

interface Props {
  fromMs: number | null;
  toMs: number | null;
  onChange: (from: number | null, to: number | null) => void;
}

function pad(n: number) { return String(n).padStart(2, '0'); }

function msToYmd(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function ymdToMs(ymd: string, endOfDay = false): number {
  const [y, m, d] = ymd.split('-').map(n => parseInt(n, 10));
  const date = new Date(y, (m ?? 1) - 1, d ?? 1, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return date.getTime();
}

function fmtDateShort(ms: number | null): string {
  if (ms == null) return '';
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function DateRangePicker({ fromMs, toMs, onChange }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState<null | 'from' | 'to'>(null);

  const handleSelect = (day: { dateString: string }) => {
    const ms = open === 'to'
      ? ymdToMs(day.dateString, true)
      : ymdToMs(day.dateString, false);
    if (open === 'from') {
      // Si hay 'to' y el nuevo 'from' es posterior, swap.
      if (toMs != null && ms > toMs) onChange(toMs - (toMs % 86400000), ymdToMs(day.dateString, true));
      else onChange(ms, toMs);
    } else if (open === 'to') {
      // Si hay 'from' y el nuevo 'to' es anterior, swap.
      if (fromMs != null && ms < fromMs) onChange(ymdToMs(day.dateString, false), fromMs + (86399999 - (fromMs % 86400000)));
      else onChange(fromMs, ms);
    }
    setOpen(null);
  };

  // Marca del calendario: día seleccionado + range si ambos están definidos
  const markedDates: any = {};
  if (open === 'from' && fromMs != null) {
    markedDates[msToYmd(fromMs)] = { selected: true, selectedColor: Colors.primary };
  } else if (open === 'to' && toMs != null) {
    markedDates[msToYmd(toMs)] = { selected: true, selectedColor: Colors.primary };
  }

  return (
    <View style={styles.row}>
      {/* Chip Desde */}
      <View style={styles.chipWrap}>
        <TouchableOpacity style={styles.chip} onPress={() => setOpen('from')} activeOpacity={0.7}>
          <Ionicons name="calendar-outline" size={14} color={fromMs ? Colors.primary : Colors.textMuted} />
          <Text style={[styles.chipText, fromMs != null && styles.chipTextActive]} numberOfLines={1}>
            {fromMs ? t('dateRange.fromValue', { date: fmtDateShort(fromMs) }) : t('dateRange.fromEmpty')}
          </Text>
        </TouchableOpacity>
        {fromMs != null && (
          <TouchableOpacity onPress={() => onChange(null, toMs)} style={styles.chipClear} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="close-circle" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Chip Hasta */}
      <View style={styles.chipWrap}>
        <TouchableOpacity style={styles.chip} onPress={() => setOpen('to')} activeOpacity={0.7}>
          <Ionicons name="calendar-outline" size={14} color={toMs ? Colors.primary : Colors.textMuted} />
          <Text style={[styles.chipText, toMs != null && styles.chipTextActive]} numberOfLines={1}>
            {toMs ? t('dateRange.toValue', { date: fmtDateShort(toMs) }) : t('dateRange.toEmpty')}
          </Text>
        </TouchableOpacity>
        {toMs != null && (
          <TouchableOpacity onPress={() => onChange(fromMs, null)} style={styles.chipClear} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="close-circle" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Modal calendario */}
      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.calendarCard} onPress={() => { /* swallow */ }}>
            <View style={styles.calendarHeader}>
              <Text style={styles.calendarTitle}>
                {open === 'from' ? t('dateRange.selectStartDate') : t('dateRange.selectEndDate')}
              </Text>
              <TouchableOpacity onPress={() => setOpen(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Calendar
              onDayPress={handleSelect}
              markedDates={markedDates}
              maxDate={open === 'from' && toMs != null ? msToYmd(toMs) : undefined}
              minDate={open === 'to' && fromMs != null ? msToYmd(fromMs) : undefined}
              theme={{
                todayTextColor: Colors.primary,
                selectedDayBackgroundColor: Colors.primary,
                arrowColor: Colors.primary,
                textMonthFontWeight: '800',
                textDayHeaderFontWeight: '700',
              }}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  chipWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingRight: 6,
  },
  chip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 10,
  },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, flex: 1 },
  chipTextActive: { color: Colors.textPrimary },
  chipClear: { padding: 2 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  calendarCard: { width: '100%', maxWidth: 400, backgroundColor: Colors.white, borderRadius: Radius.lg, overflow: 'hidden' },
  calendarHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  calendarTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
});
