import React from "react";
import styles from "./ProgressBar.module.css";

/**
 * Props:
 *   pct    – number 0-100
 *   status – string
 *   state  – 'running' | 'complete' | 'error'
 */
export default function ProgressBar({ pct, status, state = "running" }) {
  const fillClass =
    state === "complete" ? styles.fillComplete :
    state === "error"    ? styles.fillError    :
    styles.fill;

  return (
    <div className={styles.wrapper}>
      <div className={styles.labelRow}>
        <span>{status}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Download progress"
      >
        <div className={fillClass} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
