import type { Lane } from '#src/recap/domain/lane.ts';
import type { LaneRepo } from '#src/ports/lane-repo.ts';
import type { RecapInput, InputAgent, InputNote } from '#src/ports/recap-input.ts';
import { isScreenSource } from '#src/ports/screens.ts';
import type { LaneCursor } from '#src/ports/recap-records.ts';
import type { Chunk } from '#src/ports/transcripts.ts';
import type { TaskShape } from '#src/recap/domain/grouping.ts';
import { numbered } from './ledger-input.ts';
import type { Numbering, TaskFacts } from './ledger-input.ts';
import { hintOf } from './lane-hints.ts';

export interface Observed {
    readonly lane: Lane;
    readonly cursor: LaneCursor;
    readonly chunk: Chunk | null;
    readonly fresh: boolean;
}

const idOf = (index: number): string => `a${index + 1}`;

function notesOf(seen: Observed, agent: string): readonly InputNote[] {
    const all = seen.chunk?.notes ?? [];
    const found: readonly InputNote[] = all.filter((note, index) => !all.slice(index + 1).some((later) => later.kind === note.kind)).map((note) => ({ kind: note.kind, at: note.at, text: note.text, agent }));
    const left = seen.cursor.claudeRecap;
    return seen.fresh && left !== null && !found.some((note) => note.kind === 'away_summary') ? [{ kind: 'away_summary', at: null, text: left, agent }, ...found] : found;
}

export interface InputWorld {
    readonly tab: string;
    readonly repos: LaneRepo;
    readonly now: number;
    readonly tasks: readonly TaskShape[];
    readonly facts: readonly TaskFacts[];
}

export interface Built {
    readonly input: RecapInput;
    readonly numbering: Numbering;
}

export async function inputOf(seen: readonly Observed[], world: InputWorld): Promise<Built> {
    const agents: InputAgent[] = await Promise.all(seen.map(async (one, index) => ({
        id: idOf(index), kind: String(one.lane.agent), label: one.cursor.title ?? '', pane: String(one.lane.pane),
        source: isScreenSource(one.cursor.transcript) ? 'screen' as const : 'transcript' as const,
        ...(await hintOf(one.lane, one.chunk?.entries ?? [], world.repos)),
    })));
    const numbering = numbered(world.facts, agents, world.facts.length > 1);
    const input: RecapInput = {
        tab: { id: world.tab, now: world.now, zone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        agents,
        tasks: seen.length > 1 ? world.tasks.map(({ id, name, lanes }) => ({ id, name, lanes })) : [],
        ledgers: numbering.ledgers,
        notes: seen.flatMap((one, index) => notesOf(one, idOf(index))),
        transcripts: seen.flatMap((one, index) => (one.chunk === null ? [] : [{ agent: idOf(index), entries: one.chunk.entries }])),
    };
    return { input, numbering };
}
