import React from "react";
import styles from "./DatePicker.module.css";

/**
 * Props:
 *   label    – string
 *   value    – { date: "YYYY-MM-DD", time: "HH:MM" }
 *   onChange – (newValue) => void
 *   maxDate  – string "YYYY-MM-DD" (optional, caps the date input)
 *   maxTime  – string "HH:MM" (optional, caps time when date === maxDate)
 */
export default function DatePicker({ label, value, onChange, maxDate, maxTime }) {
  const dateId = `dp-date-${label}`;
  const timeId = `dp-time-${label}`;

  // Cap time input only when the selected date is today
  const timeMax = maxTime && maxDate && value.date === maxDate ? maxTime : undefined;

  const handleDateChange = (e) => {
    const newDate = e.target.value;
    let newTime = value.time;
    // If user picks today and current time is now past maxTime, clamp it
    if (maxDate && newDate === maxDate && maxTime && newTime > maxTime) {
      newTime = maxTime;
    }
    onChange({ date: newDate, time: newTime });
  };

  return (
    <fieldset className={styles.group}>
      <legend className={styles.groupLabel}>{label}</legend>
      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={dateId}>Date</label>
          <input
            id={dateId}
            type="date"
            className={styles.input}
            value={value.date}
            min="2021-01-01"
            max={maxDate}
            onChange={handleDateChange}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={timeId}>Time (UTC)</label>
          <input
            id={timeId}
            type="time"
            className={styles.input}
            value={value.time}
            max={timeMax}
            onChange={(e) => onChange({ ...value, time: e.target.value })}
          />
        </div>
      </div>
    </fieldset>
  );
}
