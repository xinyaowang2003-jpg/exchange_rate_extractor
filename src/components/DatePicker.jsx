import React, { useMemo, useEffect } from "react";
import ScrollPicker from "./ScrollPicker";
import styles from "./DatePicker.module.css";
import { MIN_YEAR } from "../constants";

const MONTH_NAMES = ["JAN","FEB","MAR","APR","MAY","JUN",
                     "JUL","AUG","SEP","OCT","NOV","DEC"];

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();  // month 1-indexed
}

function range(start, end) {
  const out = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

function pad(n) { return String(n).padStart(2, "0"); }
function fmtDate(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * Props:
 *   label    – string
 *   value    – { date: "YYYY-MM-DD", time: "HH:MM" }
 *   onChange – (newValue) => void
 *   maxDate  – string "YYYY-MM-DD"  (upper bound)
 *   maxTime  – string "HH:MM"       (upper bound when date === maxDate)
 *   minDate  – string "YYYY-MM-DD"  (lower bound, optional)
 *   minTime  – string "HH:MM"       (lower bound when date === minDate, optional)
 */
export default function DatePicker({ label, value, onChange, maxDate, maxTime, minDate, minTime }) {
  const { date, time } = value;
  const year  = parseInt(date.slice(0, 4), 10);
  const month = parseInt(date.slice(5, 7), 10);
  const day   = parseInt(date.slice(8, 10), 10);
  const hour  = parseInt(time.slice(0, 2), 10);
  const min   = parseInt(time.slice(3, 5), 10);

  // ── Upper bounds ─────────────────────────────────────────────────────────
  const maxY   = maxDate ? parseInt(maxDate.slice(0, 4), 10) : new Date().getFullYear();
  const maxM   = maxDate ? parseInt(maxDate.slice(5, 7), 10) : 12;
  const maxD   = maxDate ? parseInt(maxDate.slice(8, 10), 10) : 31;
  const maxH   = maxTime ? parseInt(maxTime.slice(0, 2), 10) : 23;
  const maxMin = maxTime ? parseInt(maxTime.slice(3, 5), 10) : 59;

  // ── Lower bounds ─────────────────────────────────────────────────────────
  const floorYear = minDate ? parseInt(minDate.slice(0, 4), 10) : MIN_YEAR;
  const floorM    = minDate ? parseInt(minDate.slice(5, 7), 10) : 1;
  const floorD    = minDate ? parseInt(minDate.slice(8, 10), 10) : 1;
  const floorH    = minTime ? parseInt(minTime.slice(0, 2), 10) : 0;
  const floorMin  = minTime ? parseInt(minTime.slice(3, 5), 10) : 0;

  // ── Constrained value arrays ─────────────────────────────────────────────
  const years = useMemo(() => range(floorYear, maxY), [floorYear, maxY]);

  const months = useMemo(() => {
    const lo = year === floorYear ? floorM : 1;
    const hi = year === maxY      ? maxM   : 12;
    return range(lo, hi);
  }, [year, floorYear, floorM, maxY, maxM]);

  const days = useMemo(() => {
    const maxDayOfMonth = daysInMonth(year, month);
    const lo = (year === floorYear && month === floorM) ? floorD : 1;
    const hi = (year === maxY      && month === maxM)   ? Math.min(maxD, maxDayOfMonth) : maxDayOfMonth;
    return range(lo, Math.max(lo, hi));
  }, [year, month, floorYear, floorM, floorD, maxY, maxM, maxD]);

  const hours = useMemo(() => {
    const lo = date === minDate ? floorH : 0;
    const hi = date === maxDate ? maxH   : 23;
    return range(lo, hi);
  }, [date, minDate, maxDate, floorH, maxH]);

  const minutes = useMemo(() => {
    const lo = (date === minDate && hour === floorH) ? floorMin : 0;
    const hi = (date === maxDate && hour === maxH)   ? maxMin   : 59;
    return range(lo, hi);
  }, [date, minDate, maxDate, hour, floorH, floorMin, maxH, maxMin]);

  // ── Auto-clamp: if current value falls outside new valid range, snap ──────
  useEffect(() => {
    if (years.length === 0) return;
    const validYear  = clamp(year,  years[0],   years[years.length - 1]);
    const validMonth = months.length ? clamp(month, months[0], months[months.length - 1]) : month;
    const validDay   = days.length   ? clamp(day,   days[0],   days[days.length - 1])     : day;
    const validHour  = hours.length  ? clamp(hour,  hours[0],  hours[hours.length - 1])   : hour;
    const validMin   = minutes.length? clamp(min,   minutes[0],minutes[minutes.length-1]) : min;

    const newDate = fmtDate(validYear, validMonth, validDay);
    const newTime = `${pad(validHour)}:${pad(validMin)}`;
    if (newDate !== date || newTime !== time) {
      onChange({ date: newDate, time: newTime });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDate, minTime, maxDate, maxTime]);

  // ── Handlers: clamp downstream values when a parent wheel changes ─────────

  const handleYear = (y) => {
    let m = month, d = day;
    if (y === maxY      && m > maxM)   m = maxM;
    if (y === floorYear && m < floorM) m = floorM;
    const maxDayForM = (y === maxY && m === maxM) ? Math.min(maxD, daysInMonth(y, m)) : daysInMonth(y, m);
    const minDayForM = (y === floorYear && m === floorM) ? floorD : 1;
    d = clamp(d, minDayForM, maxDayForM);
    onChange({ date: fmtDate(y, m, d), time });
  };

  const handleMonth = (m) => {
    let d = day;
    const maxDayForM = (year === maxY && m === maxM) ? Math.min(maxD, daysInMonth(year, m)) : daysInMonth(year, m);
    const minDayForM = (year === floorYear && m === floorM) ? floorD : 1;
    d = clamp(d, minDayForM, maxDayForM);
    onChange({ date: fmtDate(year, m, d), time });
  };

  const handleDay  = (d)  => onChange({ date: fmtDate(year, month, d), time });

  const handleHour = (h) => {
    let m2 = min;
    if (date === maxDate && h === maxH  && m2 > maxMin)  m2 = maxMin;
    if (date === minDate && h === floorH && m2 < floorMin) m2 = floorMin;
    onChange({ date, time: `${pad(h)}:${pad(m2)}` });
  };

  const handleMin = (m2) => onChange({ date, time: `${pad(hour)}:${pad(m2)}` });

  return (
    <fieldset className={styles.group}>
      <legend className={styles.groupLabel}>{label}</legend>
      <div className={styles.wheelRow}>
        <ScrollPicker values={years}   value={year}  onChange={handleYear}  label="YEAR" />
        <ScrollPicker
          values={months}
          value={month}
          onChange={handleMonth}
          label="MON"
          renderValue={(v) => MONTH_NAMES[v - 1]}
        />
        <ScrollPicker values={days}    value={day}   onChange={handleDay}   label="DAY"  />
        <div className={styles.sep} aria-hidden="true" />
        <ScrollPicker values={hours}   value={hour}  onChange={handleHour}  label="HH"   renderValue={pad} />
        <ScrollPicker values={minutes} value={min}   onChange={handleMin}   label="MM"   renderValue={pad} />
      </div>
    </fieldset>
  );
}
