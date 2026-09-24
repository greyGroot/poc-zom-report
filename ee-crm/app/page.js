'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/lib/i18n/LanguageContext';

// Module-level in-memory cache for weekly lessons across client navigations
const globalWeeklyLessonsCache = new Map();

function TeachersDirectoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, formatUrl } = useLanguage();

  // Read initial table parameters from URL
  const initialPage = Math.max(1, parseInt(searchParams?.get('page') || '1', 10) || 1);
  const initialLimit = ['10', '20', '50', '100', 'all'].includes(searchParams?.get('limit'))
    ? searchParams.get('limit')
    : '10';
  const initialSort = ['name', 'email', 'schoolmateTeacherId', 'zoomStatus', 'thisWeek'].includes(searchParams?.get('sort'))
    ? searchParams.get('sort')
    : 'name';
  const initialOrder = searchParams?.get('order') === 'desc' ? 'desc' : 'asc';
  const initialZoom = ['all', 'member', 'pending', 'not_invited'].includes(searchParams?.get('zoom'))
    ? searchParams.get('zoom')
    : 'all';
  const initialQ = searchParams?.get('q') || '';

  // Data & UI State
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [weeklyLessons, setWeeklyLessons] = useState(() => Object.fromEntries(globalWeeklyLessonsCache.entries()));
  const [submitting, setSubmitting] = useState(false);
  const [teacherToDelete, setTeacherToDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Table Controls State
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialLimit);
  const [sortField, setSortField] = useState(initialSort);
  const [sortOrder, setSortOrder] = useState(initialOrder);
  const [zoomFilter, setZoomFilter] = useState(initialZoom);
  const [searchQuery, setSearchQuery] = useState(initialQ);

  // Form fields
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [schoolmateId, setSchoolmateId] = useState('');
  const [phone, setPhone] = useState('');
  const [telegramId, setTelegramId] = useState('');
  const [zoomHostEmail, setZoomHostEmail] = useState('');

  // Sync state with URL search parameters
  const syncUrlParams = useCallback((page, limit, sort, order, zoom, q) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);

    if (page > 1) {
      url.searchParams.set('page', String(page));
    } else {
      url.searchParams.delete('page');
    }

    if (limit && limit !== '10') {
      url.searchParams.set('limit', String(limit));
    } else {
      url.searchParams.delete('limit');
    }

    if (sort && sort !== 'name') {
      url.searchParams.set('sort', sort);
    } else {
      url.searchParams.delete('sort');
    }

    if (order && order !== 'asc') {
      url.searchParams.set('order', order);
    } else {
      url.searchParams.delete('order');
    }

    if (zoom && zoom !== 'all') {
      url.searchParams.set('zoom', zoom);
    } else {
      url.searchParams.delete('zoom');
    }

    if (q && q.trim()) {
      url.searchParams.set('q', q.trim());
    } else {
      url.searchParams.delete('q');
    }

    window.history.replaceState(null, '', url.toString());
  }, []);

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

  // Auto-dismiss success notification after 5 seconds
  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => {
      setSuccessMessage(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  // Auto-dismiss error notification after 8 seconds
  useEffect(() => {
    if (!errorMessage) return;
    const timer = setTimeout(() => {
      setErrorMessage(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  // Handle Sort Click
  const handleSort = (field) => {
    let nextOrder = 'asc';
    if (sortField === field) {
      nextOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    }
    setSortField(field);
    setSortOrder(nextOrder);
    syncUrlParams(currentPage, pageSize, field, nextOrder, zoomFilter, searchQuery);
  };

  // Handle Zoom Filter Change
  const handleZoomFilterChange = (filterVal) => {
    setZoomFilter(filterVal);
    setCurrentPage(1);
    syncUrlParams(1, pageSize, sortField, sortOrder, filterVal, searchQuery);
  };

  // Handle Search Input Change
  const handleSearchChange = (val) => {
    setSearchQuery(val);
    setCurrentPage(1);
    syncUrlParams(1, pageSize, sortField, sortOrder, zoomFilter, val);
  };

  // Handle Page Size Change
  const handlePageSizeChange = (val) => {
    setPageSize(val);
    setCurrentPage(1);
    syncUrlParams(1, val, sortField, sortOrder, zoomFilter, searchQuery);
  };

  // Handle Page Navigation
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    syncUrlParams(newPage, pageSize, sortField, sortOrder, zoomFilter, searchQuery);
  };

  // Clear all filters
  const handleClearFilters = () => {
    setZoomFilter('all');
    setSearchQuery('');
    setCurrentPage(1);
    syncUrlParams(1, pageSize, sortField, sortOrder, 'all', '');
  };

  // Zoom Counts for badges
  const zoomCounts = useMemo(() => {
    const counts = { all: teachers.length, member: 0, pending: 0, not_invited: 0 };
    for (const t of teachers) {
      if (t.zoomStatus === 'member') counts.member++;
      else if (t.zoomStatus === 'pending') counts.pending++;
      else counts.not_invited++;
    }
    return counts;
  }, [teachers]);

  // Filter Teachers
  const filteredTeachers = useMemo(() => {
    return teachers.filter(teacher => {
      // Zoom Filter
      if (zoomFilter !== 'all') {
        const teacherZoom = teacher.zoomStatus || 'not_invited';
        if (teacherZoom !== zoomFilter) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const fullName = (teacher.fullName || `${teacher.lastName} ${teacher.firstName}`).toLowerCase();
        const mail = (teacher.email || '').toLowerCase();
        const smId = String(teacher.schoolmateTeacherId || '');
        const ph = (teacher.phone || '').toLowerCase();
        const tg = (teacher.telegramId || '').toLowerCase();

        if (
          !fullName.includes(q) &&
          !mail.includes(q) &&
          !smId.includes(q) &&
          !ph.includes(q) &&
          !tg.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [teachers, zoomFilter, searchQuery]);

  // Sort Teachers
  const sortedTeachers = useMemo(() => {
    const list = [...filteredTeachers];
    list.sort((a, b) => {
      let valA, valB;

      if (sortField === 'email') {
        valA = (a.email || '').toLowerCase();
        valB = (b.email || '').toLowerCase();
      } else if (sortField === 'schoolmateTeacherId') {
        valA = Number(a.schoolmateTeacherId) || 0;
        valB = Number(b.schoolmateTeacherId) || 0;
      } else if (sortField === 'zoomStatus') {
        const rank = { member: 1, pending: 2, not_invited: 3 };
        valA = rank[a.zoomStatus] || 3;
        valB = rank[b.zoomStatus] || 3;
      } else if (sortField === 'thisWeek') {
        const smIdA = Number(a.schoolmateTeacherId);
        const smIdB = Number(b.schoolmateTeacherId);
        valA = weeklyLessons[smIdA]?.totalLessons ?? -1;
        valB = weeklyLessons[smIdB]?.totalLessons ?? -1;
      } else {
        // Default: Teacher Name
        valA = (a.fullName || `${a.lastName} ${a.firstName}`).toLowerCase();
        valB = (b.fullName || `${b.lastName} ${b.firstName}`).toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredTeachers, sortField, sortOrder, weeklyLessons]);

  // Pagination Computations
  const totalItems = sortedTeachers.length;
  const isAll = pageSize === 'all';
  const effectivePageSize = isAll ? Math.max(totalItems, 1) : parseInt(pageSize, 10) || 10;
  const totalPages = isAll ? 1 : Math.ceil(totalItems / effectivePageSize) || 1;
  const safePage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedTeachers = useMemo(() => {
    if (isAll) return sortedTeachers;
    const startIndex = (safePage - 1) * effectivePageSize;
    return sortedTeachers.slice(startIndex, startIndex + effectivePageSize);
  }, [sortedTeachers, isAll, safePage, effectivePageSize]);

  // Compute current week date range (Monday - Sunday) in 'YYYY-MM-DD'
  const currentWeekRange = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const formatIso = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dt = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dt}`;
    };

    const formatShort = (d) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

    return {
      fromDate: formatIso(monday),
      toDate: formatIso(sunday),
      displayStr: `${formatShort(monday)} – ${formatShort(sunday)}`
    };
  }, []);

  // Fetch weekly lessons on demand
  useEffect(() => {
    if (!teachers.length) return;

    // When sorting by thisWeek, load all filtered teachers so sort order is fully accurate and stable.
    // Otherwise, fetch for visible paginated teachers.
    const targetTeachers = sortField === 'thisWeek' ? filteredTeachers : paginatedTeachers;
    if (!targetTeachers.length) return;

    const uncachedTeacherIds = [];
    for (const t of targetTeachers) {
      const smId = Number(t.schoolmateTeacherId);
      if (smId && (weeklyLessons[smId] === undefined || (weeklyLessons[smId]?.error && !weeklyLessons[smId]?.loading))) {
        uncachedTeacherIds.push(smId);
      }
    }

    if (!uncachedTeacherIds.length) return;

    // Set loading state for uncached
    setWeeklyLessons(prev => {
      const next = { ...prev };
      for (const id of uncachedTeacherIds) {
        next[id] = { loading: true, totalLessons: null };
      }
      return next;
    });

    fetch('/api/teachers/weekly-lessons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherIds: uncachedTeacherIds,
        fromDate: currentWeekRange.fromDate,
        toDate: currentWeekRange.toDate
      })
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (data?.results) {
          setWeeklyLessons(prev => {
            const next = { ...prev };
            for (const [idStr, resData] of Object.entries(data.results)) {
              const idNum = Number(idStr);
              const record = {
                loading: false,
                totalLessons: resData.totalLessons ?? 0,
                totalMinutes: resData.totalMinutes || 0,
                error: resData.error || null
              };
              next[idNum] = record;
              if (resData.totalLessons !== null && !resData.error) {
                globalWeeklyLessonsCache.set(idNum, record);
              }
            }
            return next;
          });
        }
      })
      .catch(err => {
        console.warn('Failed to fetch weekly lessons:', err.message);
        setWeeklyLessons(prev => {
          const next = { ...prev };
          for (const id of uncachedTeacherIds) {
            next[id] = { loading: false, totalLessons: null, error: 'failed' };
          }
          return next;
        });
      });
  }, [targetTeachers, weeklyLessons, currentWeekRange, sortField, filteredTeachers, paginatedTeachers, teachers.length]);

  // Handle Manual Form Submission
  const handleAddTeacher = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const fName = firstName.trim();
    const lName = lastName.trim();
    const mail = email.trim();
    const sId = parseInt(schoolmateId.trim(), 10);
    const tel = telegramId.trim();
    const ph = phone.trim();

    if (!fName) {
      setErrorMessage(t('directory.errFirstNameReq'));
      return;
    }
    if (!lName) {
      setErrorMessage(t('directory.errLastNameReq'));
      return;
    }
    if (!mail) {
      setErrorMessage(t('directory.errEmailReq'));
      return;
    }
    if (isNaN(sId) || sId <= 0) {
      setErrorMessage(t('directory.errIdReq'));
      return;
    }
    if (tel && !tel.startsWith('@')) {
      setErrorMessage(t('directory.errTelegramReq'));
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
          phone: ph,
          telegramId: tel,
          zoomHostEmail: zoomHostEmail.trim() || mail
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add teacher');
      }

      setTeachers(prev => {
        const filtered = prev.filter(t => t.id !== data.teacher.id);
        return [data.teacher, ...filtered];
      });

      setSuccessMessage(t('directory.teacherAddedSuccess', { name: data.teacher.fullName }));
      setFirstName('');
      setLastName('');
      setEmail('');
      setSchoolmateId('');
      setPhone('');
      setTelegramId('');
      setZoomHostEmail('');
      setIsAddFormOpen(false);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Sync from Schoolmate
  const handleSyncSchoolmateTeachers = async () => {
    try {
      setSyncing(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      // Prune client-side weekly lessons cache so table reloads fresh counts
      globalWeeklyLessonsCache.clear();
      setWeeklyLessons({});

      const res = await fetch('/api/schoolmate/sync-teachers', {
        method: 'POST'
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t('directory.syncFailed'));
      }

      if (Array.isArray(data.teachers)) {
        setTeachers(data.teachers);
      }

      const { totalFetched, created, updated } = data.stats || {};
      setSuccessMessage(
        t('directory.syncSuccess', {
          total: totalFetched || data.teachers?.length || 0,
          created: created ?? 0,
          updated: updated ?? 0
        })
      );
    } catch (err) {
      setErrorMessage(err.message || t('directory.syncFailed'));
    } finally {
      setSyncing(false);
    }
  };

  // Confirm Delete Teacher from Modal
  const confirmDeleteTeacher = async () => {
    if (!teacherToDelete) return;
    const teacher = teacherToDelete;

    setErrorMessage(null);
    setSuccessMessage(null);
    setDeletingId(teacher.id);

    const previousTeachers = [...teachers];
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
      setTeachers(previousTeachers);
      setErrorMessage(`Failed to delete teacher: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  // Date range display string for header
  const thisWeekDatesStr = currentWeekRange.displayStr;

  // Render Sortable Column Header
  const renderSortHeader = (field, label, align = 'left', sublabel = null) => {
    const isCurrent = sortField === field;
    return (
      <th
        style={{
          textAlign: align,
          cursor: 'pointer',
          userSelect: 'none',
          whiteSpace: 'nowrap'
        }}
        onClick={() => handleSort(field)}
        title={`Sort by ${label}`}
      >
        <div
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: align === 'right' ? 'flex-end' : 'flex-start',
            gap: 1
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              justifyContent: align === 'right' ? 'flex-end' : 'flex-start'
            }}
          >
            <span>{label}</span>
            <span
              style={{
                fontSize: 11,
                color: isCurrent ? 'var(--primary, #2563eb)' : 'var(--text-muted, #94a3b8)',
                fontWeight: isCurrent ? 700 : 400
              }}
            >
              {isCurrent ? (sortOrder === 'asc' ? '▲' : '▼') : '⇅'}
            </span>
          </div>
          {sublabel && (
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>
              {sublabel}
            </span>
          )}
        </div>
      </th>
    );
  };

  // Render Zoom Status Badge
  const renderZoomBadge = (status) => {
    if (status === 'member') {
      return (
        <span
          className="badge"
          style={{
            backgroundColor: '#dcfce7',
            color: '#15803d',
            border: '1px solid #86efac',
            fontWeight: 600,
            fontSize: 12,
            padding: '3px 9px',
            borderRadius: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5
          }}
        >
          <span style={{ fontSize: 9 }}>●</span>
          <span>{t('directory.zoomMember')}</span>
        </span>
      );
    }
    if (status === 'pending') {
      return (
        <span
          className="badge"
          style={{
            backgroundColor: '#fef3c7',
            color: '#b45309',
            border: '1px solid #fde68a',
            fontWeight: 600,
            fontSize: 12,
            padding: '3px 9px',
            borderRadius: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5
          }}
        >
          <span style={{ fontSize: 10 }}>⏳</span>
          <span>{t('directory.zoomPending')}</span>
        </span>
      );
    }
    return (
      <span
        className="badge"
        style={{
          backgroundColor: '#f1f5f9',
          color: '#64748b',
          border: '1px solid #e2e8f0',
          fontWeight: 500,
          fontSize: 12,
          padding: '3px 9px',
          borderRadius: 12,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5
        }}
      >
        <span style={{ fontSize: 9 }}>○</span>
        <span>{t('directory.zoomNotInvited')}</span>
      </span>
    );
  };

  const isFilterActive = zoomFilter !== 'all' || searchQuery.trim().length > 0;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">{t('directory.title')}</h1>
        <p className="page-subtitle">{t('directory.subtitle')}</p>
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

      {/* Action Bar: Add Teacher & Sync from Schoolmate Buttons */}
      <div style={{ marginBottom: 20, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setIsAddFormOpen(!isAddFormOpen)}
          style={{ padding: '9px 18px', fontSize: 14 }}
        >
          <span>{isAddFormOpen ? t('directory.closeFormBtn') : t('directory.addTeacherBtn')}</span>
        </button>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSyncSchoolmateTeachers}
          disabled={syncing}
          style={{ padding: '9px 18px', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          {syncing ? (
            <>
              <span className="spinner"></span>
              <span>{t('directory.syncingBtn')}</span>
            </>
          ) : (
            <span>{t('directory.syncFromSchoolmateBtn')}</span>
          )}
        </button>
      </div>

      {/* Expandable Paper-Like Add Teacher Block */}
      {isAddFormOpen && (
        <div className="paper-card">
          <div className="paper-header">
            <h2 className="paper-title">
              <span>📝</span>
              <span>{t('directory.formTitle')}</span>
            </h2>
            <button
              type="button"
              onClick={() => setIsAddFormOpen(false)}
              className="btn btn-sm btn-secondary"
              style={{ padding: '2px 8px' }}
              title={t('common.close')}
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleAddTeacher}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t('directory.firstName')} *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={t('directory.firstNamePlaceholder')}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('directory.lastName')} *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={t('directory.lastNamePlaceholder')}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('directory.email')} *</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder={t('directory.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('directory.schoolmateId')} *</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder={t('directory.schoolmateIdPlaceholder')}
                  value={schoolmateId}
                  onChange={(e) => setSchoolmateId(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  {t('directory.phone')} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(Optional)</span>
                </label>
                <input
                  type="tel"
                  className="form-input"
                  placeholder={t('directory.phonePlaceholder')}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  {t('directory.telegramId')} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(Optional, @)</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={t('directory.telegramIdPlaceholder')}
                  value={telegramId}
                  onChange={(e) => setTelegramId(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">
                  {t('directory.zoomEmail')}
                </label>
                <input
                  type="email"
                  className="form-input"
                  placeholder={t('directory.zoomEmailPlaceholder')}
                  value={zoomHostEmail}
                  onChange={(e) => setZoomHostEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: 12 }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span className="spinner"></span>
                    <span>{t('directory.creatingBtn')}</span>
                  </>
                ) : (
                  <span>{t('directory.createBtn')}</span>
                )}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsAddFormOpen(false)}
                disabled={submitting}
              >
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Teachers Directory Card */}
      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
          <h2 className="card-title">
            <span>👥</span>
            <span>{t('common.teachers')} ({totalItems}{totalItems !== teachers.length ? ` / ${teachers.length}` : ''})</span>
          </h2>
        </div>

        {/* Filter & Search Bar */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#f8fafc',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}
        >
          {/* Search Input Row */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 440 }}>
              <span
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  fontSize: 14,
                  pointerEvents: 'none'
                }}
              >
                🔍
              </span>
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: 36, paddingRight: searchQuery ? 30 : 12, width: '100%', height: 38 }}
                placeholder={t('directory.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: 4
                  }}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Clear All Filters Button */}
            {isFilterActive && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="btn btn-sm btn-secondary"
                style={{ height: 38, fontSize: 13 }}
              >
                ✕ {t('directory.clearFilters')}
              </button>
            )}
          </div>

          {/* Zoom State Filter Pills Row */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginRight: 4 }}>
              Zoom:
            </span>

            {/* All Zoom */}
            <button
              type="button"
              onClick={() => handleZoomFilterChange('all')}
              style={{
                padding: '5px 12px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                border: zoomFilter === 'all' ? '2px solid var(--primary, #2563eb)' : '1px solid var(--border-color)',
                backgroundColor: zoomFilter === 'all' ? 'var(--primary-light, #eff6ff)' : '#ffffff',
                color: zoomFilter === 'all' ? 'var(--primary, #2563eb)' : 'var(--text-secondary)',
                transition: 'all 0.15s ease'
              }}
            >
              {t('directory.zoomFilterAll')} ({zoomCounts.all})
            </button>

            {/* Member */}
            <button
              type="button"
              onClick={() => handleZoomFilterChange('member')}
              style={{
                padding: '5px 12px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                border: zoomFilter === 'member' ? '2px solid #16a34a' : '1px solid #bbf7d0',
                backgroundColor: zoomFilter === 'member' ? '#dcfce7' : '#ffffff',
                color: '#15803d',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all 0.15s ease'
              }}
            >
              <span>●</span>
              <span>{t('directory.zoomFilterMember')} ({zoomCounts.member})</span>
            </button>

            {/* Pending */}
            <button
              type="button"
              onClick={() => handleZoomFilterChange('pending')}
              style={{
                padding: '5px 12px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                border: zoomFilter === 'pending' ? '2px solid #d97706' : '1px solid #fde68a',
                backgroundColor: zoomFilter === 'pending' ? '#fef3c7' : '#ffffff',
                color: '#b45309',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all 0.15s ease'
              }}
            >
              <span>⏳</span>
              <span>{t('directory.zoomFilterPending')} ({zoomCounts.pending})</span>
            </button>

            {/* Not Invited */}
            <button
              type="button"
              onClick={() => handleZoomFilterChange('not_invited')}
              style={{
                padding: '5px 12px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                border: zoomFilter === 'not_invited' ? '2px solid #64748b' : '1px solid #e2e8f0',
                backgroundColor: zoomFilter === 'not_invited' ? '#f1f5f9' : '#ffffff',
                color: '#64748b',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all 0.15s ease'
              }}
            >
              <span>○</span>
              <span>{t('directory.zoomFilterNotInvited')} ({zoomCounts.not_invited})</span>
            </button>
          </div>
        </div>

        {/* Table Body */}
        <div className="card-body" style={{ padding: 0 }}>
          {loading && teachers.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="spinner spinner-dark" style={{ width: 24, height: 24, marginBottom: 10 }}></div>
              <div>{t('common.loading')}</div>
            </div>
          ) : teachers.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>👨‍🏫</div>
              <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)', marginBottom: 4 }}>
                {t('directory.noTeachersRegistered')}
              </div>
              <p style={{ margin: '0 0 16px', fontSize: 14 }}>
                {t('directory.noTeachersPrompt')}
              </p>
            </div>
          ) : filteredTeachers.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
              <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', marginBottom: 6 }}>
                {t('directory.noTeachersFound')}
              </div>
              <button
                type="button"
                onClick={handleClearFilters}
                className="btn btn-sm btn-secondary"
              >
                {t('directory.clearFilters')}
              </button>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    {renderSortHeader('name', t('directory.tableColTeacher'))}
                    {renderSortHeader('email', t('directory.email'))}
                    {renderSortHeader('schoolmateTeacherId', t('directory.tableColSchoolmateId'))}
                    {renderSortHeader('zoomStatus', t('directory.tableColZoom'))}
                    {renderSortHeader('thisWeek', t('directory.tableColThisWeek'), 'left', thisWeekDatesStr)}
                    <th style={{ textAlign: 'right' }}>{t('directory.tableColActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTeachers.map((teacher) => (
                    <tr
                      key={teacher.id}
                      className="table-row-clickable"
                      onClick={() => router.push(formatUrl(`/teachers/${teacher.id}`))}
                    >
                      <td>
                        <strong style={{ color: 'var(--text-primary)' }}>
                          {teacher.fullName || `${teacher.lastName} ${teacher.firstName}`.trim()}
                        </strong>
                      </td>
                      <td>
                        <span style={{ color: 'var(--text-secondary)' }}>{teacher.email}</span>
                        {teacher.zoomHostEmail && teacher.zoomHostEmail !== teacher.email && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            Zoom: {teacher.zoomHostEmail}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-primary">
                          #{teacher.schoolmateTeacherId}
                        </span>
                      </td>
                      <td>
                        {renderZoomBadge(teacher.zoomStatus)}
                      </td>
                      <td>
                        {(() => {
                          const smId = Number(teacher.schoolmateTeacherId);
                          const lessonInfo = weeklyLessons[smId];

                          if (!lessonInfo || lessonInfo.loading) {
                            return <span className="skeleton-pill" />;
                          }

                          if (lessonInfo.totalLessons === null) {
                            return <span style={{ color: 'var(--text-muted)', fontSize: 13 }} title="Timed out">—</span>;
                          }

                          if (lessonInfo.totalLessons === 0) {
                            return <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500 }}>0</span>;
                          }

                          return (
                            <span
                              className="badge badge-primary"
                              style={{
                                fontWeight: 600,
                                fontSize: 12,
                                padding: '3px 8px',
                                borderRadius: 12,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                            >
                              <span>📅</span>
                              <span>
                                {t('directory.lessonsShort', { count: lessonInfo.totalLessons })}
                              </span>
                            </span>
                          );
                        })()}
                      </td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                          <Link
                            href={formatUrl(`/teachers/${teacher.id}`)}
                            className="btn btn-sm btn-primary"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span>📅 {t('directory.viewScheduleBtn')}</span>
                          </Link>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setTeacherToDelete(teacher);
                            }}
                            disabled={deletingId === teacher.id}
                            className="btn btn-sm btn-danger"
                            title={t('common.delete')}
                          >
                            {deletingId === teacher.id ? (
                              <span className="spinner spinner-dark"></span>
                            ) : (
                              <span>🗑️ {t('common.delete')}</span>
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

        {/* Pagination & Summary Footer */}
        {teachers.length > 0 && (
          <div
            style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              backgroundColor: '#ffffff'
            }}
          >
            {/* Left: Per-page selector & item range */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(e.target.value)}
                  className="form-input"
                  style={{
                    width: 'auto',
                    padding: '5px 10px',
                    fontSize: 13,
                    height: 34,
                    cursor: 'pointer'
                  }}
                  aria-label="Items per page"
                >
                  <option value="10">10 / {t('directory.perPage')}</option>
                  <option value="20">20 / {t('directory.perPage')}</option>
                  <option value="50">50 / {t('directory.perPage')}</option>
                  <option value="100">100 / {t('directory.perPage')}</option>
                  <option value="all">{t('directory.allOption')}</option>
                </select>
              </div>

              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {isAll
                  ? t('directory.showingAll', { total: totalItems })
                  : t('directory.showingRange', {
                      start: totalItems === 0 ? 0 : (safePage - 1) * effectivePageSize + 1,
                      end: Math.min(safePage * effectivePageSize, totalItems),
                      total: totalItems
                    })}
              </span>
            </div>

            {/* Right: Page navigation buttons */}
            {!isAll && totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {/* First Page */}
                <button
                  type="button"
                  onClick={() => handlePageChange(1)}
                  disabled={safePage <= 1}
                  className="btn btn-sm btn-secondary"
                  style={{ minWidth: 32, padding: '4px 8px', fontSize: 12 }}
                  title="First Page"
                >
                  «
                </button>

                {/* Previous Page */}
                <button
                  type="button"
                  onClick={() => handlePageChange(safePage - 1)}
                  disabled={safePage <= 1}
                  className="btn btn-sm btn-secondary"
                  style={{ minWidth: 32, padding: '4px 10px', fontSize: 12 }}
                >
                  ‹ {t('directory.prevPage')}
                </button>

                {/* Page Number Pills */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => {
                    // Show first, last, and window around current page
                    if (totalPages <= 7) return true;
                    if (p === 1 || p === totalPages) return true;
                    return Math.abs(p - safePage) <= 1;
                  })
                  .reduce((acc, p, idx, arr) => {
                    if (idx > 0 && p - arr[idx - 1] > 1) {
                      acc.push(-p); // marker for ellipsis
                    }
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p) => {
                    if (p < 0) {
                      return (
                        <span
                          key={`ellipsis-${p}`}
                          style={{ padding: '0 4px', color: 'var(--text-muted)', fontSize: 13 }}
                        >
                          ...
                        </span>
                      );
                    }
                    const isActive = p === safePage;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handlePageChange(p)}
                        className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                        style={{
                          minWidth: 32,
                          padding: '4px 10px',
                          fontSize: 12,
                          fontWeight: isActive ? 700 : 500
                        }}
                      >
                        {p}
                      </button>
                    );
                  })}

                {/* Next Page */}
                <button
                  type="button"
                  onClick={() => handlePageChange(safePage + 1)}
                  disabled={safePage >= totalPages}
                  className="btn btn-sm btn-secondary"
                  style={{ minWidth: 32, padding: '4px 10px', fontSize: 12 }}
                >
                  {t('directory.nextPage')} ›
                </button>

                {/* Last Page */}
                <button
                  type="button"
                  onClick={() => handlePageChange(totalPages)}
                  disabled={safePage >= totalPages}
                  className="btn btn-sm btn-secondary"
                  style={{ minWidth: 32, padding: '4px 8px', fontSize: 12 }}
                  title="Last Page"
                >
                  »
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {teacherToDelete && (
        <div className="modal-backdrop" onClick={() => setTeacherToDelete(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-icon-danger">🗑️</div>
              <h3 className="modal-title">{t('directory.deleteModalTitle')}</h3>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0 }}>
                {t('directory.deleteModalBody', { name: teacherToDelete.fullName })}
              </p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setTeacherToDelete(null)}
                disabled={deletingId === teacherToDelete.id}
              >
                {t('common.cancel')}
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
                    <span>{t('directory.deletingBtn')}</span>
                  </>
                ) : (
                  <span>{t('common.delete')}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeacherDirectoryPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div className="spinner spinner-dark" style={{ width: 32, height: 32, marginBottom: 12 }}></div>
        <div>Loading directory...</div>
      </div>
    }>
      <TeachersDirectoryContent />
    </Suspense>
  );
}
