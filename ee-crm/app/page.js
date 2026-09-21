'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function TeacherDirectoryPage() {
  const router = useRouter();
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [teacherToDelete, setTeacherToDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [schoolmateId, setSchoolmateId] = useState('');
  const [zoomHostEmail, setZoomHostEmail] = useState('');

  // Fetch teachers from backend
  const fetchTeachers = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await fetch('/api/teachers');
      if (!res.ok) {
        throw new Error(`Failed to load teachers (${res.status})`);
      }
      const data = await res.json();
      setTeachers(Array.isArray(data.teachers) ? data.teachers : []);
    } catch (err) {
      setErrorMessage(err.message || 'Error connecting to database');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeachers();
  }, [fetchTeachers]);

  // Handle Manual Form Submission
  const handleAddTeacher = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const fName = firstName.trim();
    const lName = lastName.trim();
    const mail = email.trim();
    const sId = parseInt(schoolmateId.trim(), 10);

    if (!mail) {
      setErrorMessage('Teacher email is required.');
      return;
    }
    if (!fName && !lName) {
      setErrorMessage('At least first name or last name is required.');
      return;
    }
    if (isNaN(sId) || sId <= 0) {
      setErrorMessage('Schoolmate Teacher ID must be a positive integer.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: fName,
          lastName: lName,
          email: mail,
          schoolmateTeacherId: sId,
          zoomHostEmail: zoomHostEmail.trim() || mail
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add teacher');
      }

      // Optimistic / immediate state update
      setTeachers(prev => {
        const filtered = prev.filter(t => t.id !== data.teacher.id);
        return [data.teacher, ...filtered];
      });

      setSuccessMessage(`Teacher "${data.teacher.fullName}" added successfully!`);
      // Reset form
      setFirstName('');
      setLastName('');
      setEmail('');
      setSchoolmateId('');
      setZoomHostEmail('');
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm Delete Teacher from Modal
  const confirmDeleteTeacher = async () => {
    if (!teacherToDelete) return;
    const teacher = teacherToDelete;

    setErrorMessage(null);
    setSuccessMessage(null);
    setDeletingId(teacher.id);

    // Save previous state for rollback
    const previousTeachers = [...teachers];
    // Optimistic removal
    setTeachers(prev => prev.filter(t => t.id !== teacher.id));

    try {
      const res = await fetch(`/api/teachers/${teacher.id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to delete teacher (${res.status})`);
      }

      setSuccessMessage(`Deleted ${teacher.fullName} successfully.`);
      setTeacherToDelete(null);
    } catch (err) {
      // Rollback optimistic removal
      setTeachers(previousTeachers);
      setErrorMessage(`Failed to delete teacher: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Teacher Directory</h1>
        <p className="page-subtitle">
          Manage teachers, synchronize weekly Schoolmate ERP schedules, and inspect live Zoom telemetry reconciliation.
        </p>
      </div>

      {/* Alerts */}
      {errorMessage && (
        <div className="alert alert-error">
          <span>⚠️ {errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="btn btn-sm btn-secondary"
            style={{ padding: '2px 8px' }}
          >
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div className="alert alert-success">
          <span>✅ {successMessage}</span>
          <button
            onClick={() => setSuccessMessage(null)}
            className="btn btn-sm btn-secondary"
            style={{ padding: '2px 8px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Add Teacher Card */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <span>➕</span>
            <span>Add New Teacher</span>
          </h2>
        </div>
        <div className="card-body">
          <form onSubmit={handleAddTeacher}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">First Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Yuliia"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Last Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Savchuk"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="e.g. yuliasavchuk03@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Schoolmate Teacher ID *</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="e.g. 17251"
                  value={schoolmateId}
                  onChange={(e) => setSchoolmateId(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span className="spinner"></span>
                    <span>Adding Teacher...</span>
                  </>
                ) : (
                  <span>Add Teacher</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Teachers Directory Table Card */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <span>👥</span>
            <span>Registered Teachers ({teachers.length})</span>
          </h2>
          <button
            onClick={fetchTeachers}
            className="btn btn-sm btn-secondary"
            disabled={loading}
            title="Reload teachers from Upstash Redis"
          >
            {loading ? (
              <>
                <span className="spinner spinner-dark"></span>
                <span>Refreshing...</span>
              </>
            ) : (
              <>
                <span>🔄</span>
                <span>Refresh List</span>
              </>
            )}
          </button>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          {loading && teachers.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="spinner spinner-dark" style={{ width: 24, height: 24, marginBottom: 10 }}></div>
              <div>Loading teachers from Redis...</div>
            </div>
          ) : teachers.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>👨‍🏫</div>
              <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)', marginBottom: 4 }}>
                No Teachers Registered Yet
              </div>
              <p style={{ margin: '0 0 16px', fontSize: 14 }}>
                Use the form above or click one of the quick-add buttons to register a teacher.
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Teacher Name</th>
                    <th>Email Address</th>
                    <th>Schoolmate ID</th>
                    <th>Added On</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((teacher) => (
                    <tr
                      key={teacher.id}
                      className="table-row-clickable"
                      onClick={() => router.push(`/teachers/${teacher.id}`)}
                    >
                      <td>
                        <strong style={{ color: 'var(--text-primary)' }}>
                          {teacher.fullName || `${teacher.lastName} ${teacher.firstName}`.trim()}
                        </strong>
                      </td>
                      <td>
                        <span style={{ color: 'var(--text-secondary)' }}>{teacher.email}</span>
                      </td>
                      <td>
                        <span className="badge badge-primary">
                          #{teacher.schoolmateTeacherId}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        {teacher.createdAt
                          ? new Date(teacher.createdAt).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })
                          : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                          <Link
                            href={`/teachers/${teacher.id}`}
                            className="btn btn-sm btn-primary"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span>📅 View Schedule</span>
                          </Link>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setTeacherToDelete(teacher);
                            }}
                            disabled={deletingId === teacher.id}
                            className="btn btn-sm btn-danger"
                            title="Delete teacher"
                          >
                            {deletingId === teacher.id ? (
                              <span className="spinner spinner-dark"></span>
                            ) : (
                              <span>🗑️ Delete</span>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {teacherToDelete && (
        <div className="modal-backdrop" onClick={() => setTeacherToDelete(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-icon-danger">🗑️</div>
              <h3 className="modal-title">Delete Teacher</h3>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0 }}>
                Are you sure you want to delete teacher <strong>{teacherToDelete.fullName}</strong> (#{teacherToDelete.schoolmateTeacherId})?
              </p>
              <p className="modal-subtext">
                This will remove the teacher from Empire English CRM.
              </p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setTeacherToDelete(null)}
                disabled={deletingId === teacherToDelete.id}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                style={{ backgroundColor: 'var(--danger-text)', color: '#ffffff', borderColor: 'var(--danger-text)' }}
                onClick={confirmDeleteTeacher}
                disabled={deletingId === teacherToDelete.id}
              >
                {deletingId === teacherToDelete.id ? (
                  <>
                    <span className="spinner"></span>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Yes, Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
