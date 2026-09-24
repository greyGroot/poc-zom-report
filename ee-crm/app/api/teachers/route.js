// ee-crm/app/api/teachers/route.js
// Teachers API: List all teachers and register a new teacher

import { NextResponse } from 'next/server';
import { getTeachers, createTeacher } from '@/lib/db.js';
import { logger } from '@/lib/logger.js';
import { getZoomUsersStatusMap } from '@/lib/zoom.js';

export async function GET() {
  try {
    const teachers = await getTeachers();
    let zoomMap = new Map();
    try {
      zoomMap = await getZoomUsersStatusMap();
    } catch (zoomErr) {
      console.warn('[API/TEACHERS] Could not fetch Zoom statuses:', zoomErr.message);
    }

    const enrichedTeachers = teachers.map(t => {
      const emailToCheck = (t.zoomHostEmail || t.email || '').trim().toLowerCase();
      const zoomStatus = zoomMap.get(emailToCheck) || 'not_invited';
      return {
        ...t,
        zoomStatus
      };
    });

    return NextResponse.json({ teachers: enrichedTeachers });
  } catch (err) {
    await logger.error('TEACHERS_FETCH_ERROR', 'Failed to retrieve teachers list', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const {
      firstName,
      lastName,
      email,
      schoolmateTeacherId,
      phone,
      telegramId,
      zoomHostEmail,
      schoolmateLogin
    } = body || {};

    if (!firstName || typeof firstName !== 'string' || !firstName.trim()) {
      return NextResponse.json({ error: 'First Name is required' }, { status: 400 });
    }

    if (!lastName || typeof lastName !== 'string' || !lastName.trim()) {
      return NextResponse.json({ error: 'Last Name is required' }, { status: 400 });
    }

    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email Address is required' }, { status: 400 });
    }

    const numId = Number(schoolmateTeacherId);
    if (schoolmateTeacherId === undefined || schoolmateTeacherId === null || isNaN(numId) || numId <= 0) {
      return NextResponse.json(
        { error: 'Schoolmate Teacher ID is required and must be a positive number' },
        { status: 400 }
      );
    }

    // Optional Telegram ID must start with @ if supplied
    const cleanTelegram = typeof telegramId === 'string' ? telegramId.trim() : '';
    if (cleanTelegram && !cleanTelegram.startsWith('@')) {
      return NextResponse.json(
        { error: 'Telegram ID must start with @ (e.g. @username)' },
        { status: 400 }
      );
    }

    const teacher = await createTeacher({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      schoolmateTeacherId: numId,
      phone: typeof phone === 'string' ? phone.trim() : '',
      telegramId: cleanTelegram,
      zoomHostEmail,
      schoolmateLogin
    });

    await logger.info('TEACHER_CREATED', `Teacher created: ${teacher.fullName} (${teacher.id})`, {
      teacherId: teacher.id,
      schoolmateTeacherId: teacher.schoolmateTeacherId,
      email: teacher.email
    });

    const emailToCheck = (teacher.zoomHostEmail || teacher.email || '').trim().toLowerCase();
    let zoomStatus = 'not_invited';
    try {
      const zoomMap = await getZoomUsersStatusMap();
      zoomStatus = zoomMap.get(emailToCheck) || 'not_invited';
    } catch {
      // ignore
    }

    const teacherWithZoom = {
      ...teacher,
      zoomStatus
    };

    return NextResponse.json({ teacher: teacherWithZoom }, { status: 201 });
  } catch (err) {
    await logger.error('TEACHER_CREATE_ERROR', 'Failed to create teacher', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
