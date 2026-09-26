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

  return (
    <article
      className="zoom-meeting-card"
      aria-label={`${topic}, ${startTimeStr}`}
    >
      {/* Primary Row */}
      <div className="zoom-card-primary">
        <div className="zoom-card-time-topic">
          <time className="zoom-start-badge" dateTime={occurrence.startTime}>
            {startTimeStr || '—'}
          </time>
          <h3 className="zoom-meeting-topic">{topic}</h3>
        </div>

        <div className="zoom-card-duration">
          <span className="zoom-duration-badge">{durationDisplay}</span>
        </div>
      </div>

      {/* Secondary Row */}
      <div className="zoom-card-secondary">
        <span className="zoom-meta-item">
          <strong>{t('schedule.startLabel')}:</strong> {startTimeStr || '—'}
        </span>
        <span className="zoom-meta-item">
          <strong>{t('schedule.endLabel')}:</strong>{' '}
          {endTimeStr ? endTimeStr : t('schedule.endNotRecorded')}
        </span>
        <span className="zoom-meta-item">
          👥 {participantsCountLabel}
        </span>
        {occurrence.numericMeetingId && (
          <span className="zoom-meta-item zoom-meeting-id">
            <strong>{t('schedule.meetingIdLabel')}:</strong>{' '}
            <code className="zoom-mono">{occurrence.numericMeetingId}</code>
          </span>
        )}
      </div>

      {/* Actions Row */}
      <div className="zoom-card-actions">
        {pCount > 0 ? (
          <button
            type="button"
            className="zoom-btn-disclosure"
            aria-expanded={participantsOpen}
            aria-controls={`participants-${safeId}`}
            onClick={() => setParticipantsOpen(prev => !prev)}
          >
            <span>{participantsOpen ? '▲' : '▼'}</span>
            <span>
              {participantsOpen
                ? t('schedule.hideParticipants')
                : t('schedule.showParticipants', { count: pCount })}
            </span>
          </button>
        ) : (
          <span className="zoom-no-participants-text">
            {t('schedule.noParticipantsRecorded')}
          </span>
        )}

        <button
          type="button"
          className="zoom-btn-tech"
          aria-expanded={techOpen}
          aria-controls={`tech-${safeId}`}
          onClick={() => setTechOpen(prev => !prev)}
        >
          <span>⚙️</span>
          <span>{t('schedule.technicalDetails')}</span>
        </button>
      </div>

      {/* Technical Details Disclosure */}
      {techOpen && (
        <div id={`tech-${safeId}`} className="zoom-tech-details" role="region" aria-label="Technical Details">
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
