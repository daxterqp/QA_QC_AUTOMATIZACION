'use client';

/**
 * Menú intermedio del proyecto (v29).
 * Al entrar a un proyecto desde la lista, el usuario llega aquí primero y
 * elige a qué módulo entrar. Se añadieron Planos, Cargar archivos y Contactos
 * (movidos desde la tarjeta de proyecto). "Ver mapa" se renombró a
 * "Geolocalización" (gateado por map_enabled).
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useProjectFlags, useProjects } from '@hooks/useProjects';
import { useProjectMetrics } from '@hooks/useProjectMetrics';
import { useAuth } from '@lib/auth-context';
import { useI18n } from '@lib/i18n';
import { isTraceabilityEnabled, isGeolocationEnabled } from '@/types';
import PageHeader from '@components/PageHeader';
import {
  List, Timer, Map as MapIcon, ChevronRight,
  FolderOpen, FileUp, Phone, FileText, BookOpen,
  Grid3x3, FlaskConical, CalendarDays, Table2, Trash2,
} from 'lucide-react';

interface MenuOption {
  key: string;
  title: string;
  subtitle: string;
  href: string;
  icon: React.ElementType;
  tone: ToneKey;
  visible: boolean;
}

// Íconos GHOST/tintados (paridad con el móvil): fondo de color al 10% + borde
// al 30% + ícono del color. Clases literales completas para que Tailwind no las purgue.
type ToneKey = 'primary' | 'success' | 'secondary' | 'navy' | 'warning';
const TONE: Record<ToneKey, { box: string; icon: string }> = {
  primary:   { box: 'bg-primary/10 border border-primary/30',     icon: 'text-primary' },
  success:   { box: 'bg-success/10 border border-success/30',     icon: 'text-success' },
  secondary: { box: 'bg-secondary/10 border border-secondary/30', icon: 'text-secondary' },
  navy:      { box: 'bg-navy/10 border border-navy/30',           icon: 'text-navy' },
  warning:   { box: 'bg-warning/10 border border-warning/30',     icon: 'text-warning' },
};

export default function ProjectMenuPage() {
  const { t } = useI18n();
  const { id: projectId } = useParams<{ id: string }>();
  const { data: projects = [] } = useProjects();
  const project = projects.find(p => p.id === projectId);
  const { data: flags } = useProjectFlags(projectId);
  // Parte C — contadores de la tarjeta "Dossier de calidad" (mismos datos que
  // los mini-badges de la lista de proyectos).
  const { data: metrics } = useProjectMetrics(projectId);
  const { currentUser } = useAuth();
  // v43 — Papelera: solo Jefe (RESIDENT) o Creador.
  const isJefeOrCreator = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';

  const options: MenuOption[] = [
    {
      key: 'locations',
      title: t('webEnsayos.menu.locationsTitle'),
      subtitle: t('webEnsayos.menu.locationsSubtitle'),
      href: `/app/projects/${projectId}/locations`,
      icon: List,
      tone: 'primary',
      visible: true,
    },
    // ── v31 (Parte D) — modos de llenado adicionales (conviven entre sí) ──
    {
      key: 'ensayos-sector',
      title: t('webEnsayos.menu.ensayosSectorTitle'),
      subtitle: t('webEnsayos.menu.ensayosSectorSubtitle'),
      href: `/app/projects/${projectId}/ensayos/sector`,
      icon: Grid3x3,
      tone: 'success',
      visible: !!flags && !!flags.fill_by_sector,
    },
    {
      key: 'ensayos-type',
      title: t('webEnsayos.menu.ensayosTypeTitle'),
      subtitle: t('webEnsayos.menu.ensayosTypeSubtitle'),
      href: `/app/projects/${projectId}/ensayos/type`,
      icon: FlaskConical,
      tone: 'secondary',
      visible: !!flags && !!flags.fill_by_type,
    },
    {
      key: 'ensayos-date',
      title: t('webEnsayos.menu.ensayosDateTitle'),
      subtitle: t('webEnsayos.menu.ensayosDateSubtitle'),
      href: `/app/projects/${projectId}/ensayos/date`,
      icon: CalendarDays,
      tone: 'warning',
      visible: !!flags && !!flags.fill_by_date,
    },
    {
      key: 'summary',
      title: t('webEnsayos.menu.summaryTitle'),
      subtitle: t('webEnsayos.menu.summarySubtitle'),
      href: `/app/projects/${projectId}/summary`,
      icon: Table2,
      tone: 'secondary',
      visible: !!flags && !!flags.numeric_protocols,
    },
    {
      key: 'plans',
      title: t('webEnsayos.menu.plansTitle'),
      subtitle: t('webEnsayos.menu.plansSubtitle'),
      href: `/app/projects/${projectId}/plans`,
      icon: FileText,
      tone: 'navy',
      visible: true,
    },
    {
      key: 'file-upload',
      title: t('webEnsayos.menu.fileUploadTitle'),
      subtitle: t('webEnsayos.menu.fileUploadSubtitle'),
      href: `/app/projects/${projectId}/file-upload`,
      icon: FileUp,
      tone: 'secondary',
      visible: true,
    },
    {
      key: 'contacts',
      title: t('webEnsayos.menu.contactsTitle'),
      subtitle: t('webEnsayos.menu.contactsSubtitle'),
      href: `/app/projects/${projectId}/contacts`,
      icon: Phone,
      tone: 'warning',
      visible: true,
    },
    {
      key: 'recycle-bin',
      title: t('webEnsayos.menu.recycleBinTitle'),
      subtitle: t('webEnsayos.menu.recycleBinSubtitle'),
      href: `/app/projects/${projectId}/papelera`,
      icon: Trash2,
      tone: 'navy',
      visible: isJefeOrCreator,
    },
    {
      key: 'traceability',
      title: t('webEnsayos.menu.traceabilityTitle'),
      subtitle: t('webEnsayos.menu.traceabilitySubtitle'),
      href: `/app/projects/${projectId}/traceability`,
      icon: Timer,
      tone: 'warning',
      visible: !!flags && isTraceabilityEnabled(flags),
    },
    {
      key: 'map',
      title: t('webEnsayos.menu.mapTitle'),
      subtitle: t('webEnsayos.menu.mapSubtitle'),
      // Web no tiene visor de mapa nativo; el módulo de geolocalización en web
      // se centra en la gestión de sectores. El visor pleno con pines vive en móvil.
      href: `/app/projects/${projectId}/file-upload?tab=sectores`,
      icon: MapIcon,
      tone: 'success',
      visible: !!flags && isGeolocationEnabled(flags),
    },
  ];

  const visibleOptions = options.filter(o => o.visible);

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <PageHeader
        title={project?.name ?? t('webEnsayos.menu.fallbackProject')}
        subtitle={t('webEnsayos.menu.projectHome')}
        crumbs={[{ label: t('webEnsayos.menu.crumbProjects'), href: '/app/projects' }, { label: project?.name ?? '…' }]}
      />

      <div className="flex-1 p-4 max-w-3xl w-full mx-auto">
        {/* Hero */}
        <div className="bg-white rounded-xl shadow-card border border-border p-5 mb-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
            <FolderOpen size={24} className="text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-extrabold text-textPrimary">{t('webEnsayos.menu.whatToDo')}</h2>
            <p className="text-sm text-textSecondary mt-1">{t('webEnsayos.menu.chooseOption')}</p>
          </div>
        </div>

        {/* Opciones */}
        <div className="flex flex-col gap-3 mb-6">
          {/* Parte C — Dossier de calidad SIEMPRE primero, enlaza al dossier
              existente (sin duplicarlo) y muestra el estado del proyecto. */}
          <Link
            href={`/app/projects/${projectId}/dossier`}
            className="bg-white rounded-xl shadow-card border border-border p-4 flex items-center gap-4 hover:shadow-lg hover:border-primary/30 transition group"
          >
            <div className={`w-14 h-14 rounded-lg flex items-center justify-center ${TONE.success.box} ${TONE.success.icon}`}>
              <BookOpen size={26} />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-extrabold text-textPrimary">{t('webEnsayos.menu.dossierTitle')}</h3>
              <p className="text-sm text-textSecondary mt-1 leading-snug">{t('webEnsayos.menu.dossierSubtitle')}</p>
              {/* v32 — chips outline (solo borde de color) para no robar atención */}
              <div className="flex items-center gap-1.5 mt-2">
                <span className="border border-success text-success bg-white text-[10px] font-bold rounded px-1.5 py-0.5">{t('webEnsayos.menu.approvedChip', { n: metrics?.approvedProtocols ?? 0 })}</span>
                <span className="border border-primary text-primary bg-white text-[10px] font-bold rounded px-1.5 py-0.5">{t('webEnsayos.menu.inReviewChip', { n: metrics?.pendingReview ?? 0 })}</span>
                <span className="border border-danger text-danger bg-white text-[10px] font-bold rounded px-1.5 py-0.5">{t('webEnsayos.menu.rejectedChip', { n: metrics?.rejectedProtocols ?? 0 })}</span>
              </div>
            </div>
            <ChevronRight size={20} className="text-textMuted group-hover:text-primary transition" />
          </Link>

          {visibleOptions.map(opt => {
            const Icon = opt.icon;
            return (
              <Link
                key={opt.key}
                href={opt.href}
                className="bg-white rounded-xl shadow-card border border-border p-4 flex items-center gap-4 hover:shadow-lg hover:border-primary/30 transition group"
              >
                <div className={`w-14 h-14 rounded-lg flex items-center justify-center ${TONE[opt.tone].box} ${TONE[opt.tone].icon}`}>
                  <Icon size={26} />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-extrabold text-textPrimary">{opt.title}</h3>
                  <p className="text-sm text-textSecondary mt-1 leading-snug">{opt.subtitle}</p>
                </div>
                <ChevronRight size={20} className="text-textMuted group-hover:text-primary transition" />
              </Link>
            );
          })}
        </div>

      </div>
    </div>
  );
}
