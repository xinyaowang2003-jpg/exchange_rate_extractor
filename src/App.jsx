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

export default function App() {
  const [startVal, setStartVal] = useState(defaultStart);
  const [endVal,   setEndVal]   = useState(defaultEnd);
  const [selected, setSelected] = useState(new Set(INSTRUMENTS));

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
      setValidationError("Start date must be before end date.");
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
      <h1 className={styles.title}>FX Data Extraction</h1>
      <p className={styles.subtitle}>
        Dukascopy · 1-min OHLCV · 24 USD pairs · 2021–present
      </p>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Date &amp; Time Range</h2>
        <div className={styles.dateRow}>
          <DatePicker label="Start" value={startVal} onChange={setStartVal} maxDate={PAGE_LOAD_DATE} maxTime={PAGE_LOAD_TIME} />
          <DatePicker label="End"   value={endVal}   onChange={setEndVal}   maxDate={PAGE_LOAD_DATE} maxTime={PAGE_LOAD_TIME} />
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          Currency Pairs
          <span className={styles.pairCount}>{selected.size} / {INSTRUMENTS.length}</span>
        </h2>
        <InstrumentGrid selected={selected} onChange={setSelected} />
      </section>

      {estimate && (
        <p className={styles.estimate}>
          {estimate.pairs} pair{estimate.pairs !== 1 ? "s" : ""} × {estimate.days.toLocaleString()} day{estimate.days !== 1 ? "s" : ""} = {estimate.requests.toLocaleString()} requests
        </p>
      )}

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
