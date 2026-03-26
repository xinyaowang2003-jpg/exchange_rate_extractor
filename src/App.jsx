import React, { useState, useCallback, useRef, useMemo } from "react";
import DatePicker from "./components/DatePicker";
import InstrumentGrid from "./components/InstrumentGrid";
import ProgressBar from "./components/ProgressBar";
import { INSTRUMENTS } from "./constants";
import { resolveDate, weekdays } from "./utils/date";
import { fetchDay, parseBi5, rowToCSV } from "./utils/dukascopy";
import { lzmaDecompress } from "./utils/lzma";
import styles from "./App.module.css";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Computed once at module load — represents the moment the page was opened
const PAGE_LOAD_DATE = todayStr();
const PAGE_LOAD_TIME = nowTimeStr();

function defaultStart() { return { date: "2021-01-01", time: "00:00" }; }
function defaultEnd()   { return { date: PAGE_LOAD_DATE, time: PAGE_LOAD_TIME }; }

function countWeekdays(start, end) {
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endD = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  let count = 0;
  while (cur <= endD) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Advance a date+time by exactly 1 minute, rolling over into the next day if needed. */
function addOneMinute(date, time) {
  const h = parseInt(time.slice(0, 2), 10);
  const m = parseInt(time.slice(3, 5), 10);
  const totalMin = h * 60 + m + 1;
  if (totalMin >= 24 * 60) {
    // Roll over to next calendar day
    const d = new Date(date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    return { date: d.toISOString().slice(0, 10), time: "00:00" };
  }
  const newH = Math.floor(totalMin / 60);
  const newM = totalMin % 60;
  return {
    date,
    time: `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`,
  };
}

export default function App() {
  const [startVal, setStartVal] = useState(defaultStart);
  const [endVal,   setEndVal]   = useState(defaultEnd);

  // The earliest valid End value is always start + 1 minute
  const endMin = useMemo(() => addOneMinute(startVal.date, startVal.time), [startVal]);
  const [selected, setSelected] = useState(new Set());

  const [running,   setRunning]   = useState(false);
  const [pct,       setPct]       = useState(0);
  const [status,    setStatus]    = useState("");
  const [progState, setProgState] = useState("running");
  const [showProg,  setShowProg]  = useState(false);
  const [validationError, setValidationError] = useState("");

  const cancelRef = useRef(false);

  const estimate = useMemo(() => {
    try {
      const s = resolveDate(startVal);
      const e = resolveDate(endVal);
      if (s >= e || selected.size === 0) return null;
      const days = countWeekdays(s, e);
      return { pairs: selected.size, days, requests: selected.size * days };
    } catch {
      return null;
    }
  }, [startVal, endVal, selected]);

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const handleDownload = useCallback(async () => {
    setValidationError("");

    if (selected.size === 0) {
      setValidationError("Select at least one currency pair.");
      return;
    }

    const now        = new Date();
    const startDate  = resolveDate(startVal);
    const rawEndDate = resolveDate(endVal);
    const endDate    = rawEndDate > now ? now : rawEndDate;

    if (startDate >= endDate) {
      setValidationError("End date must be at least 1 minute after start date.");
      return;
    }

    const instruments = INSTRUMENTS.filter((i) => selected.has(i));
    const days  = [...weekdays(startDate, endDate)];
    const total = instruments.length * days.length;

    cancelRef.current = false;
    setRunning(true);
    setShowProg(true);
    setPct(0);
    setProgState("running");
    setStatus("Starting…");

    let done      = 0;
    let totalRows = 0;
    let failCount = 0;

    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();

    for (const instrument of instruments) {
      if (cancelRef.current) break;
      const lines = ["timestamp,open,high,low,close,volume"];
      let instrumentRows = 0;

      for (const dt of days) {
        if (cancelRef.current) break;
        const progress = (done / total) * 100;
        setPct(progress);
        setStatus(
          `Fetching ${instrument} — ${dt.toISOString().slice(0, 10)} (${Math.round(progress)}%)`
        );

        const buf = await fetchDay(instrument, dt);
        if (buf && buf.byteLength > 0) {
          try {
            const decompressed = await lzmaDecompress(buf);
            const rows = parseBi5(decompressed, instrument, dt, startDate, endDate);
            rows.forEach((r) => lines.push(rowToCSV(r)));
            instrumentRows += rows.length;
            totalRows      += rows.length;
          } catch (err) {
            failCount++;
            if (import.meta.env.DEV) {
              console.error(`[download] parse error ${instrument} ${dt.toISOString().slice(0, 10)}:`, err);
            }
          }
        } else if (buf !== null) {
          if (import.meta.env.DEV) {
            console.warn(`[download] empty buffer: ${instrument} ${dt.toISOString().slice(0, 10)}`);
          }
        }

        done++;
        if (done % 10 === 0) await sleep(1000);
      }

      if (!cancelRef.current) {
        zip.file(`${instrument}.csv`, lines.join("\n"));
        if (import.meta.env.DEV) {
          console.log(`[download] ${instrument} — ${instrumentRows} rows`);
        }
      }
    }

    if (cancelRef.current) {
      setStatus("Cancelled.");
      setProgState("error");
      setRunning(false);
      return;
    }

    setPct(100);
    setStatus("Compressing ZIP…");

    const s1      = startDate.toISOString().slice(0, 10);
    const s2      = endDate.toISOString().slice(0, 10);
    const zipBlob = await zip.generateAsync({ type: "blob" }, (meta) => {
      setStatus(`Compressing… ${Math.round(meta.percent)}%`);
    });

    const url = URL.createObjectURL(zipBlob);
    const a   = document.createElement("a");
    a.href     = url;
    a.download = `exchange_rates_${s1}_to_${s2}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    if (failCount > 0) {
      setStatus(`Complete — ${failCount} file${failCount > 1 ? "s" : ""} failed to parse.`);
      setProgState("error");
    } else {
      setStatus(`Complete — ${totalRows.toLocaleString()} rows across ${instruments.length} pair${instruments.length > 1 ? "s" : ""}.`);
      setProgState("complete");
    }
    setRunning(false);
  }, [startVal, endVal, selected]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>USD Exchange Rate Downloader</h1>
        <p className={styles.subtitle}>
          Pick a date range and currency pairs below. We fetch 1-minute bid candles
          straight from Dukascopy and deliver a ZIP of CSVs — one file per pair,
          no account or API key needed.
        </p>
        <p className={styles.meta}>
          24 pairs · 1-min OHLCV (open, high, low, close, volume) · Jan 2021 – present
        </p>
      </header>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Date &amp; Time Range</h2>
        <div className={styles.dateRow}>
          <DatePicker label="Start" value={startVal} onChange={setStartVal} maxDate={PAGE_LOAD_DATE} maxTime={PAGE_LOAD_TIME} />
          <DatePicker label="End"   value={endVal}   onChange={setEndVal}   maxDate={PAGE_LOAD_DATE} maxTime={PAGE_LOAD_TIME} minDate={endMin.date} minTime={endMin.time} />
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          Currency Pairs
          <span className={styles.pairCount}>{selected.size} / {INSTRUMENTS.length}</span>
        </h2>
        <InstrumentGrid selected={selected} onChange={setSelected} />
      </section>

      {validationError && (
        <p className={styles.validationError} role="alert">{validationError}</p>
      )}

      <div className={styles.actionRow}>
        <button
          className={styles.downloadBtn}
          onClick={handleDownload}
          disabled={running}
        >
          {running ? "Downloading…" : "Download CSV"}
        </button>
        {running && (
          <button className={styles.cancelBtn} onClick={handleCancel}>
            Cancel
          </button>
        )}
      </div>

      {showProg && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Progress</h2>
          <ProgressBar pct={pct} status={status} state={progState} />
        </section>
      )}
    </div>
  );
}
