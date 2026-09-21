'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import AirbnbDatePicker from './AirbnbDatePicker';

export default function TeacherSchedulePage() {
  const params = useParams();
  const teacherId = params?.id;
  const { t } = useLanguage();

  // Teacher State
  const [teacher, setTeacher] = useState(null);
  const [loadingTeacher, setLoadingTeacher] = useState(true);
  const [teacherError, setTeacherError] = useState(null);

  // Date Range Controls
  const [fromDate, setFromDate] = useState('2026-09-14');
  const [toDate, setToDate] = useState('2026-09-20');
  const [activePreset, setActivePreset] = useState(null);

  // Schedule Report State
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState(null);

  // Accordion State: Set of open lesson IDs
  const [expandedLessons, setExpandedLessons] = useState(new Set());

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
  const handleFetchReport = async () => {
    if (!teacher?.schoolmateTeacherId) {
      setReportError(t('schedule.errMissingId'));
      return;
    }

    if (!fromDate || !toDate) {
      setReportError(t('schedule.errDateRange'));
      return;
    }

    if (fromDate > toDate) {
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
          fromDate,
          toDate
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
  };

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
          <Link href={`/?lang=${locale}`} className="btn btn-secondary btn-sm">
            <span>{t('schedule.backLink')}</span>
          </Link>
        </div>
        <div className="alert alert-error">
          <span>⚠️ {teacherError}</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Back link */}
      <div style={{ marginBottom: 16 }}>
        <Link href={`/?lang=${locale}`} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex' }}>
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
              onPresetSelect={(preset) => setActivePreset(preset)}
              onChange={({ fromDate: newFrom, toDate: newTo }) => {
                setFromDate(newFrom);
                setToDate(newTo);
              }}
            />

            {/* Fetch Action Button & Latency Badge directly on the left */}
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleFetchReport}
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
                  {report.days.map((dayGroup) => (
                    <div key={dayGroup.date} className="day-group">
                      {/* Day Subtotal Header */}
                      <div className="day-header">
                        <span className="day-title">
                          📅 {dayGroup.dayName || dayGroup.date} ({dayGroup.date})
                        </span>
                        <span className="day-subtotal">
                          Subtotal: {dayGroup.subtotalMinutes} min ({dayGroup.lessons.length} {t('schedule.lessonsCount').toLowerCase()})
                        </span>
                      </div>

                      {/* Day Lessons List */}
                      <div className="lesson-list">
                        {dayGroup.lessons.map((lesson) => {
                          const isExpanded = expandedLessons.has(lesson.id);
                          return (
                            <div
                              key={lesson.id}
                              className={`lesson-card ${isExpanded ? 'expanded' : ''}`}
                            >
                              {/* Summary Bar */}
                              <div
                                className="lesson-summary-bar"
                                onClick={() => toggleLesson(lesson.id)}
                              >
                                <div className="lesson-left-meta">
                                  <span className="lesson-time">
                                    ⏱️ {lesson.startTime} - {lesson.endTime}
                                  </span>
                                  <span className="lesson-duration">
                                    {lesson.durationMinutes} min
                                  </span>
                                  <span className="lesson-student">
                                    {lesson.groupOrStudent || 'Individual Lesson'}
                                  </span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                                    {lesson.lessonType || 'GE'}
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
                                    <span className="lesson-detail-label">{t('schedule.lessonType')}</span>
                                    <span className="lesson-detail-val">
                                      <span className="badge badge-info">{lesson.lessonType || 'GE (General English)'}</span>
                                    </span>
                                  </div>

                                  <div className="lesson-detail-item">
                                    <span className="lesson-detail-label">{t('schedule.language')}</span>
                                    <span className="lesson-detail-val">{lesson.language || 'English'}</span>
                                  </div>

                                  <div className="lesson-detail-item">
                                    <span className="lesson-detail-label">Internal ID</span>
                                    <span className="lesson-detail-val" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                                      {lesson.id}
                                    </span>
                                  </div>

                                  <div className="lesson-detail-item">
                                    <span className="lesson-detail-label">Date & Timing</span>
                                    <span className="lesson-detail-val">
                                      {lesson.date} ({lesson.startTime} - {lesson.endTime})
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Week Summary Footer */}
                  <div className="week-totals-banner">
                    <div className="totals-group">
                      <div className="total-stat">
                        <span className="stat-label">{t('schedule.totalClaimedMinutes')}</span>
                        <span className="stat-value">{report.totalMinutesReported} min</span>
                      </div>
                      <div className="total-stat">
                        <span className="stat-label">{t('schedule.lessonsCount')}</span>
                        <span className="stat-value">{report.totalLessonsCount}</span>
                      </div>
                      <div className="total-stat">
                        <span className="stat-label">{t('schedule.totalClaimedLabel')}</span>
                        <span className="stat-value">{report.totalMinutesCalculated} min</span>
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
