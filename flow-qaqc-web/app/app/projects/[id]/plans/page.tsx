'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { FileText, Plus, ExternalLink } from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { usePlansList } from '@hooks/usePlanViewer';
import { useProject } from '@hooks/useProjects';
import { s3Url } from '@lib/pdfGenerator';
import { cn } from '@lib/utils';

export default function PlansPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { data: project } = useProject(projectId);
  const { data: plans, isLoading } = usePlansList(projectId);

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PageHeader
        title="Visor de Planos"
        subtitle={project?.name}
        crumbs={[
          { label: 'Proyectos', href: '/app/projects' },
          { label: project?.name ?? '…', href: `/app/projects/${projectId}/locations` },
          { label: 'Planos' },
        ]}
        rightContent={
          <Link
            href={`/app/projects/${projectId}/file-upload`}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <Plus size={14} />
            Subir plano
          </Link>
        }
      />

      <div className="flex-1 p-6 max-w-4xl mx-auto w-full">
        {isLoading && (
          <div className="flex items-center justify-center py-20 text-muted text-sm">
            Cargando planos…
          </div>
        )}

        {!isLoading && (!plans || plans.length === 0) && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <FileText size={48} className="text-muted opacity-40" />
            <p className="text-muted text-sm">No hay planos cargados aún.</p>
            <Link
              href={`/app/projects/${projectId}/file-upload`}
              className="text-primary text-sm font-semibold hover:underline"
            >
              Ir a Configuración → Planos PDF para subir uno
            </Link>
          </div>
        )}

        {!isLoading && plans && plans.length > 0 && (
          <div className="flex flex-col gap-3">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="bg-white border border-border rounded-xl p-4 flex items-center gap-4 shadow-card hover:shadow-modal transition-shadow"
              >
                {/* Icon */}
                <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FileText size={22} className="text-primary" />
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-navy text-sm truncate">{plan.name}</p>
                  <p className="text-muted text-xs mt-0.5">
                    {plan.file_type?.toUpperCase() ?? 'PDF'} ·{' '}
                    {new Date(plan.created_at).toLocaleDateString('es-CL')}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {/* Open in new tab (raw PDF) */}
                  {plan.s3_key && (
                    <a
                      href={s3Url(plan.s3_key)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir PDF en nueva pestaña"
                      className="p-2 rounded-lg text-muted hover:text-primary hover:bg-primary/10 transition"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}

                  {/* Open viewer */}
                  <Link
                    href={`/app/projects/${projectId}/plans/${plan.id}`}
                    className={cn(
                      'px-4 py-2 rounded-lg text-xs font-bold transition',
                      plan.s3_key
                        ? 'bg-primary text-white hover:bg-primary/90'
                        : 'bg-border text-muted cursor-not-allowed pointer-events-none'
                    )}
                  >
                    Ver plano
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
