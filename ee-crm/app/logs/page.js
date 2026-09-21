'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function SystemLogsPage() {
  const { t } = useLanguage();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Filters
  const [selectedLevel, setSelectedLevel] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Expandable details state: Set of log IDs that are expanded
  const [expandedLogIds, setExpandedLogIds] = useState(new Set());
  const [copiedId, setCopiedId] = useState(null);

  // Fetch logs from API
  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await fetch('/api/logs?limit=150');
      if (!res.ok) {
        throw new Error(`Failed to load system logs (${res.status})`);
      }
      const data = await res.json();
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (err) {
      setErrorMessage(err.message || 'Error connecting to log store');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Counts for pills
  const counts = useMemo(() => {
    const res = { ALL: logs.length, INFO: 0, WARN: 0, ERROR: 0 };
    logs.forEach(l => {
      const lvl = (l.level || 'INFO').toUpperCase();
      if (res[lvl] !== undefined) {
        res[lvl] += 1;
      }
    });
    return res;
  }, [logs]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Level filter
      const lvl = (log.level || 'INFO').toUpperCase();
      if (selectedLevel !== 'ALL' && lvl !== selectedLevel) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const actionMatch = log.action?.toLowerCase().includes(q);
        const msgMatch = log.message?.toLowerCase().includes(q);
        const detailsMatch = log.details && JSON.stringify(log.details).toLowerCase().includes(q);
        return actionMatch || msgMatch || detailsMatch;
      }

      return true;
    });
  }, [logs, selectedLevel, searchQuery]);

  // Toggle log details drawer
  const toggleDetails = (id) => {
    setExpandedLogIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Copy JSON details to clipboard
  const handleCopyDetails = async (id, details) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(details, null, 2));
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
    }
  };

  const getLevelBadgeClass = (level) => {
    switch (level?.toUpperCase()) {
      case 'ERROR':
        return 'badge-danger';
      case 'WARN':
        return 'badge-warning';
      case 'INFO':
      default:
        return 'badge-success';
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">{t('logs.title')}</h1>
        <p className="page-subtitle">{t('logs.subtitle')}</p>
      </div>

      {/* Error alert */}
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

      {/* Control Card: Filters and Actions */}
      <div className="card">
        <div className="card-body" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            {/* Level Filter Pills */}
            <div className="filter-pills">
              {[
                { id: 'ALL', label: t('logs.filterAll') },
                { id: 'INFO', label: t('logs.filterInfo') },
                { id: 'WARN', label: t('logs.filterWarn') },
                { id: 'ERROR', label: t('logs.filterError') }
              ].map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={`filter-pill ${selectedLevel === item.id ? 'active' : ''}`}
                  onClick={() => setSelectedLevel(item.id)}
                >
                  <span>{item.label}</span>
                  <span style={{ opacity: 0.7, fontSize: 11, marginLeft: 4 }}>
                    ({counts[item.id] || 0})
                  </span>
                </button>
              ))}
            </div>

            {/* Search & Refresh Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <input
                type="text"
                className="form-input"
                placeholder={t('logs.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: 240, padding: '7px 12px' }}
              />

              <button
                type="button"
                onClick={fetchLogs}
                disabled={loading}
                className="btn btn-secondary"
                style={{ padding: '7px 14px' }}
              >
                {loading ? (
                  <>
                    <span className="spinner spinner-dark"></span>
                    <span>{t('common.loading')}</span>
                  </>
                ) : (
                  <>
                    <span>🔄</span>
                    <span>{t('logs.refreshBtn')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Logs Table Card */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <span>📋</span>
            <span>{t('logs.title')}</span>
          </h2>
          <span className="badge badge-neutral">
            Showing {filteredLogs.length} of {logs.length} entries
          </span>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          {loading && logs.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="spinner spinner-dark" style={{ width: 24, height: 24, marginBottom: 10 }}></div>
              <div>{t('common.loading')}</div>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                {t('logs.noLogsMatch')}
              </div>
              <p style={{ margin: 0, fontSize: 13 }}>
                {logs.length === 0
                  ? t('logs.noLogsFound')
                  : t('logs.noLogsMatch')}
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('logs.colTimestamp')}</th>
                    <th>{t('logs.colLevel')}</th>
                    <th>{t('logs.colAction')}</th>
                    <th>{t('logs.colDuration')}</th>
                    <th>{t('logs.colMessage')}</th>
                    <th style={{ textAlign: 'right' }}>{t('logs.colDetails')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map(log => {
                    const isExpanded = expandedLogIds.has(log.id);
                    const hasDetails = log.details && (typeof log.details === 'object' ? Object.keys(log.details).length > 0 : Boolean(log.details));

                    return (
                      <tr key={log.id} style={{ borderBottom: isExpanded ? 'none' : undefined }}>
                        <td style={{ color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
                          {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                        </td>
                        <td>
                          <span className={`badge ${getLevelBadgeClass(log.level)}`}>
                            {log.level || 'INFO'}
                          </span>
                        </td>
                        <td>
                          <code style={{ fontSize: 12, backgroundColor: 'var(--bg-subtle)', padding: '2px 6px', borderRadius: 4, color: 'var(--text-primary)' }}>
                            {log.action || 'GENERAL'}
                          </code>
                        </td>
                        <td>
                          {log.durationMs !== null && log.durationMs !== undefined ? (
                            <span
                              className="badge"
                              style={{
                                backgroundColor: log.durationMs > 1000 ? '#fef3c7' : '#f1f5f9',
                                color: log.durationMs > 1000 ? '#b45309' : '#475569',
                                border: '1px solid ' + (log.durationMs > 1000 ? '#fde68a' : '#e2e8f0'),
                                fontFamily: 'var(--font-mono)',
                                fontSize: 11
                              }}
                            >
                              {log.durationMs}ms
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                        <td style={{ maxWidth: 400, wordBreak: 'break-word', color: 'var(--text-primary)' }}>
                          {log.message}
                          {isExpanded && hasDetails && (
                            <div className="code-drawer">
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                                <span style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase' }}>
                                  Payload & Trace Details
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyDetails(log.id, log.details)}
                                  className="btn btn-sm btn-secondary"
                                  style={{ padding: '2px 8px', fontSize: 11 }}
                                >
                                  {copiedId === log.id ? '✓ ' + t('common.copied') : '📋 ' + t('common.copy') + ' JSON'}
                                </button>
                              </div>
                              <pre style={{ margin: 0 }}>
                                <code>{JSON.stringify(log.details, null, 2)}</code>
                              </pre>
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {hasDetails ? (
                            <button
                              type="button"
                              onClick={() => toggleDetails(log.id)}
                              className="btn btn-sm btn-secondary"
                            >
                              <span>{isExpanded ? 'Hide' : t('logs.colDetails')}</span>
                              <span>{isExpanded ? '▲' : '▼'}</span>
                            </button>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
