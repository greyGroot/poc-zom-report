'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function TeacherSchedulePage() {
  const params = useParams();
  const teacherId = params?.id;

  // Teacher State
  const [teacher, setTeacher] = useState(null);
  const [loadingTeacher, setLoadingTeacher] = useState(true);
  const [teacherError, setTeacherError] = useState(null);

  // Date Range Controls
  const [fromDate, setFromDate] = useState('2026-09-14');
  const [toDate, setToDate] = useState('2026-09-20');
  const [activePreset, setActivePreset] = useState('test');

  // Schedule Report State
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState(null);

  // Accordion State: Set of open lesson IDs
  const [expandedLessons, setExpandedLessons] = useState(new Set());

  // Calculate week ranges helper
  const getWeekRange = (offsetWeeks = 0) => {
    const now = new Date();
    const day = now.getDay(); // 0 is Sun, 1 is Mon...
    const diffToMonday = (day === 0 ? -6 : 1) - day + offsetWeeks * 7;

    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const format = (d) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    return { from: format(monday), to: format(sunday) };
  };

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
      setReportError('Teacher Schoolmate ID is missing.');
      return;
    }

    if (fromDate > toDate) {
      setReportError('From Date cannot be later than To Date.');
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

  // Presets Handlers
  const handlePresetTest = () => {
    setFromDate('2026-09-14');
    setToDate('2026-09-20');
    setActivePreset('test');
  };

  const handlePresetThisWeek = () => {
    const range = getWeekRange(0);
    setFromDate(range.from);
    setToDate(range.to);
    setActivePreset('thisWeek');
  };

  const handlePresetLastWeek = () => {
    const range = getWeekRange(-1);
    setFromDate(range.from);
    setToDate(range.to);
    setActivePreset('lastWeek');
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
          <Link href="/" className="btn btn-secondary btn-sm">
            <span>← Back to Teachers</span>
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
        <Link href="/" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex' }}>
          <span>← Back to Teachers</span>
        </Link>
      </div>

      {/* Teacher Profile Card */}
      <div className="card">
        <div className="card-header" style={{ padding: '20px 24px' }}>
          <div>
            <h1 className="page-title" style={{ fontSize: 24, marginBottom: 6 }}>
              {teacher ? teacher.fullName : 'Teacher Schedule'}
            </h1>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="badge badge-primary">
                🆔 Schoolmate ID: {teacher?.schoolmateTeacherId || '...'}
              </span>
              <span className="badge badge-neutral">
                ✉️ {teacher?.email || '...'}
              </span>
              <span className="badge badge-purple">
                🎥 Zoom Host: {teacher?.zoomHostEmail || teacher?.email || '...'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Date Range & Fetch Controls Card */}
      <div className="card">
        <div className="card-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-end', justifyContent: 'space-between' }}>
            {/* Date Inputs */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="form-group">
                <label className="form-label">From Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setActivePreset(null);
                  }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">To Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setActivePreset(null);
                  }}
                />
              </div>

              {/* Quick Presets */}
              <div className="form-group">
                <label className="form-label">Quick Presets</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`btn-preset ${activePreset === 'test' ? 'active' : ''}`}
                    onClick={handlePresetTest}
                  >
                    Sep 14-20 (Test)
                  </button>
                  <button
                    type="button"
                    className={`btn-preset ${activePreset === 'thisWeek' ? 'active' : ''}`}
                    onClick={handlePresetThisWeek}
                  >
                    This Week
                  </button>
                  <button
                    type="button"
                    className={`btn-preset ${activePreset === 'lastWeek' ? 'active' : ''}`}
                    onClick={handlePresetLastWeek}
                  >
                    Last Week
                  </button>
                </div>
              </div>
            </div>

            {/* Fetch Action Button & Cache Badge */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleFetchReport}
                disabled={loadingReport}
                style={{ padding: '10px 20px', fontSize: 15 }}
              >
                {loadingReport ? (
                  <>
                    <span className="spinner"></span>
                    <span>Parsing Schoolmate PDF...</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>Fetch & Parse from Schoolmate</span>
                  </>
                )}
              </button>

              {report && (
                <span className="badge badge-info">
                  🌐 Live Schoolmate ({report.durationMs}ms)
                </span>
              )}
            </div>
          </div>

          {reportError && (
            <div className="alert alert-error" style={{ marginTop: 18, marginBottom: 0 }}>
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
                <span>Schoolmate Schedule</span>
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
                    No Schedule Data Loaded
                  </div>
                  <p style={{ margin: 0, fontSize: 13 }}>
                    Click &quot;Fetch & Parse from Schoolmate&quot; to download and extract the weekly schedule PDF.
                  </p>
                </div>
              ) : report.days.length === 0 ? (
                <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🏖️</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                    No Lessons Scheduled
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
                          Subtotal: {dayGroup.subtotalMinutes} min ({dayGroup.lessons.length} lesson{dayGroup.lessons.length === 1 ? '' : 's'})
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
                                    <span className="lesson-detail-label">Lesson Type</span>
                                    <span className="lesson-detail-val">
                                      <span className="badge badge-info">{lesson.lessonType || 'GE (General English)'}</span>
                                    </span>
                                  </div>

                                  <div className="lesson-detail-item">
                                    <span className="lesson-detail-label">Language</span>
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
                        <span className="stat-label">Total Claimed Minutes</span>
                        <span className="stat-value">{report.totalMinutesReported} min</span>
                      </div>
                      <div className="total-stat">
                        <span className="stat-label">Total Lessons</span>
                        <span className="stat-value">{report.totalLessonsCount}</span>
                      </div>
                      <div className="total-stat">
                        <span className="stat-label">Calculated Sum</span>
                        <span className="stat-value">{report.totalMinutesCalculated} min</span>
                      </div>
                    </div>

                    <div>
                      <span className="badge badge-success" style={{ fontSize: 13, padding: '6px 12px' }}>
                        Ready for Zoom Telemetry Matching ✅
                      </span>
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
                <span>Zoom Telemetry Reconciliation</span>
                <span className="badge badge-purple" style={{ fontSize: 11 }}>Phase 2</span>
              </h2>
              <p className="telemetry-subtitle">
                Side-by-side reconciliation of Schoolmate claimed lessons against real-time Zoom webhook telemetry.
              </p>
            </div>

            <div className="telemetry-body">
              {/* Informational Callout */}
              <div style={{ backgroundColor: '#ffffff', borderRadius: 'var(--radius-md)', padding: 14, border: '1px solid #bfdbfe' }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#1e40af', marginBottom: 4 }}>
                  📡 Live Ingestion Pipeline Active
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Meeting events (<code style={{ color: '#2563eb' }}>meeting.started</code>,{' '}
                  <code style={{ color: '#2563eb' }}>participant_joined</code>,{' '}
                  <code style={{ color: '#2563eb' }}>meeting.ended</code>) are continuously captured in Redis.
                  Phase 2 cross-references teacher host email (<strong>{teacher?.zoomHostEmail || teacher?.email || 'configured email'}</strong>)
                  and matching time windows.
                </p>
              </div>

              {/* Mock Reconciliation Preview */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Telemetry Matching Preview:</span>
                  <span className="badge badge-info" style={{ fontSize: 11 }}>Automated Rules</span>
                </div>

                {/* Example 1: Full Attendance Match */}
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
                    Zoom Meeting ID: 894 1120 4451 • QoS: Good (0.2% jitter) • Host + Student present
                  </div>
                </div>

                {/* Example 2: Student No-Show */}
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
                    Student No-Show detected (Host waited 18m). Eligible for standard no-show compensation.
                  </div>
                </div>

                {/* Example 3: Short Call / Disconnect */}
                <div className="mock-reconciliation-card">
                  <div className="mock-rec-row">
                    <span style={{ fontWeight: 600 }}>Lesson Match (16:00 - 17:00)</span>
                    <span className="badge badge-danger">SHORT_CALL ❌</span>
                  </div>
                  <div className="mock-rec-row" style={{ color: 'var(--text-secondary)' }}>
                    <span>Claimed: 60 min</span>
                    <span>Actual Duration: 12 min</span>
                  </div>
                  <div className="mock-meta">
                    Call terminated prematurely (&lt; 30 min). Flagged for supervisor manual review.
                  </div>
                </div>
              </div>

              {/* Status Legend */}
              <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.7)', borderRadius: 'var(--radius-sm)', padding: 12, border: '1px solid #e2e8f0', fontSize: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                  Reconciliation Classification Rules:
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  <li><strong style={{ color: '#15803d' }}>VERIFIED</strong>: Duration &ge; 30 min, host & student both present.</li>
                  <li><strong style={{ color: '#854d0e' }}>ONLY_HOST</strong>: Duration &ge; 15 min, student absent (No-Show).</li>
                  <li><strong style={{ color: '#b91c1c' }}>SHORT_CALL</strong>: Duration &lt; 30 min (&lt; 15 min solo), flagged for review.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
