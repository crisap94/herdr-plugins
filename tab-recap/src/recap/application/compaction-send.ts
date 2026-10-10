import type { Lane } from '#src/recap/domain/lane.ts';
import type { CompactionPlan, CompactionPlanResult } from '#src/recap/domain/compaction-plan.ts';
import type { Prompted } from '#src/ports/agents.ts';
import { saying, unknown } from '#src/ports/unknowable.ts';
import type { Unsupported } from '#src/recap/domain/compaction-plan.ts';
import { LEASE_TTL_MS } from '#src/recap/domain/typing-lease.ts';
import { duration } from '#src/recap/domain/time.ts';
import { figuresOf } from '#src/recap/render/compaction-stage.ts';
import { outcomeOf } from './compaction-outcome.ts';
import type { OutcomeDeps, Verdict } from './compaction-outcome.ts';
import type { CompactionDeps } from './compaction-deps.ts';
import { guidanceOf, restoreFrom, restoreOf } from './compaction-message.ts';
import type { Material } from './compaction-message.ts';
import type { Trail } from './compaction-trail.ts';

const RESTORING_MS = 2 * 60_000;
const RESTORE_SETTLE_MS = 15_000;

export interface Text {
    readonly material: Material;
    readonly brief: string | null;
}

interface Tried {
    readonly sent: Prompted;
    readonly verdict: Verdict | null;
}

export class Sender {
    private readonly deps: CompactionDeps;

    constructor(deps: CompactionDeps) {
        this.deps = deps;
    }

    private async typed(pane: string, type: () => Promise<Prompted>): Promise<Prompted> {
        const typing = this.deps.typing;
        if (typing === undefined) {
            return type();
        }
        const acquired = await typing.acquire(pane);
        if (acquired === 'busy') {
            return unknown({ why: 'lease', after: duration(LEASE_TTL_MS) });
        }
        try {
            return await type();
        } finally {
            if (acquired === 'taken') {
                await typing.release(pane);
            }
        }
    }

    private async attempt(lane: Lane, plan: CompactionPlan): Promise<Tried> {
        const since = this.deps.now();
        const pane = String(lane.pane);
        const sent = await this.typed(pane, async () => {
            for (const line of plan.lines) {
                const typed = await this.deps.agents.typeLine(pane, line, { enterDelay: plan.enterDelay, acceptsStall: plan.acceptsStall });
                if (typed.kind !== 'sent') {
                    return typed;
                }
            }
            return { kind: 'sent' };
        });
        if (sent.kind !== 'sent') {
            return { sent, verdict: null };
        }
        return { sent, verdict: await this.confirmed(lane, since, plan) };
    }

    private async confirmed(lane: Lane, since: number, plan: CompactionPlan): Promise<Verdict> {
        const deps: OutcomeDeps = { settling: this.deps.settling, marks: (each) => this.deps.marks(each), pause: (ms) => this.deps.pause(ms) };
        switch (plan.confirm.kind) {
            case 'turn-end':
                return outcomeOf(deps, lane, since, true);
            case 'poll': {
                let verdict = await outcomeOf(deps, lane, since, false);
                for (let read = 1; read < plan.confirm.reads && verdict.outcome === 'unconfirmed'; read += 1) {
                    await this.deps.pause(plan.confirm.every);
                    verdict = await outcomeOf(deps, lane, since, false);
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
        trail.end('failed', { why });
        await this.tell(compaction.title(String(lane.agent)), compaction.failed(String(lane.agent), why));
    }

    private async restore(lane: Lane, text: Text, plan: CompactionPlan, trail: Trail): Promise<void> {
        switch (plan.followUp.kind) {
            case 'none':
                return;
            case 'restore-message':
                break;
            default: {
                const exhaustive: never = plan.followUp;
                String(exhaustive);
                return;
            }
        }
        trail.to('restoring');
        const message = text.brief === null ? restoreOf(text.material) : restoreFrom(text.brief);
        const pane = String(lane.pane);
        const since = this.deps.now();
        const sent = await this.typed(pane, () => this.deps.agents.prompt(pane, message, undefined, { acceptsStall: plan.acceptsStall }));
        if (sent.kind === 'sent') {
            await this.deps.settling.settled(pane, since, RESTORING_MS);
            await this.deps.settling.settled(pane, since, RESTORE_SETTLE_MS);
        }
    }

    private async conclude(lane: Lane, trail: Trail, ended: { readonly verdict: Verdict; readonly retried: boolean; readonly began: number }): Promise<void> {
        const { verdict, retried } = ended;
        const { compaction } = this.deps.messages();
        const figures = { tokensBefore: verdict.tokensBefore ?? null, tokensAfter: verdict.tokensAfter ?? null, tookMs: verdict.tookMs ?? this.deps.now() - ended.began };
        trail.end(verdict.outcome, { ...figures, retried, ...(verdict.outcome === 'failed' ? { why: compaction.stage.selfFailed } : {}) });
        const said = figuresOf(figures, this.deps.messages());
        await this.tell(compaction.title(String(lane.agent)), compaction.outcome(String(lane.agent), verdict.outcome, retried, { tokens: said.tokens, took: said.took }));
    }

    async send(lane: Lane, text: Text, trail: Trail): Promise<Unsupported | undefined> {
        const resolved: CompactionPlanResult = this.deps.compactionPlans.forKind(String(lane.agent), text.brief ?? guidanceOf(text.material));
        if (resolved.kind === 'unsupported') {
            trail.end('failed', { why: resolved.why });
            return resolved;
        }
        const plan = resolved.plan;
        const began = this.deps.now();
        let tried = await this.attempt(lane, plan);
        const retried = plan.retryOnSelfFailure && tried.verdict?.outcome === 'failed';
        tried = retried ? await this.attempt(lane, plan) : tried;
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
