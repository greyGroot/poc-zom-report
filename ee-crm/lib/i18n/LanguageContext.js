'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { translations, defaultLocale, locales } from './translations';

const LanguageContext = createContext({
  locale: defaultLocale,
  setLocale: () => {},
  t: (keyPath, params = {}) => keyPath,
});

function LanguageSync({ locale, setLocaleState }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // 1. Sync from URL param ?lang=xx if present
  useEffect(() => {
    const langParam = searchParams.get('lang');
    if (langParam && locales.includes(langParam)) {
      if (langParam !== locale) {
        setLocaleState(langParam);
        try {
          localStorage.setItem('eecrm_locale', langParam);
        } catch (e) {}
      }
    } else {
      // If no ?lang in URL, check localStorage or default
      try {
        const saved = localStorage.getItem('eecrm_locale');
        const targetLocale = (saved && locales.includes(saved)) ? saved : defaultLocale;
        if (targetLocale !== locale) {
          setLocaleState(targetLocale);
        }
        // Update URL query string to reflect language in route
        const params = new URLSearchParams(searchParams.toString());
        params.set('lang', targetLocale);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      } catch (e) {}
    }
  }, [searchParams, pathname, router, locale, setLocaleState]);

  return null;
}

export function LanguageProvider({ children }) {
  const [locale, setLocaleState] = useState(defaultLocale);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setLocale = useCallback((newLocale) => {
    if (locales.includes(newLocale)) {
      setLocaleState(newLocale);
      try {
        localStorage.setItem('eecrm_locale', newLocale);
      } catch (e) {}

      // Update URL search query ?lang=...
      const params = new URLSearchParams(searchParams.toString());
      params.set('lang', newLocale);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [pathname, router, searchParams]);

  // Translation lookup function
  const t = useCallback((path, params = {}) => {
    const keys = path.split('.');
    let val = translations[locale];

    for (const k of keys) {
      if (val && typeof val === 'object' && k in val) {
        val = val[k];
      } else {
        // fallback to defaultLocale
        let fallbackVal = translations[defaultLocale];
        for (const fk of keys) {
          if (fallbackVal && typeof fallbackVal === 'object' && fk in fallbackVal) {
            fallbackVal = fallbackVal[fk];
          } else {
            fallbackVal = null;
            break;
          }
        }
        val = fallbackVal;
        break;
      }
    }

    if (typeof val !== 'string') {
      return path;
    }

    // Replace {params}
    return Object.keys(params).reduce((acc, curr) => {
      return acc.replaceAll(`{${curr}}`, params[curr]);
    }, val);
  }, [locale]);

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      <LanguageSync locale={locale} setLocaleState={setLocaleState} />
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
