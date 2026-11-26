import { countOf } from '@stateforge-labs/session-ledger';
import type { FollowedSession } from '#src/recap/domain/lane.ts';
import type { CompactionPlan, CompactionPlanResult, Unsupported } from '#src/recap/domain/compaction-plan.ts';
import type { Prompted } from '#src/ports/agents.ts';
import { saying, unknown } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { LEASE_TTL_MS } from '#src/recap/domain/typing-lease.ts';
import { uncheckedMilliseconds, type SessionKey } from '#src/recap/domain/ids.ts';
import { parseText, textOf } from '@stateforge-labs/session-ledger';
import { type Text as Prose } from '@stateforge-labs/session-ledger';
import { duration, type Instant } from '@stateforge-labs/session-ledger';
import { figuresOf } from '#src/view-model/compaction-stage.ts';
import { COMPACT_FAILURES } from '#src/protocol/exchanges/compact.ts';
import { confirmedOutcomeOf, outcomeOf, queuedOutcomeOf } from './compaction-outcome.ts';
import type { QueuedDeps, Verdict } from './compaction-outcome.ts';
import type { CompactionPorts } from './compaction-deps.ts';
import { guidanceOf, restoreFrom, restoreOf } from './compaction-message.ts';
import type { Material } from './compaction-message.ts';
import type { Trail } from './compaction-trail.ts';
import { withTypingLease } from './typing-scope.ts';
import type { Lease } from './typing-scope.ts';
import { parseDuration, parseTokens } from '@stateforge-labs/recap-view';
import { maybe } from '#src/view-model/column.ts';
import { wordingOf } from '#src/view-model/wording.ts';

const RESTORING_MS = uncheckedMilliseconds(2 * 60_000);
const RESTORE_SETTLE_MS = uncheckedMilliseconds(15_000);

export type Placement = 'queued' | 'immediate';

export type Retry = 'retried' | 'first-try';

export interface Text {
    readonly material: Material;
    readonly brief: Prose | null;
}

export interface Placed {
    readonly placement: Placement;
}

export const NOT_QUEUED: Placed = { placement: 'immediate' };

interface Tried {
    readonly sent: Prompted;
    readonly verdict: Verdict | null;
}

interface OnceAttempt {
    readonly tried: Tried;
    readonly retry: Retry;
}

interface Ended {
    readonly verdict: Verdict;
    readonly retry: Retry;
    readonly began: Instant;
}

type Unsent = Exclude<Prompted, { kind: 'sent' }>;

export class Sender {
    private readonly deps: CompactionPorts;

    constructor(deps: CompactionPorts) {
        this.deps = deps;
    }

    private now(): Instant {
        return this.deps.now();
    }

    private async typed(pane: SessionKey, type: () => Promise<Prompted>): Promise<Prompted> {
        const typing = this.deps.typing;
        const lease: Lease | undefined = typing === undefined ? undefined : { acquire: () => typing.acquire(pane), release: () => typing.release(pane) };
        const leased = await withTypingLease(lease, type);
        return leased.kind === 'busy' ? unknown({ why: 'lease', after: duration(LEASE_TTL_MS) }) : leased.value;
    }

    private async attempt(lane: FollowedSession, plan: CompactionPlan, trail: Trail, placement: Placement): Promise<Tried> {
        const since = this.now();
        const pane = lane.pane;
        const sent = await this.typed(pane, async (): Promise<Prompted> => {
            for (const line of plan.lines) {
                const typed = await this.deps.agents.typeLine(pane, line, { enterDelay: plan.enterDelay });
                if (typed.kind !== 'sent') {
                    return typed;
                }
            }
            return { kind: 'sent' };
        });
        if (sent.kind !== 'sent') {
            return { sent, verdict: null };
        }
        return { sent, verdict: await this.confirmed(lane, since, plan, trail, placement) };
    }

    private async confirmed(lane: FollowedSession, since: Instant, plan: CompactionPlan, trail: Trail, placement: Placement): Promise<Verdict> {
        const deps: QueuedDeps = { settling: this.deps.settling, marks: (each) => this.deps.marks(each), pause: (ms) => this.deps.pause(ms), now: () => this.now() };
        switch (plan.confirm.kind) {
            case 'turn-end':
                return placement === 'queued' ? queuedOutcomeOf(deps, lane, since, () => { trail.to('compacting', { queue: 'direct' }); }) : outcomeOf(deps, lane, since);
            case 'poll': {
                let verdict = await confirmedOutcomeOf(deps, lane, since);
                for (let read = 1; read < plan.confirm.reads && verdict.outcome === 'unconfirmed'; read += 1) {
                    await this.deps.pause(plan.confirm.every);
                    verdict = await confirmedOutcomeOf(deps, lane, since);
                }
                return verdict;
            }
            default: {
                const exhaustive: never = plan.confirm;
                return exhaustive;
            }
        }
    }

    private async tell(title: Prose, body: Prose): Promise<void> {
        const shown = await this.deps.notifier.notify(title, body);
        if (shown.kind === 'unknown') {
            this.deps.log(must(parseText('compaction: toast not shown')));
        }
    }

    private async refused(lane: FollowedSession, trail: Trail, sent: Unsent): Promise<void> {
        const { compaction, badge } = this.deps.messages();
        const why = sent.kind === 'blocked' ? badge.blocked : saying(sent.why);
        trail.end('failed', { why: textOf(why) }, sent.kind === 'blocked' ? COMPACT_FAILURES.skipped : COMPACT_FAILURES.error);
        await this.tell(must(parseText(compaction.title(must(parseText(lane.agent))))), must(parseText(compaction.failed(must(parseText(lane.agent)), why))));
    }

    private handoff(lane: FollowedSession, plan: CompactionPlan, text: Text): () => Prose | null {
        const message = text.brief === null ? restoreOf(text.material) : restoreFrom(text.brief);
        const restores = this.deps.restores;
        const session = lane.session;
        if (plan.followUp.kind === 'none' || restores === undefined || session === null) {
            return () => message;
        }
        restores.offer(session, message);
        return () => restores.take(session);
    }

    private async restore(lane: FollowedSession, message: Prose | null, plan: CompactionPlan, trail: Trail): Promise<void> {
        const followUp = plan.followUp;
        if (followUp.kind === 'none' || message === null) {
            return;
        }
        trail.to('restoring');
        const pane = lane.pane;
        const since = this.now();
        const sent = await this.typed(pane, () => this.deps.agents.prompt(pane, message, undefined, { stall: followUp.acceptsStall ? 'accepts-stall' : 'refuses-stall' }));
        if (sent.kind === 'sent') {
            await this.deps.settling.settled(pane, since, RESTORING_MS);
            await this.deps.settling.settled(pane, since, RESTORE_SETTLE_MS);
        }
    }

    private async conclude(lane: FollowedSession, trail: Trail, ended: Ended): Promise<void> {
        const { verdict, retry } = ended;
        const retried = retry === 'retried';
        const { compaction } = this.deps.messages();
        const figures = { tokensBefore: verdict.tokensBefore ?? null, tokensAfter: verdict.tokensAfter ?? null, tookMs: verdict.tookMs ?? this.deps.now() - ended.began };
        trail.end(verdict.outcome, { tokensBefore: figures.tokensBefore === null ? null : countOf(figures.tokensBefore), tokensAfter: figures.tokensAfter === null ? null : countOf(figures.tokensAfter), took: duration(figures.tookMs), retry: retried ? 'retried' : 'first-try', ...(verdict.outcome === 'failed' ? { why: textOf(compaction.stage.selfFailed) } : {}) });
        const said = figuresOf({ tokensBefore: maybe(figures.tokensBefore, parseTokens), tokensAfter: maybe(figures.tokensAfter, parseTokens), tookMs: parseDuration(figures.tookMs) }, wordingOf(this.deps.messages()));
        await this.tell(must(parseText(compaction.title(must(parseText(lane.agent))))), must(parseText(compaction.outcome(must(parseText(lane.agent)), verdict.outcome, retried ? 'present' : 'absent', { tokens: must(parseText(said.tokens)), took: must(parseText(said.took)) }))));
    }

    private async attemptedOnce(lane: FollowedSession, plan: CompactionPlan, trail: Trail, placement: Placement): Promise<OnceAttempt> {
        const first = await this.attempt(lane, plan, trail, placement);
        const retry = plan.retryOnSelfFailure && first.verdict?.outcome === 'failed';
        if (!retry) {
            return { tried: first, retry: 'first-try' };
        }
        trail.to('compacting', { queue: 'direct' });
        return { tried: await this.attempt(lane, plan, trail, 'immediate'), retry: 'retried' };
    }

    async send(lane: FollowedSession, text: Text, trail: Trail, placed: Placed): Promise<Unsupported | undefined> {
        const resolved: CompactionPlanResult = this.deps.compactionPlans.forKind(lane.agent, text.brief ?? guidanceOf(text.material));
        if (resolved.kind === 'unsupported') {
            trail.end('failed', { why: textOf(resolved.why) });
            return resolved;
        }
        const plan = resolved.plan;
        const began = this.now();
        if (placed.placement === 'queued') trail.to('compacting', { queue: 'queued' });
        const take = this.handoff(lane, plan, text);
        const { tried, retry } = await this.attemptedOnce(lane, plan, trail, placed.placement);
        const message = take();
        if (tried.sent.kind !== 'sent') {
            await this.refused(lane, trail, tried.sent);
            return undefined;
        }
        const verdict = tried.verdict ?? { outcome: 'unconfirmed' as const };
        if (plan.followUp.kind === 'restore-message' && verdict.outcome !== 'failed') {
            await this.restore(lane, message, plan, trail);
        }
        await this.conclude(lane, trail, { verdict, retry, began });
        return undefined;
    }
}
