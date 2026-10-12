import type { AutocompactRecords, Decision, DecisionGate, DecisionMode, DecisionVerdict, LastDecision, SkipGate } from '#src/ports/autocompact-records.ts';
import type { Boundaries } from '#src/ports/boundaries.ts';
import type { CompactionView } from '#src/ports/compaction-records.ts';
import type { Decider } from '#src/ports/decider.ts';
import type { Ledger } from '#src/ports/ledger.ts';
import type { CompactionQueue, Requests } from '#src/ports/requests.ts';
import type { LaneClaims } from './lane-claims.ts';
import type { RecapRefresh } from './recap-wait.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { Unknown } from '#src/ports/unknowable.ts';
import { READY } from '#src/recap/domain/status.ts';
import { gateOf, laneStatusAtDecision, type AutocompactMode, type AutocompactPolicy, type Gate } from '#src/recap/domain/autocompact.ts';
import { tuningOf } from '#src/recap/domain/autocompact-style.ts';
import type { AutocompactTuning } from '#src/recap/domain/autocompact-style.ts';
import { verdictOf } from '#src/recap/domain/autocompact-verdict.ts';
import { shareOf, type ContextUse } from '#src/recap/domain/compaction.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import { duration, instant, type Duration, type Instant } from '#src/recap/domain/time.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { autocompactState } from './autocompact-state.ts';
import { QUESTIONS } from './autocompact-questions.ts';
import { busyOf, detailOf, flightTextOf, recheckDue, unchangedOf } from './autocompact-gates.ts';
import type { CeilingReach, Recheck } from './autocompact-gates.ts';
import { lineOf, moneyOf } from './autocompact-line.ts';
import type { Effect } from './autocompact-line.ts';
import { flightOf, flightReason, holdsLane, NOT_AWAITING, NOTHING_IN_FLIGHT, awaitedNames, unreadable } from '#src/recap/domain/in-flight.ts';
import type { Flight, Observed } from '#src/recap/domain/in-flight.ts';
import { continuationNote } from '#src/recap/domain/continuation-note.ts';
import type { ContinuationNote } from '#src/recap/domain/continuation-note.ts';
import type { LaneEvents } from './lane-events.ts';
import { busyDetailOf, idleMsOf, policyForLane, reachOf } from './autocompact-shapes.ts';
import type { Asking, CoverageHold, DeciderHealth, Marks, Stop } from './autocompact-shapes.ts';

export type Waiting = { readonly kind: 'clear' } | { readonly kind: 'waiting'; readonly value: string } | Unknown;

interface Judgment {
    readonly gate: Gate;
    readonly recordOnly: boolean;
}

interface BackoffFacts {
    readonly policy: AutocompactPolicy;
    readonly last: LastDecision | null;
    readonly now: Instant;
    readonly tokens: number;
    readonly window: number;
    readonly lastBreakAt: Instant | null;
}

export interface AutocompactDeps {
    policy(): AutocompactPolicy;
    tuning?(): AutocompactTuning;
    decider(): Decider | null;
    readonly contexts: { of(pane: string): ContextUse | null };
    inFlight(lane: Lane): Promise<Observed>;
    awaiting?(pane: string): Promise<Waiting>;
    readonly events?: LaneEvents;
    recent(lane: Lane): Promise<readonly Entry[]>;
    readonly ledger: Pick<Ledger, 'historyOf'>;
    readonly boundaries: Pick<Boundaries, 'lastBreakAt'>;
    readonly compactions: Pick<CompactionView, 'shownFor' | 'autoInProgress'>;
    readonly decisions: Pick<AutocompactRecords, 'record' | 'skip' | 'markRequested' | 'pruneSkips' | 'lastDecisionAt' | 'lastDecision' | 'unlinkedCompactSince' | 'unlinkedCompactAny'>;
    readonly startedAt: number;
    readonly requests: Pick<Requests, 'requestCompact'>;
    readonly claims: Pick<LaneClaims, 'has'>;
    readonly queue: CompactionQueue;
    hasRecap(tab: string): boolean;
    refresh: RecapRefresh;
    lanes(tab: string): readonly Lane[];
    now(): number;
    log(line: string): void;
}

const BALANCED = tuningOf(() => undefined);

interface Judged {
    readonly verdict: DecisionVerdict;
    readonly answers: Readonly<Record<string, number>>;
    readonly why: Text | null;
    readonly decider: string | null;
    readonly costUsd: number;
    readonly tookMs: Duration | null;
}

interface Found {
    readonly mode: DecisionMode;
    readonly gate: DecisionGate;
    readonly effect: Effect;
    readonly judged: Judged;
    readonly flight: Flight;
    readonly atCeiling: CeilingReach;
}

const asksForCompaction = (mode: AutocompactMode, verdict: DecisionVerdict, effect: Effect): Asking => mode === 'on' && verdict === 'compact' && effect === 'may-act' ? 'asks' : 'holds';

function coverageBackoffActive(input: BackoffFacts): CoverageHold {
    const { policy, last, now, tokens, window, lastBreakAt } = input;
    if (policy.coverageBackoff.kind !== 'window' || last === null) return 'open';
    return last.gate === 'coverage' && last.verdict === 'wait' && now - last.at < policy.coverageBackoff.ms && tokens - last.tokens <= window * 0.1 && (lastBreakAt === null || lastBreakAt <= last.at) ? 'backing-off' : 'open';
}

const CEILING: Judged = { verdict: 'compact', answers: {}, why: null, decider: null, costUsd: 0, tookMs: null };
const UNKNOWN: Judged = { verdict: 'unknown', answers: {}, why: null, decider: null, costUsd: 0, tookMs: null };
const NO_CONTEXT = must(parseText('the context share is not known yet'));

const NOTHING: Flight = flightOf(NOTHING_IN_FLIGHT, NOT_AWAITING);

function lateFlightOf(flight: Flight, late: Waiting): Flight {
    if (late.kind === 'clear') return flightOf(flight, NOT_AWAITING);
    if (late.kind === 'waiting') return flightOf(flight, { kind: 'on', names: awaitedNames(late.value) });
    return flightOf(unreadable(flightReason(saying(late.why))), NOT_AWAITING);
}

function decisionWhy(judged: Judged, flight: Flight, atCeiling: CeilingReach): Text | null {
    const reasons = [judged.why, flightTextOf(flight, atCeiling)].filter((part): part is Text => part !== null);
    return reasons.length === 0 ? null : must(parseText(reasons.join('; ')));
}

function effectOf(judgment: Judgment): Effect {
    return judgment.recordOnly ? 'record-only' : 'may-act';
}

function marksOf(deps: AutocompactDeps, tab: TabId, pane: PaneId): Marks {
    const breakAt = deps.boundaries.lastBreakAt(tab, pane);
    const decidedAt = deps.decisions.lastDecisionAt(tab, pane);
    return {
        last: deps.decisions.lastDecision(tab, pane),
        lastBreakAt: breakAt === null ? null : instant(breakAt),
        lastDecisionAt: decidedAt === null ? null : instant(decidedAt),
    };
}

export class Autocompact {
    private readonly deps: AutocompactDeps;
    private readonly considering = new Set<PaneId>();
    private readonly asked = new Map<PaneId, Instant>();
    private readonly skipped = new Map<PaneId, SkipGate>();
    private outage: DeciderHealth = 'reachable';

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
        const { pane } = lane;
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
        const { tab, pane } = lane;
        const now = instant(deps.now());
        const busy = busyOf(deps, this.asked, tab, pane, now);
        const marks = marksOf(deps, tab, pane);
        const same = unchangedOf(marks.last, instant(deps.startedAt), use.tokens, policy.mode) === 'same';
        const recheck: Recheck = same ? recheckDue(idleMsOf(tuning), marks.last, now) : 'not-due';
        const reach = reachOf(use, policy);
        const facts = {
            kind: lane.agent, kinds: policy.kinds, shadowKinds: policy.shadowKinds, busy: busy.kind === 'busy', share: shareOf(use), minimum: policy.minimum, ceiling: policy.ceiling,
            now, lastBreakAt: marks.lastBreakAt, lastDecisionAt: marks.lastDecisionAt, cooldownMs: policy.cooldownMs,
            unchanged: same && recheck !== 'due',
            coverageBackoff: coverageBackoffActive({ policy, last: marks.last, now, tokens: use.tokens, window: use.window, lastBreakAt: marks.lastBreakAt }) === 'backing-off',
        };
        const context = { now, minimum: policy.minimum, cooldownMs: duration(policy.cooldownMs), lastBreakAt: marks.lastBreakAt, lastDecisionAt: marks.lastDecisionAt, busy: busyDetailOf(busy) };
        const cheap = gateOf({ ...facts, flight: null });
        if (cheap.gate !== 'ask' && cheap.gate !== 'ceiling') return { gate: cheap.gate, effect: effectOf(cheap), detail: detailOf(cheap.gate, { ...context, flight: null, atCeiling: 'below-ceiling' }), recheck, flight: NOTHING, atCeiling: reach };
        const flight = await this.flightOf(lane, pane, reach);
        const full = gateOf({ ...facts, flight });
        if (recheck === 'due' && (full.gate === 'ask' || full.gate === 'ceiling')) deps.log(`autocompact ${pane}: unchanged → recheck`);
        return { gate: full.gate, effect: effectOf(full), detail: detailOf(full.gate, { ...context, flight, atCeiling: reach }), recheck, flight, atCeiling: reach };
    }

    private skip(lane: Lane, gate: SkipGate, share: number | null, detail: Text | null): void {
        const { pane } = lane;
        this.deps.decisions.skip({ tab: lane.tab, pane, agent: lane.agent, at: this.deps.now(), gate, share, detail });
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
        const { tab, pane } = lane;
        const use = deps.contexts.of(pane);
        if (use === null) { this.skip(lane, 'no-context', null, NO_CONTEXT); return; }
        const { gate, effect, detail, flight, atCeiling } = await this.gated(lane, policy, use, tuning);
        if (gate !== 'ask' && gate !== 'ceiling') { this.skip(lane, gate, shareOf(use), detail); return; }
        if (!deps.hasRecap(tab)) await deps.refresh(tab, deps.lanes(tab));
        const judged = gate === 'ceiling' ? CEILING : await this.asking(lane, tuning);
        const seen = await this.lateFlight(lane, use, flight, atCeiling);
        if (seen === null) return;
        const again = busyOf(deps, this.asked, tab, pane, instant(deps.now()));
        if (again.kind === 'busy') {
            const paid = judged.costUsd > 0 ? `; decider ${moneyOf(judged.costUsd)} discarded` : '';
            this.skip(lane, 'busy', shareOf(use), must(parseText(`${again.detail}${paid}`)));
            return;
        }
        this.record(lane, use, { mode: policy.mode, gate, effect, judged, flight: seen, atCeiling });
    }

    private async lateFlight(lane: Lane, use: ContextUse, flight: Flight, atCeiling: CeilingReach): Promise<Flight | null> {
        const seen = lateFlightOf(flight, await this.waitingOf(lane.pane));
        if (!holdsLane(seen, atCeiling === 'at-ceiling')) return seen;
        this.skip(lane, 'in-flight', shareOf(use), flightTextOf(seen, atCeiling));
        return null;
    }

    private async flightOf(lane: Lane, pane: PaneId, atCeiling: CeilingReach): Promise<Flight> {
        const waiting = await this.waitingOf(pane);
        if (waiting.kind === 'clear') return flightOf(await this.deps.inFlight(lane), NOT_AWAITING);
        if (waiting.kind === 'waiting') return flightOf(atCeiling === 'at-ceiling' ? await this.deps.inFlight(lane) : NOTHING_IN_FLIGHT, { kind: 'on', names: awaitedNames(waiting.value) });
        return flightOf(unreadable(flightReason(saying(waiting.why))), NOT_AWAITING);
    }

    private async waitingOf(pane: PaneId): Promise<Waiting> {
        return this.deps.awaiting === undefined ? { kind: 'clear' } : this.deps.awaiting(pane);
    }

    private record(lane: Lane, use: ContextUse, found: Found): void {
        const { deps } = this;
        const { tab, pane } = lane;
        const { judged, effect, flight, atCeiling } = found;
        const made: Decision = {
            tab, pane, agent: lane.agent, at: deps.now(), mode: found.mode, share: shareOf(use), tokens: use.tokens, window: use.window, gate: found.gate, verdict: judged.verdict, askedVerdict: judged.verdict,
            answers: judged.answers, coverage: null, decider: judged.decider, costUsd: judged.costUsd, tookMs: judged.tookMs, why: decisionWhy(judged, flight, atCeiling), coverageOutcome: null, coverageMs: null, coverageCostUsd: null, laneStatus: laneStatusAtDecision(lane.status),
        };
        const id = deps.decisions.record(made);
        this.skipped.delete(pane);
        deps.events?.lane(pane, 'autocompact-decided', `${judged.verdict}-${shareOf(use)}`);
        deps.log(lineOf(made, effect));
        if (asksForCompaction(found.mode, judged.verdict, effect) === 'asks') this.request(tab, pane, id, continuationNote(flight.awaiting, flight.background));
    }

    private request(tab: TabId, pane: PaneId, id: string, note: ContinuationNote | null): void {
        this.asked.set(pane, instant(this.deps.now()));
        this.deps.requests.requestCompact({ tab, pane, note, origin: 'auto' });
        this.deps.decisions.markRequested(id);
    }

    private async asking(lane: Lane, tuning: AutocompactTuning): Promise<Judged> {
        const decider = this.deps.decider();
        const label = decider?.label ?? null;
        const state = autocompactState(await this.deps.recent(lane), this.deps.ledger.historyOf(String(lane.tab), String(lane.pane)));
        const answered = decider === null ? null : await decider.ask(state, QUESTIONS);
        if (answered === null || isUnknown(answered)) {
            const why = answered === null ? 'no decider is set up' : saying(answered.why);
            if (this.outage === 'reachable') this.deps.log(`autocompact: the decider is unreachable (${why}); decisions are unknown until it answers`);
            this.outage = 'unreachable';
            return { ...UNKNOWN, why: must(parseText(why)), decider: label };
        }
        this.outage = 'reachable';
        return { verdict: verdictOf(answered.answers, tuning.verdict), answers: answered.answers, why: null, decider: label, costUsd: answered.costUsd, tookMs: duration(answered.tookMs) };
    }
}
