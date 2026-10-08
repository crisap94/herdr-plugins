// Autocompact: when a lane's agent is free and its context is full enough, ask the decider whether this is a safe moment, record the
// decision, and (when `on`) ask for a compaction through the operator's own request path. Typing stays in the compaction flow.
import type { AutocompactRecords, Decision, DecisionVerdict, SkipGate } from '#src/ports/autocompact-records.ts';
import type { Boundaries } from '#src/ports/boundaries.ts';
import type { CompactionView } from '#src/ports/compaction-records.ts';
import type { Decider } from '#src/ports/decider.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { Requests } from '#src/ports/requests.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { gateOf } from '#src/recap/domain/autocompact.ts';
import type { Gate } from '#src/recap/domain/autocompact.ts';
import type { AutocompactPolicy } from '#src/recap/domain/autocompact.ts';
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

/** The work a lane's agent has in flight: a count, or `unknown` with the reason the reader gave (it counts as in flight). */
export interface FlightAnswer {
    readonly count: number | 'unknown';
    readonly why: string;
}

/** Where a consideration stopped: the gate, whether the kind is record-only, and the detail a skip keeps. */
interface Stop {
    readonly gate: Gate;
    readonly recordOnly: boolean;
    readonly detail: string | null;
}

export interface AutocompactDeps {
    /** read on every consideration, so a change applies without a restart */
    policy(): AutocompactPolicy;
    decider(): Decider | null;
    readonly contexts: { of(pane: string): ContextUse | null };
    /** work the lane's agent started and has not ended; `unknown` for a reader that cannot tell */
    inFlight(lane: Lane): Promise<FlightAnswer>;
    recent(lane: Lane): Promise<readonly Entry[]>;
    readonly ledger: Pick<Ledger, 'historyOf'>;
    readonly boundaries: Pick<Boundaries, 'lastBreakAt'>;
    readonly compactions: Pick<CompactionView, 'shownFor' | 'autoInProgress'>;
    readonly decisions: Pick<AutocompactRecords, 'record' | 'skip' | 'lastDecisionAt' | 'lastDecision' | 'unlinkedCompactSince' | 'unlinkedCompactAny'>;
    /** when this daemon process started (epoch ms): a decision made before it is a change */
    readonly startedAt: number;
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
    /** the gate of each lane's last logged skip: a skip is logged again only when its gate changed */
    private readonly skipped = new Map<string, SkipGate>();
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

    /** A compaction of this lane is in progress or was asked for (`this lane`); an automatic one of another lane is, or was asked for (`another lane`). */
    private busyOf(tab: string, pane: string): { readonly busy: boolean; readonly detail: string | null } {
        const { deps } = this;
        const since = this.asked.get(pane);
        const now = deps.now();
        const own = deps.compactions.shownFor(tab).some((record) => record.pane === pane && ACTIVE.has(record.stage)) || (since !== undefined && now - since < ASKED_FOR_MS) || deps.decisions.unlinkedCompactSince(tab, pane, now - ASKED_FOR_MS);
        if (own) return { busy: true, detail: 'this lane' };
        const other = deps.compactions.autoInProgress() || deps.decisions.unlinkedCompactAny(now - ASKED_FOR_MS);
        return other ? { busy: true, detail: 'another lane' } : { busy: false, detail: null };
    }

    /** The same tokens and mode as the lane's last decision, made by this process: nothing changed since. */
    private unchangedOf(tab: string, pane: string, use: ContextUse, policy: AutocompactPolicy): boolean {
        const last = this.deps.decisions.lastDecision(tab, pane);
        return last !== null && last.at >= this.deps.startedAt && last.tokens === use.tokens && last.mode === policy.mode;
    }

    /** Where the gates stop this lane: `ask` or `ceiling` go on, anything else is a skip. The in-flight reader runs only when the lane would otherwise be asked. */
    private async gated(lane: Lane, policy: AutocompactPolicy, use: ContextUse): Promise<Stop> {
        const { deps } = this;
        const [tab, pane] = [String(lane.tab), String(lane.pane)];
        const busy = this.busyOf(tab, pane);
        const lastBreakAt = deps.boundaries.lastBreakAt(tab, pane);
        const lastDecisionAt = deps.decisions.lastDecisionAt(tab, pane);
        const facts = {
            kind: String(lane.agent), kinds: policy.kinds, busy: busy.busy, share: shareOf(use), minimum: policy.minimum, ceiling: policy.ceiling,
            now: deps.now(), lastBreakAt, lastDecisionAt, cooldownMs: policy.cooldownMs, unchanged: this.unchangedOf(tab, pane, use, policy),
        };
        const cheap = gateOf({ ...facts, inFlight: null });
        if (cheap.gate !== 'ask' && cheap.gate !== 'ceiling') return { ...cheap, detail: this.detailOf(cheap.gate, facts, policy, busy.detail, null) };
        const flight = await deps.inFlight(lane);
        const full = gateOf({ ...facts, inFlight: flight.count });
        return { ...full, detail: this.detailOf(full.gate, facts, policy, busy.detail, flight) };
    }

    /** What a skip says about its gate, in a few words; null for the gates that decide. */
    private detailOf(gate: Gate, facts: { readonly lastBreakAt: number | null; readonly lastDecisionAt: number | null; readonly now: number; readonly cooldownMs: number }, policy: AutocompactPolicy, busy: string | null, flight: FlightAnswer | null): string | null {
        if (gate === 'busy') return busy;
        if (gate === 'below-minimum') return `below ${policy.minimum} %`;
        if (gate === 'cooldown') return `${Math.ceil((facts.cooldownMs - (facts.now - Math.max(facts.lastBreakAt ?? -Infinity, facts.lastDecisionAt ?? -Infinity))) / 1000)} s left`;
        if (gate === 'unchanged') return 'same tokens and mode as the last decision';
        if (gate !== 'in-flight' || flight === null) return null;
        return flight.count === 'unknown' ? flight.why : `${flight.count} running`;
    }

    /** Records the lane's latest skip, and logs it only when its gate differs from the lane's last logged skip. */
    private skip(lane: Lane, gate: SkipGate, share: number | null, detail: string | null): void {
        const pane = String(lane.pane);
        this.deps.decisions.skip({ tab: String(lane.tab), pane, agent: String(lane.agent), at: this.deps.now(), gate, share, detail });
        if (this.skipped.get(pane) === gate) return;
        this.skipped.set(pane, gate);
        this.deps.log(`autocompact ${pane}: ${share === null ? '? %' : `${share} %`} → skip ${gate}${detail === null ? '' : ` (${detail})`}`);
    }

    private async run(lane: Lane): Promise<void> {
        const { deps } = this;
        const policy = deps.policy();
        const [tab, pane, use] = [String(lane.tab), String(lane.pane), deps.contexts.of(String(lane.pane))];
        if (policy.mode === 'off') return;
        if (use === null) { this.skip(lane, 'no-context', null, 'the context share is not known yet'); return; }
        const { gate, recordOnly, detail } = await this.gated(lane, policy, use);
        if (gate !== 'ask' && gate !== 'ceiling') { this.skip(lane, gate, shareOf(use), detail); return; }
        if (!deps.hasRecap(tab)) await deps.refresh(tab, deps.lanes(tab));
        const judged = gate === 'ceiling' ? CEILING : await this.asking(lane);
        const made: Decision = {
            tab, pane, agent: String(lane.agent), at: deps.now(), mode: policy.mode, share: shareOf(use), tokens: use.tokens, window: use.window, gate, verdict: judged.verdict,
            answers: judged.answers, coverage: null, decider: judged.decider, costUsd: judged.costUsd, tookMs: judged.tookMs, why: judged.why,
        };
        deps.decisions.record(made);
        this.skipped.delete(pane);
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
