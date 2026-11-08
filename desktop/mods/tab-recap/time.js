import { CLOCK_FILL, CLOCK_PAD, MONTHS, MS, UNIT, WEEKDAYS } from "./constants.js";
import { TEXT } from "./text.js";

const pad = (n) => String(n).padStart(CLOCK_PAD, CLOCK_FILL);

export const clock = (ms) => `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`;
export const day = (ms) => `${MONTHS[new Date(ms).getMonth()]} ${new Date(ms).getDate()}`;
export const weekday = (ms) => WEEKDAYS[new Date(ms).getDay()];
export const hourOf = (ms) => new Date(ms).getHours();
export const minuteOf = (ms) => new Date(ms).getMinutes();

export function ago(ms) {
  const min = Math.max(0, ms) / MS.minute;
  if (min < 1) return TEXT.agoNow;
  if (min < UNIT.minHour) return TEXT.agoMin(Math.round(min));
  if (min < UNIT.minDay) return TEXT.agoHour(Math.round(min / UNIT.minHour));
  return TEXT.agoDay(Math.round(min / UNIT.minDay));
}

export const minutes = (ms) => Math.max(0, Math.round(ms / MS.minute));

export function duration(ms) {
  const s = Math.max(0, Math.round(ms / MS.second));
  if (s < UNIT.secMin) return `${s} s`;
  if (s < UNIT.secHour) return `${Math.round(s / UNIT.secMin)} min`;
  if (s < UNIT.secDay) return `${Math.round(s / UNIT.secHour)} h`;
  return `${Math.round(s / UNIT.secDay)} d`;
}

export function sizeOf(n) {
  if (n >= UNIT.million) return `${+(n / UNIT.million).toFixed(1)}M`;
  return n >= UNIT.thousand ? `${Math.round(n / UNIT.thousand)}k` : `${n}`;
}

export const percentOf = (part, whole) => (whole > 0 ? Math.round((part / whole) * UNIT.percent) : null);
