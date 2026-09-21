'use client';

import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

const LANGUAGES = [
  { code: 'en', label: 'EN', fullLabel: 'English', flag: '🇬🇧' },
  { code: 'uk', label: 'UA', fullLabel: 'Українська', flag: '🇺🇦' },
  { code: 'pl', label: 'PL', fullLabel: 'Polski', flag: '🇵🇱' },
];

export default function LanguageSelector() {
  const { locale, setLocale } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const currentLang = LANGUAGES.find((l) => l.code === locale) || LANGUAGES[0];

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (code) => {
    setLocale(code);
    setIsOpen(false);
  };

  return (
    <div className="lang-dropdown-wrapper" ref={dropdownRef}>
      {/* Trigger: single selected option pill */}
      <button
        type="button"
        className={`lang-dropdown-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="lang-flag">{currentLang.flag}</span>
        <span className="lang-name">{currentLang.fullLabel}</span>
        <span className="lang-chevron">{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="lang-dropdown-menu" role="listbox">
          {LANGUAGES.map((lang) => {
            const isSelected = lang.code === locale;
            return (
              <button
                key={lang.code}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`lang-dropdown-item ${isSelected ? 'selected' : ''}`}
                onClick={() => handleSelect(lang.code)}
              >
                <div className="lang-item-content">
                  <span className="lang-flag">{lang.flag}</span>
                  <span className="lang-item-name">{lang.fullLabel}</span>
                </div>
                {isSelected && <span className="lang-checkmark">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
