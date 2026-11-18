import type { RecapTask } from './tasks.ts';

export type TaskShape = Pick<RecapTask, 'id' | 'name' | 'lanes'>;

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

function seat(drafts: Draft[], lane: PlacedLane, world: { readonly places: ReadonlyMap<string, string | null>; readonly taken: readonly string[]; readonly reuse: string | null }): void {
    const home = drafts.find((draft) => lane.place !== null && draft.lanes.some((pane) => world.places.get(pane) === lane.place)) ?? (lane.place === null ? drafts[0] : undefined);
    if (home !== undefined) {
        home.lanes.push(lane.pane);
        return;
    }
    drafts.push({ id: drafts.length === 0 && world.reuse !== null ? world.reuse : nextKey([...world.taken, ...drafts.map((draft) => draft.id)]), name: '', lanes: [lane.pane] });
}

function named(drafts: readonly Draft[], places: ReadonlyMap<string, string | null>): readonly TaskShape[] {
    const nameOf = (draft: Draft): string => (draft.name === '' ? folderOf(places.get(draft.lanes[0] ?? '') ?? null) : draft.name);
    return drafts.map((draft) => ({ id: draft.id, lanes: draft.lanes, name: drafts.length === 1 ? '' : nameOf(draft) }));
}

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
