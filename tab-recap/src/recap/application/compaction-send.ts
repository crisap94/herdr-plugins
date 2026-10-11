import type { Lane } from '#src/recap/domain/lane.ts';
import type { CompactionPlan, CompactionPlanResult, Unsupported } from '#src/recap/domain/compaction-plan.ts';
import type { Prompted } from '#src/ports/agents.ts';
import { saying, unknown } from '#src/ports/unknowable.ts';
import { LEASE_TTL_MS } from '#src/recap/domain/typing-lease.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import { duration, instant, type Instant } from '#src/recap/domain/time.ts';
import { figuresOf } from '#src/recap/render/compaction-stage.ts';
import { COMPACT_FAILURES } from '#src/protocol/exchanges/compact.ts';
import { confirmedOutcomeOf, outcomeOf, queuedOutcomeOf } from './compaction-outcome.ts';
import type { QueuedDeps, Verdict } from './compaction-outcome.ts';
import type { CompactionDeps } from './compaction-deps.ts';
import { guidanceOf, restoreFrom, restoreOf } from './compaction-message.ts';
import type { Material } from './compaction-message.ts';
import type { Trail } from './compaction-trail.ts';
import { withTypingLease } from './typing-scope.ts';
import type { Lease } from './typing-scope.ts';

const RESTORING_MS = 2 * 60_000;
const RESTORE_SETTLE_MS = 15_000;

export interface Text {
    readonly material: Material;
    readonly brief: string | null;
}

export interface Placed {
    readonly queued: boolean;
}

export const NOT_QUEUED: Placed = { queued: false };

interface Tried {
    readonly sent: Prompted;
    readonly verdict: Verdict | null;
}

export class Sender {
    private readonly deps: CompactionDeps;

    constructor(deps: CompactionDeps) {
        this.deps = deps;
    }

    private now(): Instant {
        return instant(this.deps.now());
    }

    private async typed(pane: PaneId, type: () => Promise<Prompted>): Promise<Prompted> {
        const typing = this.deps.typing;
        const lease: Lease | undefined = typing === undefined ? undefined : { acquire: () => typing.acquire(pane), release: () => typing.release(pane) };
        const leased = await withTypingLease(lease, type);
        return leased.kind === 'busy' ? unknown({ why: 'lease', after: duration(LEASE_TTL_MS) }) : leased.value;
    }

    private async attempt(lane: Lane, plan: CompactionPlan, trail: Trail, queued: boolean): Promise<Tried> {
        const since = this.now();
        const pane = lane.pane;
        const sent = await this.typed(pane, async () => {
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
        return { sent, verdict: await this.confirmed(lane, since, plan, trail, queued) };
    }

    private async confirmed(lane: Lane, since: Instant, plan: CompactionPlan, trail: Trail, queued: boolean): Promise<Verdict> {
        const deps: QueuedDeps = { settling: this.deps.settling, marks: (each) => this.deps.marks(each), pause: (ms) => this.deps.pause(ms), now: () => this.now() };
        switch (plan.confirm.kind) {
            case 'turn-end':
                return queued ? queuedOutcomeOf(deps, lane, since, () => { trail.to('compacting', { queued: false }); }) : outcomeOf(deps, lane, since);
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

    private async tell(title: string, body: string): Promise<void> {
        const shown = await this.deps.notifier.notify(title, body);
        if (shown.kind === 'unknown') {
            this.deps.log('compaction: toast not shown');
        }
    }

    private async refused(lane: Lane, trail: Trail, sent: Exclude<Prompted, { kind: 'sent' }>): Promise<void> {
        const { compaction, badge } = this.deps.messages();
        const why = sent.kind === 'blocked' ? badge.blocked : saying(sent.why);
        trail.end('failed', { why }, sent.kind === 'blocked' ? COMPACT_FAILURES.skipped : COMPACT_FAILURES.error);
        await this.tell(compaction.title(String(lane.agent)), compaction.failed(String(lane.agent), why));
    }

    private async restore(lane: Lane, text: Text, plan: CompactionPlan, trail: Trail): Promise<void> {
        const followUp = plan.followUp;
        if (followUp.kind === 'none') {
            return;
        }
        trail.to('restoring');
        const message = text.brief === null ? restoreOf(text.material) : restoreFrom(text.brief);
        const pane = lane.pane;
        const since = this.now();
        const sent = await this.typed(pane, () => this.deps.agents.prompt(pane, message, undefined, { acceptsStall: followUp.acceptsStall }));
        if (sent.kind === 'sent') {
            await this.deps.settling.settled(pane, since, RESTORING_MS);
            await this.deps.settling.settled(pane, since, RESTORE_SETTLE_MS);
        }
    }

    private async conclude(lane: Lane, trail: Trail, ended: { readonly verdict: Verdict; readonly retried: boolean; readonly began: Instant }): Promise<void> {
        const { verdict, retried } = ended;
        const { compaction } = this.deps.messages();
        const figures = { tokensBefore: verdict.tokensBefore ?? null, tokensAfter: verdict.tokensAfter ?? null, tookMs: verdict.tookMs ?? this.deps.now() - ended.began };
        trail.end(verdict.outcome, { ...figures, retried, ...(verdict.outcome === 'failed' ? { why: compaction.stage.selfFailed } : {}) });
        const said = figuresOf(figures, this.deps.messages());
        await this.tell(compaction.title(String(lane.agent)), compaction.outcome(String(lane.agent), verdict.outcome, retried, { tokens: said.tokens, took: said.took }));
    }

    private async attemptedOnce(lane: Lane, plan: CompactionPlan, trail: Trail, queued: boolean): Promise<{ readonly tried: Tried; readonly retried: boolean }> {
        const first = await this.attempt(lane, plan, trail, queued);
        const retried = plan.retryOnSelfFailure && first.verdict?.outcome === 'failed';
        if (!retried) {
            return { tried: first, retried };
        }
        trail.to('compacting', { queued: false });
        return { tried: await this.attempt(lane, plan, trail, false), retried };
    }

    async send(lane: Lane, text: Text, trail: Trail, placed: Placed): Promise<Unsupported | undefined> {
        const resolved: CompactionPlanResult = this.deps.compactionPlans.forKind(String(lane.agent), text.brief ?? guidanceOf(text.material));
        if (resolved.kind === 'unsupported') {
            trail.end('failed', { why: resolved.why });
            return resolved;
        }
        const plan = resolved.plan;
        const began = this.now();
        if (placed.queued) trail.to('compacting', { queued: true });
        const { tried, retried } = await this.attemptedOnce(lane, plan, trail, placed.queued);
        if (tried.sent.kind !== 'sent') {
            await this.refused(lane, trail, tried.sent);
            return undefined;
        }
        const verdict = tried.verdict ?? { outcome: 'unconfirmed' as const };
        if (plan.followUp.kind === 'restore-message' && verdict.outcome !== 'failed') {
            await this.restore(lane, text, plan, trail);
        }
        await this.conclude(lane, trail, { verdict, retried, began });
        return undefined;
    }
}
