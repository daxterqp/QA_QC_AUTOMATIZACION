import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  TilePreset,
  DEFAULT_TILES,
  DEFAULT_TILE_JOINT_MM,
  DEFAULT_TILE_WASTE_PCT,
} from '@config/tiles';
import {
  getAllTiles,
  addCustomTile,
  removeCustomTile,
  calcTilesForFloor,
  TileCalcState,
} from '@services/MetradosService';
import { Colors, Radius, Shadow } from '../theme/colors';
import { useI18n } from '@i18n/index';

const TILE_COLOR = '#e67e22'; // naranja tierra

type Props = {
  visible: boolean;
  area?: number;              // m² (trazo cerrado o polígono)
  initialState?: TileCalcState;
  onSave: (state: TileCalcState) => void;
  onClose: () => void;
};

export default function TileCalculatorModal({
  visible,
  area,
  initialState,
  onSave,
  onClose,
}: Props) {
  const { t } = useI18n();
  const DEFAULT_TILE_ID = 'c4545'; // 45×45 cm — el más común en pisos peruanos

  const [tiles, setTiles] = useState<TilePreset[]>(DEFAULT_TILES);
  const [tileId, setTileId] = useState<string>(initialState?.tileId || DEFAULT_TILE_ID);
  const [jointInput, setJointInput] = useState<string>(
    String(initialState?.jointMm ?? DEFAULT_TILE_JOINT_MM)
  );
  const [wasteInput, setWasteInput] = useState<string>(
    String(initialState?.wastePct ?? DEFAULT_TILE_WASTE_PCT)
  );
  const [showTileDropdown, setShowTileDropdown] = useState(false);
  const [showAddTile, setShowAddTile] = useState(false);
  const [newName, setNewName] = useState('');
  const [newL, setNewL] = useState('');
  const [newW, setNewW] = useState('');

  useEffect(() => {
    if (visible) {
      getAllTiles().then(setTiles);
      if (initialState) {
        setTileId(initialState.tileId);
        setJointInput(String(initialState.jointMm));
        setWasteInput(String(initialState.wastePct));
      }
    }
  }, [visible, initialState]);

  const parseNum = (s: string): number => {
    const n = parseFloat(s.replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };

  const selectedTile = useMemo(
    () => tiles.find((t) => t.id === tileId) || DEFAULT_TILES.find((t) => t.id === DEFAULT_TILE_ID) || DEFAULT_TILES[0],
    [tiles, tileId]
  );

  const jointMm = parseNum(jointInput);
  const wastePct = parseNum(wasteInput);
  const floorArea = area ?? 0;

  const result = useMemo(
    () =>
      calcTilesForFloor({
        floorArea,
        tile: selectedTile,
        jointMm,
        wastePct,
      }),
    [floorArea, selectedTile, jointMm, wastePct]
  );

  const handleSave = () => {
    if (floorArea <= 0) {
      Alert.alert(t('tileCalc.noArea.title'), t('tileCalc.noArea.msg'));
      return;
    }
    const state: TileCalcState = {
      tileId: selectedTile.id,
      jointMm,
      wastePct,
      floorArea,
      totalTiles: result.totalTiles,
      perM2: result.perM2,
      savedAt: Date.now(),
    };
    onSave(state);
  };

  const handleAddCustomTile = async () => {
    const name = newName.trim();
    const L = parseNum(newL);
    const W = parseNum(newW);
    if (!name || L <= 0 || W <= 0) {
      Alert.alert(t('tileCalc.invalid.title'), t('tileCalc.invalid.msg'));
      return;
    }
    const added = await addCustomTile({
      name,
      length: L,
      width: W,
      wastePctDefault: DEFAULT_TILE_WASTE_PCT,
    });
    const fresh = await getAllTiles();
    setTiles(fresh);
    setTileId(added.id);
    setNewName('');
    setNewL('');
    setNewW('');
    setShowAddTile(false);
  };

  const handleDeleteCustom = (id: string, name: string) => {
    Alert.alert(t('tileCalc.delete.title'), t('tileCalc.delete.msg', { name }), [
      { text: t('tileCalc.cancel'), style: 'cancel' },
      {
        text: t('tileCalc.delete.confirm'),
        style: 'destructive',
        onPress: async () => {
          await removeCustomTile(id);
          const fresh = await getAllTiles();
          setTiles(fresh);
          if (tileId === id) setTileId(DEFAULT_TILE_ID);
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <MaterialCommunityIcons name="checkerboard" size={22} color={TILE_COLOR} />
            <Text style={styles.title}>{t('tileCalc.title')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.headerClose}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            {/* Área base */}
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>{t('tileCalc.areaToCover')}</Text>
              <Text style={styles.infoValue}>{floorArea.toFixed(2)} m²</Text>
            </View>

            {/* Selector de loceta */}
            <Text style={styles.label}>{t('tileCalc.tileSize')}</Text>
            <TouchableOpacity
              style={styles.dropdown}
              onPress={() => setShowTileDropdown((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={styles.dropdownText} numberOfLines={1}>
                {selectedTile.name}{' '}
                <Text style={styles.dropdownDim}>
                  ({selectedTile.length}×{selectedTile.width} cm)
                </Text>
              </Text>
              <Ionicons
                name={showTileDropdown ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.textSecondary}
              />
            </TouchableOpacity>
            {showTileDropdown && (
              <View style={styles.dropdownMenu}>
                {tiles.map((t) => (
                  <View key={t.id} style={styles.dropdownItemRow}>
                    <TouchableOpacity
                      style={[
                        styles.dropdownItem,
                        tileId === t.id && styles.dropdownItemActive,
                      ]}
                      onPress={() => {
                        setTileId(t.id);
                        setShowTileDropdown(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          tileId === t.id && styles.dropdownItemTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {t.name}{' '}
                        <Text style={styles.dropdownDim}>
                          ({t.length}×{t.width})
                        </Text>
                      </Text>
                    </TouchableOpacity>
                    {t.isCustom && (
                      <TouchableOpacity
                        style={styles.dropdownDelete}
                        onPress={() => handleDeleteCustom(t.id, t.name)}
                      >
                        <Ionicons name="trash-outline" size={14} color={Colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.dropdownAdd}
                  onPress={() => {
                    setShowTileDropdown(false);
                    setShowAddTile(true);
                  }}
                >
                  <Ionicons name="add-circle-outline" size={16} color={Colors.primary} />
                  <Text style={styles.dropdownAddText}>{t('tileCalc.addCustom')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {showAddTile && (
              <View style={styles.addCard}>
                <Text style={styles.addTitle}>{t('tileCalc.newTile')}</Text>
                <TextInput
                  style={styles.inputFull}
                  placeholder={t('tileCalc.namePlaceholder')}
                  placeholderTextColor={Colors.textMuted}
                  value={newName}
                  onChangeText={setNewName}
                />
                <View style={styles.row3}>
                  <TextInput
                    style={styles.inputSmall}
                    placeholder={t('tileCalc.lengthPlaceholder')}
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="decimal-pad"
                    value={newL}
                    onChangeText={setNewL}
                  />
                  <TextInput
                    style={styles.inputSmall}
                    placeholder={t('tileCalc.widthPlaceholder')}
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="decimal-pad"
                    value={newW}
                    onChangeText={setNewW}
                  />
                </View>
                <View style={styles.addActions}>
                  <TouchableOpacity
                    style={[styles.borderBtn, { borderColor: Colors.danger }]}
                    onPress={() => setShowAddTile(false)}
                  >
                    <Text style={[styles.borderBtnText, { color: Colors.danger }]}>{t('tileCalc.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.borderBtn, { borderColor: Colors.success }]}
                    onPress={handleAddCustomTile}
                  >
                    <Text style={[styles.borderBtnText, { color: Colors.success }]}>{t('tileCalc.add')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Junta / desperdicio */}
            <View style={styles.grid}>
              <View style={styles.cell}>
                <Text style={styles.label}>{t('tileCalc.joint')}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={jointInput}
                  onChangeText={setJointInput}
                  placeholder="2"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              <View style={styles.cell}>
                <Text style={styles.label}>{t('tileCalc.waste')}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={wasteInput}
                  onChangeText={setWasteInput}
                  placeholder="8"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            </View>

            {/* Resultado */}
            <View style={styles.resultCard}>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>{t('tileCalc.tilesPerM2')}</Text>
                <Text style={styles.resultValue}>{result.perM2.toFixed(1)}</Text>
              </View>
              <View style={[styles.resultRow, styles.resultTotal]}>
                <Text style={styles.resultTotalLabel}>{t('tileCalc.totalWithWaste', { wastePct })}</Text>
                <Text style={styles.resultTotalValue}>{t('tileCalc.units', { count: result.totalTiles })}</Text>
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={[styles.borderBtn, { borderColor: Colors.danger, flex: 1 }]} onPress={onClose}>
              <Ionicons name="close" size={16} color={Colors.danger} />
              <Text style={[styles.borderBtnText, { color: Colors.danger }]}>{t('tileCalc.close')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.borderBtn, { borderColor: Colors.success, flex: 1 }]} onPress={handleSave}>
              <Ionicons name="checkmark" size={16} color={Colors.success} />
              <Text style={[styles.borderBtnText, { color: Colors.success }]}>{t('tileCalc.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  backdropTouch: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingBottom: 16,
    maxHeight: '92%',
    ...Shadow.card,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border,
    alignSelf: 'center', marginTop: 8, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  headerClose: { padding: 4 },
  body: { paddingHorizontal: 16, paddingTop: 12 },

  infoBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 12,
  },
  infoLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  infoValue: { fontSize: 16, fontWeight: '700', color: TILE_COLOR },

  label: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 4 },
  dropdown: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, height: 42,
  },
  dropdownText: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  dropdownDim: { color: Colors.textMuted, fontWeight: '500' },
  dropdownMenu: {
    marginTop: 4, backgroundColor: Colors.white,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    ...Shadow.subtle, paddingVertical: 4,
  },
  dropdownItemRow: { flexDirection: 'row', alignItems: 'center' },
  dropdownItem: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  dropdownItemActive: { backgroundColor: Colors.surface },
  dropdownItemText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  dropdownItemTextActive: { color: Colors.primary },
  dropdownDelete: { paddingHorizontal: 12, paddingVertical: 10 },
  dropdownAdd: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  dropdownAddText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  addCard: {
    marginTop: 10, padding: 12, backgroundColor: Colors.surface,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    gap: 8,
  },
  addTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  inputFull: {
    backgroundColor: Colors.white, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 10, height: 38, fontSize: 14, color: Colors.textPrimary,
  },
  row3: { flexDirection: 'row', gap: 6 },
  inputSmall: {
    flex: 1, backgroundColor: Colors.white, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 8, height: 38, fontSize: 14,
    color: Colors.textPrimary, textAlign: 'center',
  },
  addActions: { flexDirection: 'row', gap: 8, marginTop: 4 },

  grid: {
    marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  cell: { flex: 1, minWidth: 100 },
  input: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, height: 40, fontSize: 15, fontWeight: '600',
    color: Colors.textPrimary, textAlign: 'center',
  },

  resultCard: {
    marginTop: 16, marginBottom: 12, padding: 14,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    gap: 6,
  },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  resultValue: { fontSize: 14, color: Colors.textPrimary, fontWeight: '700' },
  resultTotal: { marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.divider },
  resultTotalLabel: { fontSize: 13, color: Colors.textPrimary, fontWeight: '700' },
  resultTotalValue: { fontSize: 20, color: TILE_COLOR, fontWeight: '900' },

  footer: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  borderBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderRadius: Radius.md,
    paddingHorizontal: 16, height: 42,
  },
  borderBtnText: { fontSize: 14, fontWeight: '700' },
});
