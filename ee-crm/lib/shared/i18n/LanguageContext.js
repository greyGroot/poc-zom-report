'use client';

import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { translations, defaultLocale, locales } from './translations';

const LanguageContext = createContext({
  locale: defaultLocale,
  setLocale: () => {},
  t: (keyPath, params = {}) => keyPath,
  formatUrl: (path) => path,
});

export function LanguageProvider({ children }) {
  const pathname = usePathname() || '/';
  const router = useRouter();

  // Detect locale from path: e.g. /uk, /uk/..., /pl, /pl/...
  const currentLocale = useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length > 0 && locales.includes(segments[0])) {
      return segments[0];
    }
    return defaultLocale;
  }, [pathname]);

  // Helper to format any URL according to locale:
  // if locale === 'en' (default) -> /teachers/123
  // if locale === 'uk' -> /uk/teachers/123
  // if locale === 'pl' -> /pl/teachers/123
  const formatUrl = useCallback((path, targetLocale = currentLocale) => {
    // Strip existing locale prefix if present
    const segments = path.split('/').filter(Boolean);
    if (segments.length > 0 && locales.includes(segments[0])) {
      segments.shift();
    }
    const cleanPath = '/' + segments.join('/');

    if (targetLocale === defaultLocale) {
      return cleanPath === '' ? '/' : cleanPath;
    }
    return cleanPath === '/' ? `/${targetLocale}` : `/${targetLocale}${cleanPath}`;
  }, [currentLocale]);

  // Change locale by navigating to the new route prefix
  const setLocale = useCallback((newLocale) => {
    if (!locales.includes(newLocale)) return;
    if (newLocale === currentLocale) return;

    const newUrl = formatUrl(pathname, newLocale);
    router.push(newUrl);
  }, [currentLocale, pathname, router, formatUrl]);

  // Translation function
  const t = useCallback((path, params = {}) => {
    const keys = path.split('.');
    let val = translations[currentLocale];

    for (const k of keys) {
      if (val && typeof val === 'object' && k in val) {
        val = val[k];
      } else {
        // Fallback to defaultLocale
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
  }, [currentLocale]);

  return (
    <LanguageContext.Provider value={{ locale: currentLocale, setLocale, t, formatUrl }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
