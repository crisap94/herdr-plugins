import type { Lane } from '#src/recap/domain/lane.ts';
import type { Prompted } from '#src/ports/agents.ts';
import { saying, unknown } from '#src/ports/unknowable.ts';
import { LEASE_TTL_MS } from '#src/recap/domain/typing-lease.ts';
import { duration } from '#src/recap/domain/time.ts';
import { figuresOf } from '#src/recap/render/compaction-stage.ts';
import { outcomeOf } from './compaction-outcome.ts';
import type { OutcomeDeps, Verdict } from './compaction-outcome.ts';
import type { CompactionDeps } from './compaction-deps.ts';
import { guidanceOf, restoreFrom, restoreOf } from './compaction-message.ts';
import type { Material } from './compaction-message.ts';
import type { Trail } from './compaction-trail.ts';

const CONFIRM_READS = 20;
const CONFIRM_MS = 1000;
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

    private async attempt(lane: Lane, command: () => Promise<Prompted>): Promise<Tried> {
        const since = this.deps.now();
        const sent = await this.typed(String(lane.pane), command);
        if (sent.kind !== 'sent') {
            return { sent, verdict: null };
        }
        return { sent, verdict: await this.confirmed(lane, since) };
    }

    private async confirmed(lane: Lane, since: number): Promise<Verdict> {
        const deps: OutcomeDeps = { settling: this.deps.settling, marks: (each) => this.deps.marks(each), pause: (ms) => this.deps.pause(ms) };
        if (String(lane.agent) === 'claude') {
            return outcomeOf(deps, lane, since, true);
        }
        let verdict = await outcomeOf(deps, lane, since, false);
        for (let read = 1; read < CONFIRM_READS && verdict.outcome === 'unconfirmed'; read += 1) {
            await this.deps.pause(CONFIRM_MS);
            verdict = await outcomeOf(deps, lane, since, false);
        }
        return verdict;
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

    private commandOf(lane: Lane, text: Text): () => Promise<Prompted> {
        const pane = String(lane.pane);
        if (String(lane.agent) === 'claude') {
            return () => this.deps.agents.typeLine(pane, ['/compact ', text.brief ?? guidanceOf(text.material)]);
        }
        return () => this.deps.agents.typeLine(pane, ['/compact']);
    }

    private async restore(lane: Lane, text: Text, trail: Trail): Promise<void> {
        trail.to('restoring');
        const message = text.brief === null ? restoreOf(text.material) : restoreFrom(text.brief);
        const pane = String(lane.pane);
        const since = this.deps.now();
        const sent = await this.typed(pane, () => this.deps.agents.prompt(pane, message));
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

    async send(lane: Lane, text: Text, trail: Trail): Promise<void> {
        const claude = String(lane.agent) === 'claude';
        const command = this.commandOf(lane, text);
        const began = this.deps.now();
        let tried = await this.attempt(lane, command);
        const retried = claude && tried.verdict?.outcome === 'failed';
        tried = retried ? await this.attempt(lane, command) : tried;
        if (tried.sent.kind !== 'sent') {
            await this.refused(lane, trail, tried.sent);
            return;
        }
        const verdict = tried.verdict ?? { outcome: 'unconfirmed' as const };
        if (!claude && verdict.outcome !== 'failed') {
            await this.restore(lane, text, trail);
        }
        await this.conclude(lane, trail, { verdict, retried, began });
    }
}
