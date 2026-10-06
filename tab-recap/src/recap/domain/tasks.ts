// Tasks within a tab: which lanes work on the same thing, and how sticky that grouping is. Pure.
import { NO_SECTIONS } from './shape.ts';
import type { RecapSections } from './shape.ts';

/** One piece of work in a tab and its one recap. `sections` is null (and `markdown` all there is) for a recap stored before the fixed structure. */
export interface RecapTask {
    readonly id: string;
    /** blank when the tab has a single task */
    readonly name: string;
    readonly lanes: readonly string[];
    readonly sections: RecapSections | null;
    /** the sections drawn in the recap language */
    readonly markdown: string;
}

/** A task as the writer proposed it. */
export interface Proposed {
    readonly name: string;
    readonly lanes: readonly string[];
    readonly sections: RecapSections;
}

/** What the writer answered: the tasks, and, when it moved a lane from the task it was in, why (`regroup`). */
export interface Proposal {
    readonly tasks: readonly Proposed[];
    readonly regroup: string;
}

/** A task decided on: an id (kept while the grouping is kept), what the writer said about it. */
export interface Settled extends Proposed {
    readonly id: string;
}

const overlap = (a: readonly string[], b: ReadonlySet<string>): number => a.filter((pane) => b.has(pane)).length;

/** Each pane in at most one proposed task (the first that names it), only panes that exist; a pane nobody named joins the first task. */
export function tidied(proposal: Proposal, panes: readonly string[]): readonly Proposed[] {
    const taken = new Set<string>();
    const tasks = proposal.tasks.flatMap((task) => {
        const lanes = task.lanes.filter((pane) => panes.includes(pane) && !taken.has(pane));
        lanes.forEach((pane) => taken.add(pane));
        return lanes.length === 0 ? [] : [{ ...task, lanes }];
    });
    const left = panes.filter((pane) => !taken.has(pane));
    const [first, ...rest] = tasks;
    return first === undefined ? [] : [{ ...first, lanes: [...first.lanes, ...left] }, ...rest];
}

/** The grouping as a comparable value: the sets of lanes, sorted. */
const shape = (groups: readonly (readonly string[])[]): string =>
    JSON.stringify(groups.map((lanes) => lanes.toSorted()).toSorted((a, b) => (a[0] ?? '').localeCompare(b[0] ?? '')));

const nextId = (previous: readonly RecapTask[]): (() => string) => {
    let n = previous.reduce((most, task) => Math.max(most, Number(/^t(\d+)$/.exec(task.id)?.[1] ?? 0)), 0);
    return (): string => `t${(n += 1)}`;
};

/** The proposed task a previous task most overlaps (by lanes it still has); null when none shares a lane. */
function closest(task: RecapTask, among: readonly Proposed[]): Proposed | null {
    const lanes = new Set(task.lanes);
    const scored = among.map((candidate) => ({ candidate, score: overlap(candidate.lanes, lanes) })).filter((s) => s.score > 0);
    return scored.toSorted((a, b) => b.score - a.score)[0]?.candidate ?? null;
}

/** The writer's grouping, adopted: an unchanged set of lanes keeps its id (and name when the writer gave none). */
function adopted(previous: readonly RecapTask[], proposed: readonly Proposed[]): readonly Settled[] {
    const fresh = nextId(previous);
    const used = new Set<string>();
    return proposed.map((task) => {
        const same = previous.find((was) => !used.has(was.id) && shape([was.lanes]) === shape([task.lanes]));
        const near = same ?? previous.find((was) => !used.has(was.id) && closest(was, [task]) !== null);
        if (near !== undefined) {
            used.add(near.id);
        }
        return { ...task, id: near?.id ?? fresh(), name: task.name === '' ? (near?.name ?? '') : task.name };
    });
}

/** The previous grouping, kept: closed lanes leave, a new lane joins the task the writer put it with, new lanes the writer set apart become a task. */
function kept(previous: readonly RecapTask[], proposed: readonly Proposed[], panes: readonly string[]): readonly Settled[] {
    const known = new Set(previous.flatMap((task) => task.lanes));
    const fresh = nextId(previous);
    const olds = previous.flatMap((was) => {
        const lanes = was.lanes.filter((pane) => panes.includes(pane));
        const said = closest(was, proposed);
        const joining = proposed.filter((task) => task === said).flatMap((task) => task.lanes.filter((pane) => !known.has(pane)));
        const agreed = said !== null && said.name !== '' && shape([said.lanes.filter((pane) => known.has(pane))]) === shape([lanes]);
        return lanes.length === 0 ? [] : [{ id: was.id, name: agreed ? said.name : was.name, lanes: [...lanes, ...joining], sections: said?.sections ?? was.sections ?? EMPTY }];
    });
    const placed = new Set(olds.flatMap((task) => task.lanes));
    const apart = proposed.flatMap((task) => {
        const lanes = task.lanes.filter((pane) => !placed.has(pane));
        return lanes.length === 0 ? [] : [{ id: fresh(), name: task.name, lanes, sections: task.sections }];
    });
    return [...olds, ...apart];
}

const EMPTY: RecapSections = NO_SECTIONS;

/**
 * Whether the writer moved lanes that were already grouped, without saying why. "Unchanged" is judged on the lanes
 * both groupings know: a new lane joining a task, or a lane closing, is not a regrouping.
 */
export function unexplained(previous: readonly RecapTask[], proposal: Proposal, panes: readonly string[]): boolean {
    const known = new Set(previous.flatMap((task) => task.lanes).filter((pane) => panes.includes(pane)));
    const onKnown = (groups: readonly { readonly lanes: readonly string[] }[]): readonly (readonly string[])[] =>
        groups.map((group) => group.lanes.filter((pane) => known.has(pane))).filter((lanes) => lanes.length > 0);
    return proposal.regroup === '' && previous.length > 0 && shape(onKnown(previous)) !== shape(onKnown(tidied(proposal, panes)));
}

/**
 * HYSTERESIS: the previous grouping stays unless the writer marks a change with evidence (`regroup`). A tab with
 * one task has no task name.
 */
export function settle(previous: readonly RecapTask[], proposal: Proposal, panes: readonly string[]): readonly Settled[] {
    const proposed = tidied(proposal, panes);
    const result = unexplained(previous, proposal, panes) ? kept(previous, proposed, panes) : adopted(previous, proposed);
    return result.length === 1 ? result.map((task) => ({ ...task, name: '' })) : result;
}
