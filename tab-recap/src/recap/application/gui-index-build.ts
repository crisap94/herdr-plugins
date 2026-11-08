import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { HEADLINE_MAX, INDEX_LANES_MAX, LANE_NAME_MAX, type GuiIndexLane, type GuiIndexRow, type GuiLane, type GuiTab, type GuiTask } from '#src/recap/domain/gui-tab.ts';
import { NO, YES } from '#src/recap/domain/gui-tab-parts.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { oldestNeedOf, openNeedsOf, waitingSinceOf } from './gui-index-needs.ts';

const URGENCY: readonly string[] = ['blocked', 'done', 'working', 'idle', 'unknown'];
const ELLIPSIS = '…';
const GAP = /\s+/g;
const SPACE = ' ';
const EMPTY = must(parseText(''));
const ONE = must(parseCount(1));

function clip(raw: Text, max: Count): Text {
    const flat = raw.replace(GAP, SPACE).trim();
    return must(parseText(flat.length > max ? `${flat.slice(0, max - ONE).trimEnd()}${ELLIPSIS}` : flat));
}

const byUrgency = (lanes: readonly GuiLane[]): readonly GuiLane[] => [
    ...URGENCY.flatMap((status) => lanes.filter((lane) => lane.status === status)),
    ...lanes.filter((lane) => !URGENCY.includes(lane.status)),
];

function nowOf(task: GuiTask): Text | undefined {
    const id = task.regions.now[0];
    const fact = id === undefined ? undefined : task.facts.find((each) => each.id === id && each.state === 'open');
    return fact === undefined ? task.sections.now[0] : fact.text;
}

function headlineOf(tab: GuiTab): Text {
    const need = oldestNeedOf(openNeedsOf(tab));
    if (need !== null) { return clip(need.text, HEADLINE_MAX); }
    const now = tab.tasks.map(nowOf).find((text) => text !== undefined);
    if (now !== undefined) { return clip(now, HEADLINE_MAX); }
    const lane = byUrgency(tab.lanes).find((each) => each.heading.trim() !== '');
    return clip(lane === undefined ? EMPTY : lane.heading, HEADLINE_MAX);
}

const higher = (best: Count | null, value: Count): Count => (best === null || value > best ? value : best);

const contextOf = (lanes: readonly GuiLane[]): Count | null => lanes.flatMap((lane) => lane.contextPercent ?? []).reduce<Count | null>(higher, null);

const laneRowOf = (lane: GuiLane): GuiIndexLane => ({
    terminal: lane.pane, agent: lane.agent, status: lane.status, name: clip(lane.heading, LANE_NAME_MAX),
    contextPercent: lane.contextPercent, hint: lane.compaction.hint === null ? NO : YES, stage: lane.compaction.stage?.stage ?? null,
});

export function guiIndexRow(tab: GuiTab): GuiIndexRow {
    const needs = openNeedsOf(tab);
    return {
        tab: tab.tab, name: tab.name, status: tab.status, at: tab.at, recapAt: tab.recapAt, writing: tab.writing, headline: headlineOf(tab),
        needs: must(parseCount(needs.length)), waitingSince: waitingSinceOf(tab, needs), contextPercent: contextOf(tab.lanes), hintPercent: tab.compactHint,
        laneCount: must(parseCount(tab.lanes.length)), lanes: byUrgency(tab.lanes).slice(0, INDEX_LANES_MAX).map(laneRowOf),
    };
}
