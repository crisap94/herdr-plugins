import { readFileSync } from 'node:fs';
import * as sl from '@stateforge-labs/session-ledger';
import { createEngineWorld, createMemoryStore, type EngineWorld, type Fold, type StoreUnderTest, type Subject } from '@stateforge-labs/session-ledger/testkit';
import { pluginEngine, followedOf, type PluginEnginePlugs } from '#src/engine/engine-adapter.ts';
import { must } from '#src/protocol/result.ts';
import { TranscriptRegistry } from '#src/ports/transcript-registry.ts';
import type { Ledger, Applied } from '#src/ports/ledger.ts';
import type { RecapRecords, RecordedRun, FailedRun, Advance, TabRecap, LastRun } from '#src/ports/recap-records.ts';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import type { Transcripts, Located, ChunkResult } from '#src/ports/transcripts.ts';
import type { Clock } from '#src/ports/clock.ts';
import type { LaneRepo, RepoResult } from '#src/ports/lane-repo.ts';
import type { Unknown, Unknowable } from '#src/ports/unknowable.ts';
import type { Fact, FactId, RunId } from '#src/recap/domain/fact.ts';
import { apply, type Operation, type Refusal, type RunRef, type TaskOps } from '#src/recap/domain/ops.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { parseDuration, parseInstant, type Duration } from '#src/recap/domain/time.ts';
import { parseFailureCause, type FailureCause } from '#src/recap/domain/failure-cause.ts';
import { FULL_WRITER_VIEW, keepNewestOf, nextHoursOf, prunedWriterView, type HiddenCounts, type PositiveCount, type WriterView } from '#src/recap/domain/writer-view.ts';
import type { Debounce } from '#src/recap/domain/debounce.ts';
import type { Section } from '#src/recap/domain/fact.ts';
import { memoryStore } from '#test/db/support.ts';

const isLedgerFactId = (id: FactId): id is FactId & sl.FactId => id !== '';
const isPluginFactId = (id: sl.FactId): id is sl.FactId & FactId => id !== '';
const isLedgerRunId = (id: RunId): id is RunId & sl.RunId => id !== '';
const isPluginRunId = (id: sl.RunId): id is sl.RunId & RunId => id !== '';
const isLedgerText = (text: Text): text is Text & sl.Text => text.length >= 0;
const isPluginText = (text: sl.Text): text is sl.Text & Text => text.length >= 0;
const isLedgerCount = (count: PositiveCount): count is PositiveCount & sl.PositiveCount => Number.isSafeInteger(count) && count >= 1;

const bridged = <F, T extends F>(value: F, fits: (value: F) => value is T, what: string): T => {
    if (fits(value)) {
        return value;
    }
    throw new Error(`conformance subject: ${what} does not cross the boundary`);
};

const ledgerFactId = (id: FactId): sl.FactId => bridged(id, isLedgerFactId, 'a fact id');
const pluginFactId = (id: sl.FactId): FactId => bridged(id, isPluginFactId, 'a fact id');

const ledgerFact = (fact: Fact): sl.Fact => ({ ...fact, id: ledgerFactId(fact.id) });
const pluginFact = (fact: sl.Fact): Fact => ({ ...fact, id: pluginFactId(fact.id) });

const ledgerOperation = (op: Operation): sl.Operation => {
    if (op.op !== 'close' || op.anchor === undefined) {
        return op.op === 'close' ? { op: 'close', id: op.id, why: op.why } : op;
    }
    return { ...op, anchor: bridged(op.anchor, isLedgerText, 'an anchor') };
};
const pluginOperation = (op: sl.Operation): Operation => {
    if (op.op !== 'close' || op.anchor === undefined) {
        return op.op === 'close' ? { op: 'close', id: op.id, why: op.why } : op;
    }
    return { ...op, anchor: bridged(op.anchor, isPluginText, 'an anchor') };
};

const ledgerRefusal = (refusal: Refusal): sl.Refusal => ({ op: ledgerOperation(refusal.op), reason: refusal.reason });
const pluginRefusal = (refusal: sl.Refusal): Refusal => ({ op: pluginOperation(refusal.op), reason: refusal.reason });

const ledgerTaskOps = (task: TaskOps): sl.TaskOps => ({ task: task.task, ops: task.ops.map(ledgerOperation) });
const pluginTaskOps = (task: sl.TaskOps): TaskOps => ({ task: task.task, ops: task.ops.map(pluginOperation) });

const ledgerRun = (run: RunRef): sl.RunRef => ({
    id: bridged(run.id, isLedgerRunId, 'a run id'),
    task: run.task,
    at: run.at,
    language: run.language,
    mint: () => ledgerFactId(run.mint()),
});
const pluginRun = (run: sl.RunRef): RunRef => ({
    id: bridged(run.id, isPluginRunId, 'a run id'),
    task: run.task,
    at: run.at,
    language: run.language,
    mint: () => pluginFactId(run.mint()),
});

const ledgerApplied = (applied: Applied): sl.Applied => ({ changed: applied.changed.map(ledgerFact), refused: applied.refused.map(ledgerRefusal) });
const pluginApplied = (applied: sl.Applied): Applied => ({ changed: applied.changed.map(pluginFact), refused: applied.refused.map(pluginRefusal) });

const ledgerRecorded = (run: RecordedRun): sl.RecordedRun => ({ ...run, ops: run.ops.map(ledgerTaskOps) });
const pluginRecorded = (run: sl.RecordedRun): RecordedRun => ({ ...run, ops: run.ops.map(pluginTaskOps) });

const durationOf = (after: sl.Duration): Duration => must(parseDuration(after));
const causeOf = (detail: string): FailureCause => parseFailureCause(must(parseText(detail)));

const pluginUnknowable = (why: sl.Unknowable): Unknowable => {
    switch (why.why) {
        case 'timeout':
            return { why: 'timeout', after: durationOf(why.after) };
        case 'lease':
            return { why: 'lease', after: durationOf(why.after) };
        case 'unreadable':
            return { why: 'unreadable', detail: causeOf(why.detail) };
        case 'unreachable':
            return { why: 'unreachable', detail: causeOf(why.detail) };
        case 'failed':
            return { why: 'failed', code: why.code, detail: causeOf(why.detail) };
        case 'not-found':
            return { why: 'not-found', what: why.what };
        default: {
            const exhaustive: never = why;
            return exhaustive;
        }
    }
};
const pluginUnknown = (value: sl.Unknown): Unknown => ({ kind: 'unknown', why: pluginUnknowable(value.why) });

const isLedgerUnknown = (value: unknown): value is sl.Unknown => typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'unknown';

const known = <T>(value: T | sl.Unknown, what: string): T => {
    if (isLedgerUnknown(value)) {
        throw new Error(`conformance subject: ${what} is unknown (${value.why.why})`);
    }
    return value;
};
const knownOrNull = <T>(value: T | null | sl.Unknown, what: string): T | null => (value === null ? null : known(value, what));

const scopeOf = (tab: string): sl.ScopeId => must(sl.parseScopeId(tab));
const keyOf = (pane: string): sl.SessionKey => must(sl.parseSessionKey(pane));

const pluginRecords = (records: sl.Records): RecapRecords => ({
    readRecap: (tab: string): TabRecap | null => knownOrNull(records.readRecap(scopeOf(tab)), 'readRecap'),
    lastRunOf: (tab: string): LastRun | null => knownOrNull(records.lastRunOf(scopeOf(tab)), 'lastRunOf'),
    beginRun: (tab: string, backend: string | null, at: number): void => {
        records.beginRun(scopeOf(tab), backend, at);
    },
    recordRun: (run: RecordedRun): void => {
        records.recordRun(ledgerRecorded(run));
    },
    failRun: (run: FailedRun): void => {
        records.failRun(run);
    },
    advance: (move: Advance): void => {
        records.advance(move);
    },
});

const pluginLedger = (facts: sl.FactStore): Ledger => ({
    openOf: (task) => known(facts.openOf(task), 'openOf').map(pluginFact),
    recentlyClosed: (task, sinceMs) => known(facts.recentlyClosed(task, sinceMs), 'recentlyClosed').map(pluginFact),
    allOf: (task) => known(facts.allOf(task), 'allOf').map(pluginFact),
    keysOf: (tab) => known(facts.keysOf(scopeOf(tab)), 'keysOf'),
    historyOf: (tab, pane) => facts.historyOf(scopeOf(tab), keyOf(pane)),
    apply: (run, ops) => pluginApplied(facts.apply(ledgerRun(run), ops.map(ledgerOperation))),
});

const ledgerRecords = (records: RecapRecords): sl.Records => ({
    readRecap: (scope) => records.readRecap(scope),
    lastRunOf: (scope) => records.lastRunOf(scope),
    beginRun: (scope, backend, at) => {
        records.beginRun(scope, backend, at);
    },
    recordRun: (run) => {
        records.recordRun(pluginRecorded(run));
    },
    failRun: (run) => {
        records.failRun(run);
    },
    advance: (move) => {
        records.advance(move);
    },
});

const ledgerFacts = (ledger: Ledger): sl.FactStore => ({
    openOf: (task) => ledger.openOf(task).map(ledgerFact),
    recentlyClosed: (task, sinceMs) => ledger.recentlyClosed(task, sinceMs).map(ledgerFact),
    allOf: (task) => ledger.allOf(task).map(ledgerFact),
    keysOf: (scope) => ledger.keysOf(scope),
    historyOf: (scope, key) => ledger.historyOf(scope, key),
    apply: (run, ops) => ledgerApplied(ledger.apply(pluginRun(run), ops.map(pluginOperation))),
});

const pluginFold: Fold = (before, ops, run, sweepNow) => {
    const folded = apply(before.map(pluginFact), ops.map(pluginOperation), pluginRun(run), sweepNow);
    return { ledger: folded.ledger.map(ledgerFact), refused: folded.refused.map(ledgerRefusal), changed: folded.changed.map(ledgerFact) };
};

const ledgerHidden = (hidden: HiddenCounts): sl.HiddenCounts =>
    new Map([...hidden].map(([section, count]): [Section, sl.PositiveCount] => [section, bridged(count, isLedgerCount, 'a hidden count')]));

const ledgerRequest = (request: RecapRequest): sl.RecapRequest => {
    const { retry, input, ...rest } = request;
    const ledgerInput: sl.RecapInput = {
        ...input,
        ledgers: input.ledgers.map((entry) => (entry.hidden === undefined ? { task: entry.task, facts: entry.facts } : { task: entry.task, facts: entry.facts, hidden: ledgerHidden(entry.hidden) })),
    };
    if (retry === undefined) {
        return { ...rest, input: ledgerInput };
    }
    const refused = retry.refused.map((each) => ({ ...each, operation: ledgerOperation(each.operation) }));
    return { ...rest, input: ledgerInput, retry: { ...retry, refused } };
};

const pluginWritten = (written: sl.Written): Written => (written.kind === 'written' ? written : pluginUnknown(written));

const pluginSummarizer = (writer: sl.Writer): Summarizer => ({
    backend: writer.backend,
    contract: writer.contract,
    write: async (request: RecapRequest): Promise<Written> => pluginWritten(await writer.write(ledgerRequest(request))),
});

const pluginLocated = (located: sl.Located): Located => (located.kind === 'located' ? located : pluginUnknown(located));
const pluginChunk = (chunk: sl.Chunk | sl.Unknown): ChunkResult => (chunk.kind === 'chunk' ? chunk : pluginUnknown(chunk));

const transcriptsOf = (reader: sl.SessionReader): Transcripts => ({
    agent: reader.harness,
    inFlight: { kind: 'unsupported', why: 'in-flight-unavailable' },
    locate: async (lane: Lane): Promise<Located> => {
        const session = followedOf(lane);
        if (session === null) {
            return { kind: 'unknown', why: { why: 'not-found', what: `a followed session for ${lane.pane}` } };
        }
        return pluginLocated(await reader.locate(session));
    },
    read: async (source, was, budget) => pluginChunk(await reader.read(source, was, budget)),
    latestPrompt: () => Promise.resolve({ kind: 'prompt', text: null }),
});

class SessionRegistry extends TranscriptRegistry {
    private readonly sessions: sl.SessionSource;

    constructor(sessions: sl.SessionSource) {
        super({}, null, (kind: string) => {
            const harness = sl.parseHarnessKind(kind);
            return harness.kind === 'ok' ? sessions.unavailableReason(harness.value) : `no reader for ${kind}`;
        });
        this.sessions = sessions;
    }

    override exact(kind: string): Transcripts | undefined {
        const harness = sl.parseHarnessKind(kind);
        const reader = harness.kind === 'ok' ? this.sessions.readerFor(harness.value) : undefined;
        return reader === undefined ? undefined : transcriptsOf(reader);
    }

    override readerFor(kind: string): Transcripts | undefined {
        return this.exact(kind);
    }
}

const pluginClock = (clock: sl.Clock): Clock => ({ now: () => must(parseInstant(clock.now())) });

const pluginRepo = (result: sl.RepoResult): RepoResult => (result.kind === 'repo' || result.kind === 'no-repo' ? result : pluginUnknown(result));

const pluginRepos = (workplaces: sl.Workplaces): LaneRepo => ({
    repoOf: async (cwd: string): Promise<RepoResult> => pluginRepo(await workplaces.repoOf(cwd)),
});

const pluginWriterView = (view: sl.WriterView): WriterView =>
    view.kind === 'full' ? FULL_WRITER_VIEW : prunedWriterView(keepNewestOf(view.keepNewest), nextHoursOf(view.nextHours));

const pluginDebounce = (debounce: sl.Debounce): Debounce => (debounce.kind === 'off' ? debounce : { kind: 'window', window: durationOf(debounce.window) });

const pluginPlugs = (plugs: sl.EnginePlugs): PluginEnginePlugs => {
    const { settings } = plugs;
    return {
        source: { transcripts: new SessionRegistry(plugs.source.sessions) },
        store: { records: pluginRecords(plugs.store.records), ledger: pluginLedger(plugs.store.facts) },
        models: { summarizer: () => pluginSummarizer(plugs.models.writer()) },
        environment: {
            clock: pluginClock(plugs.environment.clock),
            repos: pluginRepos(plugs.environment.workplaces),
            log: (line: string) => {
                plugs.environment.log(line);
            },
        },
        settings: {
            language: () => settings.language(),
            writerView: () => pluginWriterView(settings.writerView()),
            ...(settings.keepInput === undefined ? {} : { keepInput: () => settings.keepInput?.() === true }),
            ...(settings.pipeline === undefined ? {} : { pipeline: () => settings.pipeline?.() ?? 'one' }),
            ...(settings.debounce === undefined ? {} : { debounce: () => pluginDebounce(settings.debounce?.() ?? { kind: 'off' }) }),
        },
        ...(plugs.on === undefined
            ? {}
            : {
                  on: (event: sl.LedgerEvent) => {
                      plugs.on?.(event);
                  },
              }),
    };
};

export const pluginSubject: Subject<EngineWorld, sl.Engine> = {
    name: 'plugin engine',
    level: 'full',
    world: () => createEngineWorld(),
    create: (world) => pluginEngine(pluginPlugs(world.plugs)),
};

export const memoryStoreSubject: Subject<null, StoreUnderTest> = {
    name: 'memory store with the plugin fold',
    level: 'full',
    world: () => null,
    create: () => createMemoryStore({ fold: pluginFold }),
};

export const sqliteStoreSubject: Subject<null, StoreUnderTest> = {
    name: 'sqlite store on memory',
    level: 'full',
    world: () => null,
    create: () => {
        const store = memoryStore();
        return { records: ledgerRecords(store.records), facts: ledgerFacts(store.ledger) };
    },
};

export const ENGINE_GROUPS: readonly string[] = ['FOL', 'TRN', 'STA', 'FBY', 'EVT', 'CMP', 'CUR', 'HIS', 'REF', 'RUN', 'CSR', 'LNG', 'RDF', 'PRT', 'LED'];

export const STORE_GROUPS: readonly string[] = ['REC', 'FCT'];

const idsOf = (group: string, parsed: unknown): readonly string[] => {
    if (!Array.isArray(parsed)) {
        throw new Error(`pending-${group}.json is not an array`);
    }
    return parsed.map((id: unknown) => {
        if (typeof id !== 'string') {
            throw new Error(`pending-${group}.json holds an id that is not a string`);
        }
        return id;
    });
};

export const pendingOf = (groups: readonly string[]): readonly string[] =>
    groups.flatMap((group) => idsOf(group, JSON.parse(readFileSync(new URL(`./pending-${group}.json`, import.meta.url), 'utf8'))));
