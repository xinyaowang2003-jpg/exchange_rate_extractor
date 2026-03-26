export function daysInMonth(year, month) {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

export function range(a, b) {
  const arr = [];
  for (let i = a; i <= b; i++) arr.push(i);
  return arr;
}

/**
 * Build a UTC Date from a { date, time } object.
 * date: "YYYY-MM-DD"
 * time: "HH:MM"
 */
export function resolveDate({ date, time }) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, 0, 0));
}

export function* weekdays(start, end) {
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endD = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 23, 59, 59, 999));
  while (cur <= endD) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) yield new Date(cur);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}
