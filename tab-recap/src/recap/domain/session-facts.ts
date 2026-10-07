// The facts of a session that need no model: counted and measured from what the store already holds. Pure.
// A line whose inputs are missing is left out — never a guess.
import { shareOf } from './compaction.ts';
import type { ContextUse } from './compaction.ts';

/** The causes a run is counted by; `imported` runs are what the old files held, not something that happened in the tab. */
export const RUN_CAUSES = ['turn-ended', 'focused', 'requested'] as const;
export type RunCause = (typeof RUN_CAUSES)[number];

export interface SessionInputs {
    /** when the tab was first seen (epoch ms) */
    readonly firstSeen: number | null;
    readonly now: number;
    /** runs per cause, as the store counts them */
    readonly runs: Readonly<Record<string, number>>;
    /** the compactions that finished, in the order they happened */
    readonly compactions: readonly { readonly tokensBefore: number | null; readonly tokensAfter: number | null }[];
    readonly lanes: readonly { readonly agent: string; readonly label: string | null; readonly context: ContextUse | null }[];
    /** the lanes' repositories on the web, `https://host/group/repo`, and the branch each lane is on */
    readonly webs: readonly ({ readonly base: string; readonly branch: string | null } | null)[];
    /** edit calls per file, most edited first */
    readonly edits: readonly { readonly path: string; readonly count: number }[];
    /** how many chapters the tab has (a break opens each one after the first); absent when not known */
    readonly chapters?: number;
}

export interface SessionFacts {
    readonly started: { readonly at: number; readonly forMs: number } | null;
    readonly runs: { readonly total: number; readonly byCause: readonly { readonly cause: RunCause; readonly count: number }[] } | null;
    /** how many compactions finished, and the tokens before → after of those that say */
    readonly compactions: { readonly count: number; readonly measured: readonly { readonly before: number; readonly after: number }[] } | null;
    readonly agents: readonly { readonly label: string; readonly share: number; readonly window: number }[];
    readonly repo: { readonly name: string; readonly branch: string | null } | null;
    readonly files: readonly { readonly path: string; readonly count: number }[];
    /** chapters, when the session broke at least once; null otherwise (one chapter is no news) */
    readonly chapters: number | null;
}

/** How many files the session facts name. */
export const FILES_SHOWN = 5;

const lastSegment = (base: string): string => base.split('/').findLast((part) => part !== '') ?? base;

function runsOf(counts: Readonly<Record<string, number>>): SessionFacts['runs'] {
    const byCause = RUN_CAUSES.map((cause) => ({ cause, count: counts[cause] ?? 0 })).filter((entry) => entry.count > 0);
    const total = byCause.reduce((sum, entry) => sum + entry.count, 0);
    return total === 0 ? null : { total, byCause };
}

/** Null when there is none; a record that lacks either number is counted but its tokens are not drawn. */
function compactionsOf(found: SessionInputs['compactions']): SessionFacts['compactions'] {
    const measured = found.flatMap((record) => (record.tokensBefore === null || record.tokensAfter === null ? [] : [{ before: record.tokensBefore, after: record.tokensAfter }]));
    return found.length === 0 ? null : { count: found.length, measured };
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
    };
}
