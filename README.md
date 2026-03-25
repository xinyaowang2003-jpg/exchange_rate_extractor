# Exchange Rate Extractor

## Goal

Extract USD exchange rates for all available countries over the past 5 years (2021–2026) using the Dukascopy historical Forex data feed.

## Output Specification

- **Granularity:** 1-minute OHLCV candles (`BID_candles_min_1.bi5`)
- **Columns:** full OHLCV — timestamp, open, high, low, close, volume
- **File structure:** one CSV per currency pair, all files together in a single output folder
- **Estimated size:** ~2.6 GB total across 24 pairs (~1,962,720 rows per pair, ~108 MB per file)

---

## Dukascopy Forex Data Feed — API Research

### Base URL

```
https://datafeed.dukascopy.com/datafeed/{INSTRUMENT}/{YEAR}/{MONTH}/{DAY}/{FILENAME}.bi5
```

### Endpoint Types

**Tick data** (one file per hour):
```
https://datafeed.dukascopy.com/datafeed/EURUSD/2021/00/15/08h_ticks.bi5
```

**OHLCV candle data** (one file per day):
```
https://datafeed.dukascopy.com/datafeed/EURUSD/2021/00/15/BID_candles_day_1.bi5
```

### Candle Timeframe Codes

| Filename | Timeframe |
|---|---|
| `BID_candles_min_1.bi5` | 1-minute |
| `BID_candles_min_5.bi5` | 5-minute |
| `BID_candles_min_10.bi5` | 10-minute |
| `BID_candles_min_15.bi5` | 15-minute |
| `BID_candles_min_30.bi5` | 30-minute |
| `BID_candles_hour_1.bi5` | 1-hour |
| `BID_candles_hour_4.bi5` | 4-hour |
| `BID_candles_day_1.bi5` | Daily |

Replace `BID_` with `ASK_` for ask-side candles.

---

### CRITICAL GOTCHA: Month is Zero-Indexed

The `{MONTH}` field in the URL is **0-indexed** (like JavaScript's `Date.getMonth()`):

| Calendar Month | URL Value |
|---|---|
| January | `00` |
| February | `01` |
| ... | ... |
| December | `11` |

Example: January 15, 2021 → `.../2021/00/15/...`

---

### Authentication

**None required.** All endpoints are public HTTP — no API key, no login.

---

### Supported USD Pairs

All pairs fully cover 2021–2026.

**All 24 fiat USD pairs:**

| Instrument | Currency |
|---|---|
| AUDUSD | Australian Dollar |
| EURUSD | Euro |
| GBPUSD | British Pound |
| NZDUSD | New Zealand Dollar |
| USDAED | UAE Dirham |
| USDCAD | Canadian Dollar |
| USDCHF | Swiss Franc |
| USDCNH | Offshore Chinese Yuan |
| USDCZK | Czech Koruna |
| USDDKK | Danish Krone |
| USDHKD | Hong Kong Dollar |
| USDHUF | Hungarian Forint |
| USDILS | Israeli Shekel |
| USDJPY | Japanese Yen |
| USDMXN | Mexican Peso |
| USDNOK | Norwegian Krone |
| USDPLN | Polish Zloty |
| USDRON | Romanian Leu |
| USDSAR | Saudi Riyal |
| USDSEK | Swedish Krona |
| USDSGD | Singapore Dollar |
| USDTHB | Thai Baht |
| USDTRY | Turkish Lira |
| USDZAR | South African Rand |

**Notable gaps (not available on Dukascopy):**
- USDINR (Indian Rupee)
- USDRUB (Russian Ruble — removed post-2022)
- Most other exotic currencies (VND, PHP, NGN, KES, PKR, EGP, etc.)

---

### Data Format: .bi5 Binary Files

Files are **LZMA-compressed binary**. After decompression:

**Tick file record (20 bytes, big-endian):**
| Bytes | Type | Field | Notes |
|---|---|---|---|
| 0–3 | int32 | Time offset | Milliseconds since hour start |
| 4–7 | int32 | Ask price | Divide by point value |
| 8–11 | int32 | Bid price | Divide by point value |
| 12–15 | float32 | Ask volume | Lots |
| 16–19 | float32 | Bid volume | Lots |

**OHLCV candle record (24 bytes, big-endian):**
| Bytes | Type | Field |
|---|---|---|
| 0–3 | int32 | Time offset (ms from day start) |
| 4–7 | int32 | Open |
| 8–11 | int32 | Close |
| 12–15 | int32 | Low |
| 16–19 | int32 | High |
| 20–23 | float32 | Volume |

**Price scaling:** divide integer prices by the instrument's point value:
- Standard 5-decimal pairs (most): `÷ 100000`
- JPY pairs: `÷ 1000`
- Some metals: `÷ 100`

All timestamps are **UTC+0**.

---

### Rate Limits

No official limit documented. Community-observed safe practice:
- Max ~10 concurrent requests
- 1-second pause between batches
- Use exponential backoff on HTTP 429 / 503 responses

---

### Other Gotchas

- **Empty files / 404s on weekends and holidays** — forex markets close Friday ~22:00 UTC, reopen Sunday ~22:00 UTC; handle gracefully
- **Instrument naming** — uppercase, no separator: `EURUSD`, not `EUR/USD`
- **No ASK candles on all instruments** — some only have BID-side files
- **Inconsistent start dates** — some pairs have gaps in older data even within the nominally available range

---

### Concrete URL Examples

```
# USDJPY tick data, January 15, 2021, 08:00 UTC
https://datafeed.dukascopy.com/datafeed/USDJPY/2021/00/15/08h_ticks.bi5

# EURUSD 1-minute candles, June 1, 2023 (month = 05)
https://datafeed.dukascopy.com/datafeed/EURUSD/2023/05/01/BID_candles_min_1.bi5

# USDMXN daily candles, March 5, 2024 (month = 02)
https://datafeed.dukascopy.com/datafeed/USDMXN/2024/02/05/BID_candles_day_1.bi5

# GBPUSD hourly candles, December 31, 2022 (month = 11)
https://datafeed.dukascopy.com/datafeed/GBPUSD/2022/11/31/BID_candles_hour_1.bi5
```

---

### URL Construction (Python)

```python
from datetime import date

def dukascopy_url(instrument: str, dt: date, candle: str = "BID_candles_day_1") -> str:
    return (
        f"https://datafeed.dukascopy.com/datafeed/"
        f"{instrument.upper()}/"
        f"{dt.year}/"
        f"{dt.month - 1:02d}/"   # CRITICAL: subtract 1 for zero-indexed month
        f"{dt.day:02d}/"
        f"{candle}.bi5"
    )
```

---

### Recommended Libraries

| Library | Language | Notes |
|---|---|---|
| [dukascopy-node](https://github.com/Leo4815162342/dukascopy-node) | Node.js/CLI | Most complete; handles month indexing, decompression, CSV export. CLI: `npx dukascopy-node -i usdjpy -from 2021-01-01 -to 2026-01-01 -t d1 -f csv` |
| [TickVault](https://github.com/keyhankamyar/TickVault) | Python | Resume-capable, proxy support, SQLite tracking |
| [duka](https://giuse88.github.io/duka/) | Python CLI | Simple and lightweight |
| [Dukas.Net](https://github.com/tomas-rampas/Dukas.Net) | .NET | bi5 → CSV pipeline |
