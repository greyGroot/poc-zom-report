'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import AirbnbDatePicker from './AirbnbDatePicker';

export default function TeacherSchedulePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const teacherId = params?.id;
  const { t, formatUrl } = useLanguage();

  // Helper to compute default current week (Monday - Sunday)
  const defaultWeek = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;

    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const formatIso = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dt = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dt}`;
    };

    return {
      from: formatIso(monday),
      to: formatIso(sunday),
      preset: 'thisWeek'
    };
  }, []);

  // Read initial values from URL search parameters (or fallback to current week)
  const paramFrom = searchParams?.get('from');
  const paramTo = searchParams?.get('to');
  const paramPreset = searchParams?.get('preset');
  const paramFilter = searchParams?.get('filter');

  const initialFrom = paramFrom || defaultWeek.from;
  const initialTo = paramTo || defaultWeek.to;
  const initialPreset = paramPreset || (paramFrom ? null : 'thisWeek');

  // Teacher State
  const [teacher, setTeacher] = useState(null);
  const [loadingTeacher, setLoadingTeacher] = useState(true);
  const [teacherError, setTeacherError] = useState(null);

  // Date Range Controls - default to current week
  const [fromDate, setFromDate] = useState(initialFrom);
  const [toDate, setToDate] = useState(initialTo);
  const [activePreset, setActivePreset] = useState(initialPreset);

  // Schedule Report State
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState(null);

  // Accordion State: Set of open lesson IDs
  const [expandedLessons, setExpandedLessons] = useState(new Set());

  // Filter State: 'all' | 'completed' | 'cancelled_advance' | 'last_minute' | 'attendance_checked'
  const [statusFilter, setStatusFilter] = useState(paramFilter || 'all');

  // Keep a ref to avoid duplicate auto-fetch
  const autoFetchedRef = useRef(false);

  // Sync state with URL query parameters
  const syncUrlParams = useCallback((newFrom, newTo, newPreset, newFilter) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (newFrom) url.searchParams.set('from', newFrom);
    if (newTo) url.searchParams.set('to', newTo);
    if (newPreset) {
      url.searchParams.set('preset', newPreset);
    } else {
      url.searchParams.delete('preset');
    }
    if (newFilter && newFilter !== 'all') {
      url.searchParams.set('filter', newFilter);
    } else {
      url.searchParams.delete('filter');
    }
    window.history.replaceState(null, '', url.toString());
  }, []);

  // Keep URL parameters synced with current dates on initial load if missing
  useEffect(() => {
    if (!paramFrom || !paramTo) {
      syncUrlParams(initialFrom, initialTo, initialPreset, statusFilter);
    }
  }, [paramFrom, paramTo, initialFrom, initialTo, initialPreset, statusFilter, syncUrlParams]);

  // Load Teacher details
  const fetchTeacher = useCallback(async () => {
    if (!teacherId) return;
    try {
      setLoadingTeacher(true);
      setTeacherError(null);
      const res = await fetch(`/api/teachers/${teacherId}`);
      if (!res.ok) {
        throw new Error(`Teacher not found (${res.status})`);
      }
      const data = await res.json();
      setTeacher(data.teacher);
    } catch (err) {
      setTeacherError(err.message);
    } finally {
      setLoadingTeacher(false);
    }
  }, [teacherId]);

  useEffect(() => {
    fetchTeacher();
  }, [fetchTeacher]);

  // Fetch & Parse Report from Schoolmate
  const handleFetchReport = useCallback(async (overrideFrom = fromDate, overrideTo = toDate) => {
    if (!teacher?.schoolmateTeacherId) {
      setReportError(t('schedule.errMissingId'));
      return;
    }

    const effectiveFrom = overrideFrom || fromDate;
    const effectiveTo = overrideTo || toDate;

    if (!effectiveFrom || !effectiveTo) {
      setReportError(t('schedule.errDateRange'));
      return;
    }

    if (effectiveFrom > effectiveTo) {
      setReportError(t('schedule.errDateOrder'));
      return;
    }

    setLoadingReport(true);
    setReportError(null);

    try {
      const res = await fetch('/api/schoolmate/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: Number(teacher.schoolmateTeacherId),
          teacherName: teacher.fullName,
          fromDate: effectiveFrom,
          toDate: effectiveTo
        })
      });

      let data = null;
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (!res.ok) {
        throw new Error(data?.error || text || `Server error (${res.status} ${res.statusText})`);
      }

      setReport(data);

      // Expand all lessons by default for convenience
      const allIds = new Set();
      if (Array.isArray(data.days)) {
        data.days.forEach(d => {
          if (Array.isArray(d.lessons)) {
            d.lessons.forEach(l => allIds.add(l.id));
          }
        });
      }
      setExpandedLessons(allIds);
    } catch (err) {
      setReportError(err.message);
    } finally {
      setLoadingReport(false);
    }
  }, [teacher, fromDate, toDate, t]);

  // Auto-fetch report when teacher loads so page refresh restores data automatically
  useEffect(() => {
    if (teacher?.schoolmateTeacherId && !autoFetchedRef.current) {
      autoFetchedRef.current = true;
      handleFetchReport(fromDate, toDate);
    }
  }, [teacher?.schoolmateTeacherId, fromDate, toDate, handleFetchReport]);

  // Toggle single lesson accordion
  const toggleLesson = (id) => {
    setExpandedLessons(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle expand all / collapse all
  const toggleAllLessons = () => {
    if (!report?.days) return;
    const totalLessons = report.days.reduce((acc, d) => acc + (d.lessons?.length || 0), 0);
    if (expandedLessons.size === totalLessons) {
      setExpandedLessons(new Set());
    } else {
      const all = new Set();
      report.days.forEach(d => d.lessons?.forEach(l => all.add(l.id)));
      setExpandedLessons(all);
    }
  };

  if (teacherError) {
    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <Link href={formatUrl('/')} className="btn btn-secondary btn-sm">
            <span>{t('schedule.backLink')}</span>
          </Link>
        </div>
        <div className="alert alert-error">
          <span>⚠️ {teacherError}</span>
        </div>
      </div>
    );
  }

  // Render Zoom Invitation Status Badge
  const renderZoomBadge = (status) => {
    if (status === 'member') {
      return (
        <span
          className="badge"
          style={{
            backgroundColor: '#dcfce7',
            color: '#15803d',
            border: '1px solid #86efac',
            fontWeight: 600,
            fontSize: 12,
            padding: '3px 9px',
            borderRadius: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5
          }}
        >
          <span style={{ fontSize: 9 }}>●</span>
          <span>{t('directory.zoomMember')}</span>
        </span>
      );
    }
    if (status === 'pending') {
      return (
        <span
          className="badge"
          style={{
            backgroundColor: '#fef3c7',
            color: '#b45309',
            border: '1px solid #fde68a',
            fontWeight: 600,
            fontSize: 12,
            padding: '3px 9px',
            borderRadius: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5
          }}
        >
          <span style={{ fontSize: 10 }}>⏳</span>
          <span>{t('directory.zoomPending')}</span>
        </span>
      );
    }
    return (
      <span
        className="badge"
        style={{
          backgroundColor: '#f1f5f9',
          color: '#64748b',
          border: '1px solid #e2e8f0',
          fontWeight: 500,
          fontSize: 12,
          padding: '3px 9px',
          borderRadius: 12,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5
        }}
      >
        <span style={{ fontSize: 9 }}>○</span>
        <span>{t('directory.zoomNotInvited')}</span>
      </span>
    );
  };

  return (
    <div>
      {/* Back link */}
      <div style={{ marginBottom: 16 }}>
        <Link href={formatUrl('/')} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex' }}>
          <span>{t('schedule.backLink')}</span>
        </Link>
      </div>

      {/* Teacher Profile Card */}
      <div className="card">
        <div className="card-header" style={{ padding: '20px 24px' }}>
          <div>
            <h1 className="page-title" style={{ fontSize: 24, marginBottom: 6 }}>
              {teacher ? teacher.fullName : t('common.loading')}
            </h1>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="badge badge-primary">
                🆔 {t('schedule.schoolmateId')}: {teacher?.schoolmateTeacherId || '...'}
              </span>
              <span className="badge badge-neutral">
                ✉️ {teacher?.email || '...'}
              </span>
              <span className="badge badge-purple">
                🎥 {t('schedule.zoomHost')}: {teacher?.zoomHostEmail || teacher?.email || '...'}
              </span>
              {renderZoomBadge(teacher?.zoomStatus)}
              {teacher?.phone && (
                <span className="badge badge-neutral">
                  📞 {t('schedule.phone')}: {teacher.phone}
                </span>
              )}
              {teacher?.telegramId && (
                <span className="badge badge-info">
                  ✈️ {t('schedule.telegram')}: {teacher.telegramId}
                </span>
              )}
              {teacher?.city && (
                <span className="badge badge-neutral">
                  📍 {t('schedule.city') || 'City'}: {teacher.city}
                </span>
              )}
              {teacher?.nationality && (
                <span className="badge badge-neutral">
                  🌍 {t('schedule.nationality') || 'Nationality'}: {teacher.nationality}
                </span>
              )}
              {teacher?.contractType && (
                <span className="badge badge-info" style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                  📄 {teacher.contractType}
                </span>
              )}
              {teacher?.schoolmateLogin && (
                <span className="badge badge-neutral">
                  👤 Login: {teacher.schoolmateLogin}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Date Range & Fetch Controls Card */}
      <div className="card" style={{ overflow: 'visible' }}>
        <div className="card-body" style={{ overflow: 'visible' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'flex-start' }}>
            {/* Airbnb Date Range Picker & Fast Selections */}
            <AirbnbDatePicker
              fromDate={fromDate}
              toDate={toDate}
              activePreset={activePreset}
              onPresetSelect={(preset) => {
                setActivePreset(preset);
              }}
              onChange={({ fromDate: newFrom, toDate: newTo, preset }) => {
                setFromDate(newFrom);
                setToDate(newTo);
                const nextPreset = preset !== undefined ? preset : null;
                setActivePreset(nextPreset);
                syncUrlParams(newFrom, newTo, nextPreset, statusFilter);
                if (newFrom && newTo && teacher?.schoolmateTeacherId) {
                  handleFetchReport(newFrom, newTo);
                }
              }}
            />

            {/* Fetch Action Button & Latency Badge directly on the left */}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleFetchReport(fromDate, toDate)}
              disabled={loadingReport}
              style={{ padding: '9px 20px', fontSize: 14 }}
            >
              {loadingReport ? (
                <>
                  <span className="spinner"></span>
                  <span>{t('schedule.fetchingBtn')}</span>
                </>
              ) : (
                <>
                  <span>⚡</span>
                  <span>{t('schedule.fetchBtn')}</span>
                </>
              )}
            </button>

            {report && (
              <span className="badge badge-info" style={{ padding: '6px 12px' }}>
                🌐 Live Schoolmate ({report.durationMs}ms)
              </span>
            )}
          </div>

          {reportError && (
            <div className="alert alert-error" style={{ marginTop: 14, marginBottom: 0 }}>
              <span>⚠️ {reportError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Split-View Layout */}
      <div className="split-view-container">
        {/* ===================================================================
            LEFT COLUMN: Schoolmate Claimed Schedule
            =================================================================== */}
        <div className="schedule-column">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">
                <span>📚</span>
                <span>{t('schedule.scheduleTitle')}</span>
              </h2>

              {report && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={toggleAllLessons}
                    className="btn btn-sm btn-secondary"
                  >
                    {expandedLessons.size > 0 ? 'Collapse All' : 'Expand All'}
                  </button>
                </div>
              )}
            </div>

            <div className="card-body">
              {!report ? (
                <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🗓️</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {t('schedule.noScheduleLoaded')}
                  </div>
                  <p style={{ margin: 0, fontSize: 13 }}>
                    {t('schedule.noSchedulePrompt')}
                  </p>
                </div>
              ) : report.days.length === 0 ? (
                <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🏖️</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                    0 {t('schedule.lessonsCount')}
                  </div>
                  <p style={{ margin: 0, fontSize: 13 }}>
                    Teacher has 0 scheduled lessons for the period {report.periodFrom} to {report.periodTo}.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Filter Pills */}
                  {(() => {
                    const allReportLessons = report.lessons || (report.days ? report.days.flatMap(d => d.lessons || []) : []);
                    const isCompleted = (l) => !l.lessonStatusName;
                    const isCancelledAdvance = (l) => (l.lessonStatusName || '').toLowerCase().includes('advance');
                    const isLastMinute = (l) => (l.lessonStatusName || '').toLowerCase().includes('last');
                    const isAttendanceChecked = (l) => Boolean(l.attendanceChecked);

                    const filterCounts = {
                      all: allReportLessons.length,
                      completed: allReportLessons.filter(isCompleted).length,
                      cancelled_advance: allReportLessons.filter(isCancelledAdvance).length,
                      last_minute: allReportLessons.filter(isLastMinute).length,
                      attendance_checked: allReportLessons.filter(isAttendanceChecked).length
                    };

                    const handleFilterClick = (filter) => {
                      setStatusFilter(filter);
                      syncUrlParams(fromDate, toDate, activePreset, filter);
                    };

                    return (
                      <div className="filter-pills-container">
                        <button
                          type="button"
                          className={`filter-pill-btn ${statusFilter === 'all' ? 'active' : ''}`}
                          onClick={() => handleFilterClick('all')}
                        >
                          <span>{t('schedule.filterAll')}</span>
                          <span className="pill-counter">{filterCounts.all}</span>
                        </button>
                        <button
                          type="button"
                          className={`filter-pill-btn ${statusFilter === 'completed' ? 'active' : ''}`}
                          onClick={() => handleFilterClick('completed')}
                        >
                          <span style={{ color: '#16a34a' }}>✅</span>
                          <span>{t('schedule.filterCompleted')}</span>
                          <span className="pill-counter">{filterCounts.completed}</span>
                        </button>
                        <button
                          type="button"
                          className={`filter-pill-btn ${statusFilter === 'cancelled_advance' ? 'active' : ''}`}
                          onClick={() => handleFilterClick('cancelled_advance')}
                        >
                          <span style={{ color: '#15803d' }}>🟢</span>
                          <span>{t('schedule.filterCancelledAdvance')}</span>
                          <span className="pill-counter">{filterCounts.cancelled_advance}</span>
                        </button>
                        <button
                          type="button"
                          className={`filter-pill-btn ${statusFilter === 'last_minute' ? 'active' : ''}`}
                          onClick={() => handleFilterClick('last_minute')}
                        >
                          <span style={{ color: '#d97706' }}>🟤</span>
                          <span>{t('schedule.filterLastMinute')}</span>
                          <span className="pill-counter">{filterCounts.last_minute}</span>
                        </button>
                        <button
                          type="button"
                          className={`filter-pill-btn ${statusFilter === 'attendance_checked' ? 'active' : ''}`}
                          onClick={() => handleFilterClick('attendance_checked')}
                        >
                          <span style={{ color: '#0284c7' }}>🔖</span>
                          <span>{t('schedule.filterChecked')}</span>
                          <span className="pill-counter">{filterCounts.attendance_checked}</span>
                        </button>
                      </div>
                    );
                  })()}

                  {/* Day Groups */}
                  {report.days.map((dayGroup) => {
                    const filterDayLessons = (lessons) => {
                      if (!Array.isArray(lessons)) return [];
                      switch (statusFilter) {
                        case 'completed':
                          return lessons.filter(l => !l.lessonStatusName);
                        case 'cancelled_advance':
                          return lessons.filter(l => (l.lessonStatusName || '').toLowerCase().includes('advance'));
                        case 'last_minute':
                          return lessons.filter(l => (l.lessonStatusName || '').toLowerCase().includes('last'));
                        case 'attendance_checked':
                          return lessons.filter(l => Boolean(l.attendanceChecked));
                        default:
                          return lessons;
                      }
                    };

                    const filteredLessons = filterDayLessons(dayGroup.lessons);
                    if (filteredLessons.length === 0 && statusFilter !== 'all') {
                      return null;
                    }

                    return (
                      <div key={dayGroup.date} className="day-group">
                        {/* Day Subtotal Header */}
                        <div className="day-header">
                          <span className="day-title">
                            📅 {dayGroup.dayName || dayGroup.date}
                          </span>
                          <span className="day-subtotal">
                            {dayGroup.subtotalMinutes} min • {filteredLessons.length} {t('schedule.lessonsCount').toLowerCase()}
                            {dayGroup.subtotalWageFormatted ? ` • ${dayGroup.subtotalWageFormatted}` : ''}
                          </span>
                        </div>

                        {/* Day Lessons List */}
                        <div className="lesson-list">
                          {filteredLessons.map((lesson, idx) => {
                            const isExpanded = expandedLessons.has(lesson.id);
                            const hasStatus = Boolean(lesson.lessonStatusName);
                            const statusColor = lesson.lessonStatusColor || (hasStatus ? '#f59e0b' : null);
                            const isZeroRate = parseFloat(String(lesson.teacherRatePerLesson || '0')) === 0;

                            return (
                              <div
                                key={lesson.id}
                                className={`lesson-card ${isExpanded ? 'expanded' : ''} ${hasStatus ? 'status-border-active' : ''}`}
                                style={statusColor ? { borderLeftColor: statusColor } : {}}
                              >
                                {/* Summary Bar */}
                                <div
                                  className="lesson-summary-bar"
                                  onClick={() => toggleLesson(lesson.id)}
                                >
                                  <div className="lesson-left-meta">
                                    {/* Authentic Ribbon Bookmarks */}
                                    <div className="ribbon-bookmarks-wrapper">
                                      {lesson.classDetailsAdded && (
                                        <div className="sm-tooltip-wrapper">
                                          <span className="ribbon-bookmark ribbon-green" />
                                          <span className="sm-tooltip-text">Added classes details</span>
                                        </div>
                                      )}
                                      {lesson.attendanceChecked && (
                                        <div className="sm-tooltip-wrapper">
                                          <span className="ribbon-bookmark ribbon-blue" />
                                          <span className="sm-tooltip-text">Attendance checked</span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Group/Student Title */}
                                    <span className="lesson-student">
                                      {idx + 1}. {lesson.groupName || lesson.groupOrStudent || 'Group Class'}
                                    </span>

                                    {/* Duration Badge */}
                                    <span className="lesson-duration">
                                      ⏱️ {lesson.durationMinutes} min
                                    </span>

                                    {/* Status Chip near duration */}
                                    {hasStatus ? (
                                      <div className="sm-tooltip-wrapper">
                                        <span className={`lesson-status-chip ${
                                          lesson.lessonStatusName?.toLowerCase().includes('advance')
                                            ? 'chip-cancelled-advance'
                                            : lesson.lessonStatusName?.toLowerCase().includes('last')
                                              ? 'chip-last-minute'
                                              : 'chip-late-cancellation'
                                        }`}>
                                          {lesson.lessonStatusName}
                                        </span>
                                        <span className="sm-tooltip-text">{lesson.lessonStatusName}</span>
                                      </div>
                                    ) : (
                                      <span className="lesson-status-chip chip-completed">
                                        Completed
                                      </span>
                                    )}
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    {/* Rate Tag */}
                                    <span className={`lesson-rate-tag ${isZeroRate ? 'zero-rate' : ''}`}>
                                      {lesson.teacherRate || `${lesson.teacherRatePerLesson} ${lesson.currencySymbol || '₴'}`}
                                    </span>

                                    <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                                      {lesson.className || lesson.lessonType || 'GE'}
                                    </span>
                                    <span className={`lesson-chevron ${isExpanded ? 'open' : ''}`}>
                                      ▼
                                    </span>
                                  </div>
                                </div>

                                {/* Accordion Detail Drawer */}
                                {isExpanded && (
                                  <div className="lesson-details-drawer">
                                    <div className="lesson-detail-item">
                                      <span className="lesson-detail-label">Group / Class</span>
                                      <span className="lesson-detail-val">{lesson.groupName || 'N/A'} (ID: {lesson.groupId || 'N/A'})</span>
                                    </div>

                                    <div className="lesson-detail-item">
                                      <span className="lesson-detail-label">{t('schedule.lessonType')}</span>
                                      <span className="lesson-detail-val">
                                        <span className="badge badge-info">{lesson.className || 'GE'}</span>
                                      </span>
                                    </div>

                                    <div className="lesson-detail-item">
                                      <span className="lesson-detail-label">Internal Lesson ID</span>
                                      <span className="lesson-detail-val" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                                        {lesson.groupLessonId || lesson.id}
                                      </span>
                                    </div>

                                    <div className="lesson-detail-item">
                                      <span className="lesson-detail-label">Date & Duration</span>
                                      <span className="lesson-detail-val">
                                        {lesson.strLessonDate || lesson.date} ({lesson.durationMinutes} min)
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Markers Legend Block */}
                  <div className="markers-legend-card">
                    <div className="markers-legend-title">
                      <span>📌</span>
                      <span>{t('schedule.legendTitle')}</span>
                    </div>
                    <div className="markers-legend-grid">
                      <div className="legend-item">
                        <span className="ribbon-bookmark ribbon-green" />
                        <span>Added classes details</span>
                      </div>
                      <div className="legend-item">
                        <span className="ribbon-bookmark ribbon-blue" />
                        <span>Attendance checked</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-color-bar" style={{ backgroundColor: '#00FF00' }} />
                        <span>Cancelled in Advance (0%)</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-color-bar" style={{ backgroundColor: '#CC9933' }} />
                        <span>Last-minute cancellation (100%)</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-color-bar" style={{ backgroundColor: '#f59e0b' }} />
                        <span>Late Cancelation (50%)</span>
                      </div>
                    </div>
                  </div>

                  {/* Week Summary Footer with Total Wage */}
                  <div className="week-totals-banner">
                    <div className="totals-group">
                      <div className="total-stat">
                        <span className="stat-label">{t('schedule.totalClaimedMinutes')}</span>
                        <span className="stat-value">{report.totalMinutesCalculated || report.totalMinutesReported} min</span>
                      </div>
                      <div className="total-stat">
                        <span className="stat-label">{t('schedule.lessonsCount')}</span>
                        <span className="stat-value">{report.totalLessonsCount}</span>
                      </div>
                      <div className="total-stat">
                        <span className="stat-label">{t('schedule.totalWageLabel')}</span>
                        <span className="stat-value" style={{ color: '#16a34a', fontWeight: 800 }}>
                          {report.totalWage || `${report.totalWageNumeric || 0} ₴`}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===================================================================
            RIGHT COLUMN: Zoom Telemetry Reconciliation (Phase 2 Placeholder)
            =================================================================== */}
        <div className="telemetry-column">
          <div className="telemetry-card">
            <div className="telemetry-header">
              <h2 className="telemetry-title">
                <span>🎥</span>
                <span>{t('schedule.zoomTelemetryTitle')}</span>
                <span className="badge badge-purple" style={{ fontSize: 11 }}>Phase 2</span>
              </h2>
              <p className="telemetry-subtitle">
                {t('schedule.zoomNoticeBody')}
              </p>
            </div>

            <div className="telemetry-body">
              {/* Informational Callout */}
              <div style={{ backgroundColor: '#ffffff', borderRadius: 'var(--radius-md)', padding: 14, border: '1px solid #bfdbfe' }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#1e40af', marginBottom: 4 }}>
                  📡 {t('schedule.zoomNoticeTitle')}
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {t('schedule.zoomStep1', { host: teacher?.zoomHostEmail || teacher?.email || 'configured host' })}
                </p>
              </div>

              {/* Status Preview */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t('schedule.matchingStatusLabel')}:</span>
                  <span className="badge badge-info" style={{ fontSize: 11 }}>{t('schedule.readyToReconcile')}</span>
                </div>

                <div className="mock-reconciliation-card">
                  <div className="mock-rec-row">
                    <span style={{ fontWeight: 600 }}>Lesson Match (08:00 - 09:00)</span>
                    <span className="badge badge-success">VERIFIED ✅</span>
                  </div>
                  <div className="mock-rec-row" style={{ color: 'var(--text-secondary)' }}>
                    <span>Claimed: 60 min</span>
                    <span>Zoom Call: 56 min</span>
                  </div>
                  <div className="mock-meta">
                    Zoom Meeting ID: 894 1120 4451 • QoS: Good • Host + Student present
                  </div>
                </div>

                <div className="mock-reconciliation-card">
                  <div className="mock-rec-row">
                    <span style={{ fontWeight: 600 }}>Lesson Match (11:00 - 12:00)</span>
                    <span className="badge badge-warning">ONLY_HOST ⚠️</span>
                  </div>
                  <div className="mock-rec-row" style={{ color: 'var(--text-secondary)' }}>
                    <span>Claimed: 60 min</span>
                    <span>Host Online: 18 min</span>
                  </div>
                  <div className="mock-meta">
                    Student No-Show detected (Host waited 18m).
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
