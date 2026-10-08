// Asking the writer for operations on the tab's ledgers, and turning its answer into the ones that are applied. The job decides WHEN;
// this decides what is asked and kept: shape, gates, one correction retry, then what is still refused is dropped.
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { InputFact } from '#src/ports/recap-input.ts';
import type { Correction, RecapRequest, Summarizer } from '#src/ports/summarizer.ts';
import { addStats, correctionOf, NO_STATS } from '#src/recap/domain/gates/gatekeeper.ts';
import type { GateStats } from '#src/recap/domain/gates/gatekeeper.ts';
import type { Gate } from '#src/recap/domain/gates/gate.ts';
import type { TaskOps } from '#src/recap/domain/ops.ts';
import { parseAnswer } from './ops-answer.ts';
import type { Resolving, Tasked } from './ops-answer.ts';
import { forTask, judge, keptOf, refusedIn, retryFor } from './ops-gating.ts';
import type { Judged, TaskGround } from './ops-gating.ts';

/** The writer gets two tries at answering with valid operations. */
const ATTEMPTS = 2;

/** What a custom writer that still answers the 1.x recap is told, in the log. */
export const OLD_CONTRACT = 'custom writer must answer operations (see README)';

export type Extracted =
    | { readonly kind: 'ops'; readonly tasks: readonly TaskOps[]; readonly cost: number; readonly stats: GateStats }
    | { readonly kind: 'failed'; readonly error: string; readonly cost: number };

/** What an answer is understood and judged against. */
export interface Ground {
    readonly resolving: Resolving;
    readonly grounds: readonly TaskGround[];
    readonly gates: readonly Gate[];
    readonly now: number;
    /** the facts of the document by document id, as it showed them: what a retry quotes of the facts a refusal names */
    readonly facts: ReadonlyMap<string, InputFact>;
    /** the retry sends only the refused operations (the default), or, when false, the whole document with a line on what was refused (2.0) */
    readonly targeted?: boolean;
}

const OLD_HINT = 'you answered a recap; answer operations on the ledger only: {"ops":[{"op":"add",…},{"op":"update",…},{"op":"close",…}]}';

/** A custom command's contract is unchanged in 2.1: its anchor is optional, so G11 does not judge its answer (the built-in harnesses are told to quote). */
const gatesFor = (ground: Ground, custom: boolean): readonly Gate[] => (custom ? ground.gates.filter((gate) => gate.id !== 'G11') : ground.gates);

function judged(ground: Ground, ops: readonly Tasked[], custom: boolean): readonly Judged[] {
    return ground.grounds.map((each) => judge(gatesFor(ground, custom), forTask(ops, each.key), each, ground.now));
}

/** What a round leaves when it is the last: the operations that passed, the counts with what is dropped. */
interface Outcome {
    readonly tasks: readonly TaskOps[];
    readonly stats: GateStats;
}

/** How the second try is asked: the whole document again with a line on what was wrong with the answer, or the refused operations alone (the rest is kept). */
type Follow = { readonly correction: string } | { readonly retry: Correction; readonly keep: readonly Tasked[] };

/** One round: what was asked, what came back, and whether it is final (`done`) or a follow-up to send (`retry`, with what to settle for if the retry cannot be used). */
type Round =
    | ({ readonly kind: 'done' } & Outcome)
    | { readonly kind: 'retry'; readonly follow: Follow; readonly stats: GateStats; readonly fallback: Outcome | null }
    | { readonly kind: 'failed'; readonly error: string };

/** The answer of a round: `keep` are the operations an earlier round passed (they are judged again with the replacements). */
interface Turn {
    readonly custom: boolean;
    readonly retryLeft: boolean;
    readonly stats: GateStats;
    readonly keep: readonly Tasked[];
}

/** The second try after refusals: the refused operations alone, or (2.0) the whole document again with one line per refusal. */
function followOf(each: readonly Judged[], ground: Ground, problems: readonly string[]): Follow {
    if (ground.targeted === false) {
        const lines = each.map((one) => correctionOf(one.given, one.refused)).filter((line) => line !== '');
        return { correction: [...lines, ...problems.map((problem) => `shape: ${problem}`)].join('\n') };
    }
    return { retry: retryFor(each, { tasks: ground.grounds, facts: ground.facts }, problems), keep: keptOf(each, ground.grounds) };
}

function round(text: string, ground: Ground, turn: Turn): Round {
    const answer = parseAnswer(text, ground.resolving);
    if (answer.kind === 'old-shape' && turn.custom) {
        return { kind: 'failed', error: OLD_CONTRACT };
    }
    if (answer.kind !== 'ops') {
        return { kind: 'retry', follow: { correction: answer.kind === 'old-shape' ? OLD_HINT : answer.why }, stats: turn.stats, fallback: null };
    }
    const each = judged(ground, [...turn.keep, ...answer.ops], turn.custom);
    const final: Outcome = {
        tasks: each.map((one, at) => ({ task: ground.grounds[at]?.key ?? '', ops: one.kept })).filter((one) => one.ops.length > 0),
        stats: each.reduce((all, one) => addStats(all, one.gated, one.refused.length), turn.stats),
    };
    if (turn.retryLeft && (refusedIn(each) > 0 || answer.problems.length > 0)) {
        const counted = each.reduce((all, one) => addStats(all, one.gated), turn.stats);
        return { kind: 'retry', follow: followOf(each, ground, answer.problems), stats: counted, fallback: final };
    }
    return { kind: 'done', ...final };
}

const settled = (fallback: Outcome, cost: number): Extracted => ({ kind: 'ops', tasks: fallback.tasks, cost, stats: fallback.stats });

const asked = (request: RecapRequest, follow: Follow | undefined): RecapRequest =>
    follow === undefined ? request : { ...request, ...('retry' in follow ? { retry: follow.retry } : { correction: follow.correction }) };

/** What the first round passed, which the follow-up's answer is judged together with. */
const keepOf = (follow: Follow | undefined): readonly Tasked[] => (follow !== undefined && 'retry' in follow ? follow.keep : []);

const whyOf = (follow: Follow | undefined): string => (follow !== undefined && 'correction' in follow ? follow.correction : 'unknown');

/**
 * The writer's answer must be `{"ops":[…]}`. One retry: when gates refused operations, only those go back (with their reasons, the facts they
 * name and no transcript) and only their replacements are asked for; operations still refused after it are dropped and the rest applied.
 * An answer that cannot be read at all is retried with the whole document and a line on what was wrong. When the retry cannot be used the
 * first answer is kept without its refused operations; with no usable answer at all the run fails: the ledger is untouched and the cursors do not advance.
 */
export async function extract(summarizer: Summarizer, request: RecapRequest, ground: Ground): Promise<Extracted> {
    let cost = 0;
    let stats = NO_STATS;
    let follow: Follow | undefined;
    let fallback: Outcome | null = null;
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
        const written = await summarizer.write(asked(request, follow));
        if (isUnknown(written)) {
            return fallback === null ? { kind: 'failed', error: saying(written.why), cost } : settled(fallback, cost);
        }
        cost += written.costUsd;
        const next = round(written.text, ground, { custom: summarizer.backend.startsWith('custom'), retryLeft: attempt < ATTEMPTS - 1, stats, keep: keepOf(follow) });
        if (next.kind === 'failed') {
            return { kind: 'failed', error: next.error, cost };
        }
        stats = next.stats;
        if (next.kind === 'done') {
            return settled(next, cost);
        }
        follow = next.follow;
        fallback = next.fallback ?? fallback;
    }
    return fallback === null ? { kind: 'failed', error: `the writer's answer was not usable (${whyOf(follow)}); the ledger is unchanged`, cost } : settled(fallback, cost);
}
