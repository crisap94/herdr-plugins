import type { RecapInput, InputAgent } from '#src/ports/recap-input.ts';
import { isScreenSource } from '#src/ports/transcript-source.ts';
import { numbered } from './ledger-input.ts';
import type { Numbering } from './ledger-input.ts';
import { hintOf } from './lane-hints.ts';
import { idOf, notesOf } from './legacy.ts';
import type { InputWorld, Observed } from './legacy.ts';

export type { InputWorld, Observed } from './legacy.ts';

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
    const numbering = numbered(world.facts, agents, world.facts.length > 1, world.writerView, world.now);
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
