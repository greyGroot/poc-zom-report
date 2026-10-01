'use client';

import React from 'react';
import { useLanguage } from '@/lib/shared/i18n/LanguageContext';

export default function GroupStudentRoster({
  students = [],
  isIndividual = false,
  fallbackStudentName = '',
  attendanceChecked = false,
  attendanceData = {},
  isFuture = false
}) {
  const { t } = useLanguage();

  // Normalize student list
  let roster = Array.isArray(students) ? students : [];
  if (roster.length === 0 && fallbackStudentName && isIndividual) {
    roster = [{ id: 'fallback', fullName: fallbackStudentName }];
  }

  const count = roster.length;
  const isSingle = isIndividual || count === 1;

  const getStudentAttendance = (student) => {
    if (isFuture) {
      return {
        status: 'unchecked',
        icon: '❓',
        title: 'Not marked',
        ariaLabel: 'Not marked'
      };
    }

    const studentId = student.id;
    const studentName = (typeof student === 'string' ? student : (student.fullName || '')).trim().toLowerCase();

    // Check attendanceData map
    let record = null;
    if (attendanceData && typeof attendanceData === 'object') {
      if (studentId && attendanceData[studentId]) record = attendanceData[studentId];
      else if (studentId && attendanceData[String(studentId)]) record = attendanceData[String(studentId)];
      else if (studentName && attendanceData[studentName]) record = attendanceData[studentName];
    }

    if (record) {
      const isAbsent = record.status === 'absent' ||
                       record.shortName === 'AB' ||
                       (record.color && (record.color.toLowerCase() === '#ff0000' || record.color.toLowerCase() === 'red'));
      if (isAbsent) {
        return {
          status: 'absent',
          icon: '❌',
          title: 'Absent',
          ariaLabel: 'Absent'
        };
      }

      const isPresent = record.status === 'present' ||
                        (!record.shortName && !record.color && record.attendanceChecked) ||
                        (record.isStudentAttend && record.shortName !== 'AB');
      if (isPresent) {
        return {
          status: 'present',
          icon: '✅',
          title: 'Present',
          ariaLabel: 'Present'
        };
      }

      return {
        status: 'unchecked',
        icon: '❓',
        title: 'Not marked',
        ariaLabel: 'Not marked'
      };
    }

    // Fallback if attendanceData not provided for student, but lesson is marked checked
    if (attendanceChecked) {
      return {
        status: 'present',
        icon: '✅',
        title: 'Present',
        ariaLabel: 'Present'
      };
    }

    return {
      status: 'unchecked',
      icon: '❓',
      title: 'Not marked',
      ariaLabel: 'Not marked'
    };
  };

  return (
    <div
      role="region"
      aria-label={isSingle ? (t('roster.enrolledStudent') || 'Enrolled Student:') : (t('roster.enrolledStudents', { count }) || `Enrolled Students (${count})`)}
      className="group-student-roster"
      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            👥 {isSingle ? (t('roster.enrolledStudent') || 'Enrolled Student:') : (t('roster.enrolledStudents', { count }) || `Enrolled Students (${count}):`)}
          </span>
          {count > 0 && (
            <span className="badge badge-neutral" style={{ fontSize: 10, padding: '1px 6px' }}>
              {isSingle ? (t('roster.studentCountSingle') || '1 student') : (t('roster.studentsCount', { count }) || `${count} students`)}
            </span>
          )}
        </div>

        {/* Attendance Status Legend (only for past/present lessons) */}
        {!isFuture && (
          <div
            className="roster-attendance-legend"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 11,
              color: 'var(--text-secondary)'
            }}
          >
            <span className="attendance-legend-item" title="Present" aria-label="Present" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <span>✅</span> {t('attendance.present') || 'Present'}
            </span>
            <span className="attendance-legend-item" title="Absent" aria-label="Absent" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <span>❌</span> {t('attendance.absent') || 'Absent'}
            </span>
            <span className="attendance-legend-item" title="Not marked" aria-label="Not marked" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <span>❓</span> {t('attendance.notMarked') || 'Not marked'}
            </span>
          </div>
        )}
      </div>

      {count === 0 ? (
        <div style={{ padding: '6px 10px', backgroundColor: '#ffffff', borderRadius: 4, border: '1px solid #e2e8f0', color: 'var(--text-muted)', fontSize: 12 }}>
          ⚪ {t('roster.noStudents') || 'No students enrolled'}
        </div>
      ) : (
        <ul
          className="student-chips-list"
          role="list"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px 8px',
            listStyle: 'none',
            margin: 0,
            padding: 0
          }}
        >
          {roster.map((student, idx) => {
            const name = typeof student === 'string'
              ? student
              : (student.fullName || `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Student');
            const key = student.id || `student-${idx}-${name}`;
            const att = getStudentAttendance(student);

            return (
              <li
                key={key}
                className={`student-chip-item student-chip-${att.status}`}
                role="listitem"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  lineHeight: 1.4,
                  maxWidth: 240,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
                title={`${name} (${att.title})`}
                aria-label={`${name}: ${att.ariaLabel}`}
              >
                <span
                  className="student-attendance-status"
                  role="img"
                  title={att.title}
                  aria-label={att.ariaLabel}
                  style={{ fontSize: 12, flexShrink: 0 }}
                >
                  {att.icon}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {name}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
