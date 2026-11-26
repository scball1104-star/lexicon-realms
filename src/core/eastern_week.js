// The one shared calendar (wave 10 dflow, 2026-11-25; Scott: weekly things key off the Eastern calendar week, the same on
// every friend's machine). Pure: give it a time in ms (Date.now() in main.js, never inside the sim step) and it returns the
// Eastern day number and the Monday week, worked out from the US rule for Eastern daylight time (second Sunday in March
// 2:00 to first Sunday in November 2:00), not from the device's own time zone. So a friend in another zone, or with a
// wrong zone set, still gets the same day and week as everyone else.
//
//   easternOffsetMin(ms)  -> -240 (EDT) or -300 (EST)
//   easternDay(ms)        -> whole days since 1970-01-01 on the Eastern calendar (the bounty board's day, world.setDay)
//   easternWeek(day)      -> the Monday week number: easternWeek(day) is the same for Monday..Sunday of one week
//   weekStartDay(week)    -> the day number of that week's Monday
//   dayText(day)          -> '2026-11-25' (tests, logs)
const DAY_MS = 86400000;

function nthSunday(y, month, n) {
  const first = new Date(Date.UTC(y, month, 1)).getUTCDay();
  return 1 + ((7 - first) % 7) + 7 * (n - 1);
}

export function easternOffsetMin(ms) {
  const y = new Date(ms - 5 * 3600000).getUTCFullYear();
  const start = Date.UTC(y, 2, nthSunday(y, 2, 2), 7);     // 2:00 EST = 7:00 UTC
  const end = Date.UTC(y, 10, nthSunday(y, 10, 1), 6);     // 2:00 EDT = 6:00 UTC
  return ms >= start && ms < end ? -240 : -300;
}

export function easternDay(ms) {
  return Math.floor((ms + easternOffsetMin(ms) * 60000) / DAY_MS);
}

// day 0 (1970-01-01) was a Thursday; day -3 was a Monday
export function easternWeek(day) { return Math.floor((day + 3) / 7); }
export function weekStartDay(week) { return week * 7 - 3; }

export function dayText(day) {
  const d = new Date(day * DAY_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
