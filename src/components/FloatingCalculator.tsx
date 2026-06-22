import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { safeEval } from '@services/MetradosService';
import { Colors, Radius, Shadow } from '../theme/colors';

type KeyDef =
  | { label: string; kind: 'num'; digit: string }
  | { label: string; kind: 'op'; op: string }
  | { label: string; kind: 'ctrl'; ctrl: 'clear' | 'back' | 'percent' | 'pi' }
  | { label: string; kind: 'eq' };

const KEYS: KeyDef[][] = [
  [
    { label: 'C',  kind: 'ctrl', ctrl: 'clear' },
    { label: '⌫', kind: 'ctrl', ctrl: 'back' },
    { label: '%', kind: 'ctrl', ctrl: 'percent' },
    { label: '÷', kind: 'op', op: '÷' },
  ],
  [
    { label: '7', kind: 'num', digit: '7' },
    { label: '8', kind: 'num', digit: '8' },
    { label: '9', kind: 'num', digit: '9' },
    { label: '×', kind: 'op', op: '×' },
  ],
  [
    { label: '4', kind: 'num', digit: '4' },
    { label: '5', kind: 'num', digit: '5' },
    { label: '6', kind: 'num', digit: '6' },
    { label: '−', kind: 'op', op: '−' },
  ],
  [
    { label: '1', kind: 'num', digit: '1' },
    { label: '2', kind: 'num', digit: '2' },
    { label: '3', kind: 'num', digit: '3' },
    { label: '+', kind: 'op', op: '+' },
  ],
  [
    { label: 'π', kind: 'ctrl', ctrl: 'pi' },
    { label: '0', kind: 'num', digit: '0' },
    { label: '.', kind: 'num', digit: '.' },
    { label: '=', kind: 'eq' },
  ],
];

const OPERATORS = '+−×÷';
const HISTORY_MAX = 10;
const PI_STR = String(Math.PI); // Math.PI → "3.141592653589793"

function isOp(ch: string): boolean {
  return OPERATORS.includes(ch);
}

function formatNum(n: number): string {
  if (!isFinite(n)) return 'Error';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(6).replace(/\.?0+$/, '');
}

function lastNumberToken(expr: string): string {
  const m = expr.match(/(-?\d*\.?\d*)$/);
  return m ? m[1] : '';
}

type HistoryEntry = { expr: string; result: string };

export type RecentValue = {
  id: string;
  value: number;
  label: string; // "12.50 m", "180 und", etc.
};

type Props = {
  fabRef?: React.Ref<View>;
  onOpenChange?: (open: boolean) => void;
  recentValues?: RecentValue[];
};

export default function FloatingCalculator({ fabRef, onOpenChange, recentValues }: Props) {
  const [open, setOpen] = useState(false);

  const [expr, setExpr] = useState('');
  const [lastResult, setLastResult] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const toggleOpen = useCallback((v: boolean) => {
    setOpen(v);
    onOpenChange?.(v);
  }, [onOpenChange]);

  const pushHistory = (e: HistoryEntry) => {
    setHistory((h) => [e, ...h].slice(0, HISTORY_MAX));
  };

  const pressDigit = (d: string) => {
    if (expr === '' && lastResult != null) {
      setLastResult(null);
      setExpr(d === '.' ? '0.' : d);
      return;
    }
    if (d === '.') {
      const token = lastNumberToken(expr);
      if (token.includes('.')) return;
      if (token === '' || token === '-') {
        setExpr(expr + '0.');
        return;
      }
      setExpr(expr + '.');
      return;
    }
    setExpr(expr + d);
  };

  const pressOp = (op: string) => {
    // Después de "=", continuar con el resultado como primer operando
    if (expr === '' && lastResult != null) {
      setExpr(formatNum(lastResult) + op);
      setLastResult(null);
      return;
    }
    if (expr === '') return;
    const last = expr[expr.length - 1];
    if (isOp(last)) {
      setExpr(expr.slice(0, -1) + op);
      return;
    }
    setExpr(expr + op);
  };

  const pressEquals = () => {
    if (expr === '') return;
    let e = expr;
    while (e.length > 0 && isOp(e[e.length - 1])) e = e.slice(0, -1);
    if (e === '') return;
    const r = safeEval(e);
    if (r == null || !isFinite(r)) {
      pushHistory({ expr: e, result: 'Error' });
      setExpr('');
      setLastResult(null);
      return;
    }
    pushHistory({ expr: e, result: formatNum(r) });
    setLastResult(r);
    setExpr('');
  };

  const pressClear = () => {
    setExpr('');
    setLastResult(null);
  };

  const pressBack = () => {
    if (expr.length > 0) {
      setExpr(expr.slice(0, -1));
      return;
    }
    if (lastResult != null) setLastResult(null);
  };

  const pressPercent = () => {
    if (expr === '' && lastResult != null) {
      setLastResult(lastResult / 100);
      return;
    }
    if (expr === '') return;
    const token = lastNumberToken(expr);
    if (!token) return;
    const n = parseFloat(token);
    if (isNaN(n)) return;
    const startIdx = expr.length - token.length;
    setExpr(expr.slice(0, startIdx) + formatNum(n / 100));
  };

  const pressPi = () => {
    // Tras un "=", iniciar una nueva expresión con π
    if (expr === '' && lastResult != null) {
      setLastResult(null);
      setExpr(PI_STR);
      return;
    }
    // Si la expresión termina en número o en ')', insertar "×π"
    if (expr !== '') {
      const last = expr[expr.length - 1];
      if (!isOp(last)) {
        setExpr(expr + '×' + PI_STR);
        return;
      }
    }
    setExpr(expr + PI_STR);
  };

  // Insertar el número de un chip en la expresión actual
  const pressChip = (value: number) => {
    const s = formatNum(value);
    // Tras "=", empezar fresco con ese número
    if (expr === '' && lastResult != null) {
      setLastResult(null);
      setExpr(s);
      return;
    }
    // Si la expresión está vacía o termina en operador → concatenar
    if (expr === '') {
      setExpr(s);
      return;
    }
    const last = expr[expr.length - 1];
    if (isOp(last)) {
      setExpr(expr + s);
      return;
    }
    // Termina en número/decimal → multiplicar por el chip
    setExpr(expr + '×' + s);
  };

  const press = (k: KeyDef) => {
    if (k.kind === 'num') pressDigit(k.digit);
    else if (k.kind === 'op') pressOp(k.op);
    else if (k.kind === 'eq') pressEquals();
    else if (k.kind === 'ctrl') {
      if (k.ctrl === 'clear') pressClear();
      else if (k.ctrl === 'back') pressBack();
      else if (k.ctrl === 'percent') pressPercent();
      else if (k.ctrl === 'pi') pressPi();
    }
  };

  const latestHistory = history[0];
  const historyLine = latestHistory ? `${latestHistory.expr} = ${latestHistory.result}` : '';
  const displayMain = expr || (lastResult != null ? formatNum(lastResult) : '0');

  const clearHistory = () => setHistory([]);

  if (!open) {
    return (
      <TouchableOpacity ref={fabRef} style={styles.fab} onPress={() => toggleOpen(true)} activeOpacity={0.85}>
        <Ionicons name="calculator-outline" size={26} color={Colors.white} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.panelWrap} pointerEvents="box-none">
      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <Ionicons name="calculator-outline" size={18} color={Colors.primary} />
          <Text style={styles.panelTitle}>Calculadora</Text>
          <TouchableOpacity onPress={() => toggleOpen(false)} style={styles.closeBtn}>
            <Ionicons name="close" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.display}>
          <TouchableOpacity
            onPress={() => history.length > 0 && setShowHistory(true)}
            disabled={history.length === 0}
            activeOpacity={0.7}
            style={styles.historyTouch}
          >
            <Text style={styles.historyText} numberOfLines={1} ellipsizeMode="head">
              {historyLine || ' '}
            </Text>
          </TouchableOpacity>
          <Text style={styles.resultText} numberOfLines={1} ellipsizeMode="head">
            {displayMain}
          </Text>
        </View>

        {/* Chips con últimos valores calculados */}
        {recentValues && recentValues.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {recentValues.slice(0, 5).map((rv) => (
              <TouchableOpacity
                key={rv.id}
                style={styles.chip}
                onPress={() => pressChip(rv.value)}
                activeOpacity={0.75}
              >
                <Text style={styles.chipText} numberOfLines={1}>{rv.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={styles.keys}>
          {KEYS.map((row, ri) => (
            <View key={ri} style={styles.keyRow}>
              {row.map((k) => (
                <TouchableOpacity
                  key={k.label}
                  style={[
                    styles.key,
                    k.kind === 'op' && styles.keyOp,
                    k.kind === 'eq' && styles.keyEq,
                    k.kind === 'ctrl' && styles.keyCtrl,
                  ]}
                  onPress={() => press(k)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.keyText,
                      k.kind === 'op' && styles.keyTextOp,
                      k.kind === 'eq' && styles.keyTextEq,
                      k.kind === 'ctrl' && styles.keyTextCtrl,
                    ]}
                  >
                    {k.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      </View>

      {/* Modal de historial completo */}
      <Modal visible={showHistory} transparent animationType="fade" onRequestClose={() => setShowHistory(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowHistory(false)}>
          <View style={styles.historyCard} onStartShouldSetResponder={() => true}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>Historial</Text>
              <TouchableOpacity onPress={clearHistory} style={styles.historyClearBtn}>
                <Ionicons name="trash-outline" size={16} color={Colors.danger} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowHistory(false)} style={styles.historyCloseBtn}>
                <Ionicons name="close" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.historyList}>
              {history.length === 0 ? (
                <Text style={styles.historyEmpty}>Sin operaciones</Text>
              ) : (
                history.map((h, i) => (
                  <View key={i} style={styles.historyItem}>
                    <Text style={styles.historyExpr} numberOfLines={1}>{h.expr}</Text>
                    <Text style={styles.historyResult} numberOfLines={1}>= {h.result}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', bottom: 16, right: 12,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.navy, alignItems: 'center', justifyContent: 'center',
    ...Shadow.card, zIndex: 60,
  },
  panelWrap: {
    position: 'absolute', bottom: 16, right: 12,
    zIndex: 200, elevation: 20,
  },
  panel: {
    width: 260,
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    ...Shadow.card, overflow: 'hidden',
  },
  panelHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  panelTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  closeBtn: { padding: 2 },

  display: {
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: Colors.surface, gap: 2, minHeight: 68,
  },
  historyTouch: { minHeight: 18 },
  historyText: { textAlign: 'right', fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
  resultText: { textAlign: 'right', fontSize: 26, color: Colors.textPrimary, fontWeight: '800' },

  chipsRow: {
    flexDirection: 'row', gap: 6,
    paddingHorizontal: 8, paddingVertical: 6,
    backgroundColor: '#f9fafb',
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  chip: {
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white,
    borderRadius: Radius.sm,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  chipText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },

  keys: { padding: 6, gap: 4 },
  keyRow: { flexDirection: 'row', gap: 4 },
  key: {
    flex: 1, height: 42, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  keyOp: { backgroundColor: '#eaf1fb', borderColor: Colors.light },
  keyEq: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  keyCtrl: { backgroundColor: '#fdecea', borderColor: '#f5c6c1' },
  keyText: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  keyTextOp: { color: Colors.primary },
  keyTextEq: { color: Colors.white, fontSize: 18 },
  keyTextCtrl: { color: Colors.danger },

  // Historial completo
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  historyCard: {
    width: '100%', maxWidth: 340, maxHeight: '70%',
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.card,
    overflow: 'hidden',
  },
  historyHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  historyTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  historyClearBtn: { padding: 4 },
  historyCloseBtn: { padding: 4 },
  historyList: { padding: 8 },
  historyEmpty: { textAlign: 'center', padding: 24, color: Colors.textMuted },
  historyItem: {
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  historyExpr: { fontSize: 13, color: Colors.textSecondary },
  historyResult: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, textAlign: 'right' },
});
