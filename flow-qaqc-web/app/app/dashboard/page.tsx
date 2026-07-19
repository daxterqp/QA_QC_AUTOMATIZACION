'use client';

/**
 * /app/dashboard — Dashboard GENERAL (portafolio de obras) estilo Power BI:
 * mapa interactivo con una burbuja por obra (color = salud según avance),
 * KPIs agregados y ranking; clic en una obra → zoom → dashboard de esa obra.
 * Todo el cuerpo vive en PortfolioDashboard/ProjectDashboard (compartidos con
 * /app/projects/[id]/historical — una sola fuente de verdad).
 */

import PageHeader from '@components/PageHeader';
import PortfolioDashboard from '@components/dashboard/PortfolioDashboard';
import { useI18n } from '@lib/i18n';
import { usePageRefresh } from '@hooks/usePageRefresh';

export default function DashboardPage() {
  const { t } = useI18n();
  const { refreshing, onRefresh } = usePageRefresh();

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <PageHeader
        onRefresh={onRefresh} refreshing={refreshing}
        title={t('webDash.title')}
        subtitle={t('webDash.portfolioSubtitle')}
        crumbs={[{ label: t('webDash.title') }]}
      />
      <div className="flex-1 max-w-screen-2xl w-full mx-auto px-4 lg:px-6 py-5">
        <PortfolioDashboard />
      </div>
    </div>
  );
}
