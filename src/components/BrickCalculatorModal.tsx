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
  BrickPreset,
  DEFAULT_BRICKS,
  DEFAULT_MORTAR_JOINT_CM,
  DEFAULT_WASTE_PCT,
} from '@config/bricks';
import {
  getAllBricks,
  addCustomBrick,
  removeCustomBrick,
  calcBricksForWall,
  wallAreaFromPerimeter,
  BrickCalcState,
  BrickOrientation,
} from '@services/MetradosService';
import { Colors, Radius, Shadow } from '../theme/colors';
import { useI18n } from '@i18n/index';

type Props = {
  visible: boolean;
  kind: 'polyline' | 'polygon';
  perimeter?: number;
  area?: number;
  initialState?: BrickCalcState;
  onSave: (state: BrickCalcState) => void;
  onClose: () => void;
};

export default function BrickCalculatorModal({
  visible,
  kind,
  perimeter,
  area,
  initialState,
  onSave,
  onClose,
}: Props) {
  const { t } = useI18n();
  const [bricks, setBricks] = useState<BrickPreset[]>(DEFAULT_BRICKS);
  const [brickId, setBrickId] = useState<string>(initialState?.brickId || DEFAULT_BRICKS[0].id);
  const [heightInput, setHeightInput] = useState<string>(
    initialState?.heightM != null ? String(initialState.heightM) : '2.40'
  );
  const [jointInput, setJointInput] = useState<string>(
    String(initialState?.jointCm ?? DEFAULT_MORTAR_JOINT_CM)
  );
  const [wasteInput, setWasteInput] = useState<string>(
    String(initialState?.wastePct ?? DEFAULT_WASTE_PCT)
  );
  const [orientation, setOrientation] = useState<BrickOrientation>(initialState?.orientation ?? 'soga');
  const [showBrickDropdown, setShowBrickDropdown] = useState(false);
  const [showAddBrick, setShowAddBrick] = useState(false);
  const [newName, setNewName] = useState('');
  const [newL, setNewL] = useState('');
  const [newW, setNewW] = useState('');
  const [newH, setNewH] = useState('');

  useEffect(() => {
    if (visible) {
      getAllBricks().then(setBricks);
      if (initialState) {
        setBrickId(initialState.brickId);
        setHeightInput(initialState.heightM != null ? String(initialState.heightM) : '2.40');
        setJointInput(String(initialState.jointCm));
        setWasteInput(String(initialState.wastePct));
        setOrientation(initialState.orientation ?? 'soga');
      }
    }
  }, [visible, initialState]);

  const parseNum = (s: string): number => {
    const n = parseFloat(s.replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };

  const selectedBrick = useMemo(
    () => bricks.find((b) => b.id === brickId) || DEFAULT_BRICKS[0],
    [bricks, brickId]
  );

  const heightM = parseNum(heightInput);
  const jointCm = parseNum(jointInput);
  const wastePct = parseNum(wasteInput);

  const wallArea = useMemo(() => {
    if (kind === 'polygon' && area != null) return area;
    if (kind === 'polyline' && perimeter != null) return wallAreaFromPerimeter(perimeter, heightM);
    return 0;
  }, [kind, area, perimeter, heightM]);

  const result = useMemo(
    () =>
      calcBricksForWall({
        wallArea,
        brick: selectedBrick,
        jointCm,
        wastePct,
        orientation,
      }),
    [wallArea, selectedBrick, jointCm, wastePct, orientation]
  );

  const handleSave = () => {
    if (wallArea <= 0) {
      Alert.alert(t('brickCalc.alert.incompleteTitle'), t('brickCalc.alert.incompleteMsg'));
      return;
    }
    const state: BrickCalcState = {
      brickId: selectedBrick.id,
      heightM: kind === 'polyline' ? heightM : undefined,
      jointCm,
      wastePct,
      orientation,
      totalBricks: result.totalBricks,
      perM2: result.perM2,
      wallArea,
      savedAt: Date.now(),
    };
    onSave(state);
  };

  const handleAddCustomBrick = async () => {
    const name = newName.trim();
    const L = parseNum(newL);
    const W = parseNum(newW);
    const H = parseNum(newH);
    if (!name || L <= 0 || W <= 0 || H <= 0) {
      Alert.alert(t('brickCalc.alert.invalidTitle'), t('brickCalc.alert.invalidMsg'));
      return;
    }
    const added = await addCustomBrick({
      name,
      length: L,
      width: W,
      height: H,
      wastePctDefault: DEFAULT_WASTE_PCT,
    });
    const fresh = await getAllBricks();
    setBricks(fresh);
    setBrickId(added.id);
    setNewName('');
    setNewL('');
    setNewW('');
    setNewH('');
    setShowAddBrick(false);
  };

  const handleDeleteCustom = (id: string, name: string) => {
    Alert.alert(t('brickCalc.alert.deleteTitle'), t('brickCalc.alert.deleteMsg', { name }), [
      { text: t('brickCalc.alert.cancel'), style: 'cancel' },
      {
        text: t('brickCalc.alert.delete'),
        style: 'destructive',
        onPress: async () => {
          await removeCustomBrick(id);
          const fresh = await getAllBricks();
          setBricks(fresh);
          if (brickId === id) setBrickId(DEFAULT_BRICKS[0].id);
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
            <MaterialCommunityIcons name="wall" size={22} color={Colors.danger} />
            <Text style={styles.title}>{t('brickCalc.title')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.headerClose}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            {/* Selector de ladrillo */}
            <Text style={styles.label}>{t('brickCalc.brickType')}</Text>
            <TouchableOpacity
              style={styles.dropdown}
              onPress={() => setShowBrickDropdown((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={styles.dropdownText} numberOfLines={1}>
                {selectedBrick.name}{' '}
                <Text style={styles.dropdownDim}>
                  ({selectedBrick.length}×{selectedBrick.width}×{selectedBrick.height} cm)
                </Text>
              </Text>
              <Ionicons
                name={showBrickDropdown ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.textSecondary}
              />
            </TouchableOpacity>
            {showBrickDropdown && (
              <View style={styles.dropdownMenu}>
                {bricks.map((b) => (
                  <View key={b.id} style={styles.dropdownItemRow}>
                    <TouchableOpacity
                      style={[
                        styles.dropdownItem,
                        brickId === b.id && styles.dropdownItemActive,
                      ]}
                      onPress={() => {
                        setBrickId(b.id);
                        setShowBrickDropdown(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          brickId === b.id && styles.dropdownItemTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {b.name}{' '}
                        <Text style={styles.dropdownDim}>
                          ({b.length}×{b.width}×{b.height})
                        </Text>
                      </Text>
                    </TouchableOpacity>
                    {b.isCustom && (
                      <TouchableOpacity
                        style={styles.dropdownDelete}
                        onPress={() => handleDeleteCustom(b.id, b.name)}
                      >
                        <Ionicons name="trash-outline" size={14} color={Colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.dropdownAdd}
                  onPress={() => {
                    setShowBrickDropdown(false);
                    setShowAddBrick(true);
                  }}
                >
                  <Ionicons name="add-circle-outline" size={16} color={Colors.primary} />
                  <Text style={styles.dropdownAddText}>{t('brickCalc.addCustom')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {showAddBrick && (
              <View style={styles.addCard}>
                <Text style={styles.addTitle}>{t('brickCalc.newBrick')}</Text>
                <TextInput
                  style={styles.inputFull}
                  placeholder={t('brickCalc.field.name')}
                  placeholderTextColor={Colors.textMuted}
                  value={newName}
                  onChangeText={setNewName}
                />
                <View style={styles.row3}>
                  <TextInput
                    style={styles.inputSmall}
                    placeholder={t('brickCalc.field.length')}
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="decimal-pad"
                    value={newL}
                    onChangeText={setNewL}
                  />
                  <TextInput
                    style={styles.inputSmall}
                    placeholder={t('brickCalc.field.width')}
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="decimal-pad"
                    value={newW}
                    onChangeText={setNewW}
                  />
                  <TextInput
                    style={styles.inputSmall}
                    placeholder={t('brickCalc.field.height')}
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="decimal-pad"
                    value={newH}
                    onChangeText={setNewH}
                  />
                </View>
                <View style={styles.addActions}>
                  <TouchableOpacity
                    style={[styles.borderBtn, { borderColor: Colors.danger }]}
                    onPress={() => setShowAddBrick(false)}
                  >
                    <Text style={[styles.borderBtnText, { color: Colors.danger }]}>{t('brickCalc.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.borderBtn, { borderColor: Colors.success }]}
                    onPress={handleAddCustomBrick}
                  >
                    <Text style={[styles.borderBtnText, { color: Colors.success }]}>{t('brickCalc.add')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Orientación */}
            <Text style={[styles.label, { marginTop: 14 }]}>{t('brickCalc.placement')}</Text>
            <View style={styles.orientationRow}>
              {(
                [
                  { key: 'soga', title: t('brickCalc.orient.soga.title'), subtitle: t('brickCalc.orient.soga.sub') },
                  { key: 'cabeza', title: t('brickCalc.orient.cabeza.title'), subtitle: t('brickCalc.orient.cabeza.sub') },
                  { key: 'canto', title: t('brickCalc.orient.canto.title'), subtitle: t('brickCalc.orient.canto.sub') },
                ] as { key: BrickOrientation; title: string; subtitle: string }[]
              ).map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.orientationOpt, orientation === opt.key && styles.orientationOptActive]}
                  onPress={() => setOrientation(opt.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.orientationTitle, orientation === opt.key && styles.orientationTitleActive]}>
                    {opt.title}
                  </Text>
                  <Text style={[styles.orientationSub, orientation === opt.key && styles.orientationSubActive]}>
                    {opt.subtitle}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Medidas */}
            <View style={[styles.grid, { marginTop: 14 }]}>
              {kind === 'polyline' && (
                <View style={styles.cell}>
                  <Text style={styles.label}>{t('brickCalc.wallHeight')}</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="decimal-pad"
                    value={heightInput}
                    onChangeText={setHeightInput}
                    placeholder="2.40"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
              )}
              <View style={styles.cell}>
                <Text style={styles.label}>{t('brickCalc.joint')}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={jointInput}
                  onChangeText={setJointInput}
                  placeholder="1.5"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              <View style={styles.cell}>
                <Text style={styles.label}>{t('brickCalc.waste')}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={wasteInput}
                  onChangeText={setWasteInput}
                  placeholder="5"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            </View>

            {/* Resultado */}
            <View style={styles.resultCard}>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>{t('brickCalc.result.wallArea')}</Text>
                <Text style={styles.resultValue}>{wallArea.toFixed(2)} m²</Text>
              </View>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>{t('brickCalc.result.perM2')}</Text>
                <Text style={styles.resultValue}>{result.perM2.toFixed(1)}</Text>
              </View>
              <View style={[styles.resultRow, styles.resultTotal]}>
                <Text style={styles.resultTotalLabel}>{t('brickCalc.result.total', { wastePct })}</Text>
                <Text style={styles.resultTotalValue}>{t('brickCalc.result.units', { count: result.totalBricks })}</Text>
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={[styles.borderBtn, { borderColor: Colors.danger, flex: 1 }]} onPress={onClose}>
              <Ionicons name="close" size={16} color={Colors.danger} />
              <Text style={[styles.borderBtnText, { color: Colors.danger }]}>{t('brickCalc.close')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.borderBtn, { borderColor: Colors.success, flex: 1 }]} onPress={handleSave}>
              <Ionicons name="checkmark" size={16} color={Colors.success} />
              <Text style={[styles.borderBtnText, { color: Colors.success }]}>{t('brickCalc.save')}</Text>
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

  orientationRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  orientationOpt: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 8,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    backgroundColor: Colors.surface, alignItems: 'center', gap: 2,
  },
  orientationOptActive: { borderColor: Colors.primary, backgroundColor: '#eef2fa' },
  orientationTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  orientationTitleActive: { color: Colors.primary },
  orientationSub: { fontSize: 10, color: Colors.textMuted, fontWeight: '600' },
  orientationSubActive: { color: Colors.primary },
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
  resultTotalValue: { fontSize: 18, color: Colors.danger, fontWeight: '900' },

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
