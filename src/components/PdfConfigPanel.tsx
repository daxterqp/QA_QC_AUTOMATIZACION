/**
 * PdfConfigPanel (v100) — Controles de configuración del PDF para UN tipo de
 * ensayo (idProtocolo). Extraído del editor por-tipo de DossierScreen para
 * poder incrustarlo también en la VISTA PREVIA del ensayo único, y ajustar la
 * config viendo el resultado en vivo. La config aplica a TODOS los ensayos de
 * ese tipo (print_configs[idProtocolo]).
 *
 * Es "controlado": recibe la config resuelta (`cfg`) y notifica cambios con
 * `onCfg`/`onCroquis`; el padre decide persistir y/o regenerar el PDF.
 */
import React from 'react';
import { View, Text, Switch, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '../theme/colors';
import { useI18n } from '@i18n/index';
import {
  PRINT_HEADER_FIELDS, CROQUIS_MAP_TYPES, CROQUIS_PLACEMENTS,
  type TemplatePrintConfig, type CroquisConfig,
  type PrintFontLevel, type PrintGraphSize, type PrintHeaderSize,
} from '@utils/featureFlags';

export default function PdfConfigPanel({
  cfg, onCfg, onCroquis,
}: {
  cfg: Required<TemplatePrintConfig>;
  onCfg: (patch: Partial<TemplatePrintConfig>) => void;
  onCroquis: (patch: Partial<CroquisConfig>) => void;
}) {
  const { t } = useI18n();
  const c = cfg;
  return (
    <View style={styles.pcType}>
      <View style={styles.pcRow}><Text style={styles.pcLabel}>{t('dossier.twoColumns')}</Text><Switch value={c.two_column} onValueChange={v => onCfg({ two_column: v })} /></View>
      <Text style={styles.pcLabel}>{t('dossier.tableFont')}</Text>
      <View style={styles.pcSeg}>
        {(['normal', 'compact', 'xcompact'] as PrintFontLevel[]).map(lv => (
          <TouchableOpacity key={lv} style={[styles.pcSegBtn, c.font_level === lv && styles.pcSegBtnOn]} onPress={() => onCfg({ font_level: lv })}>
            <Text style={[styles.pcSegText, c.font_level === lv && styles.pcSegTextOn]}>{lv === 'normal' ? t('dossier.sizeNormal') : lv === 'compact' ? t('dossier.sizeCompact') : t('dossier.sizeXCompact')}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.pcLabel}>{t('dossier.graphSize')}</Text>
      <View style={styles.pcSeg}>
        {(['normal', 'compact', 'xcompact'] as PrintGraphSize[]).map(sz => (
          <TouchableOpacity key={sz} style={[styles.pcSegBtn, c.graph_size === sz && styles.pcSegBtnOn]} onPress={() => onCfg({ graph_size: sz })}>
            <Text style={[styles.pcSegText, c.graph_size === sz && styles.pcSegTextOn]}>{sz === 'normal' ? t('dossier.sizeNormal') : sz === 'compact' ? t('dossier.sizeCompact') : t('dossier.sizeXCompact')}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {/* Presupuesto por columna + QR arriba (los knobs más usados al afinar en vivo). */}
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
          onChangeText={(text) => {
            const n = parseInt(text, 10);
            if (Number.isFinite(n)) onCfg({ col_budget: n });
          }}
        />
      </View>
      <View style={styles.pcRow}><Text style={styles.pcLabel}>{t('dossier.showQr')}</Text><Switch value={c.show_qr} onValueChange={v => onCfg({ show_qr: v })} /></View>
      <View style={styles.pcRow}><Text style={styles.pcLabel}>{t('dossier.includePhotoPanels')}</Text><Switch value={c.show_photos} onValueChange={v => onCfg({ show_photos: v })} /></View>
      <Text style={styles.pcLabel}>{t('dossier.headerRows')}</Text>
      <View style={styles.pcSeg}>
        {(['normal', 'compact', 'xcompact'] as PrintHeaderSize[]).map(hs => (
          <TouchableOpacity key={hs} style={[styles.pcSegBtn, c.header_size === hs && styles.pcSegBtnOn]} onPress={() => onCfg({ header_size: hs })}>
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
            const next = PRINT_HEADER_FIELDS.map(x => x.key).filter(k => want.includes(k));
            onCfg({ header_fields: next });
          }}>
            <Ionicons name={sel ? 'checkbox' : 'square-outline'} size={18} color={sel ? Colors.primary : Colors.textMuted} />
            <Text style={styles.pcFieldLabel}>{f.label}</Text>
          </TouchableOpacity>
        );
      })}
      <View style={styles.pcRow}><Text style={styles.pcLabel}>{t('dossier.splitTables')}</Text><Switch value={c.split_tables} onValueChange={v => onCfg({ split_tables: v })} /></View>

      {/* Croquis (mapa con sectores + ensayo ploteado) */}
      <View style={styles.pcDivider} />
      <View style={styles.pcRow}><Text style={styles.pcLabel}>{t('dossier.croquisToggle')}</Text><Switch value={c.croquis.show} onValueChange={v => onCroquis({ show: v })} /></View>
      {c.croquis.show ? (
        <>
          <Text style={styles.pcLabel}>{t('dossier.mapLayer')}</Text>
          <View style={styles.pcSeg}>
            {CROQUIS_MAP_TYPES.map(mt => (
              <TouchableOpacity key={mt.value} style={[styles.pcSegBtn, c.croquis.map_type === mt.value && styles.pcSegBtnOn]} onPress={() => onCroquis({ map_type: mt.value })}>
                <Text style={[styles.pcSegText, c.croquis.map_type === mt.value && styles.pcSegTextOn]}>{mt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.pcLabel}>{t('dossier.pdfPlacement')}</Text>
          <View style={styles.pcSeg}>
            {CROQUIS_PLACEMENTS.map(pl => (
              <TouchableOpacity key={pl.value} style={[styles.pcSegBtn, c.croquis.placement === pl.value && styles.pcSegBtnOn]} onPress={() => onCroquis({ placement: pl.value })}>
                <Text style={[styles.pcSegText, c.croquis.placement === pl.value && styles.pcSegTextOn]}>{pl.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.pcRow}><Text style={styles.pcLabel}>Mapa completo (leyenda debajo)</Text><Switch value={c.croquis.full_width} onValueChange={v => onCroquis({ full_width: v })} /></View>
          <View style={styles.pcRow}><Text style={styles.pcLabel}>{t('dossier.overlayOrthophoto')}</Text><Switch value={c.croquis.show_orthophoto} onValueChange={v => onCroquis({ show_orthophoto: v })} /></View>
          <Text style={styles.pcLabel}>{t('dossier.dimBaseLayer', { pct: Math.round(c.croquis.base_opacity * 100) })}</Text>
          <View style={styles.pcSeg}>
            {[1, 0.8, 0.6, 0.4].map(op => (
              <TouchableOpacity key={op} style={[styles.pcSegBtn, Math.abs(c.croquis.base_opacity - op) < 0.01 && styles.pcSegBtnOn]} onPress={() => onCroquis({ base_opacity: op })}>
                <Text style={[styles.pcSegText, Math.abs(c.croquis.base_opacity - op) < 0.01 && styles.pcSegTextOn]}>{Math.round(op * 100)}%</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.pcLabel}>{t('dossier.testIconSize', { size: c.croquis.point_size })}</Text>
          <View style={styles.pcSeg}>
            {[10, 14, 18, 24, 30].map(sz => (
              <TouchableOpacity key={sz} style={[styles.pcSegBtn, c.croquis.point_size === sz && styles.pcSegBtnOn]} onPress={() => onCroquis({ point_size: sz })}>
                <Text style={[styles.pcSegText, c.croquis.point_size === sz && styles.pcSegTextOn]}>{sz}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pcType: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: 12, gap: 10 },
  pcDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 2 },
  pcBudgetHint: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  pcNumInput: { width: 56, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingVertical: 6, paddingHorizontal: 8, textAlign: 'center', fontSize: 15, fontWeight: '800', color: Colors.navy, backgroundColor: Colors.white },
  pcRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pcLabel: { fontSize: 13, color: Colors.textPrimary, flexShrink: 1 },
  pcSeg: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pcSegBtn: { flexGrow: 1, minWidth: 52, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  pcSegBtnOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pcSegText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  pcSegTextOn: { color: Colors.white },
  pcFieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  pcFieldLabel: { fontSize: 13, color: Colors.textPrimary },
});
