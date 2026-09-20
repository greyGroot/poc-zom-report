// ee-crm/app/api/teachers/route.js
// Teachers API: List all teachers and register a new teacher

import { NextResponse } from 'next/server';
import { getTeachers, createTeacher } from '@/lib/db.js';
import { logger } from '@/lib/logger.js';

export async function GET() {
  try {
    const teachers = await getTeachers();
    return NextResponse.json({ teachers });
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
      zoomHostEmail,
      schoolmateLogin
    } = body || {};

    // Validate required fields: schoolmateTeacherId and (email or firstName/lastName)
    const numId = Number(schoolmateTeacherId);
    if (schoolmateTeacherId === undefined || schoolmateTeacherId === null || isNaN(numId) || numId <= 0) {
      return NextResponse.json(
        { error: 'schoolmateTeacherId is required and must be a valid number (must be positive)' },
        { status: 400 }
      );
    }

    const hasEmail = Boolean(email && typeof email === 'string' && email.trim());
    const hasName = Boolean(
      (firstName && typeof firstName === 'string' && firstName.trim()) ||
      (lastName && typeof lastName === 'string' && lastName.trim())
    );

    if (!hasEmail && !hasName) {
      return NextResponse.json(
        { error: 'At least email or name (firstName/lastName) is required' },
        { status: 400 }
      );
    }

    const teacher = await createTeacher({
      firstName,
      lastName,
      email,
      schoolmateTeacherId: Number(schoolmateTeacherId),
      zoomHostEmail,
      schoolmateLogin
    });

    await logger.info('TEACHER_CREATED', `Teacher created: ${teacher.fullName} (${teacher.id})`, {
      teacherId: teacher.id,
      schoolmateTeacherId: teacher.schoolmateTeacherId,
      email: teacher.email
    });

    return NextResponse.json({ teacher }, { status: 201 });
  } catch (err) {
    await logger.error('TEACHER_CREATE_ERROR', 'Failed to create teacher', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
