import { ELLIPSIS, NAME } from "./constants.js";

const flat = (text) => String(text ?? "").replace(NAME.markup, "").replace(/\s+/g, " ").trim();

export function clipName(text, max = NAME.max) {
  const chars = Array.from(flat(text));
  if (chars.length <= max) return chars.join("");
  const head = chars.slice(0, max - 1).join("");
  const space = head.lastIndexOf(" ");
  const cut = space >= NAME.minCut ? head.slice(0, space) : head;
  return `${cut.replace(/[\s,;:.\-]+$/, "")}${ELLIPSIS}`;
}

export function storyTitle(tasks) {
  const stories = (Array.isArray(tasks) ? tasks : []).map((t) => t?.story).filter((s) => s && typeof s.text === "string" && flat(s.text));
  const latest = stories.toSorted((a, b) => (b.at ?? 0) - (a.at ?? 0))[0];
  if (!latest) return "";
  const line = flat(latest.text.split("\n").find((l) => flat(l)) ?? "");
  const first = NAME.sentence.exec(line)?.[1] ?? line;
  return clipName(first.replace(/[.!?]+$/, ""));
}

export function sessionName({ tasks, topic, agentTitle, label, id }) {
  const candidates = [storyTitle(tasks), topic && topic !== id ? clipName(topic) : "", clipName(agentTitle), clipName(label)];
  return candidates.find(Boolean) ?? clipName(id);
}
