import React, { useRef, useEffect, useCallback } from "react";
import styles from "./ScrollPicker.module.css";

/**
 * A vertical scroll-snap picker for a list of integer values.
 *
 * Props:
 *   values   – number[]   ordered array of integers to display
 *   value    – number     currently selected value
 *   onChange – (v: number) => void
 *   label    – string     field label shown above
 */
export default function ScrollPicker({ values, value, onChange, label }) {
  const containerRef = useRef(null);
  const ITEM_H = 40;

  // Scroll to the selected item whenever `value` changes externally
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const idx = values.indexOf(value);
    if (idx < 0) return;
    el.scrollTo({ top: idx * ITEM_H, behavior: "smooth" });
  }, [value, values]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    clearTimeout(el._snapTimer);
    el._snapTimer = setTimeout(() => {
      const idx = Math.round(el.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(idx, values.length - 1));
      el.scrollTo({ top: clamped * ITEM_H, behavior: "smooth" });
      onChange(values[clamped]);
    }, 80);
  }, [values, onChange]);

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>{label}</span>
      <div
        className={styles.picker}
        ref={containerRef}
        onScroll={handleScroll}
      >
        {/* top padding so first item can center */}
        <div className={styles.pad} />
        {values.map((v) => (
          <div
            key={v}
            className={`${styles.item} ${v === value ? styles.selected : ""}`}
            onClick={() => onChange(v)}
          >
            {v}
          </div>
        ))}
        {/* bottom padding */}
        <div className={styles.pad} />
      </div>
    </div>
  );
}
