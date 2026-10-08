// Autocompact: when a lane's agent is free and its context is full enough, ask the decider whether this is a safe moment, record the
// decision, and (when `on`) ask for a compaction through the operator's own request path. Typing stays in the compaction flow.
import type { AutocompactRecords, Decision, DecisionVerdict } from '#src/ports/autocompact-records.ts';
import type { Boundaries } from '#src/ports/boundaries.ts';
import type { CompactionView } from '#src/ports/compaction-records.ts';
import type { Decider } from '#src/ports/decider.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { Requests } from '#src/ports/requests.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { gateOf } from '#src/recap/domain/autocompact.ts';
import type { AutocompactPolicy, Gate } from '#src/recap/domain/autocompact.ts';
import { verdictOf } from '#src/recap/domain/autocompact-verdict.ts';
import { shareOf } from '#src/recap/domain/compaction.ts';
import type { ContextUse } from '#src/recap/domain/compaction.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { autocompactState } from './autocompact-state.ts';
import { QUESTIONS } from './autocompact-questions.ts';

const READY = new Set(['idle', 'done']);
const ACTIVE = new Set(['briefing', 'compacting', 'restoring']);
/** A compaction asked for and not yet begun counts as in progress this long: longer than the worst gap (the recap wait, the queue poll). */
const ASKED_FOR_MS = 5 * 60_000;

export interface AutocompactDeps {
    /** read on every consideration, so a change applies without a restart */
    policy(): AutocompactPolicy;
    decider(): Decider | null;
    readonly contexts: { of(pane: string): ContextUse | null };
    /** work the lane's agent started and has not ended; `unknown` for a reader that cannot tell */
    inFlight(lane: Lane): Promise<number | 'unknown'>;
    recent(lane: Lane): Promise<readonly Entry[]>;
    readonly ledger: Pick<Ledger, 'historyOf'>;
    readonly boundaries: Pick<Boundaries, 'lastBreakAt'>;
    readonly compactions: Pick<CompactionView, 'shownFor'>;
    readonly decisions: Pick<AutocompactRecords, 'record' | 'lastDecisionAt' | 'unlinkedCompactSince'>;
    readonly requests: Pick<Requests, 'requestCompact'>;
    /** the tab has a recap written (a lane with none gets one first) */
    hasRecap(tab: string): boolean;
    refresh(tab: string, lanes: readonly Lane[]): Promise<void>;
    lanes(tab: string): readonly Lane[];
    now(): number;
    log(line: string): void;
}

interface Judged {
    readonly verdict: DecisionVerdict;
    readonly answers: Readonly<Record<string, number>>;
    readonly why: string | null;
    readonly decider: string | null;
    readonly costUsd: number;
    readonly tookMs: number | null;
}

/** Over the ceiling no model is asked. */
const CEILING: Judged = { verdict: 'compact', answers: {}, why: null, decider: null, costUsd: 0, tookMs: null };
const UNKNOWN: Judged = { verdict: 'unknown', answers: {}, why: null, decider: null, costUsd: 0, tookMs: null };

const WORDS: Readonly<Record<string, string>> = { closes_request: 'closes', announces_continuation: 'continues', asks_detailed_choice: 'choice', needs_verbatim: 'verbatim', changes_subject: 'subject', stuck: 'stuck' };

export class Autocompact {
    private readonly deps: AutocompactDeps;
    private readonly considering = new Set<string>();
    private readonly asked = new Map<string, number>();
    private outage = false;

    constructor(deps: AutocompactDeps) {
        this.deps = deps;
    }

    /** A lane's agent became idle or done and its context was looked at again. Never throws; one consideration per pane at a time. */
    async consider(lane: Lane): Promise<void> {
        const pane = String(lane.pane);
        if (!READY.has(lane.status) || this.considering.has(pane)) return;
        this.considering.add(pane);
        try {
            await this.run(lane);
        } catch (error) {
            this.deps.log(`autocompact ${pane}: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.considering.delete(pane);
        }
    }

    /** A compaction is in progress, or was asked for and has not begun (in this process, or as a decision not yet linked to one). */
    private busy(tab: string, pane: string): boolean {
        const since = this.asked.get(pane);
        const now = this.deps.now();
        return this.deps.compactions.shownFor(tab).some((record) => record.pane === pane && ACTIVE.has(record.stage)) || (since !== undefined && now - since < ASKED_FOR_MS) || this.deps.decisions.unlinkedCompactSince(tab, pane, now - ASKED_FOR_MS);
    }

    /** Where the gates stop this lane: `ask` or `ceiling` go on, anything else is no decision. The in-flight reader runs only when the lane would otherwise be asked. */
    private async gated(lane: Lane, policy: AutocompactPolicy, use: ContextUse): Promise<{ gate: Gate; recordOnly: boolean }> {
        const { deps } = this;
        const [tab, pane] = [String(lane.tab), String(lane.pane)];
        const facts = {
            kind: String(lane.agent), kinds: policy.kinds, busy: this.busy(tab, pane), share: shareOf(use), soft: policy.soft, ceiling: policy.ceiling,
            now: deps.now(), lastBreakAt: deps.boundaries.lastBreakAt(tab, pane), lastDecisionAt: deps.decisions.lastDecisionAt(tab, pane), cooldownMs: policy.cooldownMs,
        };
        const cheap = gateOf({ ...facts, inFlight: null });
        if (cheap.gate !== 'ask' && cheap.gate !== 'ceiling') return cheap;
        return gateOf({ ...facts, inFlight: await deps.inFlight(lane) });
    }

    private async run(lane: Lane): Promise<void> {
        const { deps } = this;
        const policy = deps.policy();
        const [tab, pane, use] = [String(lane.tab), String(lane.pane), deps.contexts.of(String(lane.pane))];
        if (policy.mode === 'off' || use === null) return;
        const { gate, recordOnly } = await this.gated(lane, policy, use);
        if (gate !== 'ask' && gate !== 'ceiling') return;
        if (!deps.hasRecap(tab)) await deps.refresh(tab, deps.lanes(tab));
        const judged = gate === 'ceiling' ? CEILING : await this.asking(lane);
        const made: Decision = {
            tab, pane, agent: String(lane.agent), at: deps.now(), mode: policy.mode, share: shareOf(use), tokens: use.tokens, window: use.window, gate, verdict: judged.verdict,
            answers: judged.answers, coverage: null, decider: judged.decider, costUsd: judged.costUsd, tookMs: judged.tookMs, why: judged.why,
        };
        deps.decisions.record(made);
        deps.log(this.line(made, recordOnly));
        if (policy.mode === 'on' && judged.verdict === 'compact' && !recordOnly) {
            this.asked.set(pane, deps.now());
            deps.requests.requestCompact({ tab, pane, note: null, origin: 'auto' });
        }
    }

    /** The decider's answers about the moment, and the verdict made from them in code; one log line per outage. */
    private async asking(lane: Lane): Promise<Judged> {
        const decider = this.deps.decider();
        const state = autocompactState(await this.deps.recent(lane), this.deps.ledger.historyOf(String(lane.tab), String(lane.pane)));
        const answered = decider === null ? null : await decider.ask(state, QUESTIONS);
        if (answered === null || isUnknown(answered)) {
            const why = answered === null ? 'no decider is set up' : saying(answered.why);
            if (!this.outage) this.deps.log(`autocompact: the decider is unreachable (${why}); decisions are unknown until it answers`);
            this.outage = true;
            return { ...UNKNOWN, why, decider: decider?.label ?? null };
        }
        this.outage = false;
        return { verdict: verdictOf(answered.answers), answers: answered.answers, why: null, decider: decider?.label ?? null, costUsd: answered.costUsd, tookMs: answered.tookMs };
    }

    /** `autocompact w1:p2: 61 % · closes 0.91 · … → compact (shadow)` */
    private line(made: Decision, recordOnly: boolean): string {
        const figures = Object.entries(made.answers).map(([id, value]) => `${WORDS[id] ?? id} ${value.toFixed(2)}`);
        const tag = [made.gate === 'ceiling' ? 'ceiling' : null, made.mode, recordOnly ? 'record-only' : null].filter((part) => part !== null).join(', ');
        return `autocompact ${made.pane}: ${[`${made.share} %`, ...figures].join(' · ')} → ${made.verdict} (${tag})${made.why === null ? '' : `: ${made.why}`}`;
    }
}
