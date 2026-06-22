/**
 * i18n (v46) — Núcleo de internacionalización (móvil). Sin dependencias nativas.
 *  - `LanguageProvider`: carga el idioma persistido (AsyncStorage, POR DISPOSITIVO),
 *    lo expone y lo cambia. Re-renderiza la app al cambiar.
 *  - `useI18n()`: hook → `{ lang, setLang, t }`. `t('clave', { var })` traduce + interpola.
 *  - `tx('clave', params)`: versión IMPERATIVA (Alert/servicios) que lee el idioma actual.
 *  Default `es`. Fallback por clave: idioma activo → es → la clave literal.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STRINGS, type Lang, LANGS } from './strings';
import { STRINGS_EXTRA } from './strings.extra';
import { STRINGS_SCREENS } from './screens';

/** Catálogo combinado: base + extra + por-pantalla (las últimas ganan en conflicto). */
const ALL_STRINGS: Record<string, { es: string; en: string; pt: string }> = { ...STRINGS, ...STRINGS_EXTRA, ...STRINGS_SCREENS };

const STORAGE_KEY = '@scua_language';
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

/** Traducción IMPERATIVA (lee el idioma actual del módulo). Para Alert/servicios. */
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
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && saved && (LANGS as string[]).includes(saved)) {
          currentLang = saved as Lang;
          setLangState(saved as Lang);
        }
      } catch { /* sin persistencia → default es */ }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const setLang = useCallback((l: Lang) => {
    currentLang = l;
    setLangState(l);
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => { /* persistencia best-effort */ });
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
