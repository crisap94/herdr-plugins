import { must, type Result } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { ContextUse } from '#src/recap/domain/compaction.ts';
import type { Origin } from '#src/recap/domain/origin.ts';
import { RUN_CAUSES, sessionFactsFrom, type AutocompactCounts, type RunCounts, type SessionFacts } from '#src/recap/domain/session-facts.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';

const okOrNull = <T, E>(parsed: Result<T, E>): T | null => (parsed.kind === 'ok' ? parsed.value : null);

interface BareCompaction { readonly tokensBefore: number | null; readonly tokensAfter: number | null; readonly origin: Origin }
interface BareLane { readonly agent: string; readonly label: string | null; readonly context: ContextUse | null }
interface BareWeb { readonly base: string; readonly branch: string | null }
interface BareEdit { readonly path: string; readonly count: number }
interface BareAutocompact { readonly decisions: number; readonly compacted: number; readonly waited: number }

export interface BareReadings {
    readonly firstSeen: number | null;
    readonly now: number;
    readonly runs: Readonly<Record<string, number>>;
    readonly compactions: readonly BareCompaction[];
    readonly lanes: readonly BareLane[];
    readonly webs: readonly (BareWeb | null)[];
    readonly edits: readonly BareEdit[];
    readonly chapters?: number;
    readonly autocompact?: BareAutocompact;
}

const countIn = (raw: number | null | undefined): Count | null => (raw === null || raw === undefined ? null : okOrNull(parseCount(raw)));

const textIn = (raw: string): Text => must(parseText(raw));

function autocompactIn(counts: BareAutocompact): AutocompactCounts | null {
    const [decisions, compacted, waited] = [countIn(counts.decisions), countIn(counts.compacted), countIn(counts.waited)];
    return decisions === null || compacted === null || waited === null ? null : { decisions, compacted, waited };
}

const runsIn = (runs: BareReadings['runs']): RunCounts => Object.fromEntries(RUN_CAUSES.flatMap((cause) => { const count = countIn(runs[cause]); return count === null ? [] : [[cause, count]]; }));

export function factsOfBare(input: BareReadings): SessionFacts {
    const chapters = countIn(input.chapters);
    const autocompact = input.autocompact === undefined ? null : autocompactIn(input.autocompact);
    return sessionFactsFrom({
        firstSeen: input.firstSeen === null ? null : instant(input.firstSeen), now: instant(input.now), runs: runsIn(input.runs),
        compactions: input.compactions.map((record) => ({ tokensBefore: countIn(record.tokensBefore), tokensAfter: countIn(record.tokensAfter), origin: record.origin })),
        lanes: input.lanes.map((lane) => ({ agent: textIn(lane.agent), label: lane.label === null ? null : textIn(lane.label), context: lane.context })),
        webs: input.webs.map((web) => (web === null ? null : { base: textIn(web.base), branch: web.branch === null ? null : textIn(web.branch) })),
        edits: input.edits.flatMap((edit) => { const count = countIn(edit.count); return count === null ? [] : [{ path: textIn(edit.path), count }]; }),
        ...(chapters === null ? {} : { chapters }), ...(autocompact === null ? {} : { autocompact }),
    });
}
