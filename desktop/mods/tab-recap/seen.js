import { DOC, FACT_STATE, INTERVAL, STORAGE } from "./constants.js";

function read() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE.seen) ?? "{}");
    return parsed !== null && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function lastSeen(tab, now) {
  const stored = read()[tab];
  return typeof stored === "number" ? stored : now - INTERVAL.firstLook;
}

export function markSeen(tab, now) {
  try {
    localStorage.setItem(STORAGE.seen, JSON.stringify({ ...read(), [tab]: now }));
  } catch {
    return;
  }
}

const countFacts = (doc, pick, seen) =>
  (doc.tasks ?? []).reduce((sum, task) => sum + (task.facts ?? []).filter((f) => pick(f) && f.firstAt > seen).length, 0);

export function since(doc, seen) {
  if (!doc || !Array.isArray(doc.breaks)) return { seen, need: 0, dec: 0, fact: 0, comp: 0 };
  return {
    seen,
    need: countFacts(doc, (f) => f.section === DOC.needs && f.state === FACT_STATE.open, seen),
    dec: countFacts(doc, (f) => f.section === DOC.decisions, seen),
    fact: countFacts(doc, (f) => f.section === DOC.now || f.section === DOC.done, seen),
    comp: doc.breaks.filter((b) => b.kind === DOC.compacted && b.at > seen).length,
  };
}
