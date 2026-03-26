# TODO

## Step 1 — Fetch Binary Files from Dukascopy

- Granularity: **1-minute per-minute OHLCV candles** (`BID_candles_min_1.bi5` — one file per day, containing up to 1440 1-minute candles)
- Construct the URL for each currency pair and day:
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

Each `.bi5` file is **LZMA-compressed binary**. Each file contains per-minute records for that day. Processing has three sub-steps:

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
- Convert the per-minute timestamp offset to an absolute UTC datetime:
  - `datetime(year, month, day, tzinfo=UTC) + timedelta(seconds=offset)`
  - Note: the offset field is in **seconds** (not milliseconds) for candle data

---

## Step 3 — Export to CSV

- Output folder: `./output/`
- One CSV file per currency pair, named `{INSTRUMENT}.csv` (e.g. `EURUSD.csv`)
- Each row represents one 1-minute candle
- Append records minute by minute as they are processed (avoid holding all data in memory)
- CSV columns:
  ```
  timestamp, open, high, low, close, volume
  ```
- `timestamp` in ISO 8601 UTC format: `2021-01-04 08:00:00`
- Prices rounded to 5 decimal places (3 for JPY pairs)
- Write header row on file creation only

---

## Step 4 — Web Download Interface

Build a single-page web application (`index.html` + `app.js` + `styles.css`) that lets users select and download a filtered slice of the exchange rate data as a CSV file.

### 4.1 — Date/Time Range Selection (Scrolling Pickers)

- Provide two scrolling/spinning pickers: **Start Date** and **End Date**
- Each picker has five integer fields: **Year**, **Month**, **Day**, **Hour**, **Minute**
- Valid ranges:
  - Year: 2021 – current year (auto-updates to the year the user opens the page)
  - Month: 1–12
  - Day: 1–28/29/30/31 (dynamically adjusted based on selected month and year)
  - Hour: 0–23
  - Minute: 0–59
- All selectable values must be integers (no decimals, no text labels beyond field names)
- The maximum selectable datetime is capped at the current date and time when the page loads — the user cannot select a future date/time

### 4.2 — Default Values

- **End Date default**: when the user clicks "Download", if no end date has been manually set, default to the current date and time at the moment of the click
- **Day-only selection default**: if the user selects only Year + Month + Day (leaving Hour and Minute unset / at placeholder):
  - Start date defaults to `00:00` (first minute of the day)
  - End date defaults to `23:59` (last minute of the day)
- Example: selecting Start = 2021/1/1 and End = 2021/5/1 (day-only) returns all data from `2021-01-01 00:00` through `2021-05-01 23:59`

### 4.3 — Country / Instrument Selection

- Display a list of all 24 available currency pairs:
  ```
  AUDUSD, EURUSD, GBPUSD, NZDUSD,
  USDAED, USDCAD, USDCHF, USDCNH,
  USDCZK, USDDKK, USDHKD, USDHUF,
  USDILS, USDJPY, USDMXN, USDNOK,
  USDPLN, USDRON, USDSAR, USDSEK,
  USDSGD, USDTHB, USDTRY, USDZAR
  ```
- User can select one, several, or all pairs via checkboxes
- Include a **"Select All"** / **"Deselect All"** toggle button

### 4.4 — Progress Bar

- When a download is initiated, show a progress bar displaying the current completion percentage (0–100%)
- Update the bar in real time as each instrument's data is fetched and processed
- Display a status label (e.g. "Fetching EURUSD… 45%") alongside the bar

### 4.5 — Output Format

- Output is a single **CSV file** containing one section per selected currency pair
- Each currency pair occupies its own clearly labelled block/sheet within the file (since true multi-sheet CSV is not possible, use a blank-line separator and a header row per instrument)
- Columns per instrument block:
  ```
  timestamp, open, high, low, close, volume
  ```
- Timestamps filtered to the user-selected date/time range
- File is triggered as a browser download (no server-side storage)

### 4.6 — Data Source

- Data is fetched live from Dukascopy:
  ```
  https://datafeed.dukascopy.com/datafeed/{INSTRUMENT}/{YEAR}/{MONTH_0INDEXED}/{DAY}/BID_candles_min_1.bi5
  ```
- MONTH is 0-indexed (January = 00, December = 11)
- Files are LZMA-compressed; decompress in the browser using a JS LZMA library
- Each decompressed file contains 24-byte big-endian records: timestamp_offset (int32, seconds), open (int32), close (int32), low (int32), high (int32), volume (float32)
- Scale prices: divide by 100000 for most pairs, by 1000 for USDJPY
- Skip weekends (Saturday/Sunday) when iterating days
