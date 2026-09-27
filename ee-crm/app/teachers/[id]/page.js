import { getTeacherById } from '@/lib/db.js';
import { getZoomOccurrencesForTeacher, formatOccurrenceForDisplay } from '@/lib/zoom-occurrences.js';
import TeacherScheduleClient from './TeacherScheduleClient';

export default async function TeacherSchedulePage({ params, searchParams }) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const teacherId = resolvedParams?.id;

  let teacher = null;
  let initialZoomMeetings = [];

  if (teacherId) {
    try {
      teacher = await getTeacherById(teacherId);
    } catch (e) {
      console.warn('Error fetching teacher on server:', e.message);
    }
  }

  const fromDate = resolvedSearchParams?.from;
  const toDate = resolvedSearchParams?.to;

  if (teacher && fromDate && toDate) {
    try {
      const occurrences = await getZoomOccurrencesForTeacher({
        teacherZoomEmail: teacher.zoomHostEmail,
        teacherEmail: teacher.email,
        fromDate,
        toDate
      });
      initialZoomMeetings = (occurrences || []).map(occ =>
        formatOccurrenceForDisplay(occ, {
          teacherHostEmail: teacher.zoomHostEmail || teacher.email
        })
      );
    } catch (e) {
      console.warn('Error fetching occurrences on server:', e.message);
    }
  }

  return (
    <TeacherScheduleClient
      initialTeacher={teacher}
      initialZoomMeetings={initialZoomMeetings}
    />
  );
}
