import type { Origin } from './origin.ts';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { shareOf } from '@stateforge-labs/session-ledger';
import type { ContextUse } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import { elapsed, type Duration, type Instant } from '@stateforge-labs/session-ledger';

export const RUN_CAUSES = ['turn-ended', 'focused', 'requested'] as const;
export type RunCause = (typeof RUN_CAUSES)[number];

export type RunCounts = Readonly<Partial<Record<RunCause, Count>>>;

export interface CompactionReading {
    readonly tokensBefore: Count | null;
    readonly tokensAfter: Count | null;
    readonly origin: Origin;
}

export interface LaneReading {
    readonly agent: Text;
    readonly label: Text | null;
    readonly context: ContextUse | null;
}

export interface WebReading {
    readonly base: Text;
    readonly branch: Text | null;
}

export interface FileEdit {
    readonly path: Text;
    readonly count: Count;
}

export interface AutocompactCounts {
    readonly decisions: Count;
    readonly compacted: Count;
    readonly waited: Count;
}

export interface SessionReadings {
    readonly firstSeen: Instant | null;
    readonly now: Instant;
    readonly runs: RunCounts;
    readonly compactions: readonly CompactionReading[];
    readonly lanes: readonly LaneReading[];
    readonly webs: readonly (WebReading | null)[];
    readonly edits: readonly FileEdit[];
    readonly chapters?: Count;
    readonly autocompact?: AutocompactCounts;
}

interface StartedFacts {
    readonly at: Instant;
    readonly forMs: Duration;
}

interface RunCauseCount {
    readonly cause: RunCause;
    readonly count: Count;
}

interface RunFacts {
    readonly total: Count;
    readonly byCause: readonly RunCauseCount[];
}

interface OriginCounts {
    readonly operator: Count;
    readonly auto: Count;
}

interface TokenSpan {
    readonly before: Count;
    readonly after: Count;
}

interface CompactionFacts {
    readonly count: Count;
    readonly byOrigin: OriginCounts;
    readonly measured: readonly TokenSpan[];
}

interface AgentFacts {
    readonly label: Text;
    readonly share: Count;
    readonly window: Count;
}

interface RepoFacts {
    readonly name: Text;
    readonly branch: Text | null;
}

export interface SessionFacts {
    readonly started: StartedFacts | null;
    readonly runs: RunFacts | null;
    readonly compactions: CompactionFacts | null;
    readonly agents: readonly AgentFacts[];
    readonly repo: RepoFacts | null;
    readonly files: readonly FileEdit[];
    readonly chapters: Count | null;
    readonly autocompact: AutocompactCounts | null;
}

export const FILES_SHOWN = 5;

function lastSegment(base: Text): Text {
    const last = parseText(base.split('/').findLast((part) => part !== '') ?? base);
    return last.kind === 'ok' ? last.value : base;
}

function labelOf(lane: LaneReading): Text {
    const joined = parseText(lane.label === null ? lane.agent : `${lane.agent} · ${lane.label}`);
    return joined.kind === 'ok' ? joined.value : lane.agent;
}

function agentOf(lane: LaneReading): readonly AgentFacts[] {
    if (lane.context === null || lane.context.window <= 0) {
        return [];
    }
    const share = parseCount(shareOf(lane.context));
    const window = parseCount(lane.context.window);
    return share.kind === 'ok' && window.kind === 'ok' ? [{ label: labelOf(lane), share: share.value, window: window.value }] : [];
}

function runsOf(counts: RunCounts): SessionFacts['runs'] {
    const byCause = RUN_CAUSES.flatMap((cause): readonly RunCauseCount[] => {
        const count = counts[cause];
        return count === undefined || count === 0 ? [] : [{ cause, count }];
    });
    const total = must(parseCount(byCause.reduce((sum, entry) => sum + entry.count, 0)));
    return total === 0 ? null : { total, byCause };
}

function compactionsOf(found: SessionReadings['compactions']): SessionFacts['compactions'] {
    const measured = found.flatMap((record): readonly TokenSpan[] => (record.tokensBefore === null || record.tokensAfter === null ? [] : [{ before: record.tokensBefore, after: record.tokensAfter }]));
    const auto = found.filter((record) => record.origin === 'auto').length;
    return found.length === 0 ? null : { count: must(parseCount(found.length)), byOrigin: { operator: must(parseCount(found.length - auto)), auto: must(parseCount(auto)) }, measured };
}

export function sessionFactsFrom(input: SessionReadings): SessionFacts {
    const web = input.webs.find((candidate) => candidate !== null) ?? null;
    return {
        started: input.firstSeen === null ? null : { at: input.firstSeen, forMs: elapsed(input.firstSeen, input.now) },
        runs: runsOf(input.runs),
        compactions: compactionsOf(input.compactions),
        agents: input.lanes.flatMap(agentOf),
        repo: web === null ? null : { name: lastSegment(web.base), branch: web.branch },
        files: input.edits.slice(0, FILES_SHOWN),
        chapters: input.chapters !== undefined && input.chapters > 1 ? input.chapters : null,
        autocompact: input.autocompact === undefined || input.autocompact.decisions === 0 ? null : input.autocompact,
    };
}
