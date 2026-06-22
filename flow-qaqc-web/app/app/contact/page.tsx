'use client';

import { Mail, Phone, MessageCircle, ChevronRight } from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { useI18n } from '@lib/i18n';

const CONTACT_EMAIL = 'admin@teamvastoria.com';
const CONTACT_PHONE = '+51 973785282';
const PHONE_DIGITS = CONTACT_PHONE.replace(/[^0-9]/g, '');

export default function ContactPage() {
  const { t } = useI18n();
  const rows = [
    { icon: Mail, label: t('webMisc.contactEmail'), value: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}`, color: 'text-primary' },
    { icon: MessageCircle, label: 'WhatsApp', value: CONTACT_PHONE, href: `https://wa.me/${PHONE_DIGITS}`, color: 'text-success' },
    { icon: Phone, label: t('webMisc.contactPhone'), value: CONTACT_PHONE, href: `tel:+${PHONE_DIGITS}`, color: 'text-secondary' },
  ];
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PageHeader
        title={t('webMisc.contactUs')}
        crumbs={[{ label: t('webMisc.crumbMyAccount'), href: '/app/me' }, { label: t('webMisc.contactUs') }]}
      />
      <div className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 flex flex-col gap-3">
        <p className="text-sm text-navy/70 leading-relaxed mb-1">
          {t('webMisc.contactIntro')}
        </p>
        {rows.map(({ icon: Icon, label, value, href, color }) => (
          <a key={label} href={href} target="_blank" rel="noreferrer"
            className="bg-white rounded-xl shadow-subtle px-4 py-3.5 flex items-center gap-3 hover:shadow-md transition">
            <div className="w-10 h-10 rounded-full bg-divider flex items-center justify-center flex-shrink-0">
              <Icon size={18} className={color} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-muted uppercase tracking-wider font-bold">{label}</p>
              <p className="text-sm text-navy font-semibold truncate">{value}</p>
            </div>
            <ChevronRight size={16} className="text-muted" />
          </a>
        ))}
        <p className="text-[11px] text-muted text-center mt-3">{t('webMisc.businessHours')}</p>
      </div>
    </div>
  );
}
