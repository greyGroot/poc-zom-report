'use client';

import React, { useState, useCallback } from 'react';
import { useLanguage } from '@/lib/shared/i18n/LanguageContext';
import { formatKyivTime, formatDuration } from '@/lib/utils/timezone';
import ZoomParticipants from './ZoomParticipants';

export default function ZoomMeetingCard({ occurrence, isExpanded, onToggle }) {
  const { t, locale } = useLanguage();
  const [localParticipantsOpen, setLocalParticipantsOpen] = useState(false);
  const [techOpen, setTechOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState(null); // null | 'copied' | 'error'

  const isControlled = isExpanded !== undefined;
  const participantsOpen = isControlled ? Boolean(isExpanded) : localParticipantsOpen;

  const handleToggle = useCallback(() => {
    if (onToggle) {
      onToggle();
    } else {
      setLocalParticipantsOpen(prev => !prev);
    }
  }, [onToggle]);

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
  const singularTranslation = t('schedule.participantsCountSingular');
  const participantsCountLabel = pCount === 1
    ? (singularTranslation && singularTranslation !== 'schedule.participantsCountSingular'
        ? singularTranslation
        : (locale === 'uk' ? '1 учасник' : locale === 'pl' ? '1 uczestnik' : '1 participant'))
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
      style={{ padding: 0, overflow: 'hidden' }}
    >
      {/* Symmetrical 2-Row Primary Bar */}
      <div
        className="zoom-card-primary-vertical"
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        aria-expanded={participantsOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        }}
        style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {/* Row 1: Topic Title & Action Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <h3 className="zoom-meeting-topic" style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            {topic}
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 11, padding: '2px 6px', height: 22, display: 'inline-flex', alignItems: 'center', gap: 3 }}
              onClick={(e) => {
                e.stopPropagation();
                setTechOpen(prev => !prev);
              }}
              aria-expanded={techOpen}
              aria-controls={`tech-${safeId}`}
              title={t('schedule.technicalDetails')}
            >
              <span>⚙️</span>
            </button>

            <span className={`lesson-chevron ${participantsOpen ? 'open' : ''}`} aria-hidden="true">
              ▼
            </span>
          </div>
        </div>

        {/* Row 2: Badges and Metadata */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: '100%' }}>
          {/* Time Badge */}
          <span className="lesson-time-badge" style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: 4, color: 'var(--text-primary)' }}>
            {timeDisplay}
          </span>

          {/* Duration Badge */}
          <span className="lesson-duration" style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', color: 'var(--text-secondary)' }}>
            ⏱️ {durationDisplay}
          </span>

          {/* Meeting ID Badge */}
          {occurrence.numericMeetingId && (
            <span className="badge badge-neutral" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', padding: '2px 6px' }}>
              ID: {occurrence.numericMeetingId}
            </span>
          )}

          {/* Participants Count */}
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            👥 {participantsCountLabel}
          </span>

          {/* Host Email */}
          {occurrence.hostEmail && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              🎥 {occurrence.hostEmail}
            </span>
          )}
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
      {participantsOpen && (
        <ZoomParticipants
          safeId={safeId}
          topic={topic}
          participants={occurrence.participants}
        />
      )}
    </article>
  );
}
