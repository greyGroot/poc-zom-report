'use client';

import React from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { formatKyivTime, formatDuration } from '@/lib/timezone';

export default function ZoomParticipants({ safeId, topic, participants = [] }) {
  const { t, locale } = useLanguage();

  if (!participants || participants.length === 0) {
    return (
      <div id={`participants-${safeId}`} className="zoom-participants-drawer">
        <p className="zoom-no-participants">{t('schedule.noParticipantsRecorded')}</p>
      </div>
    );
  }

  return (
    <div
      id={`participants-${safeId}`}
      className="zoom-participants-drawer"
      role="region"
      aria-label={t('schedule.participantsInTopic', { topic: topic || t('schedule.untitledMeeting') })}
    >
      <h4 className="zoom-participants-heading sr-only">
        {t('schedule.participantsInTopic', { topic: topic || t('schedule.untitledMeeting') })}
      </h4>

      <ul className="zoom-participants-list">
        {participants.map((p, idx) => {
          const roleLabel = p.is_host ? t('schedule.roleHost') : t('schedule.roleParticipant');
          const durationFormatted = formatDuration(p.connectedDurationMinutes, locale);

          let connectionSummary = '';
          if (p.connectionState === 'complete' && p.firstJoinTime && p.lastLeaveTime) {
            const joinStr = formatKyivTime(p.firstJoinTime, locale);
            const leaveStr = formatKyivTime(p.lastLeaveTime, locale);
            connectionSummary = `${joinStr}–${leaveStr} · ${t('schedule.connectedTime', { duration: durationFormatted })}`;
          } else if (p.connectionState === 'incomplete' && p.firstJoinTime) {
            const joinStr = formatKyivTime(p.firstJoinTime, locale);
            connectionSummary = `${t('schedule.joinedAt', { join: joinStr })} · ${t('schedule.connectedAtLeast', { duration: durationFormatted })} · ${t('schedule.leaveNotRecorded')}`;
          } else if (p.connectedDurationMinutes > 0) {
            connectionSummary = t('schedule.connectedTime', { duration: durationFormatted });
          } else {
            connectionSummary = t('schedule.connectionTimeUnavailable');
          }

          return (
            <li key={p.id || `p_${idx}`} className="zoom-participant-item">
              <div className="zoom-participant-identity">
                <span className="zoom-participant-name">
                  {p.name || t('schedule.unnamedParticipant')}
                </span>
                <span className={`zoom-role-badge ${p.is_host ? 'role-host' : 'role-participant'}`}>
                  {roleLabel}
                </span>
                {p.email && (
                  <span className="zoom-participant-email" title={p.email}>
                    {p.email}
                  </span>
                )}
              </div>

              <div className="zoom-participant-timing">
                <span className="zoom-timing-text">{connectionSummary}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
