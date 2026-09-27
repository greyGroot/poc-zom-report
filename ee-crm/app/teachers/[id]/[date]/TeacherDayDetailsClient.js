'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { formatKyivDateHeader } from '@/lib/timezone';
import ZoomMeetingCard from '../ZoomMeetingCard';

export default function TeacherDayDetailsClient({
  initialData,
  teacherId,
  date,
  fromParam,
  toParam,
  presetParam,
  filterParam
}) {
  const { t, locale, formatUrl } = useLanguage();
  const [data, setData] = useState(initialData);
  const [isRefreshingSchoolmate, setIsRefreshingSchoolmate] = useState(false);
  const [isRefreshingZoom, setIsRefreshingZoom] = useState(false);
  const [expandedLessons, setExpandedLessons] = useState(new Set());

  // Construct return URL that preserves overview filters and date range
  const backUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (fromParam) params.set('from', fromParam);
    if (toParam) params.set('to', toParam);
    if (presetParam) params.set('preset', presetParam);
    if (filterParam && filterParam !== 'all') params.set('filter', filterParam);
    const qs = params.toString();
    return formatUrl(`/teachers/${teacherId}${qs ? `?${qs}` : ''}`);
  }, [teacherId, fromParam, toParam, presetParam, filterParam, formatUrl]);

  // Construct adjacent day URLs preserving query parameters
  const makeDayUrl = useCallback(
    (targetDate) => {
      if (!targetDate) return '#';
      const params = new URLSearchParams();
      if (fromParam) params.set('from', fromParam);
      if (toParam) params.set('to', toParam);
      if (presetParam) params.set('preset', presetParam);
      if (filterParam && filterParam !== 'all') params.set('filter', filterParam);
      const qs = params.toString();
      return formatUrl(`/teachers/${teacherId}/${targetDate}${qs ? `?${qs}` : ''}`);
    },
    [teacherId, fromParam, toParam, presetParam, filterParam, formatUrl]
  );

  const toggleLesson = useCallback((lessonId) => {
    setExpandedLessons(prev => {
      const next = new Set(prev);
      if (next.has(lessonId)) {
        next.delete(lessonId);
      } else {
        next.add(lessonId);
      }
      return next;
    });
  }, []);

  // Independent refresh for Schoolmate
  const handleRefreshSchoolmate = useCallback(async () => {
    setIsRefreshingSchoolmate(true);
    try {
      const res = await fetch(`/api/teachers/${teacherId}/days/${date}`);
      if (res.ok) {
        const fresh = await res.json();
        setData(prev => ({
          ...prev,
          schoolmate: fresh.schoolmate
        }));
      }
    } catch (err) {
      console.warn('Failed to refresh Schoolmate:', err.message);
    } finally {
      setIsRefreshingSchoolmate(false);
    }
  }, [teacherId, date]);

  // Independent refresh for Zoom
  const handleRefreshZoom = useCallback(async () => {
    setIsRefreshingZoom(true);
    try {
      const res = await fetch(`/api/teachers/${teacherId}/days/${date}`);
      if (res.ok) {
        const fresh = await res.json();
        setData(prev => ({
          ...prev,
          zoom: fresh.zoom
        }));
      }
    } catch (err) {
      console.warn('Failed to refresh Zoom:', err.message);
    } finally {
      setIsRefreshingZoom(false);
    }
  }, [teacherId, date]);

  // Handle Invalid Date or Missing Teacher State
  if (!data || data.error || !data.teacher) {
    const isInvalidDate = data?.error?.toLowerCase().includes('date') || !/^\d{4}-\d{2}-\d{2}$/.test(date || '');
    return (
      <main className="main-content" style={{ padding: '40px 24px', maxWidth: 800, margin: '0 auto' }}>
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
            {isInvalidDate ? t('dayDetails.invalidDateTitle') : t('dayDetails.teacherNotFoundTitle')}
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14 }}>
            {isInvalidDate ? t('dayDetails.invalidDateDesc') : t('dayDetails.teacherNotFoundDesc')}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Link href={formatUrl('/teachers')} className="btn btn-primary">
              {t('dayDetails.backToDirectory')}
            </Link>
            {data?.teacher && (
              <Link href={backUrl} className="btn btn-secondary">
                {t('dayDetails.backToSchedule')}
              </Link>
            )}
          </div>
        </div>
      </main>
    );
  }

  const { teacher, schoolmate, zoom, previousDate, nextDate, timezone } = data;
  const formattedDate = formatKyivDateHeader(date, locale);

  return (
    <main className="main-content day-details-workspace" style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Top Navigation Row */}
      <div className="day-details-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Link
          href={backUrl}
          className="day-details-back-link"
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--primary)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            textDecoration: 'none'
          }}
        >
          {t('dayDetails.backToTeacher', { name: teacher.fullName }) || `← Back to ${teacher.fullName}`}
        </Link>

        {/* Day Stepper */}
        <nav aria-label="Day navigation" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {previousDate ? (
            <Link
              href={makeDayUrl(previousDate)}
              className="btn btn-secondary btn-sm"
              aria-label={`Go to previous day ${previousDate}`}
            >
              {t('dayDetails.previousDay')}
            </Link>
          ) : (
            <button type="button" className="btn btn-secondary btn-sm" disabled aria-disabled="true">
              {t('dayDetails.previousDay')}
            </button>
          )}

          {nextDate ? (
            <Link
              href={makeDayUrl(nextDate)}
              className="btn btn-secondary btn-sm"
              aria-label={`Go to next day ${nextDate}`}
            >
              {t('dayDetails.nextDay')}
            </Link>
          ) : (
            <button type="button" className="btn btn-secondary btn-sm" disabled aria-disabled="true">
              {t('dayDetails.nextDay')}
            </button>
          )}
        </nav>
      </div>

      {/* Main Header */}
      <header className="day-details-header card" style={{ padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                {teacher.fullName}
              </h1>
              <span className="badge badge-neutral" style={{ fontSize: 12 }}>
                {timezone || 'Europe/Kyiv'}
              </span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 4 }}>
              📅 {formattedDate || date}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {teacher.schoolmateTeacherId && (
              <span className="badge badge-info" style={{ fontSize: 12 }}>
                Schoolmate ID: {teacher.schoolmateTeacherId}
              </span>
            )}
            {teacher.zoomHostEmail && (
              <span className="badge badge-purple" style={{ fontSize: 12 }}>
                Zoom: {teacher.zoomHostEmail}
              </span>
            )}
          </div>
        </div>

        {/* Factual Summary Bar (No Reconciliation / Matching) */}
        <div
          className="factual-summary-banner"
          style={{
            marginTop: 18,
            paddingTop: 16,
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16
          }}
        >
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {/* Schoolmate Total */}
            <div className="factual-stat-group">
              <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>
                {t('dayDetails.schoolmateSectionTitle')}
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                {schoolmate?.state === 'available'
                  ? t('dayDetails.schoolmateFactualCount', {
                      count: schoolmate.totalLessons,
                      duration: schoolmate.totalMinutes
                    })
                  : schoolmate?.state === 'empty'
                    ? `0 ${t('schedule.lessonsCount').toLowerCase()}`
                    : '—'}
                {schoolmate?.totalWage ? ` • ${schoolmate.totalWage}` : ''}
              </span>
            </div>

            {/* Zoom Total */}
            <div className="factual-stat-group">
              <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>
                {t('dayDetails.zoomSectionTitle')}
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                {zoom?.state === 'available'
                  ? t('dayDetails.zoomFactualCount', {
                      count: zoom.totalMeetings,
                      duration: zoom.totalMinutes
                    })
                  : zoom?.state === 'empty'
                    ? `0 ${t('schedule.zoomMeetingCountPlural', { count: 0 })}`
                    : '—'}
              </span>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            ℹ️ {t('dayDetails.factualNotice')}
          </p>
        </div>
      </header>

      {/* Two-Panel Body (Schoolmate left ~40%, Zoom right ~60%) */}
      <div className="day-details-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 4.5fr) minmax(380px, 6.5fr)', gap: 20 }}>
        {/* ========================================================= */}
        {/* LEFT COLUMN: Schoolmate Lessons                           */}
        {/* ========================================================= */}
        <section className="day-column-schoolmate" aria-labelledby="schoolmate-heading">
          <div className="card" style={{ padding: '20px', minHeight: 400 }}>
            {/* Column Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 id="schoolmate-heading" style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
                  📚 {t('dayDetails.schoolmateSectionTitle')}
                </h2>
                {schoolmate?.state === 'available' && (
                  <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                    {schoolmate.totalLessons}
                  </span>
                )}
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleRefreshSchoolmate}
                disabled={isRefreshingSchoolmate}
                aria-label={t('dayDetails.retrySchoolmate')}
              >
                <span>{isRefreshingSchoolmate ? '⏳' : '🔄'}</span>
                <span>{isRefreshingSchoolmate ? t('schedule.refreshing') : t('common.refresh')}</span>
              </button>
            </div>

            {/* Schoolmate States */}
            {schoolmate?.state === 'error' && (
              <div className="zoom-error-card" style={{ padding: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>⚠️</div>
                <h3 className="zoom-error-title" style={{ fontSize: 14 }}>
                  {t('dayDetails.schoolmateError')}
                </h3>
                <p className="zoom-error-desc" style={{ fontSize: 12 }}>
                  {schoolmate.error}
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleRefreshSchoolmate}
                  style={{ marginTop: 8 }}
                >
                  🔄 {t('dayDetails.retrySchoolmate')}
                </button>
              </div>
            )}

            {schoolmate?.state === 'empty' && (
              <div className="zoom-empty-card" style={{ padding: 24 }}>
                <div className="zoom-state-icon">📋</div>
                <h3 className="zoom-state-title" style={{ fontSize: 15 }}>
                  {t('dayDetails.schoolmateEmpty')}
                </h3>
              </div>
            )}

            {schoolmate?.state === 'available' && (
              <div className="lesson-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {schoolmate.lessons.map((lesson, idx) => {
                  const isExpanded = expandedLessons.has(lesson.id || idx);
                  const hasStatus = Boolean(lesson.lessonStatusName);
                  const statusColor = lesson.lessonStatusColor || (hasStatus ? '#f59e0b' : null);
                  const isZeroRate = parseFloat(String(lesson.teacherRatePerLesson || '0')) === 0;

                  return (
                    <article
                      key={lesson.id || `lesson_${idx}`}
                      className={`lesson-card ${isExpanded ? 'expanded' : ''} ${hasStatus ? 'status-border-active' : ''}`}
                      style={statusColor ? { borderLeftColor: statusColor } : {}}
                      aria-label={`${lesson.groupName || lesson.groupOrStudent || 'Class'}, ${lesson.durationMinutes} min`}
                    >
                      {/* Summary Bar */}
                      <div
                        className="lesson-summary-bar"
                        onClick={() => toggleLesson(lesson.id || idx)}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        aria-controls={`lesson-drawer-${lesson.id || idx}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleLesson(lesson.id || idx);
                          }
                        }}
                      >
                        <div className="lesson-left-meta">
                          {/* Ribbon Bookmarks */}
                          <div className="ribbon-bookmarks-wrapper">
                            {lesson.classDetailsAdded && (
                              <div className="sm-tooltip-wrapper">
                                <span className="ribbon-bookmark ribbon-green" />
                                <span className="sm-tooltip-text">{t('dayDetails.classNotesAdded')}</span>
                              </div>
                            )}
                            {lesson.attendanceChecked && (
                              <div className="sm-tooltip-wrapper">
                                <span className="ribbon-bookmark ribbon-blue" />
                                <span className="sm-tooltip-text">{t('dayDetails.attendanceMarked')}</span>
                              </div>
                            )}
                          </div>

                          {/* Student/Group Title */}
                          <span className="lesson-student" style={{ fontWeight: 600 }}>
                            {idx + 1}. {lesson.groupName || lesson.groupOrStudent || t('dayDetails.groupClass')}
                          </span>

                          {/* Duration Badge */}
                          <span className="lesson-duration">
                            ⏱️ {lesson.durationMinutes} min
                          </span>

                          {/* Status Badge */}
                          {hasStatus ? (
                            <span className="lesson-status-chip chip-last-minute">
                              {lesson.lessonStatusName}
                            </span>
                          ) : (
                            <span className="lesson-status-chip chip-completed">
                              Completed
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {/* Rate Tag */}
                          <span className={`lesson-rate-tag ${isZeroRate ? 'zero-rate' : ''}`}>
                            {lesson.teacherRate || `${lesson.teacherRatePerLesson || 0} ${lesson.currencySymbol || '₴'}`}
                          </span>

                          <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                            {lesson.className || lesson.lessonType || 'GE'}
                          </span>

                          <span className={`lesson-chevron ${isExpanded ? 'open' : ''}`}>
                            ▼
                          </span>
                        </div>
                      </div>

                      {/* Detail Drawer */}
                      {isExpanded && (
                        <div id={`lesson-drawer-${lesson.id || idx}`} className="lesson-details-drawer">
                          <div className="lesson-detail-item">
                            <span className="lesson-detail-label">{t('dayDetails.groupOrClass')}</span>
                            <span className="lesson-detail-val">
                              {lesson.groupName || lesson.groupOrStudent || 'N/A'}{' '}
                              {lesson.groupId ? `(ID: ${lesson.groupId})` : ''}
                            </span>
                          </div>

                          <div className="lesson-detail-item">
                            <span className="lesson-detail-label">{t('schedule.lessonType')}</span>
                            <span className="lesson-detail-val">
                              <span className="badge badge-info">{lesson.className || lesson.lessonType || 'GE'}</span>
                            </span>
                          </div>

                          <div className="lesson-detail-item">
                            <span className="lesson-detail-label">{t('dayDetails.internalLessonId')}</span>
                            <span className="lesson-detail-val" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                              {lesson.groupLessonId || lesson.id || 'N/A'}
                            </span>
                          </div>

                          <div className="lesson-detail-item">
                            <span className="lesson-detail-label">{t('dayDetails.reportedWage')}</span>
                            <span className="lesson-detail-val" style={{ fontWeight: 600 }}>
                              {lesson.teacherRate || `${lesson.teacherRatePerLesson || 0} ₴`}
                            </span>
                          </div>

                          <div className="lesson-detail-item">
                            <span className="lesson-detail-label">{t('dayDetails.statusLabel')}</span>
                            <span className="lesson-detail-val">
                              {lesson.attendanceChecked ? `✅ ${t('dayDetails.attendanceMarked')}` : `⚪ ${t('dayDetails.attendanceNotMarked')}`}
                              {lesson.classDetailsAdded ? ` • 📝 ${t('dayDetails.classNotesAdded')}` : ` • ⚪ ${t('dayDetails.noClassNotes')}`}
                            </span>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: Tracked Zoom Meetings                       */}
        {/* ========================================================= */}
        <section className="day-column-zoom" aria-labelledby="zoom-heading">
          <div className="card" style={{ padding: '20px', minHeight: 400 }}>
            {/* Column Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 id="zoom-heading" style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
                  🎥 {t('dayDetails.zoomSectionTitle')}
                </h2>
                {zoom?.state === 'available' && (
                  <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                    {zoom.totalMeetings}
                  </span>
                )}
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleRefreshZoom}
                disabled={isRefreshingZoom}
                aria-label={t('dayDetails.retryZoom')}
              >
                <span>{isRefreshingZoom ? '⏳' : '🔄'}</span>
                <span>{isRefreshingZoom ? t('schedule.refreshing') : t('schedule.refreshZoom')}</span>
              </button>
            </div>

            {/* Zoom States */}
            {zoom?.state === 'error' && (
              <div className="zoom-error-card" style={{ padding: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>⚠️</div>
                <h3 className="zoom-error-title" style={{ fontSize: 14 }}>
                  {t('dayDetails.zoomError')}
                </h3>
                <p className="zoom-error-desc" style={{ fontSize: 12 }}>
                  {zoom.error}
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleRefreshZoom}
                  style={{ marginTop: 8 }}
                >
                  🔄 {t('dayDetails.retryZoom')}
                </button>
              </div>
            )}

            {zoom?.state === 'unmapped' && (
              <div className="zoom-unmapped-card" style={{ padding: 24 }}>
                <div className="zoom-state-icon">📡</div>
                <h3 className="zoom-state-title" style={{ fontSize: 15 }}>
                  {t('schedule.zoomUnavailable')}
                </h3>
                <p className="zoom-state-desc" style={{ fontSize: 13 }}>
                  {t('dayDetails.unmappedTeacher')}
                </p>
              </div>
            )}

            {zoom?.state === 'stale' && (
              <div className="zoom-error-card" style={{ padding: 16, marginBottom: 12, backgroundColor: '#fef3c7', borderColor: '#fde68a' }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>⚠️</div>
                <h3 className="zoom-error-title" style={{ fontSize: 14, color: '#92400e' }}>
                  {t('schedule.zoomUnavailable')}
                </h3>
                <p className="zoom-error-desc" style={{ fontSize: 12, color: '#b45309' }}>
                  {t('dayDetails.zoomStaleNotice')}
                </p>
              </div>
            )}

            {zoom?.state === 'empty' && (
              <div className="zoom-empty-card" style={{ padding: 24 }}>
                <div className="zoom-state-icon">📹</div>
                <h3 className="zoom-state-title" style={{ fontSize: 15 }}>
                  {t('dayDetails.zoomEmpty')}
                </h3>
                <p className="zoom-state-desc" style={{ fontSize: 13 }}>
                  {t('dayDetails.zoomEmptyBody', { date })}
                </p>
              </div>
            )}

            {zoom?.state === 'available' && (
              <div className="zoom-meeting-cards-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {zoom.meetings.map(occ => (
                  <ZoomMeetingCard key={occ.id} occurrence={occ} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
