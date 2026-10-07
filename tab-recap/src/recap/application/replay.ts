// Replaying a stored transcript: the extractor is run for every turn of it, from an empty ledger, as it would have been live.
// Everything goes into the store it is given (a scratch one); the live state is never named here.
import type { Ledger } from '#src/ports/ledger.ts';
import type { LaneRepo } from '#src/ports/lane-repo.ts';
import type { RecapRecords } from '#src/ports/recap-records.ts';
import type { Summarizer } from '#src/ports/summarizer.ts';
import { UNREAD } from '#src/ports/transcripts.ts';
import type { ChunkResult, Entry, Located, PromptResult, Transcripts } from '#src/ports/transcripts.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { RecapJob } from './recap-job.ts';

/** One turn: a prompt of the operator and everything up to the next one (the first window also holds what came before the first prompt). */
export function windowsOf(entries: readonly Entry[]): readonly (readonly Entry[])[] {
    const windows: Entry[][] = [];
    for (const entry of entries) {
        const [last] = windows.slice(-1);
        if (last === undefined || (entry.role === 'user' && entry.queued !== true && last.some((each) => each.role === 'user'))) {
            windows.push([entry]);
        } else {
            last.push(entry);
        }
    }
    return windows;
}

export interface ReplayDeps {
    /** the real reader of the transcript's kind */
    readonly reader: Transcripts;
    readonly summarizer: () => Summarizer;
    /** the scratch store: where the facts of the replay go */
    readonly records: RecapRecords;
    readonly ledger: Ledger;
    readonly repos: LaneRepo;
    readonly language: string;
    readonly log: (line: string) => void;
}

export interface Replayed {
    readonly windows: number;
    readonly facts: readonly Fact[];
}

/** Where the replay stands: the turn being run and the instant it is at. */
interface Position {
    turn: number;
    now: number;
}

const noPrompt = (): Promise<PromptResult> => Promise.resolve({ kind: 'prompt', text: null });

/** The instant a turn ended at: the time of its last entry that has one, but never before the instant it started from. */
const endOf = (window: readonly Entry[] | undefined, from: number): number => Math.max(from + 1, window?.findLast((entry) => entry.at !== undefined)?.at ?? from + 1);

/** A reader that serves the window of the turn being run, as if the transcript had just grown by it. */
function windowed(base: Transcripts, file: string, windows: readonly (readonly Entry[])[], at: Position): Transcripts {
    const read = (): Promise<ChunkResult> => Promise.resolve({
        kind: 'chunk', entries: windows[at.turn] ?? [], title: null, lastPrompt: null, claudeRecap: null, notes: [], position: { cursor: at.turn + 1, tail: null }, grew: true,
    });
    const locate = (): Promise<Located> => Promise.resolve({ kind: 'located', source: file });
    return { agent: base.agent, locate, latestPrompt: noPrompt, read };
}

/** Read `file` from the start, then one extractor run per turn, then the facts that are left. Throws a sentence when the file cannot be read. */
export async function replay(deps: ReplayDeps, file: string, label: string, size: number): Promise<Replayed> {
    const whole = await deps.reader.read(file, UNREAD, size);
    if (isUnknown(whole)) {
        throw new Error(`cannot read ${file}: ${saying(whole.why)}`);
    }
    const windows = windowsOf(whole.entries);
    const at: Position = { turn: 0, now: windows.at(0)?.at(0)?.at ?? 1 };
    const job = new RecapJob({
        transcripts: [windowed(deps.reader, file, windows, at)], records: deps.records, ledger: deps.ledger, repos: deps.repos, summarizer: deps.summarizer,
        language: (): string => deps.language, log: deps.log, clock: { now: (): Instant => instant(at.now) },
    });
    const lane = laneFrom({ paneId: 'replay:p1', tabId: label, workspaceId: 'replay', agent: deps.reader.agent, session: 'replay' });
    for (; at.turn < windows.length; at.turn += 1) {
        at.now = endOf(windows[at.turn], at.now);
        await job.refreshNow(tabId(label), [lane]);
    }
    const tasks = deps.records.readRecap(label)?.tasks ?? [];
    return { windows: windows.length, facts: tasks.flatMap((task) => deps.ledger.allOf({ tab: label, key: task.id })) };
}
