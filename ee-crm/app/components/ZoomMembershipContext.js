'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/lib/shared/i18n/LanguageContext';
import { formatKyivShortDate, formatKyivDateTime } from '@/lib/utils/timezone';

function statusPresentation(status, t) {
  if (status === 'member') {
    return { label: t('directory.zoomMember'), icon: '●', className: 'zoom-membership-badge--member' };
  }
  if (status === 'pending') {
    return { label: t('directory.zoomPending'), icon: '⏳', className: 'zoom-membership-badge--pending' };
  }
  if (status === 'not_invited') {
    return { label: t('directory.zoomNotInvited'), icon: '○', className: 'zoom-membership-badge--not-invited' };
  }
  return { label: t('zoomMembership.statusUnavailable'), icon: '⚠', className: 'zoom-membership-badge--unavailable' };
}

export default function ZoomMembershipContext({ membership, className = '' }) {
  const { t, locale } = useLanguage();
  const previousSignature = useRef(null);
  const [announcement, setAnnouncement] = useState('');

  const view = useMemo(() => {
    if (!membership) return null;
    const badge = statusPresentation(membership.status, t);
    let memberSinceText = '';
    if (membership.status === 'member') {
      const formatted = membership.memberSince?.state === 'available'
        ? formatKyivShortDate(membership.memberSince.value)
        : '';
      memberSinceText = formatted
        ? t('zoomMembership.memberSince', { date: formatted })
        : t('zoomMembership.memberSinceUnavailable');
    }

    let freshnessText = '';
    const lastSuccessfulAt = membership.freshness?.lastSuccessfulAt;
    const formattedCheck = formatKyivDateTime(lastSuccessfulAt, locale);
    if (membership.freshness?.state === 'stale') {
      freshnessText = t('zoomMembership.stale', { dateTime: formattedCheck || '—' });
    } else if (membership.freshness?.state === 'unavailable') {
      freshnessText = formattedCheck
        ? t('zoomMembership.sourceUnavailableChecked', { dateTime: formattedCheck })
        : t('zoomMembership.sourceUnavailable');
    }

    return {
      badge,
      memberSinceText,
      freshnessText,
      accessibleText: [badge.label, memberSinceText, freshnessText].filter(Boolean).join('. ')
    };
  }, [membership, locale, t]);

  const signature = membership
    ? JSON.stringify([
      membership.status,
      membership.memberSince?.state,
      membership.memberSince?.value,
      membership.freshness?.state
    ])
    : 'loading';

  useEffect(() => {
    if (previousSignature.current === null) {
      previousSignature.current = signature;
      return;
    }
    if (previousSignature.current !== signature && view?.accessibleText) {
      setAnnouncement(view.accessibleText);
      previousSignature.current = signature;
    }
  }, [signature, view]);

  if (!view) {
    return (
      <span className={`zoom-membership-context ${className}`.trim()} role="status" aria-live="polite">
        <span className="zoom-membership-loading">{t('zoomMembership.loading')}</span>
      </span>
    );
  }

  return (
    <span
      className={`zoom-membership-context ${className}`.trim()}
      role="group"
      aria-label={view.accessibleText}
    >
      <span className={`badge zoom-membership-badge ${view.badge.className}`}>
        <span className="zoom-membership-badge-icon" aria-hidden="true">{view.badge.icon}</span>
        <span>{view.badge.label}</span>
      </span>
      {view.memberSinceText && (
        <span className="zoom-membership-date">{view.memberSinceText}</span>
      )}
      {view.freshnessText && (
        <span className="zoom-membership-freshness">
          <span aria-hidden="true">⚠ </span>{view.freshnessText}
        </span>
      )}
      <span className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>
    </span>
  );
}
