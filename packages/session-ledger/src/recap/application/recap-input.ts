import type { Lane } from '#src/recap/domain/lane-shape.ts';
import type { LaneRepo } from '#src/ports/lane-repo.ts';
import type { RecapInput, InputAgent, InputNote } from '#src/ports/recap-input.ts';
import type { Count } from '#src/contract/kernel.ts';
import { brand, type Brand } from '#src/recap/domain/brand.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { isScreenSource } from '#src/ports/transcript-source.ts';
import type { LaneCursor } from '#src/ports/recap-records.ts';
import type { Chunk } from '#src/ports/transcripts.ts';
import type { TaskShape } from '#src/recap/domain/grouping.ts';
import type { WriterView } from '#src/recap/domain/writer-view.ts';
import { numbered, severalOf } from './ledger-input.ts';
import type { Numbering, TaskFacts } from './ledger-input.ts';
import { hintOf } from './lane-hints.ts';

export type Fresh = Brand<boolean, 'Fresh'>;

export const FRESH = brand<boolean, 'Fresh'>(true);
export const SEEN_BEFORE = brand<boolean, 'Fresh'>(false);

export interface Observed {
    readonly lane: Lane;
    readonly cursor: LaneCursor;
    readonly chunk: Chunk | null;
    readonly fresh: Fresh;
}

const count = brand<number, 'Count'>;
const textOf = brand<string, 'Text'>;

const idOf = (index: Count): Text => brand<string, 'Text'>(`a${index + 1}`);

function notesOf(seen: Observed, agent: Text): readonly InputNote[] {
    const all = seen.chunk?.notes ?? [];
    const found: readonly InputNote[] = all.filter((note, index) => !all.slice(index + 1).some((later) => later.kind === note.kind)).map((note) => ({ kind: note.kind, at: note.at, text: note.text, agent }));
    const left = seen.cursor.claudeRecap;
    return seen.fresh && left !== null && !found.some((note) => note.kind === 'away_summary') ? [{ kind: 'away_summary', at: null, text: left, agent }, ...found] : found;
}

export interface InputWorld {
    readonly tab: Text;
    readonly repos: LaneRepo;
    readonly now: Instant;
    readonly tasks: readonly TaskShape[];
    readonly facts: readonly TaskFacts[];
    readonly writerView: WriterView;
}

export interface Built {
    readonly input: RecapInput;
    readonly numbering: Numbering;
}

export async function inputOf(seen: readonly Observed[], world: InputWorld): Promise<Built> {
    const agents: InputAgent[] = await Promise.all(seen.map(async (one, index) => ({
        id: idOf(count(index)), kind: one.lane.agent, label: textOf(one.cursor.title ?? ''), pane: one.lane.pane,
        source: isScreenSource(one.cursor.transcript) ? 'screen' as const : 'transcript' as const,
        ...(await hintOf(one.lane, one.chunk?.entries ?? [], world.repos)),
    })));
    const numbering = numbered(world.facts, agents, severalOf(world.facts.length > 1), world.writerView, world.now);
    const input: RecapInput = {
        tab: { id: world.tab, now: world.now, zone: textOf(Intl.DateTimeFormat().resolvedOptions().timeZone) },
        agents,
        tasks: seen.length > 1 ? world.tasks.map(({ id, name, lanes }) => ({ id: textOf(id), name: textOf(name), lanes: lanes.map(brand<string, 'PaneId'>) })) : [],
        ledgers: numbering.ledgers,
        notes: seen.flatMap((one, index) => notesOf(one, idOf(count(index)))),
        transcripts: seen.flatMap((one, index) => (one.chunk === null ? [] : [{ agent: idOf(count(index)), entries: one.chunk.entries }])),
    };
    return { input, numbering };
}
