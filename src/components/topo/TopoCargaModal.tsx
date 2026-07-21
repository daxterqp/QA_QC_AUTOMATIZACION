/**
 * TopoCargaModal (móvil) — Ingreso de una carga de datos topográficos.
 *  - Manual: filas apiladas (Código + columnas habilitadas de config).
 *  - CSV: archivo con encabezados (mapeo por nombre + fallback por orden).
 * Espejo conceptual del modal web. Las columnas calculadas ('formula'/'area') no
 * se ingresan a mano.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors, Radius } from '../../theme/colors';
import { projectsCollection } from '@db/index';
import { parseFeatureFlagsJson, topoColumns, type TopoColumn } from '@utils/featureFlags';
import type { TopoRow } from '@utils/topoBinding';

interface Props {
  projectId: string;
  title: string;
  initialRows: TopoRow[];
  saving?: boolean;
  onSave: (rows: TopoRow[]) => void;
  onCancel: () => void;
}

type GridRow = Record<string, string>; // 'code' + column.id

function inputColumns(columns: TopoColumn[]): TopoColumn[] {
  return columns.filter((c) =>
    c.enabled && (c.builtin === 'coord1' || c.builtin === 'coord2' || c.builtin === 'cota' || c.source === 'manual'));
}

function topoRowToGrid(r: TopoRow): GridRow {
  const g: GridRow = { code: r.code ?? '' };
  if (r.c1 != null) g.coord1 = String(r.c1);
  if (r.c2 != null) g.coord2 = String(r.c2);
  if (r.cota != null) g.cota = String(r.cota);
  if (r.custom) for (const [k, v] of Object.entries(r.custom)) if (v != null) g[k] = String(v);
  return g;
}

function gridToTopoRow(g: GridRow, cols: TopoColumn[]): TopoRow {
  const row: TopoRow = { code: (g.code ?? '').trim() };
  const custom: Record<string, string> = {};
  for (const c of cols) {
    const v = (g[c.id] ?? '').trim();
    if (v === '') continue;
    if (c.builtin === 'coord1') row.c1 = v;
    else if (c.builtin === 'coord2') row.c2 = v;
    else if (c.builtin === 'cota') row.cota = v;
    else custom[c.id] = v;
  }
  if (Object.keys(custom).length > 0) row.custom = custom;
  return row;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  for (const line of text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    if (line.trim() === '') continue;
    const cells: string[] = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',' || ch === ';' || ch === '\t') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    out.push(cells.map((c) => c.trim()));
  }
  return out;
}

const CODE_ALIASES = ['codigo', 'code', 'ensayo', 'protocolo'];
const C1_ALIASES = ['este', 'x', 'coordenada 1', 'coord1', 'easting', 'e'];
const C2_ALIASES = ['norte', 'y', 'coordenada 2', 'coord2', 'northing', 'n'];
const COTA_ALIASES = ['cota', 'z', 'elevacion', 'altitud', 'elevation'];

export function TopoCargaModal({ projectId, title, initialRows, saving, onSave, onCancel }: Props) {
  const [cols, setCols] = useState<TopoColumn[]>([]);
  const [rows, setRows] = useState<GridRow[]>(() => {
    const init = (initialRows ?? []).map(topoRowToGrid);
    return init.length > 0 ? init : [{ code: '' }];
  });
  const [csvError, setCsvError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    projectsCollection.find(projectId)
      .then((p: any) => setCols(inputColumns(topoColumns(parseFeatureFlagsJson(p?.featureFlags)))))
      .catch(() => setCols([]));
  }, [projectId]);

  const setCell = (ri: number, key: string, val: string) =>
    setRows((prev) => prev.map((r, i) => (i === ri ? { ...r, [key]: val } : r)));
  const addRow = () => setRows((prev) => [...prev, { code: '' }]);
  const removeRow = (ri: number) => setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== ri) : prev));

  const headerMatch = (header: string, col: TopoColumn): boolean => {
    const h = norm(header);
    if (col.builtin === 'coord1') return C1_ALIASES.includes(h) || h === norm(col.name);
    if (col.builtin === 'coord2') return C2_ALIASES.includes(h) || h === norm(col.name);
    if (col.builtin === 'cota') return COTA_ALIASES.includes(h) || h === norm(col.name);
    return h === norm(col.name) || h === col.id;
  };

  const onCsv = async () => {
    setCsvError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', '*/*'], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const text = await FileSystem.readAsStringAsync(res.assets[0].uri);
      const matrix = parseCsv(text);
      if (matrix.length < 2) { setCsvError('El CSV no tiene filas de datos.'); return; }
      const headers = matrix[0];
      const codeIdx = headers.findIndex((h) => CODE_ALIASES.includes(norm(h)));
      const colIdx: Record<string, number> = {};
      for (const c of cols) { const idx = headers.findIndex((h) => headerMatch(h, c)); if (idx >= 0) colIdx[c.id] = idx; }
      const effCodeIdx = codeIdx >= 0 ? codeIdx : 0;
      const parsed: GridRow[] = [];
      for (let r = 1; r < matrix.length; r++) {
        const cells = matrix[r];
        const g: GridRow = { code: (cells[effCodeIdx] ?? '').trim() };
        for (const c of cols) { const idx = colIdx[c.id]; if (idx != null) g[c.id] = (cells[idx] ?? '').trim(); }
        if (g.code) parsed.push(g);
      }
      if (parsed.length === 0) { setCsvError('No se reconocieron filas con código.'); return; }
      setRows(parsed);
    } catch (e) { setCsvError((e as Error).message); }
  };

  const handleSave = () => onSave(rows.map((g) => gridToTopoRow(g, cols)).filter((r) => r.code));

  const colList = useMemo(() => cols, [cols]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.csvRow}>
            <TouchableOpacity style={styles.csvBtn} onPress={onCsv}>
              <Ionicons name="cloud-upload-outline" size={15} color={Colors.navy} />
              <Text style={styles.csvBtnText}>Subir CSV</Text>
            </TouchableOpacity>
            <Text style={styles.csvHint}>1ª fila = encabezados (Código, {colList.map((c) => c.name).join(', ')}).</Text>
          </View>
          {csvError && <Text style={styles.err}>{csvError}</Text>}

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, gap: 10 }} keyboardShouldPersistTaps="handled">
            {rows.map((r, ri) => (
              <View key={ri} style={styles.rowCard}>
                <View style={styles.rowHead}>
                  <Text style={styles.rowNum}>#{ri + 1}</Text>
                  <TouchableOpacity onPress={() => removeRow(ri)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.fieldLabel}>Código del ensayo</Text>
                <TextInput style={styles.input} value={r.code ?? ''} onChangeText={(v) => setCell(ri, 'code', v)} placeholder="PR-260032" placeholderTextColor={Colors.textMuted} autoCapitalize="characters" />
                {colList.map((c) => (
                  <View key={c.id}>
                    <Text style={styles.fieldLabel}>{c.name}</Text>
                    <TextInput style={styles.input} value={r[c.id] ?? ''} onChangeText={(v) => setCell(ri, c.id, v)}
                      keyboardType={c.builtin === 'coord1' || c.builtin === 'coord2' || c.builtin === 'cota' ? 'numbers-and-punctuation' : 'default'} />
                  </View>
                ))}
              </View>
            ))}
            <TouchableOpacity style={styles.addRow} onPress={addRow}>
              <Ionicons name="add" size={16} color={Colors.primary} />
              <Text style={styles.addRowText}>Agregar fila</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={saving}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving && <ActivityIndicator size="small" color={Colors.white} />}
              <Text style={styles.saveText}>Guardar carga</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(10,20,40,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.white, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '92%', flex: 1, marginTop: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontSize: 15, fontWeight: '800', color: Colors.navy, flex: 1 },
  csvRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  csvBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 8 },
  csvBtnText: { fontSize: 12, fontWeight: '800', color: Colors.navy },
  csvHint: { fontSize: 10, color: Colors.textMuted, flex: 1 },
  err: { color: Colors.danger, fontSize: 12, paddingHorizontal: 16, paddingTop: 6 },
  rowCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 12, gap: 4, borderWidth: 1, borderColor: Colors.border },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  rowNum: { fontSize: 11, fontWeight: '800', color: Colors.textMuted },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 6 },
  input: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary, marginTop: 3 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 8 },
  addRowText: { fontSize: 13, fontWeight: '800', color: Colors.primary },
  footer: { flexDirection: 'row', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: Colors.border },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: 13, alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  saveBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  saveText: { fontSize: 14, fontWeight: '800', color: Colors.white },
});
