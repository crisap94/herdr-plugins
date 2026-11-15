import type { Origin } from './origin.ts';
import { shareOf } from './compaction.ts';
import type { ContextUse } from './compaction.ts';

export const RUN_CAUSES = ['turn-ended', 'focused', 'requested'] as const;
export type RunCause = (typeof RUN_CAUSES)[number];

interface CompactionInput {
    readonly tokensBefore: number | null;
    readonly tokensAfter: number | null;
    readonly origin: Origin;
}

interface LaneInput {
    readonly agent: string;
    readonly label: string | null;
    readonly context: ContextUse | null;
}

interface WebInput {
    readonly base: string;
    readonly branch: string | null;
}

interface FileEdit {
    readonly path: string;
    readonly count: number;
}

interface AutocompactCounts {
    readonly decisions: number;
    readonly compacted: number;
    readonly waited: number;
}

export interface SessionInputs {
    readonly firstSeen: number | null;
    readonly now: number;
    readonly runs: Readonly<Record<string, number>>;
    readonly compactions: readonly CompactionInput[];
    readonly lanes: readonly LaneInput[];
    readonly webs: readonly (WebInput | null)[];
    readonly edits: readonly FileEdit[];
    readonly chapters?: number;
    readonly autocompact?: AutocompactCounts;
}

interface StartedFacts {
    readonly at: number;
    readonly forMs: number;
}

interface RunCauseCount {
    readonly cause: RunCause;
    readonly count: number;
}

interface RunFacts {
    readonly total: number;
    readonly byCause: readonly RunCauseCount[];
}

interface OriginCounts {
    readonly operator: number;
    readonly auto: number;
}

interface TokenSpan {
    readonly before: number;
    readonly after: number;
}

interface CompactionFacts {
    readonly count: number;
    readonly byOrigin: OriginCounts;
    readonly measured: readonly TokenSpan[];
}

interface AgentFacts {
    readonly label: string;
    readonly share: number;
    readonly window: number;
}

interface RepoFacts {
    readonly name: string;
    readonly branch: string | null;
}

export interface SessionFacts {
    readonly started: StartedFacts | null;
    readonly runs: RunFacts | null;
    readonly compactions: CompactionFacts | null;
    readonly agents: readonly AgentFacts[];
    readonly repo: RepoFacts | null;
    readonly files: readonly FileEdit[];
    readonly chapters: number | null;
    readonly autocompact: AutocompactCounts | null;
}

export const FILES_SHOWN = 5;

const lastSegment = (base: string): string => base.split('/').findLast((part) => part !== '') ?? base;

function runsOf(counts: Readonly<Record<string, number>>): SessionFacts['runs'] {
    const byCause = RUN_CAUSES.map((cause) => ({ cause, count: counts[cause] ?? 0 })).filter((entry) => entry.count > 0);
    const total = byCause.reduce((sum, entry) => sum + entry.count, 0);
    return total === 0 ? null : { total, byCause };
}

function compactionsOf(found: SessionInputs['compactions']): SessionFacts['compactions'] {
    const measured = found.flatMap((record) => (record.tokensBefore === null || record.tokensAfter === null ? [] : [{ before: record.tokensBefore, after: record.tokensAfter }]));
    const auto = found.filter((record) => record.origin === 'auto').length;
    return found.length === 0 ? null : { count: found.length, byOrigin: { operator: found.length - auto, auto }, measured };
}

export function sessionFactsOf(input: SessionInputs): SessionFacts {
    const web = input.webs.find((candidate) => candidate !== null) ?? null;
    return {
        started: input.firstSeen === null ? null : { at: input.firstSeen, forMs: Math.max(0, input.now - input.firstSeen) },
        runs: runsOf(input.runs),
        compactions: compactionsOf(input.compactions),
        agents: input.lanes.flatMap((lane) => (lane.context === null || lane.context.window <= 0 ? [] : [{ label: lane.label === null ? lane.agent : `${lane.agent} · ${lane.label}`, share: shareOf(lane.context), window: lane.context.window }])),
        repo: web === null ? null : { name: lastSegment(web.base), branch: web.branch },
        files: input.edits.slice(0, FILES_SHOWN),
        chapters: input.chapters !== undefined && input.chapters > 1 ? input.chapters : null,
        autocompact: input.autocompact === undefined || input.autocompact.decisions === 0 ? null : input.autocompact,
    };
}
