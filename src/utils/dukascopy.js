import { POINT, JPY_PAIRS } from "../constants";

const BASE_URL = "/datafeed";
const RECORD_SIZE = 24;

function dukascopyUrl(instrument, year, month0, day) {
  const mm = String(month0).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${BASE_URL}/${instrument}/${year}/${mm}/${dd}/BID_candles_min_1.bi5`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchDay(instrument, dt) {
  const url = dukascopyUrl(
    instrument,
    dt.getUTCFullYear(),
    dt.getUTCMonth(), // already 0-indexed
    dt.getUTCDate()
  );
  console.log(`[fetch] GET ${url}`);

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const resp = await fetch(url);
      console.log(`[fetch] ${url} → HTTP ${resp.status} (attempt ${attempt + 1})`);

      if (resp.status === 404) {
        console.log(`[fetch] 404 – no data for ${instrument} ${dt.toISOString().slice(0, 10)}`);
        return null;
      }
      if (resp.status === 429 || resp.status === 503) {
        const wait = Math.pow(2, attempt) * 1000;
        console.warn(`[fetch] Rate-limited (${resp.status}), waiting ${wait}ms…`);
        await sleep(wait);
        continue;
      }
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        const dateStr = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,"0")}-${String(dt.getUTCDate()).padStart(2,"0")}`;
        console.log(`[fetch] OK – ${buf.byteLength} bytes for ${instrument} ${dateStr}`);
        return buf;
      }
      console.warn(`[fetch] Unexpected status ${resp.status} for ${url}`);
      return null;
    } catch (err) {
      console.error(`[fetch] Network error on attempt ${attempt + 1} for ${url}:`, err);
      await sleep(Math.pow(2, attempt) * 500);
    }
  }
  console.error(`[fetch] All attempts failed for ${url}`);
  return null;
}

export function parseBi5(decompressed, instrument, dt, startDate, endDate) {
  // Ensure we have an ArrayBuffer for DataView
  let buf;
  if (decompressed instanceof Uint8Array) {
    buf = decompressed.buffer.slice(
      decompressed.byteOffset,
      decompressed.byteOffset + decompressed.byteLength
    );
  } else if (decompressed instanceof ArrayBuffer) {
    buf = decompressed;
  } else {
    // plain Array of signed bytes from lzma package
    const u8 = new Uint8Array(decompressed.length);
    for (let i = 0; i < decompressed.length; i++) {
      u8[i] = decompressed[i] & 0xff;
    }
    buf = u8.buffer;
  }

  const dv      = new DataView(buf);
  const n       = Math.floor(dv.byteLength / RECORD_SIZE);
  const point   = POINT(instrument);
  const decimals = JPY_PAIRS.has(instrument) ? 3 : 5;
  const dayStart = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));

  console.log(
    `[parse] ${instrument} ${dt.toISOString().slice(0, 10)} — ` +
    `${dv.byteLength} bytes → ${n} raw records | ` +
    `filter [${startDate.toISOString()} … ${endDate.toISOString()}]`
  );

  const rows = [];
  for (let i = 0; i < n; i++) {
    const off       = i * RECORD_SIZE;
    const secOffset = dv.getInt32(off,      false);
    const o         = dv.getInt32(off + 4,  false);
    const c         = dv.getInt32(off + 8,  false);
    const lo        = dv.getInt32(off + 12, false);
    const hi        = dv.getInt32(off + 16, false);
    const vol       = dv.getFloat32(off + 20, false);

    const ts = new Date(dayStart.getTime() + secOffset * 1000);
    if (ts < startDate || ts > endDate) continue;

    const fmt  = (v) => (v / point).toFixed(decimals);
    const pad2 = (x) => String(x).padStart(2, "0");
    const tsStr =
      `${ts.getUTCFullYear()}-${pad2(ts.getUTCMonth() + 1)}-${pad2(ts.getUTCDate())} ` +
      `${pad2(ts.getUTCHours())}:${pad2(ts.getUTCMinutes())}:${pad2(ts.getUTCSeconds())}`;

    rows.push([tsStr, fmt(o), fmt(hi), fmt(lo), fmt(c), vol.toFixed(2)]);
  }

  console.log(`[parse] ${instrument} ${dt.toISOString().slice(0, 10)} — ${rows.length} rows kept after filter`);
  return rows;
}

function escapeCSV(v) {
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowToCSV(row) {
  return row.map(escapeCSV).join(",");
}
