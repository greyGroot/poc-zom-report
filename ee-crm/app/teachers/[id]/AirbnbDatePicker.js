'use client';

import { useState, useMemo, useEffect, useRef } from 'react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAY_NAMES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function formatIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIso(str) {
  if (!str) return null;
  const parts = str.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export default function AirbnbDatePicker({
  fromDate,
  toDate,
  onChange,
  onPresetSelect,
  activePreset
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Parse initial view month from fromDate, or today
  const initialDate = useMemo(() => parseIso(fromDate) || new Date(), [fromDate]);
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  // Interactive selection state
  // null = idle, 'selecting_end' = start picked, picking end date
  const [selectionState, setSelectionState] = useState(null);
  const [tempStart, setTempStart] = useState(null);
  const [hoverDate, setHoverDate] = useState(null);

  // Sync calendar view month when fromDate changes externally
  useEffect(() => {
    const parsed = parseIso(fromDate);
    if (parsed) {
      setViewYear(parsed.getFullYear());
      setViewMonth(parsed.getMonth());
    }
  }, [fromDate]);

  // Close calendar popover on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSelectionState(null);
        setHoverDate(null);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Navigate months
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  // Grid computation for single month
  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    // Monday start: 1 -> 0, 2 -> 1 ... 0 (Sun) -> 6
    const offset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    const cells = [];
    for (let i = 0; i < offset; i++) {
      cells.push({ type: 'empty', id: `empty-${i}` });
    }

    const todayStr = formatIso(new Date());

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({
        type: 'day',
        dayNumber: day,
        dateStr,
        isToday: dateStr === todayStr
      });
    }

    return cells;
  }, [viewYear, viewMonth]);

  // Handle Day Click
  const handleDayClick = (dateStr) => {
    if (!selectionState) {
      // Step 1: Clicked start date
      setTempStart(dateStr);
      setSelectionState('selecting_end');
      onChange({ fromDate: dateStr, toDate: dateStr });
    } else {
      // Step 2: Clicked end date
      let newFrom = tempStart;
      let newTo = dateStr;

      // Auto-validate: To date cannot be less than From date
      if (dateStr < tempStart) {
        newFrom = dateStr;
        newTo = tempStart;
      }

      onChange({ fromDate: newFrom, toDate: newTo });
      setSelectionState(null);
      setTempStart(null);
      setHoverDate(null);
    }
  };

  // Fast Presets Handlers
  const handlePresetYesterday = () => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const dateStr = formatIso(y);
    onChange({ fromDate: dateStr, toDate: dateStr });
    if (onPresetSelect) onPresetSelect('yesterday');
    setViewYear(y.getFullYear());
    setViewMonth(y.getMonth());
  };

  const handlePresetThisWeek = () => {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;

    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const from = formatIso(monday);
    const to = formatIso(sunday);
    onChange({ fromDate: from, toDate: to });
    if (onPresetSelect) onPresetSelect('thisWeek');
    setViewYear(monday.getFullYear());
    setViewMonth(monday.getMonth());
  };

  const handlePresetThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const from = formatIso(firstDay);
    const to = formatIso(lastDay);
    onChange({ fromDate: from, toDate: to });
    if (onPresetSelect) onPresetSelect('thisMonth');
    setViewYear(firstDay.getFullYear());
    setViewMonth(firstDay.getMonth());
  };

  const handlePresetTestWeek = () => {
    onChange({ fromDate: '2026-09-14', toDate: '2026-09-20' });
    if (onPresetSelect) onPresetSelect('test');
    setViewYear(2026);
    setViewMonth(8); // September is 8 (0-indexed)
  };

  // Determine effective range for styling
  const effectiveStart = selectionState === 'selecting_end' ? tempStart : fromDate;
  const effectiveEnd = selectionState === 'selecting_end' && hoverDate ? hoverDate : toDate;

  const minSelected = effectiveStart && effectiveEnd ? (effectiveStart <= effectiveEnd ? effectiveStart : effectiveEnd) : effectiveStart;
  const maxSelected = effectiveStart && effectiveEnd ? (effectiveStart <= effectiveEnd ? effectiveEnd : effectiveStart) : effectiveStart;

  return (
    <div className="airbnb-picker-container" ref={containerRef}>
      {/* Top Controls Row: Airbnb Date Input Pill + Presets */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {/* Airbnb Dual-Date Trigger Pill */}
        <div
          className={`airbnb-input-bar ${isOpen ? 'is-open' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
          title="Click to open Airbnb-style Date Range Picker"
        >
          <div className={`airbnb-input-pill ${isOpen && !selectionState ? 'active' : ''}`}>
            <span className="airbnb-pill-label">From Date</span>
            <span className="airbnb-pill-val">{fromDate || 'Select date'}</span>
          </div>

          <div className="airbnb-pill-divider" />

          <div className={`airbnb-input-pill ${isOpen && selectionState ? 'active' : ''}`}>
            <span className="airbnb-pill-label">To Date</span>
            <span className="airbnb-pill-val">{toDate || 'Select date'}</span>
          </div>

          <div style={{ padding: '0 10px', color: 'var(--text-muted)', fontSize: 14 }}>
            📅
          </div>
        </div>

        {/* Quick Fast Selections requested by user */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className={`btn-preset ${activePreset === 'yesterday' ? 'active' : ''}`}
            onClick={handlePresetYesterday}
          >
            Yesterday
          </button>
          <button
            type="button"
            className={`btn-preset ${activePreset === 'thisWeek' ? 'active' : ''}`}
            onClick={handlePresetThisWeek}
          >
            This Week
          </button>
          <button
            type="button"
            className={`btn-preset ${activePreset === 'thisMonth' ? 'active' : ''}`}
            onClick={handlePresetThisMonth}
          >
            This Month
          </button>
          <button
            type="button"
            className={`btn-preset ${activePreset === 'test' ? 'active' : ''}`}
            onClick={handlePresetTestWeek}
            title="September 14 - 20, 2026 Test Week"
          >
            Sep 14-20 (Test)
          </button>
        </div>
      </div>

      {/* Single Month Airbnb Calendar Popover */}
      {isOpen && (
        <div className="airbnb-calendar-dropdown">
          {/* Header with Nav Arrows and Month Name */}
          <div className="airbnb-calendar-header">
            <button
              type="button"
              className="airbnb-nav-arrow"
              onClick={handlePrevMonth}
              aria-label="Previous month"
            >
              ‹
            </button>
            <h3 className="airbnb-month-heading">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </h3>
            <button
              type="button"
              className="airbnb-nav-arrow"
              onClick={handleNextMonth}
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          {/* Weekday Row */}
          <div className="airbnb-weekdays">
            {WEEKDAY_NAMES.map(w => (
              <div key={w} className="airbnb-weekday-cell">
                {w}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="airbnb-days-grid">
            {calendarDays.map((cell) => {
              if (cell.type === 'empty') {
                return <div key={cell.id} className="airbnb-day-slot" />;
              }

              const { dateStr, dayNumber, isToday } = cell;

              const isStart = dateStr === minSelected;
              const isEnd = dateStr === maxSelected;
              const isEndpoint = isStart || isEnd;
              const isInRange = minSelected && maxSelected && dateStr > minSelected && dateStr < maxSelected;
              const hasConnectingRight = isStart && maxSelected && maxSelected > minSelected;
              const hasConnectingLeft = isEnd && minSelected && maxSelected > minSelected;

              return (
                <div key={dateStr} className="airbnb-day-slot">
                  {/* Connected range backgrounds */}
                  {isInRange && <div className="airbnb-range-bg range-bg-middle" />}
                  {hasConnectingRight && <div className="airbnb-range-bg range-bg-start" />}
                  {hasConnectingLeft && <div className="airbnb-range-bg range-bg-end" />}

                  <button
                    type="button"
                    className={`airbnb-day-button ${isEndpoint ? 'is-endpoint' : ''} ${isInRange ? 'in-selected-range' : ''} ${isToday ? 'is-today' : ''}`}
                    onClick={() => handleDayClick(dateStr)}
                    onMouseEnter={() => {
                      if (selectionState === 'selecting_end') {
                        setHoverDate(dateStr);
                      }
                    }}
                  >
                    {dayNumber}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
