'use client';

import React, { useMemo } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getKyivDateString, formatKyivDateHeader } from '@/lib/timezone';
import { useZoomMeetings } from './useZoomMeetings';
import ZoomMeetingCard from './ZoomMeetingCard';

export default function ZoomMeetingsPanel({ teacherId, fromDate, toDate }) {
  const { t, locale } = useLanguage();

  const {
    status,
    meetings,
    totalMeetings,
    error,
    refreshError,
    responsePeriod,
    refresh,
    retry
  } = useZoomMeetings({
    teacherId,
    fromDate,
    toDate
  });

  const isRefreshing = status === 'refreshing';
  const isMultiDay = fromDate && toDate && fromDate !== toDate;
  const periodDisplay = `${fromDate}–${toDate}`;

  // Group meetings by local Kyiv date
  const groupedMeetings = useMemo(() => {
    if (!meetings || meetings.length === 0) return [];

    const groups = new Map();
    for (const m of meetings) {
      const kyivDate = getKyivDateString(m.startTime) || 'Unknown';
      if (!groups.has(kyivDate)) {
        groups.set(kyivDate, []);
      }
      groups.get(kyivDate).push(m);
    }

    return Array.from(groups.entries()).map(([dateStr, items]) => ({
      date: dateStr,
      items
    }));
  }, [meetings]);

  // Count label for successful results
  const countLabel = useMemo(() => {
    if (status !== 'success' && status !== 'refreshing') return null;
    if (totalMeetings === 1) {
      return t('schedule.zoomMeetingCountSingular', { count: 1 });
    }
    return t('schedule.zoomMeetingCountPlural', { count: totalMeetings });
  }, [status, totalMeetings, t]);

  return (
    <section
      className="telemetry-column"
      aria-label={t('schedule.zoomMeetingsTitle')}
    >
      <div className="telemetry-card">
        {/* Header */}
        <div className="telemetry-header">
          <div className="telemetry-header-info">
            <h2 className="telemetry-title">
              <span>🎥</span>
              <span>{t('schedule.zoomMeetingsTitle')}</span>
              {countLabel && (
                <span className="badge badge-neutral zoom-count-badge">
                  {countLabel}
                </span>
              )}
            </h2>
            <p className="telemetry-subtitle">
              {t('schedule.zoomMeetingsSubtitle')}
            </p>
            <div className="zoom-period-tag">
              <span>📅 {periodDisplay}</span>
            </div>
          </div>

          <div className="telemetry-header-actions">
            <button
              type="button"
              id="refreshZoomBtn"
              className="btn btn-secondary btn-sm"
              onClick={refresh}
              disabled={status === 'loading' || isRefreshing}
              aria-label={t('schedule.refreshZoom')}
            >
              <span>{isRefreshing ? '⏳' : '🔄'}</span>
              <span>{isRefreshing ? t('schedule.refreshing') : t('schedule.refreshZoom')}</span>
            </button>
          </div>
        </div>

        {/* Refresh Error Notification (retains previous results) */}
        {refreshError && (
          <div className="alert alert-warning zoom-refresh-alert" role="alert">
            <span>⚠️</span>
            <span>
              {t('schedule.refreshZoomFailed', { period: responsePeriod ? `${responsePeriod.from}–${responsePeriod.to}` : periodDisplay })}
            </span>
          </div>
        )}

        {/* Body content based on single active state */}
        <div
          className="telemetry-body"
          aria-busy={isRefreshing}
        >
          {/* 1. Loading State */}
          {status === 'loading' && (
            <div className="zoom-loading-container" role="status" aria-live="polite">
              <span className="sr-only">
                {t('schedule.loadingZoomMeetings', { period: periodDisplay })}
              </span>
              <div className="zoom-loading-spinner-wrapper">
                <div className="spinner" />
                <p className="zoom-loading-text">{t('schedule.zoomLoading')}</p>
              </div>

              {/* Skeletons hidden from assistive technology */}
              <div className="zoom-skeleton-list" aria-hidden="true">
                <div className="zoom-card-skeleton" />
                <div className="zoom-card-skeleton" />
                <div className="zoom-card-skeleton" />
              </div>
            </div>
          )}

          {/* 2. Error State */}
          {status === 'error' && (
            <div className="alert alert-error zoom-error-card" role="alert">
              <div className="zoom-error-icon">⚠️</div>
              <div className="zoom-error-content">
                <h3 className="zoom-error-title">{t('schedule.zoomLoadError')}</h3>
                <p className="zoom-error-desc">
                  {t('schedule.zoomLoadErrorBody', { period: periodDisplay })}
                </p>
                {error && <p className="zoom-error-detail">Detail: {error}</p>}
                <button
                  type="button"
                  className="btn btn-primary btn-sm zoom-retry-btn"
                  onClick={retry}
                >
                  🔄 {t('schedule.tryAgain')}
                </button>
              </div>
            </div>
          )}

          {/* 3. Unmapped Teacher State */}
          {status === 'unmapped' && (
            <div className="zoom-unmapped-card">
              <div className="zoom-state-icon">📡</div>
              <h3 className="zoom-state-title">{t('schedule.zoomUnavailable')}</h3>
              <p className="zoom-state-desc">{t('schedule.unmappedTeacher')}</p>
            </div>
          )}

          {/* 4. Neutral Empty State */}
          {status === 'empty' && (
            <div className="zoom-empty-card">
              <div className="zoom-state-icon">📹</div>
              <h3 className="zoom-state-title">{t('schedule.noZoomMeetings')}</h3>
              <p className="zoom-state-desc">
                {t('schedule.noZoomMeetingsBody', { from: fromDate, to: toDate })}
              </p>
              <p className="zoom-state-hint">{t('schedule.noZoomMeetingsPrompt')}</p>
            </div>
          )}

          {/* 5. Success / Refreshing State with Results */}
          {(status === 'success' || status === 'refreshing') && meetings.length > 0 && (
            <div className="zoom-occurrences-container">
              {groupedMeetings.map(group => (
                <div key={group.date} className="zoom-date-group">
                  {isMultiDay && (
                    <h3 className="zoom-date-heading">
                      📅 {formatKyivDateHeader(group.date, locale)}
                    </h3>
                  )}

                  <div className="zoom-meeting-cards-list">
                    {group.items.map(occ => (
                      <ZoomMeetingCard key={occ.id} occurrence={occ} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
