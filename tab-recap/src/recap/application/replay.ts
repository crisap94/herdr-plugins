import type { Enumerators } from '#src/ports/enumerators.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { LaneRepo } from '#src/ports/lane-repo.ts';
import type { RecapRecords } from '#src/ports/recap-records.ts';
import type { Summarizer } from '#src/ports/summarizer.ts';
import { UNREAD } from '#src/ports/transcripts.ts';
import type { ChunkResult, Entry, InFlightCapability, Located, PromptResult, Transcripts } from '#src/ports/transcripts.ts';
import { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { Fact } from '#src/recap/domain/fact.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Pipeline } from '#src/recap/domain/pipeline.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { RecapJob } from './recap-job.ts';
import type { RecapJobDeps } from './recap-job.ts';

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
    readonly reader: Transcripts;
    readonly summarizer: () => Summarizer;
    readonly records: RecapRecords;
    readonly ledger: Ledger;
    readonly repos: LaneRepo;
    readonly language: string;
    readonly log: (line: string) => void;
    readonly pipeline?: Pipeline;
    readonly enumerator?: () => Enumerators | null;
}

export interface Replayed {
    readonly windows: number;
    readonly facts: readonly Fact[];
    readonly costUsd: number;
}

interface Position {
    turn: number;
    now: number;
}

const noPrompt = (): Promise<PromptResult> => Promise.resolve({ kind: 'prompt', text: null });

const endOf = (window: readonly Entry[] | undefined, from: number): number => Math.max(from + 1, window?.findLast((entry) => entry.at !== undefined)?.at ?? from + 1);

function windowed(base: Transcripts, file: string, windows: readonly (readonly Entry[])[], at: Position): Transcripts {
    const read = (): Promise<ChunkResult> => Promise.resolve({
        kind: 'chunk', entries: windows[at.turn] ?? [], title: null, lastPrompt: null, claudeRecap: null, notes: [], position: { cursor: at.turn + 1, tail: null }, grew: true,
    });
    const locate = (): Promise<Located> => Promise.resolve({ kind: 'located', source: file });
    const inFlight: InFlightCapability = { kind: 'unsupported', why: 'windowed-reader' };
    return { agent: base.agent, locate, latestPrompt: noPrompt, read, inFlight };
}

function pipelineOf(deps: ReplayDeps): Pick<RecapJobDeps, 'pipeline' | 'enumerator'> {
    const chosen = deps.pipeline;
    return { ...(chosen === undefined ? {} : { pipeline: (): Pipeline => chosen }), ...(deps.enumerator === undefined ? {} : { enumerator: deps.enumerator }) };
}

export async function replay(deps: ReplayDeps, file: string, label: string, size: number): Promise<Replayed> {
    const whole = await deps.reader.read(file, UNREAD, size);
    if (isUnknown(whole)) {
        throw new Error(`cannot read ${file}: ${saying(whole.why)}`);
    }
    const windows = windowsOf(whole.entries);
    const at: Position = { turn: 0, now: windows.at(0)?.at(0)?.at ?? 1 };
    const job = new RecapJob({
        transcripts: new TranscriptRegistry({ [deps.reader.agent]: windowed(deps.reader, file, windows, at) }, null), records: deps.records, ledger: deps.ledger, repos: deps.repos, summarizer: deps.summarizer,
        language: (): string => deps.language, log: deps.log, clock: { now: (): Instant => instant(at.now) },
        ...pipelineOf(deps),
    });
    const lane = laneFrom({ paneId: 'replay:p1', tabId: label, workspaceId: 'replay', agent: deps.reader.agent, session: 'replay' });
    for (; at.turn < windows.length; at.turn += 1) {
        at.now = endOf(windows[at.turn], at.now);
        await job.refreshNow(tabId(label), [lane]);
    }
    const tasks = deps.records.readRecap(label)?.tasks ?? [];
    return { windows: windows.length, facts: tasks.flatMap((task) => deps.ledger.allOf({ tab: label, key: task.id })), costUsd: deps.records.readRecap(label)?.costUsd ?? 0 };
}
