// The part of a compaction that types into the agent and waits for it: the command, the confirmation from its records, the restore message.
import type { Lane } from '#src/recap/domain/lane.ts';
import type { Prompted } from '#src/ports/agents.ts';
import { saying } from '#src/ports/unknowable.ts';
import { figuresOf } from '#src/recap/render/compaction-stage.ts';
import { outcomeOf } from './compaction-outcome.ts';
import type { OutcomeDeps, Verdict } from './compaction-outcome.ts';
import type { CompactionDeps } from './compaction-deps.ts';
import { guidanceOf, restoreFrom, restoreOf } from './compaction-message.ts';
import type { Material } from './compaction-message.ts';
import type { Trail } from './compaction-trail.ts';

/** codex and opencode compact at once, with no turn herdr can see: their records are read this many times, a second apart, until they say. */
const CONFIRM_READS = 20;
const CONFIRM_MS = 1000;
/** The restore message's answer is waited for this long; the compaction is finished after it anyway. */
const RESTORING_MS = 2 * 60_000;
/** After the restore message went in, the lane's own turn for it (herdr's working → done pushes) is waited for this long, so that it cannot count as the operator's next turn. */
const RESTORE_SETTLE_MS = 15_000;

/** What is sent: the material the template is built from, and the written brief when there is one. */
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

    /** One go at the compaction command: typed, then confirmed on herdr's push from the agent's own records. */
    private async attempt(lane: Lane, command: () => Promise<Prompted>): Promise<Tried> {
        const since = this.deps.now();
        const sent = await command();
        if (sent.kind !== 'sent') {
            return { sent, verdict: null };
        }
        return { sent, verdict: await this.confirmed(lane, since) };
    }

    /** claude's compaction is a turn herdr pushes the end of; the others' happens on the spot, so their records are simply read until they say. */
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

    /** Typing refused or failed: the record says why, once. */
    private async refused(lane: Lane, trail: Trail, sent: Exclude<Prompted, { kind: 'sent' }>): Promise<void> {
        const { compaction, badge } = this.deps.messages();
        const why = sent.kind === 'blocked' ? badge.blocked : saying(sent.why);
        trail.end('failed', { why });
        await this.tell(compaction.title(String(lane.agent)), compaction.failed(String(lane.agent), why));
    }

    /** claude takes `/compact ` and then its guidance, typed in two pieces; the others take their own `/compact`, typed too: sent as a prompt it is a message to them, not a command. */
    private commandOf(lane: Lane, text: Text): () => Promise<Prompted> {
        const pane = String(lane.pane);
        if (String(lane.agent) === 'claude') {
            return () => this.deps.agents.typeLine(pane, ['/compact ', text.brief ?? guidanceOf(text.material)]);
        }
        return () => this.deps.agents.typeLine(pane, ['/compact']);
    }

    /** What the others are told once compacted: where things stand. Waited for, so that the record ends after the answer. */
    private async restore(lane: Lane, text: Text, trail: Trail): Promise<void> {
        trail.to('restoring');
        const message = text.brief === null ? restoreOf(text.material) : restoreFrom(text.brief);
        const since = this.deps.now();
        const sent = await this.deps.agents.prompt(String(lane.pane), message, { until: ['idle', 'done'], timeoutMs: RESTORING_MS });
        if (sent.kind === 'sent') {
            await this.deps.settling.settled(String(lane.pane), since, RESTORE_SETTLE_MS);
        }
    }

    /** The record's end and the toast, with the numbers the agent's records gave (the time is the stage time when they did not). */
    private async conclude(lane: Lane, trail: Trail, ended: { readonly verdict: Verdict; readonly retried: boolean; readonly began: number }): Promise<void> {
        const { verdict, retried } = ended;
        const { compaction } = this.deps.messages();
        const figures = { tokensBefore: verdict.tokensBefore ?? null, tokensAfter: verdict.tokensAfter ?? null, tookMs: verdict.tookMs ?? this.deps.now() - ended.began };
        trail.end(verdict.outcome, { ...figures, retried, ...(verdict.outcome === 'failed' ? { why: compaction.stage.selfFailed } : {}) });
        const said = figuresOf(figures, this.deps.messages());
        await this.tell(compaction.title(String(lane.agent)), compaction.outcome(String(lane.agent), verdict.outcome, retried, { tokens: said.tokens, took: said.took }));
    }

    /** The one place anything is typed into an agent: the compaction command (once more for claude when its own summarizer failed), then, for the others, the reminder. */
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
