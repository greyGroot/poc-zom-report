'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom React hook for managing Zoom meetings state, deduplication,
 * request abortion, same-period refresh retention, and error handling.
 */
export function useZoomMeetings({ teacherId, fromDate, toDate }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'empty' | 'unmapped' | 'error' | 'refreshing'
  const [meetings, setMeetings] = useState([]);
  const [totalMeetings, setTotalMeetings] = useState(0);
  const [error, setError] = useState(null);
  const [refreshError, setRefreshError] = useState(null);
  const [responsePeriod, setResponsePeriod] = useState(null);

  const abortControllerRef = useRef(null);
  const currentRequestedPeriodRef = useRef({ from: null, to: null });

  const fetchMeetings = useCallback(
    async (from, to, isManualRefresh = false) => {
      if (!teacherId || !from || !to) return;

      // Abort in-flight request if any
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      currentRequestedPeriodRef.current = { from, to };

      if (isManualRefresh) {
        setStatus('refreshing');
        setRefreshError(null);
      } else {
        setStatus('loading');
        setError(null);
        setRefreshError(null);
      }

      try {
        const query = new URLSearchParams({ from, to });
        const res = await fetch(`/api/teachers/${teacherId}/zoom-meetings?${query.toString()}`, {
          signal: controller.signal
        });

        // Ignore response if requested period has since changed
        if (
          currentRequestedPeriodRef.current.from !== from ||
          currentRequestedPeriodRef.current.to !== to
        ) {
          return;
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to load Zoom meetings (${res.status})`);
        }

        const data = await res.json();

        // Stale check
        if (
          currentRequestedPeriodRef.current.from !== from ||
          currentRequestedPeriodRef.current.to !== to
        ) {
          return;
        }

        setResponsePeriod({ from, to });
        setTotalMeetings(data.totalMeetings || 0);
        setMeetings(data.meetings || []);

        if (data.unmapped) {
          setStatus('unmapped');
        } else if (!data.meetings || data.meetings.length === 0) {
          setStatus('empty');
        } else {
          setStatus('success');
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          return; // Ignore intentional aborts
        }

        // Stale check
        if (
          currentRequestedPeriodRef.current.from !== from ||
          currentRequestedPeriodRef.current.to !== to
        ) {
          return;
        }

        if (isManualRefresh) {
          // Keep previous cards, show refresh error alert
          setRefreshError(err.message);
          setStatus('success'); // Remain in success state with previous results
        } else {
          setError(err.message);
          setStatus('error');
          setMeetings([]);
          setTotalMeetings(0);
        }
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [teacherId]
  );

  // Auto-fetch on teacherId or date changes
  useEffect(() => {
    if (teacherId && fromDate && toDate) {
      fetchMeetings(fromDate, toDate, false);
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [teacherId, fromDate, toDate, fetchMeetings]);

  const refresh = useCallback(() => {
    if (fromDate && toDate) {
      fetchMeetings(fromDate, toDate, true);
    }
  }, [fromDate, toDate, fetchMeetings]);

  const retry = useCallback(() => {
    if (fromDate && toDate) {
      fetchMeetings(fromDate, toDate, false);
    }
  }, [fromDate, toDate, fetchMeetings]);

  return {
    status,
    meetings,
    totalMeetings,
    error,
    refreshError,
    responsePeriod,
    refresh,
    retry
  };
}
