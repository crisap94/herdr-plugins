import { checkedLedger, checkedRecords, knownOr, type GuardedLedger, type GuardedRecapRecords } from '#src/ports/guarded-reads.ts';
import type { LegacyEnumerator as Enumerator } from '@stateforge-labs/session-ledger';
import type { Workplaces } from '@stateforge-labs/session-ledger';
import type { LegacyWriter as Writer } from '@stateforge-labs/session-ledger';
import { UNREAD, cursorOf, grewOf, sourcePathOf } from '@stateforge-labs/session-ledger';
import type { ChunkResult, Entry, InFlightCapability, Located, PromptResult } from '@stateforge-labs/session-ledger';
import type { LegacySessionReader as SessionReader } from '@stateforge-labs/session-ledger';
import { TranscriptRegistry } from '@stateforge-labs/session-ledger';
import { capabilityWording } from '@stateforge-labs/session-ledger';
import { isUnknown } from '@stateforge-labs/session-ledger';
import { saying } from '#src/recap/domain/saying.ts';
import { must } from '@stateforge-labs/session-ledger';
import type { Count } from '@stateforge-labs/session-ledger';
import { parseCount } from '@stateforge-labs/session-ledger';
import type { PositiveCount } from '@stateforge-labs/session-ledger';
import { parsePositiveCount } from '@stateforge-labs/session-ledger';
import type { Fact, FactId } from '@stateforge-labs/session-ledger';
import type { SessionPath, ScopeId } from '#src/recap/domain/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Pipeline } from '@stateforge-labs/session-ledger';
import { parseText, textOf, type Text } from '@stateforge-labs/session-ledger';
import type { WriterView } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';
import type { Usd } from '@stateforge-labs/session-ledger';
import { parseUsd } from '@stateforge-labs/session-ledger';
import { pluginEngine } from '#src/engine/engine-adapter.ts';
import { tabRecaps, type TabRecaps } from '#src/engine/tab-recaps.ts';
import type { EngineModels, EngineSettings } from '@stateforge-labs/session-ledger';
import type { HarnessKind } from '#src/recap/domain/ids.ts';

export function mergedWindows(entries: readonly Entry[], mergeTurns: PositiveCount): readonly (readonly Entry[])[] {
    const windows: Entry[][] = [];
    for (const entry of entries) {
        const [last] = windows.slice(-1);
        if (last === undefined || (entry.role === 'user' && entry.queued !== true && last.some((each) => each.role === 'user'))) {
            windows.push([entry]);
        } else {
            last.push(entry);
        }
    }
    const merged: Entry[][] = [];
    for (let index = 0; index < windows.length; index += mergeTurns) {
        merged.push(windows.slice(index, index + mergeTurns).flat());
    }
    return merged;
}

export interface TypedReplayDeps {
    readonly reader: SessionReader;
    readonly summarizer: () => Writer;
    readonly records: GuardedRecapRecords;
    readonly ledger: GuardedLedger;
    readonly repos: Workplaces;
    readonly language: Text;
    readonly log: (line: Text) => void;
    readonly pipeline?: Pipeline;
    readonly enumerator?: () => Enumerator | null;
    readonly writerView: WriterView;
    readonly mint: () => FactId;
}

export interface Replayed {
    readonly windows: Count;
    readonly turns: Count;
    readonly facts: readonly Fact[];
    readonly costUsd: Usd;
}

interface Position {
    turn: Count;
    now: Instant;
}

const ONE = must(parsePositiveCount(1));
const NONE = must(parseCount(0));

const noPrompt = (): Promise<PromptResult> => Promise.resolve({ kind: 'prompt', text: null });

const endOf = (window: readonly Entry[] | undefined, from: Instant): Instant => instant(Math.max(from + 1, window?.findLast((entry) => entry.at !== undefined)?.at ?? from + 1));

const unavailable = (kind: HarnessKind): Text => capabilityWording('history-unavailable', must(parseText(kind)));

function windowed(base: SessionReader, file: SessionPath, windows: readonly (readonly Entry[])[], at: Position): SessionReader {
    const read = (): Promise<ChunkResult> => Promise.resolve({
        kind: 'chunk', entries: windows[at.turn] ?? [], title: null, lastPrompt: null, harnessRecap: null, notes: [], position: { cursor: cursorOf(at.turn + 1), tail: null }, grew: grewOf(true),
    });
    const locate = (): Promise<Located> => Promise.resolve({ kind: 'located', source: sourcePathOf(file) });
    const inFlight: InFlightCapability = { kind: 'unsupported', why: 'windowed-reader' };
    return { agent: base.agent, locate, latestPrompt: noPrompt, read, inFlight };
}

function modelsOf(deps: TypedReplayDeps): EngineModels {
    return { summarizer: deps.summarizer, ...(deps.enumerator === undefined ? {} : { enumerator: deps.enumerator }) };
}

function settingsOf(deps: TypedReplayDeps): EngineSettings {
    const chosen = deps.pipeline;
    return { language: (): Text => deps.language, ...(chosen === undefined ? {} : { pipeline: (): Pipeline => chosen }), writerView: (): WriterView => deps.writerView };
}

function engineOf(deps: TypedReplayDeps, file: SessionPath, windows: readonly (readonly Entry[])[], at: Position): TabRecaps {
    return tabRecaps(pluginEngine({
        source: { transcripts: new TranscriptRegistry(new Map([[deps.reader.agent, windowed(deps.reader, file, windows, at)]]), null, unavailable) },
        store: { records: checkedRecords(deps.records), ledger: checkedLedger(deps.ledger) },
        models: modelsOf(deps),
        environment: { clock: { now: (): Instant => at.now }, repos: deps.repos, log: deps.log, mint: deps.mint },
        settings: settingsOf(deps),
    }));
}

async function entriesOf(reader: SessionReader, file: SessionPath, size: Count): Promise<readonly Entry[]> {
    const result = await reader.read(sourcePathOf(file), UNREAD, size);
    if (isUnknown(result)) throw new Error(`cannot read ${file}: ${saying(result.why)}`);
    return result.entries;
}

async function runWindows(engine: TabRecaps, lane: ReturnType<typeof laneFrom>, windows: readonly (readonly Entry[])[], at: Position, label: ScopeId): Promise<void> {
    for (; at.turn < windows.length; at.turn = must(parseCount(at.turn + 1))) {
        at.now = endOf(windows[at.turn], at.now);
        await engine.refresh(label, [lane]);
    }
}

export async function replayFile(deps: TypedReplayDeps, file: SessionPath, label: ScopeId, size: Count, mergeTurns: PositiveCount): Promise<Replayed> {
    const entries = await entriesOf(deps.reader, file, size);
    const turns = mergedWindows(entries, ONE);
    const windows = mergedWindows(entries, mergeTurns);
    const at: Position = { turn: NONE, now: instant(windows.at(0)?.at(0)?.at ?? 1) };
    const engine = engineOf(deps, file, windows, at);
    const lane = laneFrom({ paneId: textOf('replay:p1'), tabId: textOf(label), workspaceId: textOf('replay'), agent: textOf(deps.reader.agent), session: textOf('replay') });
    await runWindows(engine, lane, windows, at, label);
    const tasks = knownOr(deps.records.readRecap(label), null)?.tasks ?? [];
    return {
        windows: must(parseCount(windows.length)),
        turns: must(parseCount(turns.length)),
        facts: tasks.flatMap((task) => knownOr(deps.ledger.allOf({ scope: label, key: task.id }), [])),
        costUsd: must(parseUsd(knownOr(deps.records.readRecap(label), null)?.costUsd ?? 0)),
    };
}

export const oneTurnReplay = (): Replayed => ({ windows: must(parseCount(1)), turns: must(parseCount(1)), facts: [], costUsd: must(parseUsd(0)) });
