// ee-crm/app/api/teachers/[id]/zoom-meetings/route.js
// Teacher Zoom Meetings API: Retrieve factual Zoom occurrences for a teacher and date range

import { NextResponse } from 'next/server';
import { getTeacherById } from '@/lib/db.js';
import { logger } from '@/lib/logger.js';
import {
  getZoomOccurrencesForTeacher,
  formatOccurrenceForDisplay
} from '@/lib/zoom-occurrences.js';

export async function GET(req, { params }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Teacher ID is required' }, { status: 400 });
    }

    const teacher = await getTeacherById(id);
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!from || !to) {
      return NextResponse.json(
        { error: 'Please provide both from and to date parameters' },
        { status: 400 }
      );
    }

    if (from > to) {
      return NextResponse.json(
        { error: 'To Date cannot be earlier than From Date' },
        { status: 400 }
      );
    }

    // Check if teacher has mapped host identity
    const hasHostMapping = Boolean(
      (teacher.zoomHostEmail && teacher.zoomHostEmail.trim()) ||
      (teacher.email && teacher.email.trim())
    );

    if (!hasHostMapping) {
      return NextResponse.json({
        success: true,
        teacherId: id,
        from,
        to,
        totalMeetings: 0,
        meetings: [],
        unmapped: true
      });
    }

    const occurrences = await getZoomOccurrencesForTeacher({
      teacherZoomEmail: teacher.zoomHostEmail,
      teacherEmail: teacher.email,
      fromDate: from,
      toDate: to
    });

    const formattedMeetings = occurrences.map(formatOccurrenceForDisplay);

    return NextResponse.json({
      success: true,
      teacherId: id,
      from,
      to,
      totalMeetings: formattedMeetings.length,
      meetings: formattedMeetings
    });
  } catch (err) {
    await logger.error('TEACHER_ZOOM_MEETINGS_ERROR', 'Failed to retrieve Zoom meetings', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
