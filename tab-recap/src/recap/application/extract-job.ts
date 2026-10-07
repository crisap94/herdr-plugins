// Asking the writer for operations on the tab's ledgers, and turning its answer into the ones that are applied. The job decides WHEN;
// this decides what is asked and kept: shape, gates, one correction retry, then what is still refused is dropped.
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { RecapRequest, Summarizer } from '#src/ports/summarizer.ts';
import { addStats, NO_STATS } from '#src/recap/domain/gates/gatekeeper.ts';
import type { GateStats } from '#src/recap/domain/gates/gatekeeper.ts';
import type { Gate } from '#src/recap/domain/gates/gate.ts';
import type { TaskOps } from '#src/recap/domain/ops.ts';
import { parseAnswer } from './ops-answer.ts';
import type { Resolving } from './ops-answer.ts';
import { correctionFor, forTask, judge, refusedIn } from './ops-gating.ts';
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
}

const OLD_HINT = 'you answered a recap; answer operations on the ledger only: {"ops":[{"op":"add",…},{"op":"update",…},{"op":"close",…}]}';

function judged(ground: Ground, ops: ReturnType<typeof parseAnswer> & { kind: 'ops' }): readonly Judged[] {
    return ground.grounds.map((each) => judge(ground.gates, forTask(ops.ops, each.key), each, ground.now));
}

/** What a round leaves when it is the last: the operations that passed, the counts with what is dropped. */
interface Outcome {
    readonly tasks: readonly TaskOps[];
    readonly stats: GateStats;
}

/** One round: what was asked, what came back, and whether it is final (`done`) or a correction to send (`retry`, with what to settle for if the retry cannot be used). */
type Round =
    | ({ readonly kind: 'done' } & Outcome)
    | { readonly kind: 'retry'; readonly correction: string; readonly stats: GateStats; readonly fallback: Outcome | null }
    | { readonly kind: 'failed'; readonly error: string };

function round(text: string, ground: Ground, custom: boolean, retryLeft: boolean, stats: GateStats): Round {
    const answer = parseAnswer(text, ground.resolving);
    if (answer.kind === 'old-shape' && custom) {
        return { kind: 'failed', error: OLD_CONTRACT };
    }
    if (answer.kind !== 'ops') {
        return { kind: 'retry', correction: answer.kind === 'old-shape' ? OLD_HINT : answer.why, stats, fallback: null };
    }
    const each = judged(ground, answer);
    const final: Outcome = {
        tasks: each.map((one, at) => ({ task: ground.grounds[at]?.key ?? '', ops: one.kept })).filter((one) => one.ops.length > 0),
        stats: each.reduce((all, one) => addStats(all, one.gated, one.refused.length), stats),
    };
    if (retryLeft && (refusedIn(each) > 0 || answer.problems.length > 0)) {
        const counted = each.reduce((all, one) => addStats(all, one.gated), stats);
        return { kind: 'retry', correction: correctionFor(each, answer.problems), stats: counted, fallback: final };
    }
    return { kind: 'done', ...final };
}

const settled = (fallback: Outcome, cost: number): Extracted => ({ kind: 'ops', tasks: fallback.tasks, cost, stats: fallback.stats });

/**
 * The writer's answer must be `{"ops":[…]}`. One retry, saying what was refused; operations still refused after it are dropped and the
 * rest applied. When the retry cannot be used the first answer is kept without its refused operations; with no usable answer at all the
 * run fails: the ledger is untouched and the cursors do not advance.
 */
export async function extract(summarizer: Summarizer, request: RecapRequest, ground: Ground): Promise<Extracted> {
    let cost = 0;
    let stats = NO_STATS;
    let correction: string | undefined;
    let fallback: Outcome | null = null;
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
        const written = await summarizer.write(correction === undefined ? request : { ...request, correction });
        if (isUnknown(written)) {
            return fallback === null ? { kind: 'failed', error: saying(written.why), cost } : settled(fallback, cost);
        }
        cost += written.costUsd;
        const next = round(written.text, ground, summarizer.backend.startsWith('custom'), attempt < ATTEMPTS - 1, stats);
        if (next.kind === 'failed') {
            return { kind: 'failed', error: next.error, cost };
        }
        stats = next.stats;
        if (next.kind === 'done') {
            return settled(next, cost);
        }
        correction = next.correction;
        fallback = next.fallback ?? fallback;
    }
    return fallback === null ? { kind: 'failed', error: `the writer's answer was not usable (${correction ?? 'unknown'}); the ledger is unchanged`, cost } : settled(fallback, cost);
}
