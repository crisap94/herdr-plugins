import type { PaneId } from './lane-shape.ts';
import type { RecapTask } from './tasks.ts';
import { textOf, type Text } from './text.ts';

export type TaskShape = Pick<RecapTask, 'id' | 'name' | 'lanes'>;

export interface PlacedLane { readonly pane: PaneId; readonly place: Text | null; }

const folderOf = (place: Text | null): Text => textOf((place ?? '').split('/').findLast((part) => part !== '') ?? '');

const nextKey = (taken: readonly Text[]): Text => textOf(`t${taken.reduce((most, id) => Math.max(most, Number(/^t(\d+)$/.exec(id)?.[1] ?? 0)), 0) + 1}`);

interface Draft { id: Text; name: Text; lanes: PaneId[]; }

interface Placing { readonly places: ReadonlyMap<PaneId, Text | null>; readonly taken: readonly Text[]; readonly reuse: Text | null; }

function seat(drafts: Draft[], lane: PlacedLane, world: Placing): void {
    const home = drafts.find((draft) => lane.place !== null && draft.lanes.some((pane) => world.places.get(pane) === lane.place)) ?? (lane.place === null ? drafts[0] : undefined);
    if (home !== undefined) return void home.lanes.push(lane.pane);
    drafts.push({ id: drafts.length === 0 && world.reuse !== null ? world.reuse : nextKey([...world.taken, ...drafts.map((draft) => draft.id)]), name: textOf(''), lanes: [lane.pane] });
}

function named(drafts: readonly Draft[], places: ReadonlyMap<PaneId, Text | null>): readonly TaskShape[] {
    const firstPlace = (draft: Draft): Text | null => ((first) => (first === undefined ? null : (places.get(first) ?? null)))(draft.lanes[0]);
    const nameOf = (draft: Draft): Text => (draft.name === '' ? folderOf(firstPlace(draft)) : draft.name);
    return drafts.map((draft) => ({ id: draft.id, lanes: draft.lanes, name: drafts.length === 1 ? textOf('') : nameOf(draft) }));
}

export function keptGrouping(previous: readonly TaskShape[], lanes: readonly PlacedLane[], retired: readonly Text[] = []): readonly TaskShape[] {
    const panes = new Set(lanes.map((lane) => lane.pane));
    const places = new Map(lanes.map((lane) => [lane.pane, lane.place]));
    const drafts: Draft[] = previous.map((task) => ({ id: task.id, name: task.name, lanes: task.lanes.filter((pane) => panes.has(pane)) })).filter((task) => task.lanes.length > 0);
    const reuse = drafts.length === 0 && previous.length === 1 ? (previous[0]?.id ?? null) : null;
    for (const lane of lanes.filter((each) => !drafts.some((draft) => draft.lanes.includes(each.pane)))) {
        seat(drafts, lane, { places, taken: [...retired, ...previous.map((task) => task.id)], reuse });
    }
    return named(drafts, places);
}
