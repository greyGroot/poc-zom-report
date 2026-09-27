'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getKyivDateString, formatKyivDateHeader } from '@/lib/timezone';
import AirbnbDatePicker from './AirbnbDatePicker';
import { useZoomMeetings } from './useZoomMeetings';
import ZoomMeetingCard from './ZoomMeetingCard';

export default function TeacherScheduleClient({ initialTeacher = null, initialZoomMeetings = [] }) {
  const params = useParams();
  const searchParams = useSearchParams();
  const teacherId = params?.id;
  const { t, locale, formatUrl } = useLanguage();

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
  const [teacher, setTeacher] = useState(initialTeacher);
  const [loadingTeacher, setLoadingTeacher] = useState(!initialTeacher);
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

  // Zoom Meetings hook
  const {
    status: zoomStatus,
    meetings: zoomMeetings,
    totalMeetings: zoomTotalCount,
    error: zoomError,
    refreshError: zoomRefreshError,
    refresh: refreshZoom
  } = useZoomMeetings({
    teacherId,
    fromDate,
    toDate,
    initialMeetings: initialZoomMeetings
  });

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

  // Group Zoom meetings by Kyiv date
  const zoomMeetingsByDate = useMemo(() => {
    const map = new Map();
    if (Array.isArray(zoomMeetings)) {
      for (const m of zoomMeetings) {
        const d = getKyivDateString(m.startTime) || 'Unknown';
        if (!map.has(d)) {
          map.set(d, []);
        }
        map.get(d).push(m);
      }
    }
    return map;
  }, [zoomMeetings]);

  // Combined Day-by-Day List (Union of Schoolmate days and Zoom meeting dates)
  const combinedDaysList = useMemo(() => {
    const schoolmateMap = new Map();
    if (report?.days) {
      for (const d of report.days) {
        schoolmateMap.set(d.date, d);
      }
    }

    const allDatesSet = new Set();
    // Add all dates from Schoolmate
    for (const d of schoolmateMap.keys()) {
      if (d) allDatesSet.add(d);
    }
    // Add all dates from Zoom
    for (const d of zoomMeetingsByDate.keys()) {
      if (d && d !== 'Unknown') allDatesSet.add(d);
    }

    // If no days found yet, but fromDate/toDate exist, ensure the requested dates are in range
    if (allDatesSet.size === 0 && fromDate && toDate) {
      if (fromDate === toDate) {
        allDatesSet.add(fromDate);
      }
    }

    const sortedDates = Array.from(allDatesSet).sort();

    const filterDayLessons = (lessons) => {
      if (!Array.isArray(lessons)) return [];
      switch (statusFilter) {
        case 'completed':
          return lessons.filter(l => !l.lessonStatusName || l.lessonStatusName.toLowerCase().includes('trial success'));
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

    return sortedDates.map(dateStr => {
      const smDay = schoolmateMap.get(dateStr);
      const dayLessons = smDay?.lessons || [];
      const filteredLessons = filterDayLessons(dayLessons);
      const dayZoomMeetings = zoomMeetingsByDate.get(dateStr) || [];

      let dayName = smDay?.dayName || '';
      if (!dayName && dateStr) {
        dayName = formatKyivDateHeader(dateStr, locale);
      }

      const subtotalMinutes = smDay?.subtotalMinutes || dayLessons.reduce((sum, l) => sum + (l.durationMinutes || 0), 0);
      const subtotalWageFormatted = smDay?.subtotalWageFormatted || (smDay?.subtotalWage ? `${smDay.subtotalWage.toFixed(2)} ₴` : null);

      return {
        date: dateStr,
        dayName,
        daySchedule: smDay,
        rawLessons: dayLessons,
        filteredLessons,
        zoomMeetings: dayZoomMeetings,
        subtotalMinutes,
        subtotalWageFormatted
      };
    });
  }, [report, zoomMeetingsByDate, fromDate, toDate, statusFilter, locale]);

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
    <div style={{ maxWidth: 1400, margin: '0 auto', paddingBottom: 40 }}>
      {/* Back link */}
      <div style={{ marginBottom: 16 }}>
        <Link href={formatUrl('/')} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex' }}>
          <span>{t('schedule.backLink')}</span>
        </Link>
      </div>

      {/* Teacher Profile Card */}
      <div className="card" style={{ marginBottom: 16 }}>
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
      <div className="card" style={{ overflow: 'visible', marginBottom: 20 }}>
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

      {/* Floating Filter Pills & Expand Controls */}
      {(() => {
        const allReportLessons = report?.lessons || (report?.days ? report.days.flatMap(d => d.lessons || []) : []);
        const isCompleted = (l) => !l.lessonStatusName || (l.lessonStatusName || '').toLowerCase().includes('trial success');
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            <div className="filter-pills-container" style={{ margin: 0 }}>
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

            {report && (
              <button
                type="button"
                onClick={toggleAllLessons}
                className="btn btn-sm btn-secondary"
              >
                {expandedLessons.size > 0 ? 'Collapse All' : 'Expand All'}
              </button>
            )}
          </div>
        );
      })()}

      {/* Loading Skeletons */}
      {loadingReport && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
          <div className="card" style={{ padding: 24 }}>
            <div className="zoom-card-skeleton" style={{ marginBottom: 12 }} />
            <div className="zoom-card-skeleton" />
          </div>
        </div>
      )}

      {/* ===================================================================
          DAY-BY-DAY ELEVATED PAPER BOXES (CRM-004 ARCHITECTURE)
          =================================================================== */}
      {!loadingReport && combinedDaysList.length === 0 && (
        <div className="card" style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏖️</div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
            0 {t('schedule.lessonsCount')}
          </div>
          <p style={{ margin: 0, fontSize: 13 }}>
            Teacher has 0 scheduled lessons for the period {fromDate} to {toDate}.
          </p>
        </div>
      )}

      {!loadingReport && combinedDaysList.map((day) => {
        if (statusFilter !== 'all' && day.filteredLessons.length === 0 && day.zoomMeetings.length === 0) {
          return null;
        }

        return (
          <section
            key={day.date}
            className="day-box-card"
            aria-label={`Day ${day.dayName || day.date}`}
          >
            {/* Day Elevated Header */}
            <header className="day-box-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span className="day-title" style={{ fontSize: 15, fontWeight: 700 }}>
                  📅 {day.dayName || day.date}
                </span>
                <span className="day-subtotal">
                  {day.subtotalMinutes} min • {day.filteredLessons.length} {t('schedule.lessonsCount').toLowerCase()}
                  {day.subtotalWageFormatted ? ` • ${day.subtotalWageFormatted}` : ''}
                </span>
              </div>

              {day.date && (
                <Link
                  href={formatUrl(`/teachers/${teacherId}/${day.date}?from=${fromDate}&to=${toDate}${activePreset ? `&preset=${activePreset}` : ''}${statusFilter !== 'all' ? `&filter=${statusFilter}` : ''}`)}
                  className="btn btn-secondary btn-sm"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#1d4ed8',
                    backgroundColor: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <span>{t('schedule.openDayDetails') || 'Open day details'}</span>
                  <span>→</span>
                </Link>
              )}
            </header>

            {/* Side-by-Side Day Body */}
            <div className="day-box-grid">
              {/* ========================================================= */}
              {/* LEFT: Schoolmate Schedule for this day                     */}
              {/* ========================================================= */}
              <div className="day-column-box">
                <div className="day-column-heading">
                  <span>📚 {t('schedule.scheduleTitle')}</span>
                  <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                    {day.filteredLessons.length}
                  </span>
                </div>

                {day.filteredLessons.length === 0 ? (
                  <div className="zoom-empty-card" style={{ padding: '24px 16px', minHeight: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 24, marginBottom: 4 }}>📋</span>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                      {t('schedule.schoolmateEmpty') || 'No Schoolmate lessons scheduled for this day.'}
                    </p>
                  </div>
                ) : (
                  <div className="lesson-list" style={{ padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {day.filteredLessons.map((lesson, idx) => {
                      const isExpanded = expandedLessons.has(lesson.id);
                      const hasStatus = Boolean(lesson.lessonStatusName);
                      const statusColor = lesson.lessonStatusColor || (hasStatus ? '#f59e0b' : null);
                      const isZeroRate = parseFloat(String(lesson.teacherRatePerLesson || '0')) === 0;

                      const timeDisplay = (lesson.startTime && lesson.endTime && lesson.startTime !== '00:00')
                        ? `${lesson.startTime} – ${lesson.endTime}`
                        : (lesson.startTime && lesson.startTime !== '00:00' ? lesson.startTime : null);

                      const safeRate = lesson.teacherRate || `${parseFloat(String(lesson.teacherRatePerLesson || 0)).toFixed(2)} ${lesson.currencySymbol || '₴'}`;

                      const isIndividual = (Number(lesson.enrolledStudents) || 1) <= 1;
                      const rawGroupName = lesson.groupName || lesson.groupOrStudent || '';
                      const cleanStudentName = rawGroupName.replace(/\s+(NovaPay|Grammarly|EPAM|SoftServe|Genesis|MacPaw|Ciklum|Luxoft|Ajax|Sigma|DOU|B1|B2|A1|A2|C1|C2|Speaking Club).*$/i, '').trim() || rawGroupName;

                      return (
                        <article
                          key={lesson.id || idx}
                          className={`lesson-card ${isExpanded ? 'expanded' : ''} ${hasStatus ? 'status-border-active' : ''}`}
                          style={statusColor ? { borderLeftColor: statusColor } : {}}
                        >
                          {/* Summary Bar - 2-row layout */}
                          <div
                            className="lesson-summary-bar-vertical"
                            onClick={() => toggleLesson(lesson.id)}
                            role="button"
                            tabIndex={0}
                            aria-expanded={isExpanded}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleLesson(lesson.id);
                              }
                            }}
                            style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}
                          >
                            {/* Row 1: Title & Expand Chevron */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {/* Ribbon Bookmarks */}
                                <div className="ribbon-bookmarks-wrapper">
                                  {lesson.classDetailsAdded && (
                                    <div className="sm-tooltip-wrapper">
                                      <span className="ribbon-bookmark ribbon-green" />
                                      <span className="sm-tooltip-text">{t('dayDetails.classNotesAdded') || 'Added classes details'}</span>
                                    </div>
                                  )}
                                  {lesson.attendanceChecked && (
                                    <div className="sm-tooltip-wrapper">
                                      <span className="ribbon-bookmark ribbon-blue" />
                                      <span className="sm-tooltip-text">{t('dayDetails.attendanceMarked') || 'Attendance checked'}</span>
                                    </div>
                                  )}
                                </div>

                                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                                  {idx + 1}. {rawGroupName || 'Group Class'}
                                </h4>
                              </div>

                              <span className={`lesson-chevron ${isExpanded ? 'open' : ''}`} style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {isExpanded ? '▲' : '▼'}
                              </span>
                            </div>

                            {/* Row 2: Badges and Metadata */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: '100%' }}>
                              {/* Time Badge */}
                              {timeDisplay && (
                                <span className="lesson-time-badge" style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: 4, color: 'var(--text-primary)' }}>
                                  {timeDisplay}
                                </span>
                              )}

                              {/* Duration Badge */}
                              <span className="lesson-duration" style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', color: 'var(--text-secondary)' }}>
                                ⏱️ {lesson.durationMinutes} min
                              </span>

                              {/* Status Chip */}
                              {hasStatus ? (
                                <span className={`lesson-status-chip ${
                                  lesson.lessonStatusName?.toLowerCase().includes('advance')
                                    ? 'chip-cancelled-advance'
                                    : lesson.lessonStatusName?.toLowerCase().includes('last')
                                      ? 'chip-last-minute'
                                      : 'chip-late-cancellation'
                                }`} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, fontWeight: 600 }}>
                                  {lesson.lessonStatusName}
                                </span>
                              ) : (
                                <span className="lesson-status-chip chip-completed" style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, fontWeight: 600 }}>
                                  Completed
                                </span>
                              )}

                              {/* Rate Tag */}
                              <span className={`lesson-rate-tag ${isZeroRate ? 'zero-rate' : ''}`} style={{ fontSize: 12, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
                                {safeRate}
                              </span>

                              {/* Lesson Type */}
                              <span className="badge badge-neutral" style={{ fontSize: 11, padding: '2px 6px' }}>
                                {lesson.className || lesson.lessonType || 'GE'}
                              </span>

                              {/* Planned Students */}
                              <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                👥 {t('dayDetails.plannedStudents', { count: lesson.enrolledStudents || 1 }) || `Planned: ${lesson.enrolledStudents || 1}`}
                                {lesson.attendanceChecked && (
                                  <span>· {t('dayDetails.attendedStudents', { attended: lesson.attendedCount || lesson.enrolledStudents || 1, planned: lesson.enrolledStudents || 1 }) || `Attended: ${lesson.attendedCount || lesson.enrolledStudents || 1}/${lesson.enrolledStudents || 1}`}</span>
                                )}
                              </span>

                              {/* Attendance Status */}
                              <span style={{ fontSize: 11, color: lesson.attendanceChecked ? '#047857' : 'var(--text-muted)', fontWeight: 500 }}>
                                {lesson.attendanceChecked ? `✅ ${t('dayDetails.attendanceMarked') || 'Attendance marked'}` : `⚪ ${t('dayDetails.attendanceNotMarked') || 'Attendance not marked'}`}
                              </span>
                            </div>
                          </div>

                          {/* Accordion Detail Drawer */}
                          {isExpanded && (
                            <div style={{ padding: '10px 14px', backgroundColor: '#f8fafc', borderTop: '1px solid var(--border-color)', fontSize: 12 }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {isIndividual ? (
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', backgroundColor: '#ffffff', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{cleanStudentName}</span>
                                      <span className="badge badge-neutral" style={{ fontSize: 11 }}>1 {t('dayDetails.enrolledStudent')}</span>
                                    </div>
                                    <span style={{ fontSize: 12, color: lesson.attendanceChecked ? '#047857' : 'var(--text-muted)' }}>
                                      {lesson.attendanceChecked ? `✅ ${t('dayDetails.attended')}` : `⚪ ${t('dayDetails.attendanceNotMarked')}`}
                                    </span>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', backgroundColor: '#ffffff', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{rawGroupName}</span>
                                      <span className="badge badge-neutral" style={{ fontSize: 11 }}>{lesson.enrolledStudents || 1} {t('dayDetails.enrolledStudentsPlural')}</span>
                                    </div>
                                    <span style={{ fontSize: 12, color: lesson.attendanceChecked ? '#047857' : 'var(--text-muted)' }}>
                                      {lesson.attendanceChecked
                                        ? `✅ ${lesson.enrolledStudents || 1}/${lesson.enrolledStudents || 1} ${t('dayDetails.attended')}`
                                        : `⚪ ${t('dayDetails.attendanceNotMarked')}`}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Class Notes / Additional Details if present */}
                              {(lesson.classDetailsAdded || lesson.notes) && (
                                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0', fontSize: 12, color: 'var(--text-secondary)' }}>
                                  📝 <span style={{ fontWeight: 600 }}>{t('dayDetails.classNotes') || 'Class Notes'}:</span> {lesson.notes || t('dayDetails.classNotesAdded')}
                                </div>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ========================================================= */}
              {/* RIGHT: Tracked Zoom Meetings for this day                 */}
              {/* ========================================================= */}
              <div className="day-column-box">
                <div className="day-column-heading" style={{ justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>🎥 {t('schedule.zoomMeetingsTitle')}</span>
                    <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                      {day.zoomMeetings.length}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: 11, padding: '2px 8px', height: 22 }}
                    onClick={refreshZoom}
                    disabled={zoomStatus === 'loading' || zoomStatus === 'refreshing'}
                  >
                    <span>{zoomStatus === 'refreshing' ? '⏳' : '🔄'}</span>
                    <span>{t('common.refresh') || 'Refresh'}</span>
                  </button>
                </div>

                {zoomStatus === 'loading' && (
                  <div className="zoom-skeleton-list" aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="zoom-card-skeleton" />
                  </div>
                )}

                {zoomStatus !== 'loading' && day.zoomMeetings.length === 0 && (
                  <div className="zoom-empty-card" style={{ padding: '24px 16px', minHeight: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 24, marginBottom: 4 }}>📹</span>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                      {t('schedule.zoomEmpty') || 'No Zoom meetings recorded for this date.'}
                    </p>
                  </div>
                )}

                {zoomStatus !== 'loading' && day.zoomMeetings.length > 0 && (
                  <div className="zoom-meeting-cards-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {day.zoomMeetings.map(occ => (
                      <ZoomMeetingCard key={occ.id} occurrence={occ} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        );
      })}

      {/* Markers Legend Block */}
      <div className="markers-legend-card" style={{ marginTop: 20 }}>
        <div className="markers-legend-title">
          <span>📌</span>
          <span>{t('schedule.legendTitle')}</span>
        </div>
        <div className="markers-legend-grid">
          <div className="legend-item">
            <span className="ribbon-bookmark ribbon-green" />
            <span>{t('dayDetails.classNotesAdded') || 'Added classes details'}</span>
          </div>
          <div className="legend-item">
            <span className="ribbon-bookmark ribbon-blue" />
            <span>{t('dayDetails.attendanceMarked') || 'Attendance checked'}</span>
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
      {report && (
        <div className="week-totals-banner" style={{ marginTop: 16 }}>
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
      )}
    </div>
  );
}
