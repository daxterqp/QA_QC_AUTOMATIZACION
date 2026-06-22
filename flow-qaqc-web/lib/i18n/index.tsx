'use client';
/**
 * i18n (web, v46.1) — ESPEJO del núcleo móvil (src/i18n/index.tsx) adaptado a web:
 *  - Persistencia en `localStorage` (POR NAVEGADOR) en vez de AsyncStorage.
 *  - El catálogo de cadenas (strings/strings.extra/screens) es BYTE-ESPEJO del móvil.
 *  - `LanguageProvider`: carga el idioma persistido, lo expone y lo cambia.
 *  - `useI18n()`: hook → `{ lang, setLang, t }`. `t('clave', { var })` traduce + interpola.
 *  - `tx('clave', params)`: versión IMPERATIVA (servicios) que lee el idioma actual.
 *  Default `es`. Fallback por clave: idioma activo → es → la clave literal.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { STRINGS, type Lang, LANGS } from './strings';
import { STRINGS_EXTRA } from './strings.extra';
import { STRINGS_SCREENS } from './screens';
import { STRINGS_WEB } from './web';
import { STRINGS_WEB_UPLOAD } from './web.upload';
import { STRINGS_WEB_DASH } from './web.dash';
import { STRINGS_WEB_PROTO } from './web.proto';
import { STRINGS_WEB_DOSSIER } from './web.dossier';
import { STRINGS_WEB_ENSAYOS } from './web.ensayos';
import { STRINGS_WEB_MISC } from './web.misc';
import { STRINGS_WEB_CSECTORS } from './web.csectors';
import { STRINGS_WEB_CMEASURE } from './web.cmeasure';
import { STRINGS_WEB_CNUMERIC } from './web.cnumeric';
import { STRINGS_WEB_CHIST } from './web.chist';
import { STRINGS_WEB_CMISC } from './web.cmisc';

/** Catálogo combinado: base + extra + por-pantalla (espejo del móvil) + web-only (por grupo). */
const ALL_STRINGS: Record<string, { es: string; en: string; pt: string }> = {
  ...STRINGS, ...STRINGS_EXTRA, ...STRINGS_SCREENS,
  ...STRINGS_WEB, ...STRINGS_WEB_UPLOAD, ...STRINGS_WEB_DASH,
  ...STRINGS_WEB_PROTO, ...STRINGS_WEB_DOSSIER, ...STRINGS_WEB_ENSAYOS, ...STRINGS_WEB_MISC,
  ...STRINGS_WEB_CSECTORS, ...STRINGS_WEB_CMEASURE, ...STRINGS_WEB_CNUMERIC, ...STRINGS_WEB_CHIST, ...STRINGS_WEB_CMISC,
};

const STORAGE_KEY = 'scua_language';
const DEFAULT_LANG: Lang = 'es';

/** Idioma actual a nivel módulo (para `tx` imperativo fuera de React). */
let currentLang: Lang = DEFAULT_LANG;

function interpolate(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));
}

/** Traduce una clave en un idioma dado (fallback: idioma → es → clave). */
export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const entry = ALL_STRINGS[key];
  const raw = entry ? (entry[lang] ?? entry.es) : key;
  return interpolate(raw, params);
}

/** Traducción IMPERATIVA (lee el idioma actual del módulo). Para servicios. */
export function tx(key: string, params?: Record<string, string | number>): string {
  return translate(currentLang, key, params);
}

export function getCurrentLang(): Lang {
  return currentLang;
}

/** Mapa de locale para fechas/números por idioma. */
export const LOCALE_BCP47: Record<Lang, string> = { es: 'es-PE', en: 'en-US', pt: 'pt-BR' };
export function currentLocale(): string {
  return LOCALE_BCP47[currentLang];
}

interface I18nContextValue {
  lang: Lang;
  ready: boolean;
  setLang: (l: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: DEFAULT_LANG,
  ready: true,
  setLang: () => {},
  t: (k) => translate(DEFAULT_LANG, k),
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(currentLang);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (saved && (LANGS as string[]).includes(saved)) {
        currentLang = saved as Lang;
        setLangState(saved as Lang);
      }
    } catch { /* sin persistencia → default es */ }
    setReady(true);
  }, []);

  const setLang = useCallback((l: Lang) => {
    currentLang = l;
    setLangState(l);
    try { window.localStorage.setItem(STORAGE_KEY, l); } catch { /* best-effort */ }
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>) => translate(lang, key, params), [lang]);

  const value = useMemo<I18nContextValue>(() => ({ lang, ready, setLang, t }), [lang, ready, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

export type { Lang } from './strings';
export { LANGS, LANG_LABEL } from './strings';
