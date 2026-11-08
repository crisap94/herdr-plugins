import { INDEX_LANES_MAX, STATUS, WRITING } from "./constants.js";

const isFields = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v, fallback = "") => (typeof v === "string" ? v : fallback);

function parseLane(input) {
  if (!isFields(input)) return null;
  return {
    terminal: str(input.terminal), agent: str(input.agent), status: str(input.status, STATUS.unknown), name: str(input.name),
    contextPercent: num(input.contextPercent), hint: input.hint === true, stage: typeof input.stage === "string" ? input.stage : null,
  };
}

function parseRow(input) {
  if (!isFields(input) || typeof input.tab !== "string" || !input.tab) return null;
  const lanes = (Array.isArray(input.lanes) ? input.lanes : []).map(parseLane).filter(Boolean).slice(0, INDEX_LANES_MAX);
  return {
    tab: input.tab, name: str(input.name, input.tab), status: str(input.status, STATUS.unknown), at: num(input.at) ?? 0,
    recapAt: num(input.recapAt), writing: input.writing === WRITING ? WRITING : "", headline: str(input.headline),
    needs: num(input.needs) ?? 0, waitingSince: num(input.waitingSince), contextPercent: num(input.contextPercent),
    hintPercent: num(input.hintPercent), laneCount: num(input.laneCount) ?? lanes.length, lanes,
  };
}

export function parseIndex(text) {
  const parsed = JSON.parse(text);
  const tabs = isFields(parsed) && Array.isArray(parsed.tabs) ? parsed.tabs : [];
  return tabs.map(parseRow).filter(Boolean);
}
