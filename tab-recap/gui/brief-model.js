import { DOC, FACT_STATE, URL_IN_TEXT, FALLBACK_ZONE, STATUS, YES } from "./constants.js";
import { TEXT } from "./text.js";
import { breaksOf, eventsOf } from "./derive-timeline.js";
import { since } from "./seen.js";
import { laneStatus } from "./model.js";

const idsOf = (task, region) => (task.regions?.[region] ?? []);
const factsIn = (task, region) => idsOf(task, region).map((id) => (task.facts ?? []).find((f) => f.id === id)).filter(Boolean);
const prefix = (doc, task) => (doc.tasks.length > 1 ? TEXT.sidePrefix(task.name) : "");

function listOf(doc, region, plain) {
  return doc.tasks.flatMap((task) => {
    const facts = factsIn(task, region);
    return facts.length ? facts.map((f) => `${prefix(doc, task)}${f.text}`) : (task.sections?.[plain] ?? []).map((t) => `${prefix(doc, task)}${t}`);
  });
}

function needCards(doc) {
  return doc.tasks.flatMap((task) => {
    const facts = factsIn(task, DOC.needs).filter((f) => f.state === FACT_STATE.open).toSorted((a, b) => a.firstAt - b.firstAt);
    if (facts.length) return facts.map((f) => ({ id: f.id ?? null, text: `${prefix(doc, task)}${f.text}`, why: f.why, since: f.firstAt }));
    return (task.sections?.needs ?? []).map((text) => ({ id: null, text: `${prefix(doc, task)}${text}`, why: null, since: null }));
  });
}

function decisionsOf(doc) {
  return doc.tasks.flatMap((task) => {
    const facts = factsIn(task, DOC.decisions);
    if (facts.length) return facts.map((f) => ({ id: f.id, title: `${prefix(doc, task)}${f.text}`, why: f.why, at: f.firstAt, closedWhy: f.closedWhy }));
    return (task.sections?.decisions ?? []).map((text, i) => ({ id: `${task.id}-${i}`, title: text, why: null, at: null, closedWhy: null }));
  });
}

function linkLabel(f) {
  const text = (f.ref || f.text || "").replace(URL_IN_TEXT, "").trim();
  return text || f.spans?.[0]?.url || "";
}

function linksOf(doc) {
  return doc.tasks.flatMap((task) => {
    const facts = factsIn(task, DOC.links);
    if (facts.length) return facts.map((f) => ({ label: linkLabel(f), url: f.spans?.[0]?.url ?? null }));
    return (task.sections?.links ?? []).map((text) => ({ label: text, url: null }));
  });
}

function laneOf(l) {
  return {
    terminal: l.pane, agent: l.agent, name: l.heading || l.title || l.pane, status: laneStatus(l) ?? STATUS.unknown,
    contextPercent: l.contextPercent ?? null, window: l.context?.window ?? null, tokens: l.context?.tokens ?? null,
    hint: l.compaction?.hint ?? null, stage: l.compaction?.stage ?? null, branch: l.git?.branch ?? l.branch ?? null,
  };
}

export function briefOf(doc, seen) {
  const goal = doc.tasks.map((t) => t.sections?.goal).find(Boolean) ?? "";
  return {
    goal, needCards: needCards(doc), now: listOf(doc, DOC.now, DOC.now), next: listOf(doc, DOC.next, DOC.next), decisions: decisionsOf(doc),
    links: linksOf(doc), lanes: (doc.lanes ?? []).map(laneOf), stories: doc.tasks.map((t) => t.story).filter(Boolean),
    curating: doc.tasks.some((t) => t.curating === YES), session: doc.session ?? null, events: eventsOf(doc), breaks: breaksOf(doc),
    cuts: doc.cuts ?? [], zone: doc.zone || FALLBACK_ZONE, banner: since(doc, seen), stale: doc.versions?.stale === YES, error: doc.error ?? null,
  };
}
