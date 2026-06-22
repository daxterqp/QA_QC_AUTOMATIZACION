'use client';
/**
 * LanguageSelector (web, v46.1) — selector de idioma compacto para la barra lateral.
 * Espejo funcional del selector del menú móvil: cambia el idioma activo (es/en/pt),
 * persistido por navegador en localStorage vía LanguageProvider.
 */
import { Globe } from 'lucide-react';
import { useI18n, LANGS, LANG_LABEL, type Lang } from '@lib/i18n';

export default function LanguageSelector() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="flex items-center gap-2 px-1">
      <Globe size={14} className="text-light flex-shrink-0" />
      <select
        aria-label={t('drawer.language')}
        value={lang}
        onChange={e => setLang(e.target.value as Lang)}
        className="flex-1 min-w-0 bg-white/10 text-light text-xs font-semibold rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer hover:bg-white/15 transition"
      >
        {LANGS.map(l => (
          <option key={l} value={l} className="text-navy">{LANG_LABEL[l]}</option>
        ))}
      </select>
    </div>
  );
}
