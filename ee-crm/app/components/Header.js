'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import LanguageSelector from './LanguageSelector';

export default function Header() {
  const { t } = useLanguage();

  return (
    <header className="navbar">
      <div className="nav-inner">
        <Link href="/" className="nav-brand">
          <span>{t('common.brand')}</span>
          <span className="brand-badge">v.0.0.1</span>
        </Link>

        <div className="nav-right">
          <nav className="nav-links">
            <Link href="/" className="nav-link">
              <span>👥</span>
              <span>{t('common.teachers')}</span>
            </Link>
            <Link href="/logs" className="nav-link">
              <span>📋</span>
              <span>{t('common.systemLogs')}</span>
            </Link>
          </nav>

          <LanguageSelector />
        </div>
      </div>
    </header>
  );
}
