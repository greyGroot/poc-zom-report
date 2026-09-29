'use client';

import React from 'react';
import { useLanguage } from '@/lib/shared/i18n/LanguageContext';

export default function GroupStudentRoster({
  students = [],
  isIndividual = false,
  fallbackStudentName = '',
  attendanceChecked = false
}) {
  const { t } = useLanguage();

  // Normalize student list
  let roster = Array.isArray(students) ? students : [];
  if (roster.length === 0 && fallbackStudentName && isIndividual) {
    roster = [{ id: 'fallback', fullName: fallbackStudentName }];
  }

  const count = roster.length;
  const isSingle = isIndividual || count === 1;

  return (
    <div
      role="region"
      aria-label={isSingle ? (t('roster.enrolledStudent') || 'Enrolled Student:') : (t('roster.enrolledStudents', { count }) || `Enrolled Students (${count})`)}
      className="group-student-roster"
      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          👥 {isSingle ? (t('roster.enrolledStudent') || 'Enrolled Student:') : (t('roster.enrolledStudents', { count }) || `Enrolled Students (${count}):`)}
        </span>
        {count > 0 && (
          <span className="badge badge-neutral" style={{ fontSize: 10, padding: '1px 6px' }}>
            {isSingle ? (t('roster.studentCountSingle') || '1 student') : (t('roster.studentsCount', { count }) || `${count} students`)}
          </span>
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

            return (
              <li
                key={key}
                className="student-chip-item"
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
                title={name}
              >
                <span style={{ fontSize: 12, opacity: 0.8, flexShrink: 0 }} aria-hidden="true">👤</span>
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
