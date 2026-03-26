"""
Exchange Rate Extractor
Fetches 1-minute OHLCV candles for 24 USD pairs from Dukascopy (2021-01-01 to today).
"""

import asyncio
import csv
import lzma
import ssl
import struct
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import aiohttp

# --- Config ---

INSTRUMENTS = [
    "AUDUSD", "EURUSD", "GBPUSD", "NZDUSD",
    "USDAED", "USDCAD", "USDCHF", "USDCNH",
    "USDCZK", "USDDKK", "USDHKD", "USDHUF",
    "USDILS", "USDJPY", "USDMXN", "USDNOK",
    "USDPLN", "USDRON", "USDSAR", "USDSEK",
    "USDSGD", "USDTHB", "USDTRY", "USDZAR",
]

JPY_PAIRS = {"USDJPY"}
POINT_VALUE = {inst: (1000 if inst in JPY_PAIRS else 100000) for inst in INSTRUMENTS}

START_DATE = date(2021, 1, 1)
END_DATE = date.today()

OUTPUT_DIR = Path("./output")
CANDLE_FILE = "BID_candles_min_1"
RECORD_SIZE = 24  # bytes per candle record
RECORD_FMT = ">iiiiif"

MAX_CONCURRENT = 10
BATCH_PAUSE = 1.0  # seconds between batches


# --- URL builder ---

def dukascopy_url(instrument: str, dt: date) -> str:
    return (
        f"https://datafeed.dukascopy.com/datafeed/"
        f"{instrument}/"
        f"{dt.year}/"
        f"{dt.month - 1:02d}/"
        f"{dt.day:02d}/"
        f"{CANDLE_FILE}.bi5"
    )


# --- Binary parser ---

def parse_bi5(data: bytes, instrument: str, dt: date) -> list[tuple]:
    try:
        raw = lzma.decompress(data)
    except Exception:
        return []

    if not raw:
        return []

    n = len(raw) // RECORD_SIZE
    point = POINT_VALUE[instrument]
    day_start = datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)
    decimals = 3 if instrument in JPY_PAIRS else 5

    rows = []
    for i in range(n):
        offset = i * RECORD_SIZE
        ms, o, c, lo, hi, vol = struct.unpack_from(RECORD_FMT, raw, offset)
        ts = day_start + timedelta(seconds=ms)
        rows.append((
            ts.strftime("%Y-%m-%d %H:%M:%S"),
            round(o / point, decimals),
            round(hi / point, decimals),
            round(lo / point, decimals),
            round(c / point, decimals),
            vol,
        ))
    return rows


# --- CSV writer ---

def get_csv_writer(instrument: str):
    path = OUTPUT_DIR / f"{instrument}.csv"
    is_new = not path.exists()
    f = open(path, "a", newline="")
    writer = csv.writer(f)
    if is_new:
        writer.writerow(["timestamp", "open", "high", "low", "close", "volume"])
    return f, writer


# --- Async fetcher ---

async def fetch_day(session: aiohttp.ClientSession, instrument: str, dt: date, semaphore: asyncio.Semaphore):
    url = dukascopy_url(instrument, dt)
    async with semaphore:
        for attempt in range(5):
            try:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status == 404:
                        return instrument, dt, None
                    if resp.status in (429, 503):
                        await asyncio.sleep(2 ** attempt)
                        continue
                    if resp.status == 200:
                        data = await resp.read()
                        return instrument, dt, data
                    return instrument, dt, None
            except Exception:
                await asyncio.sleep(2 ** attempt)
    return instrument, dt, None


def weekdays(start: date, end: date):
    current = start
    while current <= end:
        if current.weekday() < 5:  # Mon–Fri
            yield current
        current += timedelta(days=1)


async def main():
    OUTPUT_DIR.mkdir(exist_ok=True)

    # Open all CSV files upfront
    csv_handles = {}
    for inst in INSTRUMENTS:
        f, writer = get_csv_writer(inst)
        csv_handles[inst] = (f, writer)

    semaphore = asyncio.Semaphore(MAX_CONCURRENT)
    days = list(weekdays(START_DATE, END_DATE))
    total = len(INSTRUMENTS) * len(days)
    done = 0

    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE
    connector = aiohttp.TCPConnector(limit=MAX_CONCURRENT, ssl=ssl_ctx)
    async with aiohttp.ClientSession(connector=connector) as session:
        # Build all tasks grouped in batches of MAX_CONCURRENT
        all_tasks = [
            (inst, dt)
            for dt in days
            for inst in INSTRUMENTS
        ]

        batch_size = MAX_CONCURRENT
        for batch_start in range(0, len(all_tasks), batch_size):
            batch = all_tasks[batch_start: batch_start + batch_size]
            coros = [fetch_day(session, inst, dt, semaphore) for inst, dt in batch]
            results = await asyncio.gather(*coros)

            for instrument, dt, data in results:
                done += 1
                if data:
                    rows = parse_bi5(data, instrument, dt)
                    if rows:
                        _, writer = csv_handles[instrument]
                        writer.writerows(rows)

            if batch_start % (batch_size * 50) == 0:
                pct = done / total * 100
                print(f"  {done}/{total} ({pct:.1f}%) — last batch ending {dt}")
                # Flush all files periodically
                for f, _ in csv_handles.values():
                    f.flush()

            await asyncio.sleep(BATCH_PAUSE)

    for f, _ in csv_handles.values():
        f.flush()
        f.close()

    print(f"\nDone. Output in {OUTPUT_DIR.resolve()}")


if __name__ == "__main__":
    asyncio.run(main())
