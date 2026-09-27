'use client';

import React, { useState, useCallback } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { formatKyivTime, formatDuration } from '@/lib/timezone';
import ZoomParticipants from './ZoomParticipants';

export default function ZoomMeetingCard({ occurrence }) {
  const { t, locale } = useLanguage();
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [techOpen, setTechOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState(null); // null | 'copied' | 'error'

  const safeId = occurrence.id;
  const topic = occurrence.topic || t('schedule.untitledMeeting');
  const startTimeStr = formatKyivTime(occurrence.startTime, locale);
  const endTimeStr = occurrence.endTime ? formatKyivTime(occurrence.endTime, locale) : null;
  const pCount = occurrence.participantsCount || 0;

  // Duration formatting with neutral semantics
  let durationDisplay = '';
  if (occurrence.durationState === 'complete' && typeof occurrence.durationMinutes === 'number') {
    durationDisplay = formatDuration(occurrence.durationMinutes, locale);
  } else if (occurrence.durationState === 'incomplete') {
    if (typeof occurrence.durationMinutes === 'number' && occurrence.durationMinutes > 0) {
      const durStr = formatDuration(occurrence.durationMinutes, locale);
      durationDisplay = t('schedule.atLeastDuration', { duration: durStr });
    } else {
      durationDisplay = t('schedule.durationUnavailable');
    }
  } else {
    durationDisplay = t('schedule.durationUnavailable');
  }

  // Participants count label with singular / plural
  const participantsCountLabel = pCount === 1
    ? (t('schedule.participantsCountSingular') || '1 participant')
    : `${pCount} ${locale === 'uk' ? 'учасників' : locale === 'pl' ? 'uczestników' : 'participants'}`;

  // Clipboard copy
  const handleCopyUuid = useCallback(async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(occurrence.uuid);
        setCopyStatus('copied');
      } else {
        // Fallback for non-secure / headless contexts
        const textarea = document.createElement('textarea');
        textarea.value = occurrence.uuid;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopyStatus('copied');
      }
    } catch {
      setCopyStatus('error');
    }

    setTimeout(() => {
      setCopyStatus(null);
    }, 3000);
  }, [occurrence.uuid]);

  const timeDisplay = (startTimeStr && endTimeStr)
    ? `${startTimeStr} – ${endTimeStr}`
    : (startTimeStr || '—');

  return (
    <article
      className={`zoom-meeting-card ${participantsOpen ? 'expanded' : ''}`}
      aria-label={`${topic}, ${timeDisplay}`}
    >
      {/* Symmetrical Summary Bar */}
      <div
        className="zoom-card-primary"
        onClick={() => pCount > 0 && setParticipantsOpen(prev => !prev)}
        style={{ cursor: pCount > 0 ? 'pointer' : 'default' }}
      >
        <div className="zoom-card-time-topic">
          {/* Symmetrical Time Range Badge */}
          <span className="lesson-time-badge" style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
            {timeDisplay}
          </span>

          <h3 className="zoom-meeting-topic" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
            {topic}
          </h3>

          {/* Duration Badge */}
          <span className="lesson-duration" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            ⏱️ {durationDisplay}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {occurrence.numericMeetingId && (
            <span className="badge badge-neutral" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              ID: {occurrence.numericMeetingId}
            </span>
          )}

          {pCount > 0 && (
            <span className={`lesson-chevron ${participantsOpen ? 'open' : ''}`} style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {participantsOpen ? '▲' : '▼'}
            </span>
          )}
        </div>
      </div>

      {/* Symmetrical Sub-Bar (Participants Count, Host Info & Actions) */}
      <div className="lesson-sub-meta" style={{ padding: '4px 14px 8px', fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>
            👥 {participantsCountLabel}
          </span>
          {occurrence.hostEmail && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              🎥 {occurrence.hostEmail}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {pCount > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 11, padding: '2px 8px', height: 24 }}
              onClick={(e) => {
                e.stopPropagation();
                setParticipantsOpen(prev => !prev);
              }}
              aria-expanded={participantsOpen}
              aria-controls={`participants-${safeId}`}
            >
              <span>{participantsOpen ? '▲ ' + (t('schedule.hideParticipants') || 'Hide') : '▼ ' + (t('schedule.showParticipants', { count: pCount }) || 'Show participants')}</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ fontSize: 11, padding: '2px 8px', height: 24 }}
            onClick={(e) => {
              e.stopPropagation();
              setTechOpen(prev => !prev);
            }}
            aria-expanded={techOpen}
            aria-controls={`tech-${safeId}`}
          >
            <span>⚙️ {t('schedule.technicalDetails') || 'Debug'}</span>
          </button>
        </div>
      </div>

      {/* Technical Details Disclosure */}
      {techOpen && (
        <div id={`tech-${safeId}`} className="zoom-tech-details" role="region" aria-label="Technical Details">
          {occurrence.identityKind === 'legacy_derived' || !occurrence.uuid ? (
            <div className="zoom-tech-row">
              <span className="zoom-tech-label">{t('schedule.occurrenceIdentity')}:</span>
              <span className="zoom-legacy-derived-badge">{t('schedule.legacyReconstructedOccurrence')}</span>
            </div>
          ) : (
            <div className="zoom-tech-row">
              <span className="zoom-tech-label">{t('schedule.occurrenceUuid')}:</span>
              <code className="zoom-uuid-code" title={occurrence.uuid}>
                {occurrence.uuid}
              </code>
              <button
                type="button"
                className="zoom-btn-copy"
                onClick={handleCopyUuid}
                aria-label={t('schedule.copyUuid')}
              >
                📋 {t('schedule.copyUuid')}
              </button>
            </div>
          )}

          {copyStatus && (
            <div className="zoom-copy-feedback" role="status" aria-live="polite">
              {copyStatus === 'copied' ? t('schedule.uuidCopied') : t('schedule.couldNotCopyUuid')}
            </div>
          )}
        </div>
      )}

      {/* Participants Disclosure */}
      {participantsOpen && pCount > 0 && (
        <ZoomParticipants
          safeId={safeId}
          topic={topic}
          participants={occurrence.participants}
        />
      )}
    </article>
  );
}
