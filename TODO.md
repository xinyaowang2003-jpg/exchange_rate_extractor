# TODO

## Step 1 — Fetch Binary Files from Dukascopy

- Construct the URL for each currency pair, day, and minute-candle file:
  ```
  https://datafeed.dukascopy.com/datafeed/{INSTRUMENT}/{YEAR}/{MONTH}/{DAY}/BID_candles_min_1.bi5
  ```
  - `{MONTH}` is **0-indexed** (January = `00`, December = `11`)
- Iterate over all 24 pairs, all days from 2021-01-01 to today's date (auto-detected at runtime using `date.today()`)
- Skip weekends (Saturday, Sunday) — no trading data exists
- Download each `.bi5` file via HTTP GET (no authentication needed)
- Handle missing files gracefully — HTTP 404 or empty response means no data for that day (holidays, market closures); skip silently
- Respect rate limits: max ~10 concurrent requests, 1-second pause between batches, exponential backoff on HTTP 429 / 503

---

## Step 2 — Process the Binary Data

Each `.bi5` file is **LZMA-compressed binary**. Processing has three sub-steps:

### 2a. Decompress
- Decompress the raw bytes using LZMA (standard library)
- If decompressed output is empty, skip the file (legitimate gap in data)

### 2b. Parse Binary Records
- Each 1-minute candle is a **24-byte big-endian record**, no headers:

  | Bytes | Type    | Field     | Notes                          |
  |-------|---------|-----------|--------------------------------|
  | 0–3   | int32   | Timestamp | Milliseconds from start of day |
  | 4–7   | int32   | Open      | Raw integer, needs scaling     |
  | 8–11  | int32   | Close     | Raw integer, needs scaling     |
  | 12–15 | int32   | Low       | Raw integer, needs scaling     |
  | 16–19 | int32   | High      | Raw integer, needs scaling     |
  | 20–23 | float32 | Volume    | Already in lots, no scaling    |

- Total records in a file = `len(decompressed bytes) / 24`
- Parse using `struct.unpack_from('>iiiiif', data, offset)` for each record

### 2c. Scale Prices
- Raw integer prices must be divided by the instrument's **point value** to get the actual exchange rate:
  - Most pairs (5-decimal): `÷ 100000`
  - JPY pairs (USDJPY): `÷ 1000`
- Convert the timestamp offset to an absolute UTC datetime:
  - `datetime(year, month, day, tzinfo=UTC) + timedelta(milliseconds=offset)`

---

## Step 3 — Export to CSV

- Output folder: `./output/`
- One CSV file per currency pair, named `{INSTRUMENT}.csv` (e.g. `EURUSD.csv`)
- Append records day by day as they are processed (avoid holding all data in memory)
- CSV columns:
  ```
  timestamp, open, high, low, close, volume
  ```
- `timestamp` in ISO 8601 UTC format: `2021-01-04 08:00:00`
- Prices rounded to 5 decimal places (3 for JPY pairs)
- Write header row on file creation only
