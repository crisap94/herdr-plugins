import type { DecisionDraft, DecisionGate, DecisionLedger, DecisionMode, Verdict, SkipGate } from '#src/ports/autocompact-records.ts';
import type { DeciderPort } from '#src/ports/decider.ts';
import type { FactStore } from '#src/ports/ledger.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { isUnknown, saying, type Unknown } from '#src/ports/unknowable.ts';
import { gateFrom, parseGatePercent, type GateFacts, type LaneStatusAtDecision, type WatchMode, type Policy } from '#src/recap/domain/autocompact.ts';
import { tuningFrom, type CompactTuning } from '#src/recap/domain/autocompact-style.ts';
import { verdictOf } from '#src/recap/domain/autocompact-verdict.ts';
import { shareOf, type ContextUse } from '#src/recap/domain/compaction.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { Probability } from '#src/recap/domain/probability.ts';
import { parseUsd, type Usd } from '#src/recap/domain/usd.ts';
import type { IdleHold } from '#src/recap/domain/idle-hold.ts';
import { placementOf, type DecisionId, type PaneId, type Placement } from '#src/recap/domain/timing-ids.ts';
import type { Candidate, CompactionActivity, CompactionAsk, RecapReadiness, SafePointEvent, SessionSignals } from '#src/compaction-timing/contract.ts';
import { duration, instant, type Duration, type Instant } from '#src/recap/domain/time.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { autocompactState } from './autocompact-state.ts';
import { QUESTIONS } from './autocompact-questions.ts';
import { busyOf, detailOf, gateBusyOf, gateSamenessOf, flightTextOf, recheckDue, unchangedOf, type CeilingReach, type Recheck } from './autocompact-gates.ts';
import { lineOf, moneyOf, type Effect } from './autocompact-line.ts';
import { flightOf, flightReason, holdsLane, NOT_AWAITING, NOTHING_IN_FLIGHT, awaitedNames, unreadable, type Flight, type Observed, ceilingOf } from '#src/recap/domain/in-flight.ts';
import { continuationNote, type ContinuationNote } from '#src/recap/domain/continuation-note.ts';
import { busyDetailOf, coverageBackoffActive, idleEligibility, idleMsOf, policyForLane, reachOf, type Asking, type DeciderHealth, type Marks, type Stop } from './autocompact-shapes.ts';

export type Waiting = { readonly kind: 'clear' } | { readonly kind: 'waiting'; readonly value: Text } | Unknown;

interface ContextsOf { of(pane: PaneId): ContextUse | null; }

export interface AutocompactDeps {
    policy(): Policy;
    tuning?(): CompactTuning;
    idleHold?(): IdleHold;
    decider(): DeciderPort | null;
    readonly contexts: ContextsOf;
    inFlight(candidate: Candidate): Promise<Observed>;
    awaiting?(pane: PaneId): Promise<Waiting>;
    emit?(event: SafePointEvent): void;
    recent(candidate: Candidate): Promise<readonly Entry[]>;
    statusOf(candidate: Candidate): LaneStatusAtDecision | null;
    readonly ledger: Pick<FactStore, 'historyOf'>;
    readonly sessions: Pick<SessionSignals, 'lastBreakAt'>;
    readonly activity: Pick<CompactionActivity, 'activeFor' | 'automaticInProgress'>;
    readonly decisions: Pick<DecisionLedger, 'record' | 'skip' | 'markRequested' | 'pruneSkips' | 'lastDecisionAt' | 'lastDecision' | 'unlinkedCompactSince' | 'unlinkedCompactAny'>;
    readonly startedAt: Instant;
    request(ask: CompactionAsk): void;
    readonly recaps: RecapReadiness;
    now(): Instant;
    log(line: Text): void;
}

const BALANCED = tuningFrom(() => undefined);

export type IdleClaim = 'claimed' | 'declined';

interface Judged {
    readonly verdict: Verdict;
    readonly answers: ReadonlyMap<Text, Probability>;
    readonly why: Text | null;
    readonly decider: Text | null;
    readonly costUsd: Usd;
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

const shareCount = (use: ContextUse): Count => must(parseCount(shareOf(use)));

const asksForCompaction = (mode: WatchMode, verdict: Verdict, effect: Effect): Asking => mode === 'on' && verdict === 'compact' && effect === 'may-act' ? 'asks' : 'holds';


const NO_COST = must(parseUsd(0));
const CEILING: Judged = { verdict: 'compact', answers: new Map(), why: null, decider: null, costUsd: NO_COST, tookMs: null };
const UNKNOWN: Judged = { verdict: 'unknown', answers: new Map(), why: null, decider: null, costUsd: NO_COST, tookMs: null };
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

function marksOf(deps: AutocompactDeps, placed: Placement): Marks {
    const { tab, pane, candidate } = placed;
    const decidedAt = deps.decisions.lastDecisionAt(tab, pane);
    const brokeAt = deps.sessions.lastBreakAt(candidate.scope, candidate.key);
    return {
        last: deps.decisions.lastDecision(tab, pane),
        lastBreakAt: brokeAt === null ? null : instant(brokeAt),
        lastDecisionAt: decidedAt === null ? null : decidedAt,
    };
}

type Forcing = 'forced' | 'scheduled';


export class SafePointWatch {
    private readonly deps: AutocompactDeps;
    private readonly considering = new Set<PaneId>();
    private readonly asked = new Map<PaneId, Instant>();
    private readonly skipped = new Map<PaneId, SkipGate>();
    private readonly held = new Set<PaneId>();
    private outage: DeciderHealth = 'reachable';

    constructor(deps: AutocompactDeps) {
        this.deps = deps;
    }

    private tuning(): CompactTuning {
        return this.deps.tuning?.() ?? BALANCED;
    }

    prune(candidates: readonly Candidate[]): void {
        const keep = this.deps.policy().mode === 'off' ? [] : candidates.filter((candidate) => candidate.ready).map((candidate) => { const { tab, pane } = placementOf(candidate); return { tab, pane }; });
        this.deps.decisions.pruneSkips(keep);
    }

    async consider(candidate: Candidate): Promise<void> {
        const placed = placementOf(candidate);
        const { pane } = placed;
        if (!candidate.ready || this.considering.has(pane)) return;
        this.considering.add(pane);
        const forced: Forcing = this.held.delete(pane) ? 'forced' : 'scheduled';
        try {
            await this.run(placed, this.deps.statusOf(candidate), forced);
        } catch (error) {
            this.deps.log(must(parseText(`autocompact ${pane}: ${error instanceof Error ? error.message : String(error)}`)));
        } finally {
            this.considering.delete(pane);
        }
    }

    private async gated(placed: Placement, policy: Policy, use: ContextUse, tuning: CompactTuning, forced: Forcing): Promise<Stop> {
        const { deps } = this;
        const { pane } = placed;
        const now = deps.now();
        const busy = busyOf(deps, this.asked, placed, now);
        const marks = marksOf(deps, placed);
        const sameness = unchangedOf(marks.last, deps.startedAt, must(parseCount(use.tokens)), policy.mode);
        const same = sameness === 'same';
        let recheck: Recheck = 'not-due';
        if (same) recheck = forced === 'forced' ? 'due' : recheckDue(idleMsOf(tuning), marks.last, now);
        const reach = reachOf(use, policy);
        const facts: Omit<GateFacts, 'flight'> = {
            kind: placed.agent, kinds: policy.kinds, shadowKinds: policy.shadowKinds, busy: gateBusyOf(busy), share: parseGatePercent(shareOf(use)), minimum: policy.minimum, ceiling: policy.ceiling,
            now, lastBreakAt: marks.lastBreakAt, lastDecisionAt: marks.lastDecisionAt, cooldownMs: duration(policy.cooldownMs),
            unchanged: gateSamenessOf(sameness, recheck),
            coverageBackoff: coverageBackoffActive({ policy, last: marks.last, now, tokens: must(parseCount(use.tokens)), window: must(parseCount(use.window)), lastBreakAt: marks.lastBreakAt }),
        };
        const context = { now, minimum: policy.minimum, cooldownMs: duration(policy.cooldownMs), lastBreakAt: marks.lastBreakAt, lastDecisionAt: marks.lastDecisionAt, busy: busyDetailOf(busy) };
        const cheap = gateFrom({ ...facts, flight: null });
        if (cheap.gate !== 'ask' && cheap.gate !== 'ceiling') return { gate: cheap.gate, effect: cheap.recordOnly, detail: detailOf(cheap.gate, { ...context, flight: null, atCeiling: 'below-ceiling' }), recheck, flight: NOTHING, atCeiling: reach };
        const flight = await this.flightOf(placed, reach);
        const full = gateFrom({ ...facts, flight });
        if (recheck === 'due' && (full.gate === 'ask' || full.gate === 'ceiling')) deps.log(must(parseText(`autocompact ${pane}: unchanged → recheck`)));
        return { gate: full.gate, effect: full.recordOnly, detail: detailOf(full.gate, { ...context, flight, atCeiling: reach }), recheck, flight, atCeiling: reach };
    }

    private skip(placed: Placement, gate: SkipGate, share: Count | null, detail: Text | null): void {
        const { pane } = placed;
        this.deps.decisions.skip({ tab: placed.tab, pane, agent: placed.agent, at: this.deps.now(), gate, share, detail });
        if (this.skipped.get(pane) === gate) return;
        this.skipped.set(pane, gate);
        this.deps.emit?.({ kind: 'session-skipped', key: placed.candidate.key, gate });
        this.deps.log(must(parseText(`autocompact ${pane}: ${share === null ? '? %' : `${share} %`} → skip ${gate}${detail === null ? '' : ` (${detail})`}`)));
    }

    claimIdle(candidate: Candidate): IdleClaim {
        const { deps } = this;
        const placed = placementOf(candidate);
        const { pane } = placed;
        if (deps.idleHold?.() === 'off') return 'declined';
        if (idleEligibility(policyForLane(deps.policy(), placed.agent), placed, deps.contexts.of(pane)) === 'ineligible') return 'declined';
        const busy = busyOf(deps, this.asked, placed, deps.now());
        if (busy.kind === 'busy' && busy.detail === 'this lane') return 'declined';
        this.held.add(pane);
        deps.log(must(parseText(`autocompact ${pane}: held Claude's idle compaction`)));
        void this.consider(candidate);
        return 'claimed';
    }

    private async run(placed: Placement, status: LaneStatusAtDecision | null, forced: Forcing): Promise<void> {
        const { deps } = this;
        const policy = policyForLane(deps.policy(), placed.agent);
        if (policy === null) return;
        const tuning = this.tuning();
        const { pane } = placed;
        const use = deps.contexts.of(pane);
        if (use === null) { this.skip(placed, 'no-context', null, NO_CONTEXT); return; }
        const { gate, effect, detail, flight, atCeiling } = await this.gated(placed, policy, use, tuning, forced);
        if (gate !== 'ask' && gate !== 'ceiling') { this.skip(placed, gate, shareCount(use), detail); return; }
        await deps.recaps.ensure(placed.candidate.scope);
        const judged = gate === 'ceiling' ? CEILING : await this.asking(placed, tuning);
        const seen = await this.lateFlight(placed, use, flight, atCeiling);
        if (seen === null) return;
        const again = busyOf(deps, this.asked, placed, deps.now());
        if (again.kind === 'busy') {
            const paid = judged.costUsd > 0 ? `; decider ${moneyOf(judged.costUsd)} discarded` : '';
            this.skip(placed, 'busy', shareCount(use), must(parseText(`${again.detail}${paid}`)));
            return;
        }
        this.record(placed, status, use, { mode: policy.mode, gate, effect, judged, flight: seen, atCeiling });
    }

    private async lateFlight(placed: Placement, use: ContextUse, flight: Flight, atCeiling: CeilingReach): Promise<Flight | null> {
        const seen = lateFlightOf(flight, await this.waitingOf(placed.pane));
        if (!holdsLane(seen, ceilingOf(atCeiling === 'at-ceiling'))) return seen;
        this.skip(placed, 'in-flight', shareCount(use), flightTextOf(seen, atCeiling));
        return null;
    }

    private async flightOf(placed: Placement, atCeiling: CeilingReach): Promise<Flight> {
        const waiting = await this.waitingOf(placed.pane);
        if (waiting.kind === 'clear') return flightOf(await this.deps.inFlight(placed.candidate), NOT_AWAITING);
        if (waiting.kind === 'waiting') return flightOf(atCeiling === 'at-ceiling' ? await this.deps.inFlight(placed.candidate) : NOTHING_IN_FLIGHT, { kind: 'on', names: awaitedNames(waiting.value) });
        return flightOf(unreadable(flightReason(saying(waiting.why))), NOT_AWAITING);
    }

    private async waitingOf(pane: PaneId): Promise<Waiting> {
        return this.deps.awaiting === undefined ? { kind: 'clear' } : this.deps.awaiting(pane);
    }

    private record(placed: Placement, status: LaneStatusAtDecision | null, use: ContextUse, found: Found): void {
        const { deps } = this;
        const { tab, pane } = placed;
        const { judged, effect, flight, atCeiling } = found;
        const made: DecisionDraft = {
            tab, pane, agent: placed.agent, at: deps.now(), mode: found.mode, share: shareCount(use), tokens: must(parseCount(use.tokens)), window: must(parseCount(use.window)), gate: found.gate, verdict: judged.verdict, askedVerdict: judged.verdict,
            answers: judged.answers, coverage: null, decider: judged.decider, costUsd: judged.costUsd, tookMs: judged.tookMs, why: decisionWhy(judged, flight, atCeiling), coverageOutcome: null, coverageMs: null, coverageCostUsd: null, laneStatus: status,
        };
        const id = deps.decisions.record(made);
        this.skipped.delete(pane);
        deps.emit?.({ kind: 'safe-point-decided', key: placed.candidate.key, verdict: judged.verdict, share: shareCount(use) });
        deps.log(must(parseText(lineOf(made, effect))));
        if (asksForCompaction(found.mode, judged.verdict, effect) === 'asks') this.request(placed, id, continuationNote(flight.awaiting, flight.background));
    }

    private request(placed: Placement, id: DecisionId, note: ContinuationNote | null): void {
        this.asked.set(placed.pane, this.deps.now());
        this.deps.request({ scope: placed.candidate.scope, key: placed.candidate.key, decisionId: id, note });
        this.deps.decisions.markRequested(id);
    }

    private async asking(placed: Placement, tuning: CompactTuning): Promise<Judged> {
        const decider = this.deps.decider();
        const state = autocompactState(await this.deps.recent(placed.candidate), this.deps.ledger.historyOf(placed.tab, placed.pane));
        const answered = decider === null ? null : await decider.ask(must(parseText(JSON.stringify(state))), QUESTIONS);
        if (answered === null || isUnknown(answered)) {
            const why = answered === null ? 'no decider is set up' : saying(answered.why);
            if (this.outage === 'reachable') this.deps.log(must(parseText(`autocompact: the decider is unreachable (${why}); decisions are unknown until it answers`)));
            this.outage = 'unreachable';
            return { ...UNKNOWN, why: must(parseText(why)), decider: decider?.label ?? null };
        }
        this.outage = 'reachable';
        return { verdict: verdictOf(Object.fromEntries(answered.answers), tuning.verdict), answers: answered.answers, why: null, decider: decider?.label ?? null, costUsd: answered.costUsd, tookMs: answered.tookMs };
    }
}
