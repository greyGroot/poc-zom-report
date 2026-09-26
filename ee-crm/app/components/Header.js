'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import LanguageSelector from './LanguageSelector';

export default function Header() {
  const { t, formatUrl } = useLanguage();
  const { data: session, status } = useSession();
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const user = session?.user;
  const initial = user?.name
    ? user.name.charAt(0).toUpperCase()
    : user?.email
    ? user.email.charAt(0).toUpperCase()
    : 'U';

  const isBypass = process.env.NEXT_PUBLIC_EE_CRM_AUTH_BYPASS === 'true';
  const canNavigate = status === 'authenticated' || isBypass;

  return (
    <header className="navbar">
      <div className="nav-inner">
        <Link href={formatUrl('/')} className="nav-brand">
          <span>{t('common.brand')}</span>
          <span className="brand-badge">v.0.0.1</span>
        </Link>

        <div className="nav-right">
          {canNavigate && (
            <nav className="nav-links">
              <Link href={formatUrl('/')} className="nav-link">
                <span>👥</span>
                <span>{t('common.teachers')}</span>
              </Link>
              <Link href={formatUrl('/logs')} className="nav-link">
                <span>📋</span>
                <span>{t('common.systemLogs')}</span>
              </Link>
            </nav>
          )}

          <LanguageSelector />

          {status === 'authenticated' && user && (
            <div className="user-profile-wrapper" ref={dropdownRef}>
              <button
                type="button"
                className={`user-profile-trigger ${profileOpen ? 'open' : ''}`}
                onClick={() => setProfileOpen(!profileOpen)}
                aria-label="User profile menu"
              >
                {user.image ? (
                  <img src={user.image} alt={user.name || 'User'} className="user-avatar-img" />
                ) : (
                  <div className="user-avatar-fallback">{initial}</div>
                )}
                <span className="user-name-text">{user.name || user.email}</span>
                <span className="user-chevron">▼</span>
              </button>

              {profileOpen && (
                <div className="user-dropdown-menu">
                  <div className="user-dropdown-info">
                    <p className="user-dropdown-name">{user.name || 'Faculty Member'}</p>
                    <p className="user-dropdown-email">{user.email}</p>
                  </div>
                  <div className="user-dropdown-divider" />
                  <button
                    type="button"
                    className="user-dropdown-item user-signout-btn"
                    onClick={() => signOut({ callbackUrl: formatUrl('/login') })}
                  >
                    <span>🚪</span>
                    <span>{t('auth.signOut')}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {status === 'unauthenticated' && !isBypass && (
            <Link href={formatUrl('/login')} className="btn-signin-link">
              <span>{t('auth.signInWithGoogle')}</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

