'use client';

/**
 * DashboardFilters — Barra horizontal de filtros del dashboard por proyecto
 * (estilo Power BI): fechas + especialidad + sector + estado (solo mapa).
 * Controlada por el padre; cero fetching.
 */

import { useI18n } from '@lib/i18n';
import type { DashboardFiltersState } from '@hooks/useDashboardData';

const inputCls = `rounded-lg border border-border bg-surface px-3 py-2 text-sm text-gray-800
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`;

export default function DashboardFilters({
  filters, onChange, specialties, sectorOptions,
}: {
  filters: DashboardFiltersState;
  onChange: (patch: Partial<DashboardFiltersState>) => void;
  specialties: string[];
  sectorOptions: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const hasAny = filters.dateFrom || filters.dateTo || filters.specialty || filters.sectorId || filters.status;

  return (
    <div className="bg-white rounded-xl shadow-subtle px-4 py-3 flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-gray-500 font-medium">{t('webDash.dateFrom')}</label>
        <input type="date" value={filters.dateFrom}
          onChange={e => onChange({ dateFrom: e.target.value })} className={inputCls} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-gray-500 font-medium">{t('webDash.dateTo')}</label>
        <input type="date" value={filters.dateTo}
          onChange={e => onChange({ dateTo: e.target.value })} className={inputCls} />
      </div>
      {specialties.length > 0 && (
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-gray-500 font-medium">{t('webDash.filterSpecialty')}</label>
          <select value={filters.specialty}
            onChange={e => onChange({ specialty: e.target.value })} className={inputCls}>
            <option value="">{t('webDash.allFemale')}</option>
            {specialties.map(sp => <option key={sp} value={sp}>{sp}</option>)}
          </select>
        </div>
      )}
      {sectorOptions.length > 0 && (
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-gray-500 font-medium">{t('webDash.sector')}</label>
          <select value={filters.sectorId}
            onChange={e => onChange({ sectorId: e.target.value })} className={inputCls}>
            <option value="">{t('webDash.allMale')}</option>
            {sectorOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-gray-500 font-medium">
          {t('webDash.status')} <span className="text-gray-400 normal-case">({t('webDash.filterStatusHint')})</span>
        </label>
        <select value={filters.status}
          onChange={e => onChange({ status: e.target.value })} className={inputCls}>
          <option value="">{t('webDash.allMale')}</option>
          <option value="APPROVED">{t('webDash.statusApproved')}</option>
          <option value="REJECTED">{t('webDash.statusRejected')}</option>
          <option value="SUBMITTED">{t('webDash.statusSubmittedShort')}</option>
          <option value="DRAFT">{t('webDash.statusDraftShort')}</option>
        </select>
      </div>
      {hasAny && (
        <button
          onClick={() => onChange({ dateFrom: '', dateTo: '', specialty: '', sectorId: '', status: '' })}
          className="text-xs text-primary hover:underline font-semibold pb-2.5"
        >
          {t('webDash.clearFilters')}
        </button>
      )}
    </div>
  );
}
