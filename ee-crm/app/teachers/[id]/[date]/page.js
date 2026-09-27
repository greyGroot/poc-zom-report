import { getTeacherDayData } from '@/lib/teacher-day.js';
import TeacherDayDetailsClient from './TeacherDayDetailsClient';

export default async function TeacherDayPage({ params, searchParams }) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  const teacherId = resolvedParams?.id;
  const date = resolvedParams?.date;

  const fromParam = resolvedSearchParams?.from;
  const toParam = resolvedSearchParams?.to;
  const presetParam = resolvedSearchParams?.preset;
  const filterParam = resolvedSearchParams?.filter;

  let initialData = null;
  if (teacherId && date) {
    try {
      initialData = await getTeacherDayData({ teacherId, date });
    } catch (err) {
      console.warn('Error fetching teacher-day data on server:', err.message);
      initialData = { error: err.message, status: 500 };
    }
  }

  return (
    <TeacherDayDetailsClient
      initialData={initialData}
      teacherId={teacherId}
      date={date}
      fromParam={fromParam}
      toParam={toParam}
      presetParam={presetParam}
      filterParam={filterParam}
    />
  );
}
