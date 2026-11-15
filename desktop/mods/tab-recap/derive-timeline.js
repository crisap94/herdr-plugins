import { BIN_COUNT, BREAK_KIND, DOC, FACT_SECTION, HOURS, MS, SECTIONS } from "./constants.js";
import { day, weekday } from "./time.js";

export function eventsOf(doc) {
  return (doc?.tasks ?? []).flatMap((task) => (task.facts ?? []).flatMap((f) => {
    const sec = FACT_SECTION[f.section];
    return sec ? [{ t: f.firstAt, sec, text: f.text }] : [];
  })).toSorted((a, b) => a.t - b.t);
}

export function breaksOf(doc) {
  return (doc?.breaks ?? []).flatMap((b) => {
    const kind = BREAK_KIND[b.kind];
    return kind ? [{ t: b.at, kind, text: b.text }] : [];
  });
}

export const matches = (e, f) => (!f.sections.size || f.sections.has(e.sec)) && (!f.q || e.text.toLowerCase().includes(f.q));

export function bins(events, now) {
  const size = (HOURS * MS.hour) / BIN_COUNT;
  const from = now - HOURS * MS.hour;
  const made = Array.from({ length: BIN_COUNT }, (_, i) => ({ i, t0: from + i * size, t1: from + (i + 1) * size, events: [], counts: {} }));
  let older = 0;
  events.forEach((e) => {
    if (e.t < from) { older += 1; return; }
    const b = made[Math.min(BIN_COUNT - 1, Math.floor((e.t - from) / size))];
    b.events.push(e);
    b.counts[e.sec] = (b.counts[e.sec] ?? 0) + 1;
  });
  made.forEach((b) => {
    b.n = b.events.length;
    b.dominant = SECTIONS.reduce((m, s) => ((b.counts[s] ?? 0) > (b.counts[m] ?? 0) ? s : m), DOC.needs);
  });
  return { bins: made, older, from };
}

export function feed(events, breaks, f, zone) {
  const list = events.filter((e) => matches(e, f) && (!f.bin || (e.t >= f.bin.t0 && e.t < f.bin.t1))).map((e) => ({ type: "event", t: e.t, e }));
  const marks = f.bin || f.q || f.sections.size ? [] : breaks.map((b) => ({ type: "break", t: b.t, b }));
  const rows = list.concat(marks).toSorted((a, b) => b.t - a.t);
  const out = [];
  let last = "";
  rows.forEach((r) => {
    const d = day(r.t, zone);
    if (d !== last) { last = d; out.push({ type: "day", label: `${d} (${weekday(r.t, zone)})` }); }
    out.push(r);
  });
  return { rows: out, count: list.length };
}
