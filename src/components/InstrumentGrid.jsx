import React, { useCallback } from "react";
import { INSTRUMENTS } from "../constants";
import styles from "./InstrumentGrid.module.css";

/**
 * Props:
 *   selected  – Set<string>
 *   onChange  – (newSet: Set<string>) => void
 */
export default function InstrumentGrid({ selected, onChange }) {
  const toggle = useCallback((inst) => {
    const next = new Set(selected);
    next.has(inst) ? next.delete(inst) : next.add(inst);
    onChange(next);
  }, [selected, onChange]);

  const selectAll   = useCallback(() => onChange(new Set(INSTRUMENTS)), [onChange]);
  const deselectAll = useCallback(() => onChange(new Set()), [onChange]);

  return (
    <div>
      <div className={styles.toolbar}>
        <button className={styles.smallBtn} onClick={selectAll}>Select All</button>
        <button className={styles.smallBtn} onClick={deselectAll}>Deselect All</button>
      </div>
      <div className={styles.grid}>
        {INSTRUMENTS.map((inst) => {
          const checked = selected.has(inst);
          return (
            <label
              key={inst}
              className={`${styles.chip} ${checked ? styles.checked : ""}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(inst)}
              />
              {inst}
            </label>
          );
        })}
      </div>
    </div>
  );
}
