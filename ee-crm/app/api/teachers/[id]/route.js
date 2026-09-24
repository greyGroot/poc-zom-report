// ee-crm/app/api/teachers/[id]/route.js
// Individual Teacher API: Retrieve and delete teacher by ID

import { NextResponse } from 'next/server';
import { getTeacherById, deleteTeacher } from '@/lib/db.js';
import { logger } from '@/lib/logger.js';
import { getZoomUsersStatusMap } from '@/lib/zoom.js';

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

    let zoomStatus = 'not_invited';
    try {
      const zoomMap = await getZoomUsersStatusMap();
      const emailToCheck = (teacher.zoomHostEmail || teacher.email || '').trim().toLowerCase();
      zoomStatus = zoomMap.get(emailToCheck) || 'not_invited';
    } catch {
      // ignore
    }

    return NextResponse.json({
      teacher: {
        ...teacher,
        zoomStatus
      }
    });
  } catch (err) {
    await logger.error('TEACHER_GET_ERROR', 'Failed to get teacher', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    // In Next.js 16+, params is a Promise that must be awaited
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Teacher ID is required' }, { status: 400 });
    }

    const teacher = await getTeacherById(id);
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
    }

    await deleteTeacher(id);

    await logger.info('TEACHER_DELETED', `Teacher deleted: ${teacher.fullName} (${id})`, {
      teacherId: id,
      schoolmateTeacherId: teacher.schoolmateTeacherId
    });

    return NextResponse.json({
      success: true,
      id,
      message: 'Teacher deleted successfully'
    });
  } catch (err) {
    await logger.error('TEACHER_DELETE_ERROR', 'Failed to delete teacher', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
