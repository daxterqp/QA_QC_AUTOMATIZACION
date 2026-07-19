'use client';

/**
 * /app/projects/[id]/historical — Dashboard POR PROYECTO (título "Dashboard").
 * Shell fino: todo el cuerpo vive en components/dashboard/ProjectDashboard,
 * compartido con el drill-down del portafolio (/app/dashboard).
 */

import { useParams } from 'next/navigation';
import PageHeader from '@components/PageHeader';
import ProjectDashboard from '@components/dashboard/ProjectDashboard';
import { useProjects } from '@hooks/useProjects';
import { useI18n } from '@lib/i18n';
import { usePageRefresh } from '@hooks/usePageRefresh';

export default function HistoricalPage() {
  const { refreshing, onRefresh } = usePageRefresh();
  const { id: projectId } = useParams<{ id: string }>();
  const { t } = useI18n();
  const { data: projects = [] } = useProjects();
  const project = projects.find(p => p.id === projectId);

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <PageHeader
        onRefresh={onRefresh} refreshing={refreshing}
        title={t('webDossier.dashboardTitle')}
        subtitle={project?.name}
        crumbs={[
          { label: t('webDossier.crumbProjects'), href: '/app/projects' },
          { label: project?.name ?? '…' },
        ]}
      />
      <div className="flex-1 max-w-screen-2xl w-full mx-auto px-4 lg:px-6 py-5">
        <ProjectDashboard projectId={projectId} />
      </div>
    </div>
  );
}
