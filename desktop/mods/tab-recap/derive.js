import { HINT_DEFAULT, MS, STAGE, STATUS, STATUS_ORDER, STEP_STATE, STEPS } from "./constants.js";
import { minutes } from "./time.js";

const rank = (status) => {
  const at = STATUS_ORDER.indexOf(status);
  return at < 0 ? STATUS_ORDER.length : at;
};

export function byUrgency(rows) {
  return rows.toSorted((a, b) => rank(a.status) - rank(b.status)
    || (a.waitingSince ?? Infinity) - (b.waitingSince ?? Infinity)
    || a.name.localeCompare(b.name));
}

export const maxCtx = (row) => {
  const values = row.lanes.map((l) => l.contextPercent).filter((v) => v !== null);
  return row.contextPercent ?? (values.length ? Math.max(...values) : null);
};

export const hintOf = (row) => row.hintPercent ?? HINT_DEFAULT;
export const needsYou = (row) => row.needs > 0 || row.status === STATUS.blocked;

export function visible(rows, filter, q) {
  const needle = q.trim().toLowerCase();
  return byUrgency(rows).filter((r) => (!filter.size || filter.has(r.status))
    && (!needle || `${r.name}${r.space}${r.headline}`.toLowerCase().includes(needle)));
}

export const countBy = (rows, status) => rows.filter((r) => r.status === status).length;

export function worstOf(rows) {
  return STATUS_ORDER.find((s) => countBy(rows, s) > 0) ?? STATUS.idle;
}

export const waitMinutes = (row, now) => (row.waitingSince ? minutes(now - row.waitingSince) : 0);

export function stepsOf(stage, now) {
  const at = STEPS.indexOf(stage.stage);
  const done = stage.stage === STAGE.compacted;
  return STEPS.map((name, i) => {
    const state = done || i < at ? STEP_STATE.ok : i === at ? STEP_STATE.now : STEP_STATE.idle;
    const secs = i === at && !done ? Math.max(0, Math.round((now - stage.stageAt) / MS.second)) : done && i === STEPS.length - 1 ? Math.round((stage.tookMs ?? 0) / MS.second) : null;
    return { name, state, secs };
  });
}
