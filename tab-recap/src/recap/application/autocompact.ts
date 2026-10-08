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
import { gateOf, READY } from '#src/recap/domain/autocompact.ts';
import type { Gate } from '#src/recap/domain/autocompact.ts';
import type { AutocompactMode, AutocompactPolicy } from '#src/recap/domain/autocompact.ts';
import { verdictOf } from '#src/recap/domain/autocompact-verdict.ts';
import { shareOf } from '#src/recap/domain/compaction.ts';
import type { ContextUse } from '#src/recap/domain/compaction.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { autocompactState } from './autocompact-state.ts';
import { QUESTIONS } from './autocompact-questions.ts';
import { busyOf, detailOf, unchangedOf } from './autocompact-gates.ts';
import { lineOf } from './autocompact-line.ts';
import type { FlightAnswer } from './autocompact-gates.ts';

export type { FlightAnswer } from './autocompact-gates.ts';

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
    readonly decisions: Pick<AutocompactRecords, 'record' | 'skip' | 'markRequested' | 'pruneSkips' | 'lastDecisionAt' | 'lastDecision' | 'unlinkedCompactSince' | 'unlinkedCompactAny'>;
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

/** A compact verdict of a lane whose kind is compacted, in mode `on`, is requested; a record-only or shadow one never is. */
const asksForCompaction = (mode: AutocompactMode, verdict: DecisionVerdict, recordOnly: boolean): boolean => mode === 'on' && verdict === 'compact' && !recordOnly;

/** Over the ceiling no model is asked. */
const CEILING: Judged = { verdict: 'compact', answers: {}, why: null, decider: null, costUsd: 0, tookMs: null };
const UNKNOWN: Judged = { verdict: 'unknown', answers: {}, why: null, decider: null, costUsd: 0, tookMs: null };


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

    /** Forgets the skips of every lane that is not idle or done in `board` (all of them while autocompact is off). */
    prune(board: readonly Lane[]): void {
        const keep = this.deps.policy().mode === 'off' ? [] : board.filter((lane) => READY.has(lane.status)).map((lane) => ({ tab: String(lane.tab), pane: String(lane.pane) }));
        this.deps.decisions.pruneSkips(keep);
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

    /** Where the gates stop this lane: `ask` or `ceiling` go on, anything else is a skip. The in-flight reader runs only when the lane would otherwise be asked. */
    private async gated(lane: Lane, policy: AutocompactPolicy, use: ContextUse): Promise<Stop> {
        const { deps } = this;
        const [tab, pane] = [String(lane.tab), String(lane.pane)];
        const now = deps.now();
        const busy = busyOf(deps, this.asked, tab, pane, now);
        const lastBreakAt = deps.boundaries.lastBreakAt(tab, pane);
        const lastDecisionAt = deps.decisions.lastDecisionAt(tab, pane);
        const facts = {
            kind: String(lane.agent), kinds: policy.kinds, busy: busy.busy, share: shareOf(use), minimum: policy.minimum, ceiling: policy.ceiling,
            now, lastBreakAt, lastDecisionAt, cooldownMs: policy.cooldownMs,
            unchanged: unchangedOf(deps.decisions.lastDecision(tab, pane), deps.startedAt, use.tokens, policy.mode),
        };
        const cheap = gateOf({ ...facts, inFlight: null });
        const context = { now, minimum: policy.minimum, cooldownMs: policy.cooldownMs, lastBreakAt, lastDecisionAt, busy: busy.detail };
        if (cheap.gate !== 'ask' && cheap.gate !== 'ceiling') return { ...cheap, detail: detailOf(cheap.gate, { ...context, flight: null }) };
        const flight = await deps.inFlight(lane);
        const full = gateOf({ ...facts, inFlight: flight.count });
        return { ...full, detail: detailOf(full.gate, { ...context, flight }) };
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
        // the decider may have taken a while: another lane may have been requested meanwhile, so the busy check is made again, synchronously, before the record
        const again = busyOf(deps, this.asked, tab, pane, deps.now());
        if (again.busy) { this.skip(lane, 'busy', shareOf(use), again.detail); return; }
        const made: Decision = {
            tab, pane, agent: String(lane.agent), at: deps.now(), mode: policy.mode, share: shareOf(use), tokens: use.tokens, window: use.window, gate, verdict: judged.verdict,
            answers: judged.answers, coverage: null, decider: judged.decider, costUsd: judged.costUsd, tookMs: judged.tookMs, why: judged.why,
        };
        const id = deps.decisions.record(made);
        this.skipped.delete(pane);
        deps.log(lineOf(made, recordOnly));
        if (asksForCompaction(policy.mode, judged.verdict, recordOnly)) this.request(tab, pane, id);
    }

    /** The compaction is asked for through the operator's request path, and the decision says so. */
    private request(tab: string, pane: string, id: string): void {
        this.asked.set(pane, this.deps.now());
        this.deps.requests.requestCompact({ tab, pane, note: null, origin: 'auto' });
        this.deps.decisions.markRequested(id);
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
}
