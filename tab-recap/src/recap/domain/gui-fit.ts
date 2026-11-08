import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from './count.ts';
import type { GuiCut, GuiCutPart, GuiFact, GuiRegions, GuiTimelineRow } from './gui-tab-parts.ts';
import type { GuiLane, GuiSections, GuiTab, GuiTask } from './gui-tab-types.ts';
import { parseText, type NonEmptyText, type Text } from './text.ts';

export const PROMPT_BYTES: Count = must(parseCount(2048));
export const FACT_TEXT_BYTES: Count = must(parseCount(4096));
export const TIMELINE_FLOOR_FIRST: Count = must(parseCount(200));
export const TIMELINE_FLOOR_SECOND: Count = must(parseCount(40));
export const DECISIONS_FLOOR: Count = must(parseCount(50));
export const TOO_LARGE_ERROR: Text = must(parseText('the document was too large: parts of it were left out, see cuts'));

const ELLIPSIS: Text = must(parseText('…'));
const REPLACEMENT: Text = must(parseText('�'));
const NOTHING: Text = must(parseText(''));

interface Trimmed {
    readonly task: GuiTask;
    readonly made: readonly GuiCut[];
}

type Step = (tab: GuiTab) => GuiTab;

const cut = <T>(part: GuiCutPart, task: NonEmptyText | null, kept: readonly T[], total: readonly T[]): GuiCut => ({ part, task, kept: must(parseCount(kept.length)), total: must(parseCount(total.length)) });

const sizeOf = (tab: GuiTab): Count => must(parseCount(Buffer.byteLength(JSON.stringify(tab))));

function clipped(text: Text, bytes: Count): Text {
    if (Buffer.byteLength(text) <= bytes) { return text; }
    const head = Buffer.from(text).subarray(0, Math.max(0, bytes - Buffer.byteLength(ELLIPSIS))).toString('utf8');
    return must(parseText(`${head.endsWith(REPLACEMENT) ? head.slice(0, -1) : head}${ELLIPSIS}`));
}

function clippedPrompts(tab: GuiTab): GuiTab {
    const lanes = tab.lanes.map((lane): GuiLane => (lane.lastPrompt === null ? lane : { ...lane, lastPrompt: clipped(lane.lastPrompt, PROMPT_BYTES) }));
    const changed = lanes.filter((lane, at) => lane.lastPrompt !== tab.lanes[at]?.lastPrompt);
    const unchanged = lanes.filter((lane, at) => lane.lastPrompt === tab.lanes[at]?.lastPrompt && lane.lastPrompt !== null);
    return changed.length === 0 ? tab : { ...tab, lanes, cuts: [...tab.cuts, cut('prompt', null, unchanged, [...unchanged, ...changed])] };
}

function pruned(task: GuiTask, regions: GuiRegions, timeline: readonly GuiTimelineRow[]): GuiTask {
    const ids = [...regions.goal, ...regions.now, ...regions.needs, ...regions.decisions, ...regions.next, ...regions.rules, ...regions.links];
    const kept = new Set([...ids, ...timeline.flatMap((row) => (row.kind === 'fact' ? [row.fact] : []))]);
    return { ...task, regions, timeline, facts: task.facts.filter((fact) => kept.has(fact.id)) };
}

function trimmedTimeline(task: GuiTask, floor: Count): Trimmed {
    const facts = task.timeline.filter((row) => row.kind === 'fact');
    if (facts.length <= floor) { return { task, made: [] }; }
    const allowed = new Set(facts.slice(0, floor));
    const timeline = task.timeline.filter((row) => row.kind === 'break' || allowed.has(row));
    return { task: pruned(task, task.regions, timeline), made: [cut('timeline', task.id, [...allowed], facts)] };
}

const keyOf = (each: GuiCut): Text => must(parseText(`${each.part}:${each.task ?? ''}`));

function accumulated(before: readonly GuiCut[], made: readonly GuiCut[]): readonly GuiCut[] {
    const latest = new Map(made.map((each) => [keyOf(each), each]));
    const seen = new Set(before.map(keyOf));
    const merged = before.map((old) => ({ ...old, kept: latest.get(keyOf(old))?.kept ?? old.kept }));
    return [...merged, ...made.filter((each) => !seen.has(keyOf(each)))];
}

function withTasks(tab: GuiTab, step: (task: GuiTask) => Trimmed): GuiTab {
    const stepped = tab.tasks.map(step);
    return { ...tab, tasks: stepped.map((one) => one.task), cuts: accumulated(tab.cuts, stepped.flatMap((one) => one.made)) };
}

const timelineStep = (floor: Count): Step => (tab) => withTasks(tab, (task) => trimmedTimeline(task, floor));

const withoutMarkdown: Step = (tab) => withTasks(tab, (task): Trimmed => (task.markdown === NOTHING ? { task, made: [] } : { task: { ...task, markdown: NOTHING }, made: [cut('markdown', task.id, [], [task.markdown])] }));

function clippedFact(fact: GuiFact): GuiFact {
    const text = clipped(fact.text, FACT_TEXT_BYTES);
    const why = fact.why === null ? null : clipped(fact.why, FACT_TEXT_BYTES);
    return text === fact.text && why === fact.why ? fact : { ...fact, text, why, spans: text === fact.text ? fact.spans : null };
}

const clippedFacts: Step = (tab) => withTasks(tab, (task): Trimmed => {
    const facts = task.facts.map(clippedFact);
    const changed = facts.filter((fact, at) => fact !== task.facts[at]);
    return { task: { ...task, facts }, made: changed.length === 0 ? [] : [cut('text', task.id, facts.filter((fact) => !changed.includes(fact)), facts)] };
});

function trimmedDecisions(task: GuiTask): Trimmed {
    const state = new Map(task.facts.map((fact) => [fact.id, fact.state]));
    const all = task.regions.decisions;
    const open = all.filter((id) => state.get(id) === 'open');
    const closed = all.filter((id) => state.get(id) !== 'open');
    const room = Math.max(0, DECISIONS_FLOOR - open.length);
    if (closed.length <= room) { return { task, made: [] }; }
    const allowed = new Set([...open, ...closed.slice(0, room)]);
    return { task: pruned(task, { ...task.regions, decisions: all.filter((id) => allowed.has(id)) }, task.timeline), made: [cut('decisions', task.id, [...allowed], all)] };
}

function minimal(tab: GuiTab): GuiTab {
    const dropped = tab.tasks.map((task) => cut('facts', task.id, [], task.facts));
    const regions: GuiRegions = { goal: [], now: [], needs: [], decisions: [], next: [], rules: [], links: [] };
    const sections: GuiSections = { goal: NOTHING, now: [], needs: [], done: [], decisions: [], next: [], links: [], rules: [] };
    const tasks = tab.tasks.map((task): GuiTask => ({ ...task, facts: [], timeline: [], markdown: NOTHING, story: null, regions, sections, needsWaitedMs: [] }));
    const lanes = tab.lanes.map((lane): GuiLane => ({ ...lane, notes: [] }));
    return { ...tab, tasks, lanes, breaks: [], warnings: [], claudeRecaps: [], error: TOO_LARGE_ERROR, cuts: accumulated(tab.cuts, dropped) };
}

const STEPS: readonly Step[] = [
    timelineStep(TIMELINE_FLOOR_FIRST),
    withoutMarkdown,
    timelineStep(TIMELINE_FLOOR_SECOND),
    clippedFacts,
    (tab) => withTasks(tab, trimmedDecisions),
    minimal,
];

export function fitGuiTab(tab: GuiTab, limit: Count): GuiTab {
    return STEPS.reduce((current, step) => (sizeOf(current) <= limit ? current : step(current)), clippedPrompts(tab));
}
