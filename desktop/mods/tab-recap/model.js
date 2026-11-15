import { agents, spaces } from "herdr";
import { STATUS, STATUS_ORDER } from "./constants.js";

export function liveTabs() {
  return spaces().flatMap((space) => space.tabs.map((tab) => ({ id: tab.id, name: tab.name, space: space.name, spaceId: space.id, status: tab.status })));
}

const titleOf = (tab) => agents().find((a) => a.tab === tab)?.title ?? "";

export function tabRows(index) {
  const byTab = new Map(index.map((r) => [r.tab, r]));
  return liveTabs().filter((t) => t.status !== null || byTab.has(t.id)).map((t) => {
    const row = byTab.get(t.id);
    return {
      id: t.id, name: row?.name ?? t.name, space: t.space, spaceId: t.spaceId, status: t.status ?? (STATUS_ORDER.includes(row?.status) ? row.status : STATUS.idle),
      headline: row?.headline || titleOf(t.id), soft: !row?.headline, needs: row?.needs ?? 0, waitingSince: row?.waitingSince ?? null,
      recapAt: row?.recapAt ?? null, at: row?.at ?? 0, writing: row?.writing ?? "", contextPercent: row?.contextPercent ?? null,
      hintPercent: row?.hintPercent ?? null, laneCount: row?.laneCount ?? 0, lanes: row?.lanes ?? [], hasRow: Boolean(row),
    };
  });
}

export function laneStatus(lane) {
  return agents().find((a) => a.address === lane.pane)?.status ?? lane.status;
}
