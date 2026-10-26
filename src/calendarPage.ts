// The wall calendar is a tear-off day calendar: year banner, month, big day number, day of the
// year and days left, a holiday line, and the weekday. Pure, so the page can be tested.

export interface CalendarPage {
  year: number;
  month: string;
  day: number;
  weekday: string;
  /** 1 on 1 January. */
  dayOfYear: number;
  /** Days left in the year after this one: 364 on 1 January of a common year. */
  daysLeft: number;
  holiday?: string;
  /** Changes once a day, to know when to redraw. */
  key: string;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Fixed-date days most calendars print, keyed "month-day" (1-based). */
const HOLIDAYS: Record<string, string> = {
  "1-1": "New Year's Day",
  "2-14": "Valentine's Day",
  "3-17": "St Patrick's Day",
  "4-1": "April Fools' Day",
  "4-22": "Earth Day",
  "5-1": "Labour Day",
  "10-31": "Halloween",
  "12-24": "Christmas Eve",
  "12-25": "Christmas Day",
  "12-26": "Boxing Day",
  "12-31": "New Year's Eve",
};

export function calendarPage(d: Date): CalendarPage {
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  const dayMs = 86_400_000;
  const dayOfYear = Math.round((Date.UTC(y, m, day) - Date.UTC(y, 0, 1)) / dayMs) + 1;
  const yearLength = Math.round((Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / dayMs);
  return {
    year: y, month: MONTHS[m], day, weekday: WEEKDAYS[d.getDay()],
    dayOfYear, daysLeft: yearLength - dayOfYear,
    holiday: HOLIDAYS[`${m + 1}-${day}`],
    key: `${y}-${m}-${day}`,
  };
}

/** Draws the page onto a canvas sized w×h (about 3:4), in the teal-on-white tear-off style. */
export function drawCalendarPage(ctx: CanvasRenderingContext2D, w: number, h: number, p: CalendarPage): void {
  const teal = "#1fb8cc", ink = "#22c3d6", paper = "#ffffff";
  const font = (px: number, weight = 700) => `${weight} ${Math.round(px)}px "Arial Rounded MT Bold", "Nunito", "Segoe UI", sans-serif`;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Year banner with the two binder rings.
  const top = h * 0.2;
  ctx.fillStyle = teal;
  ctx.fillRect(0, 0, w, top);
  ctx.fillStyle = paper;
  ctx.font = font(h * 0.15, 800);
  ctx.fillText(String(p.year), w / 2, top * 0.55);
  for (const x of [w * 0.12, w * 0.88]) {
    ctx.beginPath();
    ctx.arc(x, top * 0.82, w * 0.03, 0, Math.PI * 2);
    ctx.fillStyle = "#e8eef0";
    ctx.fill();
  }

  // Month and the big day number.
  ctx.fillStyle = ink;
  ctx.font = font(h * 0.08, 600);
  ctx.fillText(p.month, w / 2, h * 0.3);
  ctx.font = font(h * 0.36, 800);
  ctx.fillText(String(p.day), w / 2, h * 0.53);

  // Day of year (left), days left (right), holiday between.
  const tagY = h * 0.74, tagH = h * 0.06, tagW = w * 0.17;
  ctx.fillStyle = teal;
  ctx.fillRect(w * 0.03, tagY - tagH / 2, tagW, tagH);
  ctx.fillRect(w * 0.97 - tagW, tagY - tagH / 2, tagW, tagH);
  ctx.fillStyle = paper;
  ctx.font = font(tagH * 0.75, 800);
  ctx.fillText(String(p.dayOfYear).padStart(3, "0"), w * 0.03 + tagW / 2, tagY);
  ctx.fillText(String(p.daysLeft).padStart(3, "0"), w * 0.97 - tagW / 2, tagY);
  if (p.holiday) {
    ctx.fillStyle = ink;
    ctx.font = font(h * 0.04, 500);
    ctx.fillText(p.holiday, w / 2, tagY);
  }

  // Weekday strip.
  ctx.strokeStyle = teal;
  ctx.lineWidth = h * 0.008;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.8);
  ctx.lineTo(w, h * 0.8);
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.font = font(h * 0.1, 700);
  ctx.fillText(p.weekday, w / 2, h * 0.9);

  // Thin teal border.
  ctx.strokeStyle = teal;
  ctx.lineWidth = w * 0.012;
  ctx.strokeRect(0, 0, w, h);
}
