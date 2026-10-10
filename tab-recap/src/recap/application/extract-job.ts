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
import type { JobContract } from '#src/recap/domain/backend.ts';

const ATTEMPTS = 2;

export const OLD_CONTRACT = 'custom writer must answer operations (see README)';

export type Extracted =
    | { readonly kind: 'ops'; readonly tasks: readonly TaskOps[]; readonly cost: number; readonly stats: GateStats }
    | { readonly kind: 'failed'; readonly error: string; readonly cost: number };

export interface Ground {
    readonly resolving: Resolving;
    readonly grounds: readonly TaskGround[];
    readonly gates: readonly Gate[];
    readonly now: number;
    readonly facts: ReadonlyMap<string, InputFact>;
    readonly targeted?: boolean;
}

const OLD_HINT = 'you answered a recap; answer operations on the ledger only: {"ops":[{"op":"add",…},{"op":"update",…},{"op":"close",…}]}';

const gatesFor = (ground: Ground, contract: JobContract): readonly Gate[] => (contract === 'free-text' ? ground.gates.filter((gate) => gate.id !== 'G11') : ground.gates);

function judged(ground: Ground, ops: readonly Tasked[], contract: JobContract): readonly Judged[] {
    return ground.grounds.map((each) => judge(gatesFor(ground, contract), forTask(ops, each.key), each, ground.now));
}

interface Outcome {
    readonly tasks: readonly TaskOps[];
    readonly stats: GateStats;
}

type Follow = { readonly correction: string } | { readonly retry: Correction; readonly keep: readonly Tasked[] };

type Round =
    | ({ readonly kind: 'done' } & Outcome)
    | { readonly kind: 'retry'; readonly follow: Follow; readonly stats: GateStats; readonly fallback: Outcome | null }
    | { readonly kind: 'failed'; readonly error: string };

interface Turn {
    readonly contract: JobContract;
    readonly retryLeft: boolean;
    readonly stats: GateStats;
    readonly keep: readonly Tasked[];
}

function followOf(each: readonly Judged[], ground: Ground, problems: readonly string[]): Follow {
    if (ground.targeted === false) {
        const lines = each.map((one) => correctionOf(one.given, one.refused)).filter((line) => line !== '');
        return { correction: [...lines, ...problems.map((problem) => `shape: ${problem}`)].join('\n') };
    }
    return { retry: retryFor(each, { tasks: ground.grounds, facts: ground.facts }, problems), keep: keptOf(each, ground.grounds) };
}

function round(text: string, ground: Ground, turn: Turn): Round {
    const answer = parseAnswer(text, ground.resolving);
    if (answer.kind === 'old-shape' && turn.contract === 'free-text') {
        return { kind: 'failed', error: OLD_CONTRACT };
    }
    if (answer.kind !== 'ops') {
        return { kind: 'retry', follow: { correction: answer.kind === 'old-shape' ? OLD_HINT : answer.why }, stats: turn.stats, fallback: null };
    }
    const each = judged(ground, [...turn.keep, ...answer.ops], turn.contract);
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

const keepOf = (follow: Follow | undefined): readonly Tasked[] => (follow !== undefined && 'retry' in follow ? follow.keep : []);

const whyOf = (follow: Follow | undefined): string => (follow !== undefined && 'correction' in follow ? follow.correction : 'unknown');

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
        const next = round(written.text, ground, { contract: summarizer.contract ?? 'strict', retryLeft: attempt < ATTEMPTS - 1, stats, keep: keepOf(follow) });
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
