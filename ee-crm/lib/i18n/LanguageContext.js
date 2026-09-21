'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, defaultLocale, locales } from './translations';

const LanguageContext = createContext({
  locale: defaultLocale,
  setLocale: () => {},
  t: (keyPath, params = {}) => keyPath,
});

export function LanguageProvider({ children }) {
  const [locale, setLocaleState] = useState(defaultLocale);

  // Initialize from localStorage if available
  useEffect(() => {
    try {
      const saved = localStorage.getItem('eecrm_locale');
      if (saved && locales.includes(saved)) {
        setLocaleState(saved);
      }
    } catch (e) {
      // localStorage may be unavailable
    }
  }, []);

  const setLocale = (newLocale) => {
    if (locales.includes(newLocale)) {
      setLocaleState(newLocale);
      try {
        localStorage.setItem('eecrm_locale', newLocale);
      } catch (e) {
        // ignore
      }
    }
  };

  // Translation function: t('directory.title') or t('directory.deleteModalBody', { name: 'John' })
  const t = (path, params = {}) => {
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
  };

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
