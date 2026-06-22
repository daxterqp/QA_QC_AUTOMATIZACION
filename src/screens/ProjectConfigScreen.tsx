/**
 * ProjectConfigScreen — Configuración de módulos del proyecto (v29).
 *
 * Solo 3 secciones:
 *  1. Configuración de Protocolos
 *  2. Módulo de Trazabilidad (padre + hijos)
 *  3. Módulo de Geolocalización (padre + hijos)
 *
 * Los hijos quedan en gris / no clickeables si su padre está OFF, pero se
 * preserva su valor en state para no perder configuración.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppHeader from '@components/AppHeader';
import { Colors, Radius } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import { useAuth } from '@context/AuthContext';
import { DEFAULT_FEATURE_FLAGS, parseFeatureFlagsJson, type ProjectFeatureFlags, type CoordinateSystem } from '@utils/featureFlags';
import { validateMask, buildProtocolCode } from '@utils/protocolCode';
import { supabase } from '@config/supabase';
import { Q } from '@nozbe/watermelondb';
import { database, projectsCollection, protocolTemplatesCollection } from '@db/index';
import { useTourStep } from '@hooks/useTourStep';
import { useTour } from '@context/TourContext';
import { useI18n } from '@i18n/index';

type Props = NativeStackScreenProps<RootStackParamList, 'ProjectConfig'>;

const COORD_SYSTEMS: { value: CoordinateSystem; labelKey: string }[] = [
  { value: 'WGS84_LATLNG',  labelKey: 'projectConfig.coordWgs84LatLng' },
  { value: 'WGS84_UTM',     labelKey: 'projectConfig.coordWgs84Utm' },
  { value: 'PSAD56_LATLNG', labelKey: 'projectConfig.coordPsad56LatLng' },
  { value: 'PSAD56_UTM',    labelKey: 'projectConfig.coordPsad56Utm' },
];

const GPS_POLLING_OPTIONS: { value: 'off' | 'foreground' | 'background'; labelKey: string }[] = [
  { value: 'off',        labelKey: 'projectConfig.gpsPollingOff' },
  { value: 'foreground', labelKey: 'projectConfig.gpsPollingForeground' },
  { value: 'background', labelKey: 'projectConfig.gpsPollingBackground' },
];

export default function ProjectConfigScreen({ route, navigation }: Props) {
  const { projectId, projectName } = route.params;
  const { currentUser } = useAuth();
  const { t } = useI18n();
  const isCreator = currentUser?.role === 'CREATOR';
  const insets = useSafeAreaInsets();

  const [flags, setFlags] = useState<ProjectFeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [mapTileUrl, setMapTileUrl] = useState<string>('');
  const [sampleIdentifier, setSampleIdentifier] = useState<string>(''); // v43 — id de muestras
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // v46.1 — tipos de ensayo del proyecto (para la máscara por tipo) + UI colapsable.
  const [testTypes, setTestTypes] = useState<{ tipo: string; name: string }[]>([]);
  const [showPerType, setShowPerType] = useState(false);

  const { jumpToStep, isActive: tourActive, isContextual, dismissTour } = useTour();
  const configProtocolsRef = useTourStep('config_protocols');
  const configTraceabilityRef = useTourStep('config_traceability');
  const configGeoRef = useTourStep('config_geo');
  const configSaveRef = useTourStep('config_save');

  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      if (tourActive && isContextual) dismissTour();
    });
    return unsub;
  }, [navigation, tourActive, isContextual, dismissTour]);

  useEffect(() => {
    if (!isCreator) {
      Alert.alert(t('projectConfig.restrictedTitle'), t('projectConfig.restrictedMsg'), [
        { text: t('projectConfig.ok'), onPress: () => navigation.goBack() },
      ]);
      return;
    }
    (async () => {
      try {
        // v43 FIX — Las columnas base (feature_flags, map_tile_url) SIEMPRE existen.
        // `sample_identifier` (v46) puede no existir aún: si se incluye en este select y
        // la columna falta, Supabase devuelve error → data=null → los flags NUNCA se
        // cargaban y la config se veía "en blanco" aunque sí estaban guardados. Por eso
        // va en una consulta SEPARADA y tolerante.
        const { data } = await supabase
          .from('projects')
          .select('feature_flags, map_tile_url')
          .eq('id', projectId)
          .single();
        if (data) {
          const ff = data.feature_flags ?? null;
          const raw: ProjectFeatureFlags = typeof ff === 'string'
            ? parseFeatureFlagsJson(ff)
            : ff && typeof ff === 'object'
              ? { ...DEFAULT_FEATURE_FLAGS, ...ff }
              : DEFAULT_FEATURE_FLAGS;
          // v29 — Los @deprecated son SIEMPRE true (parte del funcionamiento estándar).
          // Proyectos legacy pueden tenerlos en false; normalizamos al cargar.
          setFlags({
            ...raw,
            plans_pdf: true, advanced_charts: true, normas: true,
            phone_contacts: true, qr_codes: true, protocol_linking: true,
          });
          setMapTileUrl(data.map_tile_url ?? '');
        }
        // sample_identifier — best-effort (no rompe la carga si falta la columna v46).
        try {
          const { data: sid } = await supabase.from('projects').select('sample_identifier').eq('id', projectId).single();
          if (sid) setSampleIdentifier((sid as any).sample_identifier ?? '');
        } catch { /* columna v46 ausente */ }
        // v46.1 — tipos de ensayo locales (id_protocolo) para la máscara por tipo.
        try {
          const tmpls = await protocolTemplatesCollection
            .query(Q.where('project_id', projectId), Q.where('is_hidden', Q.notEq(true)))
            .fetch();
          const byTipo = new Map<string, string>();
          for (const t of tmpls as any[]) {
            const tipo = (t.idProtocolo ?? '').trim();
            if (tipo && !byTipo.has(tipo)) byTipo.set(tipo, (t.name ?? tipo).trim());
          }
          setTestTypes([...byTipo.entries()].map(([tipo, name]) => ({ tipo, name })).sort((a, b) => a.tipo.localeCompare(b.tipo)));
        } catch { /* sin templates locales */ }
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, isCreator, navigation]);

  const setFlag = <K extends keyof ProjectFeatureFlags>(key: K, value: ProjectFeatureFlags[K]) =>
    setFlags(prev => ({ ...prev, [key]: value }));
  const toggleFlag = (key: keyof ProjectFeatureFlags) =>
    setFlags(prev => ({ ...prev, [key]: !prev[key] }));

  const handleSave = async () => {
    // v31 — Una máscara inválida generaría códigos colisionantes: bloquear el guardado.
    if (flags.protocol_codes) {
      const maskErrors = validateMask(flags.coding_mask_default);
      // v46.1 — validar también las máscaras por tipo (una inválida colisionaría).
      for (const [tipo, m] of Object.entries(flags.coding_mask_by_type ?? {})) {
        validateMask(m).forEach(e => maskErrors.push(`${tipo}: ${e}`));
      }
      if (maskErrors.length > 0) {
        Alert.alert(t('projectConfig.invalidMaskTitle'), maskErrors.join('\n'));
        return;
      }
    }
    setSaving(true);
    try {
      // Forzar @deprecated a true al guardar — son parte del funcionamiento estándar.
      // Normalizar consistencia padre-hijo: si el padre está OFF, los hijos
      // se persisten en su valor "neutro" para no dejar estado zombi en BD.
      const toPersist: ProjectFeatureFlags = {
        ...flags,
        plans_pdf: true, advanced_charts: true, normas: true,
        phone_contacts: true, qr_codes: true, protocol_linking: true,
        ...(!flags.traceability_module && {
          equipment_catalog: false,
          traceability_gps_polling: 'off' as const,
          anonymize_traceability: false,
        }),
        ...(!flags.map_enabled && {
          gps_capture_subjective: false,
          gps_capture_numeric: false,
        }),
      };
      const trimmed = mapTileUrl.trim();
      // v43.3 — `sample_identifier` va en el MISMO update verificado que el resto de la
      // config (atómico). Antes iba en un update aparte con try/catch que tragaba el
      // error: si fallaba, la nube quedaba sin id y el pull cloud-wins borraba el id
      // local → se "perdía". Ahora se persiste y verifica junto a los demás flags.
      const { data: updatedRows, error } = await supabase
        .from('projects')
        .update({
          feature_flags: toPersist,
          map_tile_url: trimmed.length > 0 ? trimmed : null,
          sample_identifier: sampleIdentifier.trim() || null,
          updated_at: Date.now(),
        })
        .eq('id', projectId)
        .select('id');   // verificación: si no devuelve filas, NO se persistió en la nube
      if (error) throw error;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error(t('projectConfig.cloudRejected'));
      }
      try {
        const proj = await projectsCollection.find(projectId);
        await database.write(async () => {
          await (proj as any).update((r: any) => {
            r.featureFlags = JSON.stringify(toPersist);
            r.mapTileUrl = trimmed.length > 0 ? trimmed : null;
            r.sampleIdentifier = sampleIdentifier.trim() || null;
          });
        });
      } catch { /* el siguiente pull lo arreglará */ }
      Alert.alert(t('projectConfig.savedTitle'), t('projectConfig.savedMsg'), [{ text: t('projectConfig.ok'), onPress: () => navigation.goBack() }]);
    } catch (e: any) {
      Alert.alert(t('projectConfig.errorTitle'), e?.message ?? t('projectConfig.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingText}>{t('projectConfig.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader
        title={t('projectConfig.headerTitle')}
        subtitle={projectName}
        onBack={() => navigation.goBack()}
        rightContent={
          <TouchableOpacity onPress={() => jumpToStep('config_protocols')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
          </TouchableOpacity>
        }
      />
      {/* `flex:1` acota el ScrollView entre el header y el footer fijos; sin él
          el contenido se cortaba y no permitía scroll. */}
      <ScrollView style={styles.scrollFlex} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator>
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={16} color={Colors.primary} />
          <Text style={styles.infoText}>
            {t('projectConfig.infoText')}
          </Text>
        </View>

        {/* ── 1. Configuración de Protocolos ────────────────── */}
        <View ref={configProtocolsRef}>
        <SectionBox icon="document-text-outline" title={t('projectConfig.sectionProtocols')} color={Colors.success}>
          <CheckRow label={t('projectConfig.classicLabel')} description={t('projectConfig.classicDesc')}
            value={flags.classic_protocols} onToggle={() => toggleFlag('classic_protocols')} />
          <CheckRow label={t('projectConfig.numericLabel')} description={t('projectConfig.numericDesc')}
            value={flags.numeric_protocols} onToggle={() => toggleFlag('numeric_protocols')} />
          <CheckRow label={t('projectConfig.parametricLabel')} description={t('projectConfig.parametricDesc')}
            value={flags.parametric_templates} onToggle={() => toggleFlag('parametric_templates')} />
          <CheckRow label={t('projectConfig.historicalLabel')} description={t('projectConfig.historicalDesc')}
            value={flags.historical_import} onToggle={() => toggleFlag('historical_import')} />
          <CheckRow label={t('projectConfig.multiLevelLabel')} description={t('projectConfig.multiLevelDesc')}
            value={flags.multi_level_approval} onToggle={() => toggleFlag('multi_level_approval')} />
          {flags.multi_level_approval && (
            <View style={styles.subRow}>
              <Text style={styles.subRowLabel}>{t('projectConfig.levelsLabel')}</Text>
              {([1, 2, 3] as const).map(n => (
                <TouchableOpacity key={n} onPress={() => setFlag('approval_levels', n)}
                  style={[styles.levelBtn, flags.approval_levels === n && styles.levelBtnActive]}>
                  <Text style={[styles.levelBtnText, flags.approval_levels === n && { color: Colors.white }]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── v43: Módulos opcionales del proyecto (visibilidad en el menú) ── */}
          <Text style={styles.fieldLabel}>{t('projectConfig.projectModulesLabel')}</Text>
          <Text style={styles.helperText}>
            {t('projectConfig.projectModulesHelp')}
          </Text>
          <CheckRow label={t('projectConfig.modulePlansLabel')} description={t('projectConfig.modulePlansDesc')}
            value={flags.module_plans} onToggle={() => toggleFlag('module_plans')} />
          <CheckRow label={t('projectConfig.moduleContactsLabel')} description={t('projectConfig.moduleContactsDesc')}
            value={flags.module_contacts} onToggle={() => toggleFlag('module_contacts')} />
          <CheckRow label={t('projectConfig.moduleSummaryLabel')} description={t('projectConfig.moduleSummaryDesc')}
            value={flags.module_summary_tables} onToggle={() => toggleFlag('module_summary_tables')} />

          {/* ── v31 (Parte D+E) + v43: Llenado de protocolos ── */}
          <Text style={styles.fieldLabel}>{t('projectConfig.fillModeLabel')}</Text>
          <Text style={styles.helperText}>
            {t('projectConfig.fillModeHelp')}
          </Text>
          <CheckRow label={t('projectConfig.fillByLocationLabel')} description={t('projectConfig.fillByLocationDesc')}
            value={flags.module_protocols_by_location} onToggle={() => toggleFlag('module_protocols_by_location')} />
          <CheckRow label={t('projectConfig.fillBySampleLabel')} description={t('projectConfig.fillBySampleDesc')}
            value={flags.fill_by_sample} onToggle={() => toggleFlag('fill_by_sample')} />
          {flags.fill_by_sample && (
            <>
              <Text style={styles.fieldLabel}>{t('projectConfig.sampleIdentifierLabel')}</Text>
              <TextInput
                value={sampleIdentifier}
                onChangeText={txt => setSampleIdentifier(txt.replace(/[^0-9A-Za-z]/g, ''))}
                autoCapitalize="characters" autoCorrect={false} maxLength={6}
                style={styles.urlInput}
                placeholder={t('projectConfig.sampleIdentifierPlaceholder')}
                placeholderTextColor={Colors.textMuted}
              />
              <Text style={styles.helperText}>
                Las muestras se codifican como M-{(sampleIdentifier || '123')}-{'{ddmmyy}'}-0001 (secuencial de 4 dígitos por proyecto).
              </Text>
            </>
          )}
          <CheckRow label={t('projectConfig.fillBySectorLabel')} description={t('projectConfig.fillBySectorDesc')}
            value={flags.fill_by_sector} onToggle={() => toggleFlag('fill_by_sector')} />
          <CheckRow label={t('projectConfig.fillByTypeLabel')} description={t('projectConfig.fillByTypeDesc')}
            value={flags.fill_by_type} onToggle={() => toggleFlag('fill_by_type')} />
          <CheckRow label={t('projectConfig.fillByDateLabel')} description={t('projectConfig.fillByDateDesc')}
            value={flags.fill_by_date} onToggle={() => toggleFlag('fill_by_date')} />
          <CheckRow label={t('projectConfig.protocolCodesLabel')} description={t('projectConfig.protocolCodesDesc')}
            value={flags.protocol_codes} onToggle={() => toggleFlag('protocol_codes')} />
          {flags.protocol_codes && (
            <>
              <Text style={styles.fieldLabel}>{t('projectConfig.maskLabel')}</Text>
              <TextInput
                value={flags.coding_mask_default}
                onChangeText={txt => setFlag('coding_mask_default', txt)}
                autoCapitalize="characters" autoCorrect={false}
                style={styles.urlInput}
                placeholder="{TIPO}-{AA}{SEQ:4}"
                placeholderTextColor={Colors.textMuted}
              />
              {validateMask(flags.coding_mask_default).map((e, i) => (
                <Text key={i} style={[styles.helperText, { color: Colors.danger }]}>⚠ {e}</Text>
              ))}
              {/* v46.1 — Selector de TOKENS (insertar con un toque, sin escribir a mano). */}
              <View style={styles.tokenRow}>
                {['{TIPO}', '{AA}', '{AAAA}', '{MM}', '{DD}', '{SEQ:4}', '{SECTOR}'].map(tok => (
                  <TouchableOpacity key={tok} style={styles.tokenChip}
                    onPress={() => setFlag('coding_mask_default', (flags.coding_mask_default ?? '') + tok)}>
                    <Text style={styles.tokenChipText}>{tok}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* v46.1 — Vista previa EN VIVO del código generado con la máscara actual. */}
              {validateMask(flags.coding_mask_default).length === 0 && (
                <View style={styles.previewBox}>
                  <Text style={styles.previewLabel}>{t('projectConfig.codingPreview')}</Text>
                  <Text style={styles.previewCode}>
                    {buildProtocolCode(flags.coding_mask_default, { tipo: 'PR', date: new Date(2026, 5, 21), seq: 32, sector: 'NORTE' })}
                  </Text>
                </View>
              )}
              <Text style={styles.helperText}>
                {t('projectConfig.tokensHelp')}
              </Text>
              {/* v46.1 — Ámbito de REINICIO del correlativo. */}
              <Text style={styles.fieldLabel}>{t('projectConfig.codingResetLabel')}</Text>
              <View style={styles.optionList}>
                {([
                  ['year', t('projectConfig.codingResetYear')],
                  ['year_sector', t('projectConfig.codingResetSector')],
                  ['year_month', t('projectConfig.codingResetMonth')],
                ] as const).map(([val, label]) => {
                  const active = (flags.coding_seq_reset ?? 'year') === val;
                  return (
                    <TouchableOpacity key={val} onPress={() => setFlag('coding_seq_reset', val)}
                      style={[styles.optionRow, active && styles.optionRowActive]}>
                      <View style={[styles.radio, active && styles.radioActive]}>{active && <View style={styles.radioInner} />}</View>
                      <Text style={[styles.optionText, active && { color: Colors.primary, fontWeight: '700' }]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.helperText}>{t('projectConfig.codingResetHelp')}</Text>
              {/* v46.1 — Máscara por TIPO de ensayo (override opcional del default). */}
              {testTypes.length > 0 && (
                <>
                  <TouchableOpacity style={styles.perTypeToggle} onPress={() => setShowPerType(v => !v)}>
                    <Ionicons name={showPerType ? 'chevron-down' : 'chevron-forward'} size={16} color={Colors.primary} />
                    <Text style={styles.perTypeToggleText}>{t('projectConfig.codingPerTypeLabel')}</Text>
                    {flags.coding_mask_by_type && Object.keys(flags.coding_mask_by_type).length > 0 && (
                      <View style={styles.perTypeBadge}><Text style={styles.perTypeBadgeText}>{Object.keys(flags.coding_mask_by_type).length}</Text></View>
                    )}
                  </TouchableOpacity>
                  {showPerType && (
                    <View style={{ gap: 8, marginTop: 4 }}>
                      <Text style={styles.helperText}>{t('projectConfig.codingPerTypeHelp')}</Text>
                      {testTypes.map(({ tipo, name }) => {
                        const override = flags.coding_mask_by_type?.[tipo] ?? '';
                        const errs = override ? validateMask(override) : [];
                        return (
                          <View key={tipo}>
                            <Text style={styles.perTypeName} numberOfLines={1}>{tipo} · {name}</Text>
                            <TextInput
                              style={styles.urlInput}
                              value={override}
                              placeholder={flags.coding_mask_default}
                              placeholderTextColor={Colors.textMuted}
                              autoCapitalize="characters"
                              autoCorrect={false}
                              onChangeText={txt => setFlags(prev => {
                                const next = { ...(prev.coding_mask_by_type ?? {}) };
                                if (txt.trim()) next[tipo] = txt; else delete next[tipo];
                                return { ...prev, coding_mask_by_type: next };
                              })}
                            />
                            {errs.map((e, i) => (
                              <Text key={i} style={[styles.helperText, { color: Colors.danger }]}>⚠ {e}</Text>
                            ))}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </>
              )}
            </>
          )}
        </SectionBox>
        </View>

        {/* ── 2. Módulo de Trazabilidad ─────────────────────── */}
        <View ref={configTraceabilityRef}>
        <SectionBox icon="timer-outline" title={t('projectConfig.sectionTraceability')} color={Colors.warning}>
          <CheckRow label={t('projectConfig.traceabilityLabel')} emphasis
            description={t('projectConfig.traceabilityDesc')}
            value={flags.traceability_module} onToggle={() => toggleFlag('traceability_module')} />
          <View style={[styles.childrenWrap, !flags.traceability_module && styles.childrenDisabled]}>
            <CheckRow label={t('projectConfig.equipmentCatalogLabel')} description={t('projectConfig.equipmentCatalogDesc')}
              value={flags.equipment_catalog} onToggle={() => toggleFlag('equipment_catalog')}
              disabled={!flags.traceability_module} />

            <Text style={styles.fieldLabel}>{t('projectConfig.gpsTrackingLabel')}</Text>
            <View style={styles.optionList}>
              {GPS_POLLING_OPTIONS.map(o => (
                <TouchableOpacity key={o.value} disabled={!flags.traceability_module}
                  onPress={() => setFlag('traceability_gps_polling', o.value)}
                  style={[styles.optionRow, flags.traceability_gps_polling === o.value && styles.optionRowActive]}>
                  <View style={[styles.radio, flags.traceability_gps_polling === o.value && styles.radioActive]}>
                    {flags.traceability_gps_polling === o.value && <View style={styles.radioInner} />}
                  </View>
                  <Text style={[styles.optionText, flags.traceability_gps_polling === o.value && { color: Colors.primary, fontWeight: '700' }]}>
                    {t(o.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.helperText}>
              {t('projectConfig.gpsBackgroundHelp')}
            </Text>

            {flags.traceability_gps_polling !== 'off' && (
              <>
                <Text style={styles.fieldLabel}>{t('projectConfig.gpsIntervalLabel')}</Text>
                <TextInput
                  value={String(flags.traceability_gps_interval_seconds)}
                  onChangeText={txt => {
                    const v = parseInt(txt, 10);
                    if (Number.isFinite(v)) setFlag('traceability_gps_interval_seconds', Math.max(1, Math.min(30, v)));
                  }}
                  keyboardType="number-pad"
                  editable={flags.traceability_module}
                  style={styles.urlInput}
                  placeholderTextColor={Colors.textMuted}
                />
                <Text style={styles.helperText}>{t('projectConfig.gpsIntervalHelp')}</Text>
              </>
            )}
          </View>
        </SectionBox>
        </View>

        {/* ── 3. Módulo de Geolocalización ──────────────────── */}
        <View ref={configGeoRef}>
        <SectionBox icon="map-outline" title={t('projectConfig.sectionGeo')} color={Colors.primary}>
          <CheckRow label={t('projectConfig.geoLabel')} emphasis
            description={t('projectConfig.geoDesc')}
            value={flags.map_enabled} onToggle={() => toggleFlag('map_enabled')} />
          <View style={[styles.childrenWrap, !flags.map_enabled && styles.childrenDisabled]}>
            <CheckRow label={t('projectConfig.gpsSubjectiveLabel')} description={t('projectConfig.gpsSubjectiveDesc')}
              value={flags.gps_capture_subjective} onToggle={() => toggleFlag('gps_capture_subjective')}
              disabled={!flags.map_enabled} />
            <CheckRow label={t('projectConfig.gpsNumericLabel')} description={t('projectConfig.gpsNumericDesc')}
              value={flags.gps_capture_numeric} onToggle={() => toggleFlag('gps_capture_numeric')}
              disabled={!flags.map_enabled} />

            <Text style={styles.fieldLabel}>{t('projectConfig.coordSystemLabel')}</Text>
            <View style={styles.optionList}>
              {COORD_SYSTEMS.map(c => (
                <TouchableOpacity key={c.value} disabled={!flags.map_enabled}
                  onPress={() => setFlag('coordinate_system', c.value)}
                  style={[styles.optionRow, flags.coordinate_system === c.value && styles.optionRowActive]}>
                  <View style={[styles.radio, flags.coordinate_system === c.value && styles.radioActive]}>
                    {flags.coordinate_system === c.value && <View style={styles.radioInner} />}
                  </View>
                  <Text style={[styles.optionText, flags.coordinate_system === c.value && { color: Colors.primary, fontWeight: '700' }]}>
                    {t(c.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.helperText}>
              {t('projectConfig.coordSystemHelp')}
            </Text>

            <Text style={styles.fieldLabel}>{t('projectConfig.orthoUrlLabel')}</Text>
            <TextInput
              value={mapTileUrl}
              onChangeText={setMapTileUrl}
              placeholder="https://tu-server.com/tiles/{z}/{x}/{y}.png"
              autoCapitalize="none" autoCorrect={false}
              editable={flags.map_enabled}
              style={styles.urlInput}
              placeholderTextColor={Colors.textMuted}
            />
            <Text style={styles.helperText}>
              {t('projectConfig.orthoUrlHelp')}
            </Text>
          </View>
        </SectionBox>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(12, insets.bottom + 8) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>{t('projectConfig.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity ref={configSaveRef} onPress={handleSave} style={styles.saveBtn} disabled={saving}>
          <Text style={styles.saveText}>{saving ? t('projectConfig.saving') : t('projectConfig.save')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Subcomponentes ──────────────────────────────────────────────────────

function SectionBox({ icon, title, color, children }: {
  icon: string; title: string; color: string; children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionBox}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon as any} size={16} color={color} />
        <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function CheckRow({ label, description, value, onToggle, disabled, emphasis }: {
  label: string; description: string; value: boolean;
  onToggle: () => void; disabled?: boolean; emphasis?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      disabled={disabled}
      style={[
        styles.modRow,
        value && styles.modRowActive,
        emphasis && styles.modRowEmphasis,
        disabled && styles.modRowDisabled,
      ]}
    >
      <View style={[styles.checkbox, value && styles.checkboxActive]}>
        {value && <Ionicons name="checkmark" size={14} color={Colors.white} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.modLabel, value && { color: Colors.primary }, emphasis && { fontSize: 14 }]}>{label}</Text>
        <Text style={styles.modDesc}>{description}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: Colors.textSecondary, fontSize: 14 },
  scrollFlex: { flex: 1 },
  scroll: { padding: 12, paddingBottom: 80 },

  infoBox: { flexDirection: 'row', gap: 8, backgroundColor: Colors.primary + '10', borderColor: Colors.primary + '30', borderWidth: 1, borderRadius: Radius.md, padding: 12, marginBottom: 12 },
  infoText: { flex: 1, fontSize: 11, color: Colors.textSecondary, lineHeight: 15 },

  sectionBox: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, marginBottom: 10, backgroundColor: Colors.white, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sectionTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionBody: { padding: 10, gap: 6 },

  modRow: { flexDirection: 'row', gap: 10, padding: 10, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  modRowActive: { borderColor: Colors.primary + '50', backgroundColor: Colors.primary + '08' },
  modRowEmphasis: { borderWidth: 2 },
  modRowDisabled: { opacity: 0.5 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  modLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  modDesc: { fontSize: 11, color: Colors.textMuted, marginTop: 2, lineHeight: 14 },

  childrenWrap: { marginLeft: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: Colors.border, gap: 6, marginTop: 4 },
  childrenDisabled: { opacity: 0.5 },

  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 36, marginTop: 2 },
  subRowLabel: { fontSize: 11, color: Colors.textMuted },
  levelBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: Colors.border },
  levelBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  levelBtnText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginTop: 6 },
  optionList: { gap: 4 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  optionRowActive: { borderColor: Colors.primary + '50', backgroundColor: Colors.primary + '08' },
  optionText: { fontSize: 12, color: Colors.textSecondary, flex: 1 },
  radio: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: Colors.primary },
  radioInner: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.primary },
  urlInput: { fontSize: 12, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white, fontFamily: 'Courier', color: Colors.textPrimary, marginTop: 4 },
  helperText: { fontSize: 10, color: Colors.textMuted, marginTop: 4, lineHeight: 13 },
  // v46.1 — codificación correlativa: selector de tokens + vista previa.
  tokenRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tokenChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: Colors.primary + '50', backgroundColor: Colors.primary + '0D' },
  tokenChipText: { fontSize: 11, fontWeight: '700', color: Colors.primary, fontFamily: 'Courier' },
  previewBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, padding: 8, borderRadius: 6, backgroundColor: Colors.primary + '0D' },
  previewLabel: { fontSize: 11, color: Colors.textMuted },
  previewCode: { fontSize: 14, fontWeight: '700', color: Colors.primary, fontFamily: 'Courier', letterSpacing: 0.5 },
  perTypeToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  perTypeToggleText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  perTypeBadge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  perTypeBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.white },
  perTypeName: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, marginTop: 2 },

  footer: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.white },
  cancelBtn: { flex: 1, padding: 14, alignItems: 'center', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textSecondary, fontWeight: '700' },
  saveBtn: { flex: 1, padding: 14, alignItems: 'center', borderRadius: Radius.md, backgroundColor: Colors.primary },
  saveText: { color: Colors.white, fontWeight: '700' },
});
