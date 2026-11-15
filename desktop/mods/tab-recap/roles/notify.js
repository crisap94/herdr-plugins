import { notify, setShared, shared } from "herdr";
import { INTERVAL, NOTIFIED_KEEP, SHARED, STAGE } from "../constants.js";
import { duration, percentOf } from "../time.js";
import { TEXT } from "../text.js";

const checked = new Set();

function post(tab, lane) {
  const stage = lane.compaction.stage;
  const window = lane.context?.window ?? 0;
  const key = `${tab}:${lane.pane}:${stage.stageAt}`;
  const told = shared(SHARED.notified) ?? [];
  if (told.includes(key)) return;
  setShared(SHARED.notified, [...told, key].slice(-NOTIFIED_KEEP));
  notify({
    title: TEXT.compactedTitle(percentOf(stage.tokensBefore ?? 0, window) ?? 0, percentOf(stage.tokensAfter ?? 0, window) ?? 0),
    body: `${lane.heading || lane.pane}${TEXT.separator}${duration(stage.tookMs ?? 0)}`, level: "success", action: { name: "pane.focus", args: { terminal: lane.pane } },
  });
}

export async function announce(store, rows) {
  const due = rows.filter((r) => r.lanes.some((l) => l.stage === STAGE.compacted) && !checked.has(`${r.tab}:${r.at}`));
  for (const row of due) {
    checked.add(`${row.tab}:${row.at}`);
    const entry = await store.loadDoc(row.tab);
    (entry.doc?.lanes ?? []).filter((l) => l.compaction?.stage?.stage === STAGE.compacted && Date.now() - l.compaction.stage.stageAt < INTERVAL.stageFresh)
      .forEach((l) => post(row.tab, l));
  }
}

export const toast = (title, body = "") => notify({ title, body, level: "success" });
