'use client';

/**
 * ProjectConfigModal — Configuración de módulos del proyecto (v29).
 *
 * Solo 3 secciones:
 *  1. Configuración de Protocolos
 *  2. Módulo de Trazabilidad (padre + hijos)
 *  3. Módulo de Geolocalización (padre + hijos)
 *
 * Los hijos de cada módulo padre quedan deshabilitados (grises, no clickeables)
 * mientras el padre esté OFF — pero se preserva su valor en el state para no
 * perder configuración cuando el padre se vuelva a prender.
 */

import { useState } from 'react';
import { X, Settings, Info, FileText, Timer, Map } from 'lucide-react';
import { cn } from '@lib/utils';
import type { ProjectFeatureFlags, CoordinateSystem } from '@/types';
import { DEFAULT_FEATURE_FLAGS } from '@/types';
import { validateMask } from '@lib/protocolCode';
import { useI18n } from '@lib/i18n';

interface Props {
  /** Valor inicial. Si null/undefined se usan defaults. */
  initialFlags?: ProjectFeatureFlags | null;
  /** URL de tile XYZ para ortofoto (campo del proyecto, no flag). */
  initialMapTileUrl?: string | null;
  /** v43 — Identificador del proyecto para el código de muestras (campo, no flag). */
  initialSampleIdentifier?: string | null;
  /** Llamado al confirmar — entrega flags + map_tile_url + sample_identifier. */
  onConfirm: (flags: ProjectFeatureFlags, mapTileUrl: string | null, sampleIdentifier: string | null) => void;
  onCancel: () => void;
  confirmLabel?: string;
  title?: string;
}

export function ProjectConfigModal({
  initialFlags,
  initialMapTileUrl,
  initialSampleIdentifier,
  onConfirm,
  onCancel,
  confirmLabel,
  title,
}: Props) {
  const { t } = useI18n();
  const resolvedConfirmLabel = confirmLabel ?? t('webCMisc.cfg.confirmLabel');
  const resolvedTitle = title ?? t('webCMisc.cfg.title');

  const GPS_POLLING_OPTIONS: { value: 'off' | 'foreground' | 'background'; label: string }[] = [
    { value: 'off',        label: t('webCMisc.cfg.gpsPollingOff') },
    { value: 'foreground', label: t('webCMisc.cfg.gpsPollingForeground') },
    { value: 'background', label: t('webCMisc.cfg.gpsPollingBackground') },
  ];

  const COORD_SYSTEM_OPTIONS: { value: CoordinateSystem; label: string }[] = [
    { value: 'WGS84_LATLNG',  label: t('webCMisc.cfg.coordWgs84LatLng') },
    { value: 'WGS84_UTM',     label: t('webCMisc.cfg.coordWgs84Utm') },
    { value: 'PSAD56_LATLNG', label: t('webCMisc.cfg.coordPsad56LatLng') },
    { value: 'PSAD56_UTM',    label: t('webCMisc.cfg.coordPsad56Utm') },
  ];

  const [flags, setFlags] = useState<ProjectFeatureFlags>(() => ({
    ...DEFAULT_FEATURE_FLAGS,
    ...(initialFlags ?? {}),
    // Forzar @deprecated a true siempre — son parte del funcionamiento estándar.
    plans_pdf: true, advanced_charts: true, normas: true,
    phone_contacts: true, qr_codes: true, protocol_linking: true,
  }));
  const [mapTileUrl, setMapTileUrl] = useState<string>(initialMapTileUrl ?? '');
  const [sampleIdentifier, setSampleIdentifier] = useState<string>(initialSampleIdentifier ?? '');

  const setFlag = <K extends keyof ProjectFeatureFlags>(key: K, value: ProjectFeatureFlags[K]) =>
    setFlags(prev => ({ ...prev, [key]: value }));
  const toggleFlag = (key: keyof ProjectFeatureFlags) =>
    setFlags(prev => ({ ...prev, [key]: !prev[key] }));

  // v31 — Una máscara inválida generaría códigos colisionantes.
  const maskErrors = flags.protocol_codes ? validateMask(flags.coding_mask_default) : [];

  const handleConfirm = () => {
    if (maskErrors.length > 0) return;   // botón deshabilitado; defensa extra
    const trimmed = mapTileUrl.trim();
    // Normalizar al persistir:
    //  - @deprecated SIEMPRE true (defensa en profundidad por si el state local
    //    se desincronizó).
    //  - Consistencia padre-hijo: si el padre está OFF, los hijos se persisten
    //    en su valor "neutro" para no dejar estado zombi en BD.
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
    onConfirm(toPersist, trimmed.length > 0 ? trimmed : null, sampleIdentifier.trim() || null);
  };

  return (
    // Overlay SCROLLEABLE: si el modal es más alto que la ventana, se desplaza el
    // overlay completo. Patrón a prueba de quirks de flexbox (el `flex-1+min-h-0`
    // no scrolleaba en el Chromium del desktop). Header sticky para no perderlo.
    <div className="fixed inset-0 z-50 bg-navy/50 overflow-y-auto p-4 flex justify-center items-start" onClick={onCancel}>
      <div className="bg-white rounded-xl w-full max-w-2xl my-4 flex flex-col shadow-modal"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 z-10 rounded-t-xl flex items-center justify-between px-4 py-3 border-b border-border bg-navy text-white">
          <div className="flex items-center gap-2">
            <Settings size={16} />
            <h3 className="text-sm font-bold tracking-wide uppercase">{resolvedTitle}</h3>
          </div>
          <button onClick={onCancel} className="p-1 rounded hover:bg-white/10 transition">
            <X size={16} />
          </button>
        </div>

        {/* Cuerpo (flujo normal; el scroll lo maneja el overlay). */}
        <div className="px-4 py-3 flex flex-col gap-4">
          <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-md p-3">
            <Info size={14} className="text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-textSecondary leading-relaxed"
               dangerouslySetInnerHTML={{ __html: t('webCMisc.cfg.infoText') }} />
          </div>

          {/* ── 1. Configuración de Protocolos ─────────────────────── */}
          <Section icon={<FileText size={14} />} title={t('projectConfig.sectionProtocols')} tone="ok">
            <Check label={t('projectConfig.classicLabel')} description={t('projectConfig.classicDesc')}
              value={flags.classic_protocols} onToggle={() => toggleFlag('classic_protocols')} />
            <Check label={t('projectConfig.numericLabel')} description={t('projectConfig.numericDesc')}
              value={flags.numeric_protocols} onToggle={() => toggleFlag('numeric_protocols')} />
            <Check label={t('projectConfig.parametricLabel')} description={t('webCMisc.cfg.parametricDesc')}
              value={flags.parametric_templates} onToggle={() => toggleFlag('parametric_templates')} />
            <Check label={t('projectConfig.historicalLabel')} description={t('webCMisc.cfg.historicalDesc')}
              value={flags.historical_import} onToggle={() => toggleFlag('historical_import')} />
            <Check label={t('projectConfig.multiLevelLabel')} description={t('projectConfig.multiLevelDesc')}
              value={flags.multi_level_approval} onToggle={() => toggleFlag('multi_level_approval')} />
            {flags.multi_level_approval && (
              <div className="ml-7 mt-1 flex items-center gap-2 text-xs">
                <span className="text-muted">{t('projectConfig.levelsLabel')}</span>
                {([1, 2, 3] as const).map(n => (
                  <button key={n} onClick={() => setFlag('approval_levels', n)}
                    className={cn(
                      'px-2 py-0.5 rounded border text-xs font-bold transition',
                      flags.approval_levels === n
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-textSecondary border-border hover:bg-surface',
                    )}>
                    {n}
                  </button>
                ))}
              </div>
            )}

            {/* ── v43: Módulos opcionales del proyecto ── */}
            <p className="text-[11px] font-bold uppercase tracking-wider text-textMuted mt-2">{t('projectConfig.projectModulesLabel')}</p>
            <p className="text-[11px] text-textMuted leading-snug -mt-1">
              {t('webCMisc.cfg.projectModulesHelp')}
            </p>
            <Check label={t('projectConfig.modulePlansLabel')} description={t('projectConfig.modulePlansDesc')}
              value={flags.module_plans} onToggle={() => toggleFlag('module_plans')} />
            <Check label={t('projectConfig.moduleContactsLabel')} description={t('projectConfig.moduleContactsDesc')}
              value={flags.module_contacts} onToggle={() => toggleFlag('module_contacts')} />
            <Check label={t('projectConfig.moduleSummaryLabel')} description={t('projectConfig.moduleSummaryDesc')}
              value={flags.module_summary_tables} onToggle={() => toggleFlag('module_summary_tables')} />

            {/* ── v31 (Parte D+E) + v43: Llenado de protocolos ── */}
            <p className="text-[11px] font-bold uppercase tracking-wider text-textMuted mt-2">{t('projectConfig.fillModeLabel')}</p>
            <p className="text-[11px] text-textMuted leading-snug -mt-1">
              {t('projectConfig.fillModeHelp')}
            </p>
            <Check label={t('projectConfig.fillByLocationLabel')} description={t('projectConfig.fillByLocationDesc')}
              value={flags.module_protocols_by_location} onToggle={() => toggleFlag('module_protocols_by_location')} />
            <Check label={t('projectConfig.fillBySampleLabel')} description={t('projectConfig.fillBySampleDesc')}
              value={flags.fill_by_sample} onToggle={() => toggleFlag('fill_by_sample')} />
            {flags.fill_by_sample && (
              <div className="ml-7 mt-1 flex flex-col gap-1">
                <label className="text-xs text-muted font-bold">{t('projectConfig.sampleIdentifierLabel')}</label>
                <input
                  type="text"
                  value={sampleIdentifier}
                  onChange={e => setSampleIdentifier(e.target.value.replace(/[^0-9A-Za-z]/g, ''))}
                  maxLength={6}
                  placeholder={t('projectConfig.sampleIdentifierPlaceholder')}
                  className="text-xs border border-border rounded px-2 py-1.5 focus:outline-none focus:border-primary"
                />
                <p className="text-[10px] text-textMuted">{t('webCMisc.cfg.sampleHint', { id: sampleIdentifier || '123' })}</p>
              </div>
            )}
            <Check label={t('projectConfig.fillBySectorLabel')} description={t('projectConfig.fillBySectorDesc')}
              value={flags.fill_by_sector} onToggle={() => toggleFlag('fill_by_sector')} />
            <Check label={t('projectConfig.fillByTypeLabel')} description={t('projectConfig.fillByTypeDesc')}
              value={flags.fill_by_type} onToggle={() => toggleFlag('fill_by_type')} />
            <Check label={t('projectConfig.fillByDateLabel')} description={t('projectConfig.fillByDateDesc')}
              value={flags.fill_by_date} onToggle={() => toggleFlag('fill_by_date')} />
            <Check label={t('projectConfig.protocolCodesLabel')} description={t('projectConfig.protocolCodesDesc')}
              value={flags.protocol_codes} onToggle={() => toggleFlag('protocol_codes')} />
            {flags.protocol_codes && (
              <div className="ml-7 mt-1 flex flex-col gap-1">
                <label className="text-xs text-muted font-bold">{t('projectConfig.maskLabel')}</label>
                <input
                  type="text"
                  value={flags.coding_mask_default}
                  onChange={e => setFlag('coding_mask_default', e.target.value)}
                  placeholder={t('webCMisc.cfg.maskPlaceholder')}
                  className="text-xs font-mono border border-border rounded px-2 py-1.5 focus:outline-none focus:border-primary"
                />
                {maskErrors.map((e, i) => (
                  <p key={i} className="text-[11px] text-danger">⚠ {e}</p>
                ))}
                <p className="text-[10px] text-textMuted">
                  {t('webCMisc.cfg.tokensHelp', { tokens: '{TIPO} {AA} {AAAA} {MM} {DD} {SEQ:n} {SECTOR}', example: '{TIPO}-{AA}{SEQ:4}' })}
                </p>
              </div>
            )}
          </Section>

          {/* ── 2. Módulo de Trazabilidad ──────────────────────────── */}
          <Section icon={<Timer size={14} />} title={t('projectConfig.sectionTraceability')} tone="warning">
            <Check
              label={t('projectConfig.traceabilityLabel')}
              description={t('webCMisc.cfg.traceabilityDesc')}
              value={flags.traceability_module}
              onToggle={() => toggleFlag('traceability_module')}
              emphasis
            />
            <div className={cn(
              'flex flex-col gap-1.5 ml-4 pl-3 border-l-2 border-border transition-opacity',
              flags.traceability_module ? 'opacity-100' : 'opacity-40 pointer-events-none',
            )}>
              <Check label={t('projectConfig.equipmentCatalogLabel')} description={t('webCMisc.cfg.equipmentCatalogDesc')}
                value={flags.equipment_catalog} onToggle={() => toggleFlag('equipment_catalog')}
                disabled={!flags.traceability_module} />

              <SelectField label={t('projectConfig.gpsTrackingLabel')}
                helper={t('webCMisc.cfg.gpsBackgroundHelp')}
                value={flags.traceability_gps_polling}
                onChange={v => setFlag('traceability_gps_polling', v as any)}
                options={GPS_POLLING_OPTIONS}
                disabled={!flags.traceability_module} />

              {flags.traceability_gps_polling !== 'off' && (
                <div className="px-2.5 py-2 bg-surface rounded border border-border">
                  <label className="block text-xs font-bold text-textPrimary mb-1">
                    {t('webCMisc.cfg.gpsIntervalLabel')}
                  </label>
                  <input
                    type="number" min={1} max={30}
                    disabled={!flags.traceability_module}
                    value={flags.traceability_gps_interval_seconds}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10);
                      if (Number.isFinite(v)) setFlag('traceability_gps_interval_seconds', Math.max(1, Math.min(30, v)));
                    }}
                    className="w-24 px-2 py-1.5 text-xs rounded border border-border bg-white focus:border-primary focus:outline-none disabled:opacity-50"
                  />
                  <p className="text-[10px] text-muted mt-1">{t('projectConfig.gpsIntervalHelp')}</p>
                </div>
              )}
            </div>
          </Section>

          {/* ── 3. Módulo de Geolocalización ───────────────────────── */}
          <Section icon={<Map size={14} />} title={t('projectConfig.sectionGeo')} tone="primary">
            <Check
              label={t('projectConfig.geoLabel')}
              description={t('projectConfig.geoDesc')}
              value={flags.map_enabled}
              onToggle={() => toggleFlag('map_enabled')}
              emphasis
            />
            <div className={cn(
              'flex flex-col gap-1.5 ml-4 pl-3 border-l-2 border-border transition-opacity',
              flags.map_enabled ? 'opacity-100' : 'opacity-40 pointer-events-none',
            )}>
              <Check label={t('projectConfig.gpsSubjectiveLabel')} description={t('projectConfig.gpsSubjectiveDesc')}
                value={flags.gps_capture_subjective} onToggle={() => toggleFlag('gps_capture_subjective')}
                disabled={!flags.map_enabled} />
              <Check label={t('projectConfig.gpsNumericLabel')} description={t('projectConfig.gpsNumericDesc')}
                value={flags.gps_capture_numeric} onToggle={() => toggleFlag('gps_capture_numeric')}
                disabled={!flags.map_enabled} />

              <SelectField label={t('webCMisc.cfg.coordSystemLabel')}
                helper={t('webCMisc.cfg.coordSystemHelp')}
                value={flags.coordinate_system}
                onChange={v => setFlag('coordinate_system', v as CoordinateSystem)}
                options={COORD_SYSTEM_OPTIONS}
                disabled={!flags.map_enabled} />

              <div className={cn('p-2.5 bg-surface rounded border border-border', !flags.map_enabled && 'opacity-60')}>
                <label className="block text-xs font-bold text-textPrimary mb-1">
                  {t('webCMisc.cfg.orthoUrlLabel')}
                </label>
                <input
                  type="text"
                  disabled={!flags.map_enabled}
                  value={mapTileUrl}
                  onChange={e => setMapTileUrl(e.target.value)}
                  placeholder="https://tu-server.com/tiles/{z}/{x}/{y}.png"
                  className="w-full px-2 py-1.5 text-xs rounded border border-border bg-white font-mono focus:border-primary focus:outline-none disabled:opacity-50"
                />
                <p className="text-[10px] text-muted mt-1">
                  {t('projectConfig.orthoUrlHelp')}
                </p>
              </div>
            </div>
          </Section>
        </div>

        {/* Footer (sticky abajo para que "Guardar" siempre quede a la vista). */}
        <div className="sticky bottom-0 z-10 rounded-b-xl flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-surface">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-bold text-textSecondary hover:text-textPrimary transition">
            {t('common.cancel')}
          </button>
          <button onClick={handleConfirm} disabled={maskErrors.length > 0}
            className={cn(
              'px-4 py-1.5 text-xs font-bold rounded transition',
              maskErrors.length > 0
                ? 'bg-border text-muted cursor-not-allowed'
                : 'bg-primary text-white hover:bg-primary/90',
            )}>
            {resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Subcomponentes ────────────────────────────────────────────────────────

function Section({ icon, title, tone, children }: {
  icon: React.ReactNode; title: string;
  tone: 'ok' | 'warning' | 'primary';
  children: React.ReactNode;
}) {
  const toneClass = tone === 'ok' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-primary';
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-border">
        <span className={toneClass}>{icon}</span>
        <span className={cn('text-[11px] font-extrabold tracking-wider uppercase', toneClass)}>{title}</span>
      </div>
      <div className="px-3 py-2 flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Check({ label, description, value, onToggle, disabled, emphasis }: {
  label: string; description: string; value: boolean;
  onToggle: () => void; disabled?: boolean; emphasis?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'flex items-start gap-3 p-2.5 rounded border text-left transition w-full',
        value ? 'bg-primary/5 border-primary/30' : 'bg-white border-border hover:bg-surface',
        disabled && 'opacity-50 cursor-not-allowed hover:bg-white',
        emphasis && 'border-2',
      )}
    >
      <div className={cn(
        'mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0',
        value ? 'bg-primary border-primary' : 'bg-white border-border',
      )}>
        {value && <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5 L4 7 L8 3" stroke="white" strokeWidth="2" fill="none" /></svg>}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-xs font-bold', value ? 'text-primary' : 'text-textPrimary', emphasis && 'text-sm')}>{label}</p>
        <p className="text-[11px] text-muted leading-snug">{description}</p>
      </div>
    </button>
  );
}

function SelectField({ label, helper, value, onChange, options, disabled }: {
  label: string; helper?: string; value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className={cn('p-2.5 bg-surface rounded border border-border', disabled && 'opacity-60')}>
      <label className="block text-xs font-bold text-textPrimary mb-1">{label}</label>
      <select
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-xs rounded border border-border bg-white focus:border-primary focus:outline-none disabled:opacity-50"
      >
        {options.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
      {helper && <p className="text-[10px] text-muted mt-1 leading-snug">{helper}</p>}
    </div>
  );
}
