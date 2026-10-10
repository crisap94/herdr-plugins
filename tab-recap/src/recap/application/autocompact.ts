import type { AutocompactRecords, Decision, DecisionGate, DecisionMode, DecisionVerdict, SkipGate } from '#src/ports/autocompact-records.ts';
import type { Boundaries } from '#src/ports/boundaries.ts';
import type { CompactionView } from '#src/ports/compaction-records.ts';
import type { Decider } from '#src/ports/decider.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { CompactionQueue, Requests } from '#src/ports/requests.ts';
import type { CompactionClaims } from './compaction-claims.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import { gateOf, READY } from '#src/recap/domain/autocompact.ts';
import type { Gate } from '#src/recap/domain/autocompact.ts';
import type { AutocompactMode, AutocompactPolicy } from '#src/recap/domain/autocompact.ts';
import { registeredKindOf } from '#src/recap/domain/registered-kinds.ts';
import { tuningOf } from '#src/recap/domain/autocompact-style.ts';
import type { AutocompactTuning } from '#src/recap/domain/autocompact-style.ts';
import { verdictOf } from '#src/recap/domain/autocompact-verdict.ts';
import { shareOf } from '#src/recap/domain/compaction.ts';
import type { ContextUse } from '#src/recap/domain/compaction.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { autocompactState } from './autocompact-state.ts';
import { QUESTIONS } from './autocompact-questions.ts';
import { busyOf, detailOf, recheckDue, unchangedOf } from './autocompact-gates.ts';
import { lineOf, moneyOf } from './autocompact-line.ts';
import type { FlightAnswer } from './autocompact-gates.ts';
import type { LaneEvents } from './lane-events.ts';

export type { FlightAnswer } from './autocompact-gates.ts';

export type Waiting = { readonly kind: 'clear' } | { readonly kind: 'waiting'; readonly value: string } | Unknown;

interface Stop {
    readonly gate: Gate;
    readonly recordOnly: boolean;
    readonly detail: string | null;
    readonly recheck: boolean;
}

export interface AutocompactDeps {
    policy(): AutocompactPolicy;
    tuning?(): AutocompactTuning;
    decider(): Decider | null;
    readonly contexts: { of(pane: string): ContextUse | null };
    inFlight(lane: Lane): Promise<FlightAnswer>;
    awaiting?(pane: string): Promise<Waiting>;
    readonly events?: LaneEvents;
    recent(lane: Lane): Promise<readonly Entry[]>;
    readonly ledger: Pick<Ledger, 'historyOf'>;
    readonly boundaries: Pick<Boundaries, 'lastBreakAt'>;
    readonly compactions: Pick<CompactionView, 'shownFor' | 'autoInProgress'>;
    readonly decisions: Pick<AutocompactRecords, 'record' | 'skip' | 'markRequested' | 'pruneSkips' | 'lastDecisionAt' | 'lastDecision' | 'unlinkedCompactSince' | 'unlinkedCompactAny'>;
    readonly startedAt: number;
    readonly requests: Pick<Requests, 'requestCompact'>;
    readonly claims: Pick<CompactionClaims, 'has'>;
    readonly queue: CompactionQueue;
    hasRecap(tab: string): boolean;
    refresh(tab: string, lanes: readonly Lane[]): Promise<void>;
    lanes(tab: string): readonly Lane[];
    now(): number;
    log(line: string): void;
}

const BALANCED = tuningOf(() => undefined);

interface Judged {
    readonly verdict: DecisionVerdict;
    readonly answers: Readonly<Record<string, number>>;
    readonly why: string | null;
    readonly decider: string | null;
    readonly costUsd: number;
    readonly tookMs: number | null;
}

const asksForCompaction = (mode: AutocompactMode, verdict: DecisionVerdict, recordOnly: boolean): boolean => mode === 'on' && verdict === 'compact' && !recordOnly;

function policyForLane(policy: AutocompactPolicy, lane: Lane): (Omit<AutocompactPolicy, 'mode'> & { readonly mode: DecisionMode }) | null {
    if (policy.mode === 'off') return null;
    const kind = String(lane.agent);
    const registered = registeredKindOf(kind);
    const recordOnly = (registered !== null && policy.shadowKinds.includes(registered)) || !policy.kinds.includes(kind);
    return { ...policy, mode: recordOnly ? 'shadow' : policy.mode };
}

const CEILING: Judged = { verdict: 'compact', answers: {}, why: null, decider: null, costUsd: 0, tookMs: null };
const UNKNOWN: Judged = { verdict: 'unknown', answers: {}, why: null, decider: null, costUsd: 0, tookMs: null };

export class Autocompact {
    private readonly deps: AutocompactDeps;
    private readonly considering = new Set<string>();
    private readonly asked = new Map<string, number>();
    private readonly skipped = new Map<string, SkipGate>();
    private outage = false;

    constructor(deps: AutocompactDeps) {
        this.deps = deps;
    }

    private tuning(): AutocompactTuning {
        return this.deps.tuning?.() ?? BALANCED;
    }

    prune(board: readonly Lane[]): void {
        const keep = this.deps.policy().mode === 'off' ? [] : board.filter((lane) => READY.has(lane.status)).map((lane) => ({ tab: String(lane.tab), pane: String(lane.pane) }));
        this.deps.decisions.pruneSkips(keep);
    }

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

    private async gated(lane: Lane, policy: AutocompactPolicy, use: ContextUse, tuning: AutocompactTuning): Promise<Stop> {
        const { deps } = this;
        const [tab, pane] = [String(lane.tab), String(lane.pane)];
        const now = deps.now();
        const busy = busyOf(deps, this.asked, tab, pane, now);
        const lastBreakAt = deps.boundaries.lastBreakAt(tab, pane);
        const lastDecisionAt = deps.decisions.lastDecisionAt(tab, pane);
        const last = deps.decisions.lastDecision(tab, pane);
        const same = unchangedOf(last, deps.startedAt, use.tokens, policy.mode);
        const recheck = same && recheckDue(tuning.recheckIdleMs, last, now);
        const facts = {
            kind: String(lane.agent), kinds: policy.kinds, shadowKinds: policy.shadowKinds, busy: busy.busy, share: shareOf(use), minimum: policy.minimum, ceiling: policy.ceiling,
            now, lastBreakAt, lastDecisionAt, cooldownMs: policy.cooldownMs,
            unchanged: same && !recheck,
        };
        const cheap = gateOf({ ...facts, inFlight: null });
        const context = { now, minimum: policy.minimum, cooldownMs: policy.cooldownMs, lastBreakAt, lastDecisionAt, busy: busy.detail };
        if (cheap.gate !== 'ask' && cheap.gate !== 'ceiling') return { ...cheap, detail: detailOf(cheap.gate, { ...context, flight: null }), recheck };
        const flight = await this.flightOf(lane, pane);
        const full = gateOf({ ...facts, inFlight: flight.count });
        if (flight.detail?.startsWith('stale:') === true) deps.log(`autocompact ${pane}: ${flight.detail}`);
        if (recheck && (full.gate === 'ask' || full.gate === 'ceiling')) deps.log(`autocompact ${pane}: unchanged → recheck`);
        return { ...full, detail: detailOf(full.gate, { ...context, flight }), recheck };
    }

    private skip(lane: Lane, gate: SkipGate, share: number | null, detail: string | null): void {
        const pane = String(lane.pane);
        this.deps.decisions.skip({ tab: String(lane.tab), pane, agent: String(lane.agent), at: this.deps.now(), gate, share, detail });
        if (this.skipped.get(pane) === gate) return;
        this.skipped.set(pane, gate);
        this.deps.events?.lane(pane, 'autocompact-skipped', gate);
        this.deps.log(`autocompact ${pane}: ${share === null ? '? %' : `${share} %`} → skip ${gate}${detail === null ? '' : ` (${detail})`}`);
    }

    private async run(lane: Lane): Promise<void> {
        const { deps } = this;
        const policy = policyForLane(deps.policy(), lane);
        if (policy === null) return;
        const tuning = this.tuning();
        const [tab, pane, use] = [String(lane.tab), String(lane.pane), deps.contexts.of(String(lane.pane))];
        if (use === null) { this.skip(lane, 'no-context', null, 'the context share is not known yet'); return; }
        const { gate, recordOnly, detail } = await this.gated(lane, policy, use, tuning);
        if (gate !== 'ask' && gate !== 'ceiling') { this.skip(lane, gate, shareOf(use), detail); return; }
        if (!deps.hasRecap(tab)) await deps.refresh(tab, deps.lanes(tab));
        const judged = gate === 'ceiling' ? CEILING : await this.asking(lane, tuning);
        if (await this.waitSkipped(lane, use)) return;
        const again = busyOf(deps, this.asked, tab, pane, deps.now());
        if (again.busy) {
            const paid = judged.costUsd > 0 ? `; decider ${moneyOf(judged.costUsd)} discarded` : '';
            this.skip(lane, 'busy', shareOf(use), `${again.detail}${paid}`);
            return;
        }
        this.record(lane, use, { mode: policy.mode, gate, recordOnly, judged });
    }

    private async waitSkipped(lane: Lane, use: ContextUse): Promise<boolean> {
        const late = await this.waitingOf(String(lane.pane));
        if (late.kind === 'clear') return false;
        this.skip(lane, 'in-flight', shareOf(use), late.kind === 'waiting' ? `awaiting ${late.value}` : saying(late.why));
        return true;
    }

    private async flightOf(lane: Lane, pane: string): Promise<FlightAnswer> {
        const waiting = await this.waitingOf(pane);
        if (waiting.kind === 'clear') {
            const found = await this.deps.inFlight(lane);
            if (found.count !== 'unknown' && found.count > 0 && (lane.status === 'idle' || lane.status === 'done')) {
                return { count: 0, why: 'stale', detail: `stale: idle pane with ${found.count} open work item${found.count === 1 ? '' : 's'}` };
            }
            return found;
        }
        if (waiting.kind === 'waiting') return { count: 1, why: 'awaiting', detail: `awaiting ${waiting.value}` };
        return { count: 'unknown', why: saying(waiting.why) };
    }

    private async waitingOf(pane: string): Promise<Waiting> {
        return this.deps.awaiting === undefined ? { kind: 'clear' } : this.deps.awaiting(pane);
    }

    private record(lane: Lane, use: ContextUse, found: { readonly mode: DecisionMode; readonly gate: DecisionGate; readonly recordOnly: boolean; readonly judged: Judged }): void {
        const { deps } = this;
        const [tab, pane] = [String(lane.tab), String(lane.pane)];
        const { judged, recordOnly } = found;
        const made: Decision = {
            tab, pane, agent: String(lane.agent), at: deps.now(), mode: found.mode, share: shareOf(use), tokens: use.tokens, window: use.window, gate: found.gate, verdict: judged.verdict,
            answers: judged.answers, coverage: null, decider: judged.decider, costUsd: judged.costUsd, tookMs: judged.tookMs, why: judged.why,
        };
        const id = deps.decisions.record(made);
        this.skipped.delete(pane);
        deps.events?.lane(pane, 'autocompact-decided', `${judged.verdict}-${shareOf(use)}`);
        deps.log(lineOf(made, recordOnly));
        if (asksForCompaction(found.mode, judged.verdict, recordOnly)) this.request(tab, pane, id);
    }

    private request(tab: string, pane: string, id: string): void {
        this.asked.set(pane, this.deps.now());
        this.deps.requests.requestCompact({ tab, pane, note: null, origin: 'auto' });
        this.deps.decisions.markRequested(id);
    }

    private async asking(lane: Lane, tuning: AutocompactTuning): Promise<Judged> {
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
        return { verdict: verdictOf(answered.answers, tuning.verdict), answers: answered.answers, why: null, decider: decider?.label ?? null, costUsd: answered.costUsd, tookMs: answered.tookMs };
    }
}
