'use client';

import { useLanguage } from '@/lib/i18n/LanguageContext';

const LANGUAGES = [
  { code: 'en', label: 'EN', fullLabel: 'English', flag: '🇬🇧' },
  { code: 'uk', label: 'UK', fullLabel: 'Українська', flag: '🇺🇦' },
  { code: 'pl', label: 'PL', fullLabel: 'Polski', flag: '🇵🇱' },
];

export default function LanguageSelector() {
  const { locale, setLocale } = useLanguage();

  return (
    <div className="language-selector" aria-label="Select language">
      {LANGUAGES.map((lang) => {
        const isActive = locale === lang.code;
        return (
          <button
            key={lang.code}
            type="button"
            className={`lang-btn ${isActive ? 'active' : ''}`}
            onClick={() => setLocale(lang.code)}
            title={lang.fullLabel}
          >
            <span className="lang-flag">{lang.flag}</span>
            <span className="lang-code">{lang.label}</span>
          </button>
        );
      })}
    </div>
  );
}
