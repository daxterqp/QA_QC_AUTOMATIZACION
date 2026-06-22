'use client';

import { Box } from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { useI18n } from '@lib/i18n';

export default function AboutPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PageHeader
        title={t('webMisc.aboutUs')}
        crumbs={[{ label: t('webMisc.crumbMyAccount'), href: '/app/me' }, { label: t('webMisc.aboutUs') }]}
      />
      <div className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 flex flex-col gap-4">
        <div className="flex flex-col items-center py-4 text-center">
          <div className="w-16 h-16 rounded-full bg-navy flex items-center justify-center mb-3">
            <Box size={30} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-navy tracking-wide">Flow QC</h1>
          <p className="text-sm text-muted mt-1 max-w-md">{t('webMisc.aboutTagline')}</p>
        </div>

        <section className="bg-white rounded-xl shadow-subtle p-5">
          <h2 className="text-base font-bold text-navy mb-2">{t('webMisc.whoWeAre')}</h2>
          <p className="text-sm text-navy/70 leading-relaxed">
            {t('webMisc.whoWeAreBody')}
          </p>
        </section>

        <section className="bg-white rounded-xl shadow-subtle p-5">
          <h2 className="text-base font-bold text-navy mb-2">Teamvastoria</h2>
          <p className="text-sm text-navy/70 leading-relaxed">
            {t('webMisc.teamvastoriaBody')}
          </p>
        </section>

        <section className="bg-white rounded-xl shadow-subtle p-5">
          <h2 className="text-base font-bold text-navy mb-2">{t('webMisc.ourMission')}</h2>
          <p className="text-sm text-navy/70 leading-relaxed">
            {t('webMisc.ourMissionBody')}
          </p>
        </section>

        <p className="text-[11px] text-muted text-center mt-2">{t('webMisc.versionLine')}</p>
      </div>
    </div>
  );
}
