import type { Instant } from '#src/recap/domain/time.ts';
import type { Usd } from '#src/contract/kernel.ts';
import { brand, type Brand } from '#src/recap/domain/brand.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { InputFact } from '#src/ports/recap-input.ts';
import type { Correction, RecapRequest, Writer } from '#src/ports/summarizer.ts';
import { addStats, correctionOf, NO_STATS } from '#src/recap/domain/gates/gatekeeper.ts';
import type { GateStats } from '#src/recap/domain/gates/gatekeeper.ts';
import type { Gate } from '#src/recap/domain/gates/gate.ts';
import type { TaskOps } from '#src/recap/domain/ops.ts';
import { parseAnswer } from './ops-answer.ts';
import type { Resolving, Tasked } from './ops-answer.ts';
import { forTask, keptOf, refusedIn, retryFor } from './ops-gating.ts';
import type { Judged, TaskGround } from './ops-gating.ts';
import type { JobContract } from '#src/recap/domain/backend.ts';
import { batch } from './job-kit/batch.ts';

const ATTEMPTS = 2;

const textOf = brand<string, 'Text'>;
const usd = brand<number, 'Usd'>;
const canRetry = brand<boolean, 'RetryLeft'>;

type RetryLeft = Brand<boolean, 'RetryLeft'>;

export const OLD_CONTRACT = textOf('custom writer must answer operations (see README)');

export interface OpsExtracted { readonly kind: 'ops'; readonly tasks: readonly TaskOps[]; readonly cost: Usd; readonly stats: GateStats }

export interface FailedExtraction { readonly kind: 'failed'; readonly error: Text; readonly cost: Usd }

export type Extracted = OpsExtracted | FailedExtraction;

export interface Ground {
    readonly resolving: Resolving;
    readonly grounds: readonly TaskGround[];
    readonly gates: readonly Gate[];
    readonly now: Instant;
    readonly facts: ReadonlyMap<Text, InputFact>;
    readonly targeted?: boolean;
}

const OLD_HINT = textOf('you answered a recap; answer operations on the ledger only: {"ops":[{"op":"add",…},{"op":"update",…},{"op":"close",…}]}');

const gatesFor = (ground: Ground, contract: JobContract): readonly Gate[] => (contract === 'free-text' ? ground.gates.filter((gate) => gate.id !== 'G11') : ground.gates);

function judged(ground: Ground, ops: readonly Tasked[], contract: JobContract): readonly Judged[] {
    return ground.grounds.map((each) => batch('writer', { gates: gatesFor(ground, contract), task: each, at: ground.now }, forTask(ops, each.key)));
}

interface Outcome {
    readonly tasks: readonly TaskOps[];
    readonly stats: GateStats;
}

interface CorrectionFollow { readonly correction: Text }

interface RetryFollow { readonly retry: Correction; readonly keep: readonly Tasked[] }

type Follow = CorrectionFollow | RetryFollow;

type Followed = Follow | undefined;

type Round =
    | ({ readonly kind: 'done' } & Outcome)
    | { readonly kind: 'retry'; readonly follow: Follow; readonly stats: GateStats; readonly fallback: Outcome | null }
    | { readonly kind: 'failed'; readonly error: Text };

interface Turn {
    readonly contract: JobContract;
    readonly retryLeft: RetryLeft;
    readonly stats: GateStats;
    readonly keep: readonly Tasked[];
}

function followOf(each: readonly Judged[], ground: Ground, problems: readonly Text[]): Follow {
    if (ground.targeted === false) {
        const lines = each.map((one) => correctionOf(one.given, one.refused)).filter((line) => line !== '');
        return { correction: textOf([...lines, ...problems.map((problem) => `shape: ${problem}`)].join('\n')) };
    }
    return { retry: retryFor(each, { tasks: ground.grounds, facts: ground.facts }, problems), keep: keptOf(each, ground.grounds) };
}

function round(text: Text, ground: Ground, turn: Turn): Round {
    const answer = parseAnswer(text, ground.resolving);
    if (answer.kind === 'old-shape' && turn.contract === 'free-text') {
        return { kind: 'failed', error: OLD_CONTRACT };
    }
    if (answer.kind !== 'ops') {
        return { kind: 'retry', follow: { correction: answer.kind === 'old-shape' ? OLD_HINT : answer.why }, stats: turn.stats, fallback: null };
    }
    const each = judged(ground, [...turn.keep, ...answer.ops], turn.contract);
    const final: Outcome = {
        tasks: each.map((one, at) => ({ task: ground.grounds[at]?.key ?? textOf(''), ops: one.kept })).filter((one) => one.ops.length > 0),
        stats: each.reduce((all, one) => addStats(all, one.gated, brand<number, 'Count'>(one.refused.length)), turn.stats),
    };
    if (turn.retryLeft && (refusedIn(each) > 0 || answer.problems.length > 0)) {
        const counted = each.reduce((all, one) => addStats(all, one.gated), turn.stats);
        return { kind: 'retry', follow: followOf(each, ground, answer.problems.map(textOf)), stats: counted, fallback: final };
    }
    return { kind: 'done', ...final };
}

const settled = (fallback: Outcome, cost: Usd): Extracted => ({ kind: 'ops', tasks: fallback.tasks, cost, stats: fallback.stats });

const asked = (request: RecapRequest, follow: Followed): RecapRequest =>
    follow === undefined ? request : { ...request, ...('retry' in follow ? { retry: follow.retry } : { correction: follow.correction }) };

const keepOf = (follow: Followed): readonly Tasked[] => (follow !== undefined && 'retry' in follow ? follow.keep : []);

const whyOf = (follow: Followed): Text => (follow !== undefined && 'correction' in follow ? follow.correction : textOf('unknown'));

export async function extract(summarizer: Writer, request: RecapRequest, ground: Ground): Promise<Extracted> {
    let cost = usd(0);
    let stats = NO_STATS;
    let follow: Followed;
    let fallback: Outcome | null = null;
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
        const written = await summarizer.write(asked(request, follow));
        if (isUnknown(written)) {
            return fallback === null ? { kind: 'failed', error: saying(written.why), cost } : settled(fallback, cost);
        }
        cost = usd(cost + written.costUsd);
        const next = round(written.text, ground, { contract: summarizer.contract, retryLeft: canRetry(attempt < ATTEMPTS - 1), stats, keep: keepOf(follow) });
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
    return fallback === null ? { kind: 'failed', error: textOf(`the writer's answer was not usable (${whyOf(follow)}); the ledger is unchanged`), cost } : settled(fallback, cost);
}
