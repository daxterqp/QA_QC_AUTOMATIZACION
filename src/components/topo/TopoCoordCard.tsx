/**
 * TopoCoordCard (v44) — Tarjeta read-only de "Coordenadas Topográficas" en la ficha.
 * Mismo formato que la tarjeta GPS (GPSCaptureBar embedded). Muestra las columnas
 * marcadas "Mostrar en ficha" de la config: coordenadas + cota + custom/computadas.
 * Si no hay datos topográficos, muestra el estado de espera.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius } from '../../theme/colors';
import { projectSectorsCollection } from '@db/index';
import type { TopoColumn } from '@utils/featureFlags';

interface TopoProtocol {
  topoCoordEast?: number | null;
  topoCoordNorth?: number | null;
  topoCoordElevation?: number | null;
  topoValuesJson?: string | null;
  topoSectorId?: string | null;
  topoUpdatedAt?: number | null;
}

interface Props {
  protocol: TopoProtocol;
  /** Columnas de config (para saber labels + cuáles mostrar en ficha). */
  columns: TopoColumn[];
  /** Nombre de sector (resuelto por el caller) si hay topoSectorId. */
  sectorName?: string | null;
  embedded?: boolean;
}

function fmt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return String(v);
}

export function TopoCoordCard({ protocol, columns, sectorName, embedded }: Props) {
  const custom = useMemo<Record<string, unknown>>(() => {
    if (!protocol.topoValuesJson) return {};
    try { return JSON.parse(protocol.topoValuesJson) ?? {}; } catch { return {}; }
  }, [protocol.topoValuesJson]);

  // Resuelve el nombre del sector calculado (topoSectorId) si no lo pasó el caller.
  const [resolvedSector, setResolvedSector] = useState<string | null>(sectorName ?? null);
  useEffect(() => {
    if (sectorName != null) { setResolvedSector(sectorName); return; }
    const sid = protocol.topoSectorId;
    if (!sid) { setResolvedSector(null); return; }
    let cancelled = false;
    projectSectorsCollection.find(sid)
      .then((s: any) => { if (!cancelled) setResolvedSector(s?.name ?? null); })
      .catch(() => { if (!cancelled) setResolvedSector(null); });
    return () => { cancelled = true; };
  }, [protocol.topoSectorId, sectorName]);

  // Columnas a mostrar (las marcadas "mostrar en ficha"); si no hay config, defaults.
  const shown = columns.filter((c) => c.show_in_ficha);
  const rows: { label: string; value: string }[] = [];
  for (const c of shown) {
    if (c.builtin === 'coord1') rows.push({ label: c.name, value: fmt(protocol.topoCoordEast) });
    else if (c.builtin === 'coord2') rows.push({ label: c.name, value: fmt(protocol.topoCoordNorth) });
    else if (c.builtin === 'cota') rows.push({ label: c.name, value: fmt(protocol.topoCoordElevation) });
    else if (c.builtin === 'sector') rows.push({ label: c.name, value: resolvedSector ?? '—' });
    else {
      const v = custom[c.id];
      rows.push({ label: c.name, value: v == null || v === '' ? '—' : String(v) });
    }
  }

  const hasAnyValue =
    protocol.topoCoordEast != null || protocol.topoCoordNorth != null ||
    protocol.topoCoordElevation != null || Object.keys(custom).length > 0 || !!protocol.topoSectorId;

  return (
    <View style={[styles.bar, embedded && styles.barEmbedded]}>
      <Text style={styles.title}>Coordenadas Topográficas</Text>
      {!hasAnyValue ? (
        <Text style={styles.waiting}>A la espera de datos topográficos.</Text>
      ) : (
        <View style={styles.grid}>
          {rows.map((r, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.label}>{r.label}</Text>
              <Text style={styles.value}>{r.value}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 10, gap: 4 },
  barEmbedded: { backgroundColor: Colors.white, borderRadius: 0, paddingHorizontal: 0 },
  title: { fontSize: 13, fontWeight: '800', color: Colors.navy },
  waiting: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', marginTop: 2 },
  grid: { marginTop: 4, gap: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 12, color: Colors.textSecondary, flex: 1 },
  value: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, textAlign: 'right' },
});
