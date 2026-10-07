// Which lanes work on which task. The grouping is sticky: it is kept from one run to the next, lanes come and go. A new lane joins the
// task of the lanes that work in the same place (the repository, else the folder); in a place of its own it is a task of its own.
import type { RecapTask } from './tasks.ts';

/** A task as the grouping knows it: no recap, just who works on it. */
export type TaskShape = Pick<RecapTask, 'id' | 'name' | 'lanes'>;

/** A lane as the grouping sees it: where it works (the repository's top-level folder, else its working folder; null: unknown). */
export interface PlacedLane {
    readonly pane: string;
    readonly place: string | null;
}

const folderOf = (place: string | null): string => (place ?? '').split('/').findLast((part) => part !== '') ?? '';

const nextKey = (taken: readonly string[]): string =>
    `t${taken.reduce((most, id) => Math.max(most, Number(/^t(\d+)$/.exec(id)?.[1] ?? 0)), 0) + 1}`;

interface Draft {
    id: string;
    name: string;
    lanes: string[];
}

/** Put `lane` in the draft task of the lanes that work in its place; else in a task of its own (an unknown place joins the first task). */
function seat(drafts: Draft[], lane: PlacedLane, world: { readonly places: ReadonlyMap<string, string | null>; readonly taken: readonly string[]; readonly reuse: string | null }): void {
    const home = drafts.find((draft) => lane.place !== null && draft.lanes.some((pane) => world.places.get(pane) === lane.place)) ?? (lane.place === null ? drafts[0] : undefined);
    if (home !== undefined) {
        home.lanes.push(lane.pane);
        return;
    }
    drafts.push({ id: drafts.length === 0 && world.reuse !== null ? world.reuse : nextKey([...world.taken, ...drafts.map((draft) => draft.id)]), name: '', lanes: [lane.pane] });
}

/** Several tasks: a task with no name is named by its first lane's folder. One task: none has a name. */
function named(drafts: readonly Draft[], places: ReadonlyMap<string, string | null>): readonly TaskShape[] {
    const nameOf = (draft: Draft): string => (draft.name === '' ? folderOf(places.get(draft.lanes[0] ?? '') ?? null) : draft.name);
    return drafts.map((draft) => ({ id: draft.id, lanes: draft.lanes, name: drafts.length === 1 ? '' : nameOf(draft) }));
}

/**
 * The previous grouping, kept: a closed lane leaves its task, a task left with no lane is gone, and a lane no task holds goes where
 * `place` says. With no grouping yet, the lanes are grouped the same way. When every lane of a tab's only task is gone, the lanes that
 * come next continue that task (its facts stay with it). A key a task of the tab has ever used (`retired`) is never given to another.
 */
export function keptGrouping(previous: readonly TaskShape[], lanes: readonly PlacedLane[], retired: readonly string[] = []): readonly TaskShape[] {
    const panes = new Set(lanes.map((lane) => lane.pane));
    const places = new Map(lanes.map((lane) => [lane.pane, lane.place]));
    const drafts: Draft[] = previous.map((task) => ({ id: task.id, name: task.name, lanes: task.lanes.filter((pane) => panes.has(pane)) })).filter((task) => task.lanes.length > 0);
    const reuse = drafts.length === 0 && previous.length === 1 ? (previous[0]?.id ?? null) : null;
    for (const lane of lanes.filter((each) => !drafts.some((draft) => draft.lanes.includes(each.pane)))) {
        seat(drafts, lane, { places, taken: [...retired, ...previous.map((task) => task.id)], reuse });
    }
    return named(drafts, places);
}
