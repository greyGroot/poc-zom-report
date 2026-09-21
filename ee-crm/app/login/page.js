'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/i18n/LanguageContext';

function LoginContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t, formatUrl } = useLanguage();

  const [isLoading, setIsLoading] = useState(false);

  const callbackUrl = searchParams.get('callbackUrl') || formatUrl('/');
  const error = searchParams.get('error');

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(callbackUrl);
    }
  }, [status, callbackUrl, router]);

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      await signIn('google', { callbackUrl });
    } catch (err) {
      console.error('Sign-in failed:', err);
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Logo / Header */}
        <div className="login-header">
          <div className="login-brand-icon">🇬🇧</div>
          <h1 className="login-title">{t('auth.signInTitle')}</h1>
          <p className="login-subtitle">{t('auth.signInSubtitle')}</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="login-alert login-alert-danger">
            <span className="login-alert-icon">⚠️</span>
            <div className="login-alert-content">
              <strong>{t('common.error')}</strong>
              <p>
                {error === 'AccessDenied'
                  ? t('auth.accessDeniedError')
                  : error === 'OAuthCallback'
                  ? t('auth.accessDeniedError')
                  : t('auth.sessionExpired')}
              </p>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="login-actions">
          <button
            type="button"
            className="btn-google-signin"
            onClick={handleGoogleSignIn}
            disabled={isLoading || status === 'loading'}
          >
            {isLoading ? (
              <span className="btn-spinner" />
            ) : (
              <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span>{isLoading ? t('auth.signingIn') : t('auth.signInWithGoogle')}</span>
          </button>
        </div>

        {/* Security / Scope Notice */}
        <div className="login-notice">
          <div className="login-notice-badge">🛡️ {t('auth.accessRestricted')}</div>
          <p className="login-notice-text">{t('auth.accessRestrictedDesc')}</p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="loading-state">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
