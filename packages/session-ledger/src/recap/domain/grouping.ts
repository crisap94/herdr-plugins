import type { SessionKey } from './followed-session-shape.ts';
import type { RecapTask } from './tasks.ts';
import { textOf, type Text } from './text.ts';

export type TaskShape = Pick<RecapTask, 'id' | 'name' | 'sessions'>;

export interface PlacedLane { readonly key: SessionKey; readonly place: Text | null; }

const folderOf = (place: Text | null): Text => textOf((place ?? '').split('/').findLast((part) => part !== '') ?? '');

const nextKey = (taken: readonly Text[]): Text => textOf(`t${taken.reduce((most, id) => Math.max(most, Number(/^t(\d+)$/.exec(id)?.[1] ?? 0)), 0) + 1}`);

interface Draft { id: Text; name: Text; sessions: SessionKey[]; }

interface Placing { readonly places: ReadonlyMap<SessionKey, Text | null>; readonly taken: readonly Text[]; readonly reuse: Text | null; }

function seat(drafts: Draft[], lane: PlacedLane, world: Placing): void {
    const home = drafts.find((draft) => lane.place !== null && draft.sessions.some((member) => world.places.get(member) === lane.place)) ?? (lane.place === null ? drafts[0] : undefined);
    if (home !== undefined) return void home.sessions.push(lane.key);
    drafts.push({ id: drafts.length === 0 && world.reuse !== null ? world.reuse : nextKey([...world.taken, ...drafts.map((draft) => draft.id)]), name: textOf(''), sessions: [lane.key] });
}

function named(drafts: readonly Draft[], places: ReadonlyMap<SessionKey, Text | null>): readonly TaskShape[] {
    const firstPlace = (draft: Draft): Text | null => ((first) => (first === undefined ? null : (places.get(first) ?? null)))(draft.sessions[0]);
    const nameOf = (draft: Draft): Text => (draft.name === '' ? folderOf(firstPlace(draft)) : draft.name);
    return drafts.map((draft) => ({ id: draft.id, sessions: draft.sessions, name: drafts.length === 1 ? textOf('') : nameOf(draft) }));
}

export function keptGrouping(previous: readonly TaskShape[], lanes: readonly PlacedLane[], retired: readonly Text[] = []): readonly TaskShape[] {
    const kept = new Set(lanes.map((lane) => lane.key));
    const places = new Map(lanes.map((lane) => [lane.key, lane.place]));
    const drafts: Draft[] = previous.map((task) => ({ id: task.id, name: task.name, sessions: task.sessions.filter((member) => kept.has(member)) })).filter((task) => task.sessions.length > 0);
    const reuse = drafts.length === 0 && previous.length === 1 ? (previous[0]?.id ?? null) : null;
    for (const lane of lanes.filter((each) => !drafts.some((draft) => draft.sessions.includes(each.key)))) {
        seat(drafts, lane, { places, taken: [...retired, ...previous.map((task) => task.id)], reuse });
    }
    return named(drafts, places);
}
