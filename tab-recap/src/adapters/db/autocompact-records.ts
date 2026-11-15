import type { Database } from 'bun:sqlite';
import { and, asc, count, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import type { AutocompactRecords, CoverageAmendment, LinkedDecision, Decision, DecisionCounts, DecisionGate, DecisionMode, DecisionVerdict, LastDecision, PaneKey, Skip, SkipGate, StoredCoverageOutcome, StoredDecision } from '#src/ports/autocompact-records.ts';
import { laneStatusAtDecision, unreachable } from '#src/recap/domain/autocompact.ts';
import type { CoverageOutcome, LaneStatusAtDecision } from '#src/recap/domain/autocompact.ts';
import { must } from '#src/protocol/result.ts';
import { agentKind, paneId, parseCompactionId, parseDecisionId, tabId, type CompactionId, type DecisionId, type PaneId, type TabId } from '#src/recap/domain/ids.ts';
import { instant, parseDuration, type Instant } from '#src/recap/domain/time.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseUsd, type Usd } from '#src/recap/domain/usd.ts';
import { BadRow, blob, guarded, maybeText, maybeWhole, text, whole } from './rows.ts';
import type { Row } from './rows.ts';
import { writeTx } from './connection.ts';
import { autocompactDecision, autocompactSkip } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { idOf, typeIdOf } from './typeid.ts';
import { ids } from './uuid7.ts';

const COMPACT = 'compact';
const ON = 'on';
const WAIT = 'wait';
const COVERAGE_GATE = 'coverage';
const NO_COUNTS: DecisionCounts = { decisions: must(parseCount(0)), compacted: must(parseCount(0)), waited: must(parseCount(0)) };
const MICRO = 1e6;

interface LatestDecision {
    readonly id: Uint8Array;
    readonly gate: DecisionGate;
}

const NEWEST_COLUMNS = {
    id: autocompactDecision.id, tab_id: autocompactDecision.tabId, pane: autocompactDecision.pane, agent: autocompactDecision.agent, at: autocompactDecision.at,
    mode: autocompactDecision.mode, share: autocompactDecision.share, tokens: autocompactDecision.tokens, window: autocompactDecision.window, gate: autocompactDecision.gate,
    verdict: autocompactDecision.verdict, answers: autocompactDecision.answers, coverage: autocompactDecision.coverage, decider: autocompactDecision.decider,
    cost_micro_usd: autocompactDecision.costMicroUsd, took_ms: autocompactDecision.tookMs, why: autocompactDecision.why, requested: autocompactDecision.requested,
    asked_verdict: autocompactDecision.askedVerdict, coverage_outcome: autocompactDecision.coverageOutcome, unchecked_reason: autocompactDecision.uncheckedReason,
    coverage_missing: autocompactDecision.coverageMissing, coverage_ms: autocompactDecision.coverageMs, coverage_cost_micro_usd: autocompactDecision.coverageCostMicroUsd,
    compaction_id: autocompactDecision.compactionId, lane_status: autocompactDecision.laneStatus,
};

const numbers = (raw: string | null): Record<string, number> | null => {
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) throw new BadRow('answers are not an object');
    return Object.fromEntries(Object.entries(parsed).filter((pair): pair is [string, number] => typeof pair[1] === 'number'));
};

function skipOf(row: Row): Skip {
    return { tab: tabId(text(row, 'tab_id')), pane: paneId(text(row, 'pane')), agent: agentKind(text(row, 'agent')), at: instant(whole(row, 'at')), gate: text(row, 'gate') as SkipGate, share: maybeWhole(row, 'share'), detail: maybeText(row, 'detail') };
}

function outcomeOf(row: Row): StoredCoverageOutcome | null {
    const outcome = maybeText(row, 'coverage_outcome');
    switch (outcome) {
        case 'passed': return { kind: 'passed' };
        case 'missed': return { kind: 'missed', count: must(parseCount(whole(row, 'coverage_missing'))) };
        case 'unchecked': {
            const reason = maybeText(row, 'unchecked_reason');
            if (reason === 'no-decider' || reason === 'decider-cannot-answer' || reason === 'no-brief') return { kind: 'unchecked', reason };
            throw new BadRow('unchecked coverage has no reason');
        }
        case null: return null;
        default: throw new BadRow('unknown coverage outcome');
    }
}

function costOf(row: Row): Usd | null {
    const cost = maybeWhole(row, 'coverage_cost_micro_usd');
    return cost === null ? null : must(parseUsd(cost / MICRO));
}

function missingOf(outcome: CoverageOutcome, coverage: CoverageAmendment['coverage']): number | null {
    switch (outcome.kind) {
        case 'missed': return outcome.facts.length;
        case 'unchecked': return null;
        case 'passed': return coverage !== null && Object.keys(coverage).length > 0 ? 0 : null;
        default: return unreachable(outcome);
    }
}

export const laneStatusOf = (row: Row): LaneStatusAtDecision | null => laneStatusAtDecision(maybeText(row, 'lane_status'));

function decisionOf(row: Row): StoredDecision {
    const compaction = row['compaction_id'] === null ? null : must(parseCompactionId(typeIdOf('compaction', blob(row, 'compaction_id'))));
    return {
        id: must(parseDecisionId(typeIdOf('decision', blob(row, 'id')))), tab: tabId(text(row, 'tab_id')), pane: paneId(text(row, 'pane')), agent: agentKind(text(row, 'agent')), at: instant(whole(row, 'at')),
        mode: text(row, 'mode') as DecisionMode, share: whole(row, 'share'), tokens: must(parseCount(whole(row, 'tokens'))), window: must(parseCount(whole(row, 'window'))),
        gate: text(row, 'gate') as DecisionGate, verdict: text(row, 'verdict') as DecisionVerdict,
        askedVerdict: maybeText(row, 'asked_verdict') as DecisionVerdict | null,
        answers: numbers(text(row, 'answers')) ?? {}, coverage: numbers(maybeText(row, 'coverage')), decider: maybeText(row, 'decider'),
        costUsd: must(parseUsd(whole(row, 'cost_micro_usd') / MICRO)), tookMs: maybeWhole(row, 'took_ms') === null ? null : must(parseDuration(whole(row, 'took_ms'))), why: maybeText(row, 'why'),
        coverageOutcome: outcomeOf(row), coverageMs: maybeWhole(row, 'coverage_ms') === null ? null : must(parseDuration(whole(row, 'coverage_ms'))), coverageCostUsd: costOf(row), compactionId: compaction, laneStatus: laneStatusOf(row),
    };
}

export class AutocompactRecordsRepository implements AutocompactRecords {
    private readonly db: Database;
    private readonly orm: Orm;

    constructor(db: Database) {
        this.db = db;
        this.orm = ormOf(db);
    }

    record(d: Decision): DecisionId {
        const id = ids.next();
        writeTx(this.db, () => {
            this.orm.insert(autocompactDecision).values({
                id, tabId: d.tab, pane: d.pane, agent: d.agent, at: d.at, mode: d.mode, share: d.share, tokens: d.tokens, window: d.window,
                gate: d.gate, verdict: d.verdict, answers: JSON.stringify(d.answers), coverage: d.coverage === null ? null : JSON.stringify(d.coverage),
                decider: d.decider ?? null, costMicroUsd: Math.round(d.costUsd * MICRO), tookMs: d.tookMs ?? null, why: d.why ?? null,
                askedVerdict: d.askedVerdict ?? null, laneStatus: d.laneStatus ?? null, requested: 0,
            }).run();
            this.orm.delete(autocompactSkip).where(and(eq(autocompactSkip.tabId, d.tab), eq(autocompactSkip.pane, d.pane))).run();
        });
        return must(parseDecisionId(typeIdOf('decision', id)));
    }

    link(id: DecisionId, compactionId: CompactionId): void {
        const [key, target] = [idOf('decision', id), idOf('compaction', compactionId)];
        if (key !== null && target !== null) writeTx(this.db, () => { this.attachTo(key, target); });
    }

    linkLatest(tab: TabId, pane: PaneId, compactionId: CompactionId): LinkedDecision | null {
        const [row, target] = [guarded((): LatestDecision | null => this.orm.select({ id: autocompactDecision.id, gate: autocompactDecision.gate }).from(autocompactDecision)
            .where(and(eq(autocompactDecision.tabId, tabId(tab)), eq(autocompactDecision.pane, paneId(pane)), eq(autocompactDecision.verdict, COMPACT), isNull(autocompactDecision.compactionId)))
            .orderBy(desc(autocompactDecision.at), desc(autocompactDecision.id)).limit(1).get() ?? null, null), idOf('compaction', compactionId)];
        if (row === null || target === null) return null;
        writeTx(this.db, () => { this.attachTo(row.id, target); });
        return { id: must(parseDecisionId(typeIdOf('decision', row.id))), gate: row.gate };
    }

    amend(id: DecisionId, update: CoverageAmendment): void {
        const key = idOf('decision', id);
        const { coverage, outcome, coverageMs, coverageCostUsd, why, block } = update;
        const waited = outcome.kind === 'unchecked' || outcome.kind === 'missed';
        const flag = waited && block ? 1 : 0;
        const note = why ?? null;
        const reason = outcome.kind === 'unchecked' ? outcome.reason : null;
        if (key !== null) {
            writeTx(this.db, () => {
                this.orm.update(autocompactDecision).set({
                    coverage: coverage === null ? null : JSON.stringify(coverage), coverageOutcome: outcome.kind, uncheckedReason: reason,
                    coverageMissing: missingOf(outcome, coverage), coverageMs,
                    coverageCostMicroUsd: coverageCostUsd === null ? null : Math.round(coverageCostUsd * MICRO),
                    verdict: sql`CASE WHEN ${flag} = 1 THEN ${WAIT} ELSE ${autocompactDecision.verdict} END`,
                    gate: sql`CASE WHEN ${flag} = 1 THEN ${COVERAGE_GATE} ELSE ${autocompactDecision.gate} END`,
                    why: sql`CASE WHEN ${note} IS NULL THEN ${autocompactDecision.why} WHEN ${autocompactDecision.why} IS NULL THEN ${note} ELSE ${autocompactDecision.why} || '; ' || ${note} END`,
                }).where(eq(autocompactDecision.id, key)).run();
            });
        }
    }

    lastDecisionAt(tab: TabId, pane: PaneId): Instant | null {
        const at = guarded(() => maybeWhole(this.orm.select({ at: sql<number | null>`MAX(${autocompactDecision.at})` }).from(autocompactDecision)
            .where(and(eq(autocompactDecision.tabId, tabId(tab)), eq(autocompactDecision.pane, paneId(pane)))).get() ?? { at: null }, 'at'), null);
        return at === null ? null : instant(at);
    }

    lastDecision(tab: TabId, pane: PaneId): LastDecision | null {
        return guarded((): LastDecision | null => {
            const row = this.orm.select({ at: autocompactDecision.at, tokens: autocompactDecision.tokens, mode: autocompactDecision.mode, verdict: autocompactDecision.verdict, gate: autocompactDecision.gate })
                .from(autocompactDecision).where(and(eq(autocompactDecision.tabId, tabId(tab)), eq(autocompactDecision.pane, paneId(pane))))
                .orderBy(desc(autocompactDecision.at), desc(autocompactDecision.id)).limit(1).get() ?? null;
            return row === null ? null : { at: instant(row.at), tokens: must(parseCount(row.tokens)), mode: row.mode, verdict: row.verdict, gate: row.gate };
        }, null);
    }

    unlinkedCompactSince(tab: TabId, pane: PaneId, at: Instant): boolean {
        return guarded(() => this.orm.select({ found: sql`1` }).from(autocompactDecision).where(and(eq(autocompactDecision.tabId, tabId(tab)), eq(autocompactDecision.pane, paneId(pane)),
            eq(autocompactDecision.mode, ON), eq(autocompactDecision.verdict, COMPACT), eq(autocompactDecision.requested, 1), isNull(autocompactDecision.compactionId), gte(autocompactDecision.at, at)))
            .limit(1).get() !== undefined, false);
    }

    unlinkedCompactAny(at: Instant): boolean {
        return guarded(() => this.orm.select({ found: sql`1` }).from(autocompactDecision).where(and(eq(autocompactDecision.mode, ON), eq(autocompactDecision.verdict, COMPACT),
            eq(autocompactDecision.requested, 1), isNull(autocompactDecision.compactionId), gte(autocompactDecision.at, at))).limit(1).get() !== undefined, false);
    }

    markRequested(id: DecisionId): void {
        const key = idOf('decision', id);
        if (key !== null) writeTx(this.db, () => { this.orm.update(autocompactDecision).set({ requested: 1 }).where(eq(autocompactDecision.id, key)).run(); });
    }

    pruneSkips(keep: readonly PaneKey[]): void {
        const kept = new Set(keep.map((lane) => `${lane.tab}\u0000${lane.pane}`));
        writeTx(this.db, () => {
            for (const skip of this.skips()) {
                if (!kept.has(`${skip.tab}\u0000${skip.pane}`)) {
                    this.orm.delete(autocompactSkip).where(and(eq(autocompactSkip.tabId, skip.tab), eq(autocompactSkip.pane, skip.pane))).run();
                }
            }
        });
    }

    skip(skip: Skip): void {
        writeTx(this.db, () => {
            this.orm.insert(autocompactSkip).values({
                tabId: skip.tab, pane: skip.pane, agent: skip.agent, at: skip.at, gate: skip.gate, share: skip.share ?? null, detail: skip.detail ?? null,
            }).onConflictDoUpdate({
                target: [autocompactSkip.tabId, autocompactSkip.pane],
                set: { agent: sql`excluded.agent`, at: sql`excluded.at`, gate: sql`excluded.gate`, share: sql`excluded.share`, detail: sql`excluded.detail` },
            }).run();
        });
    }

    skips(): readonly Skip[] {
        return guarded(() => this.orm.select({
            tab_id: autocompactSkip.tabId, pane: autocompactSkip.pane, agent: autocompactSkip.agent, at: autocompactSkip.at, gate: autocompactSkip.gate,
            share: autocompactSkip.share, detail: autocompactSkip.detail,
        }).from(autocompactSkip).orderBy(desc(autocompactSkip.at), asc(autocompactSkip.tabId), asc(autocompactSkip.pane)).all().map(skipOf), []);
    }

    newest(limit: Count, tab?: TabId): readonly StoredDecision[] {
        return guarded(() => this.orm.select(NEWEST_COLUMNS).from(autocompactDecision)
            .where(tab === undefined ? undefined : eq(autocompactDecision.tabId, tabId(tab)))
            .orderBy(desc(autocompactDecision.at), desc(autocompactDecision.id)).limit(limit).all().map(decisionOf), []);
    }

    countsFor(tab: TabId): DecisionCounts {
        return guarded((): DecisionCounts => {
            const row = this.orm.select({
                decisions: count(), compacted: count(autocompactDecision.compactionId),
                waited: sql<number>`COALESCE(SUM(${autocompactDecision.verdict} <> ${COMPACT}), 0)`,
            }).from(autocompactDecision).where(eq(autocompactDecision.tabId, tabId(tab))).get() ?? NO_COUNTS;
            return { decisions: must(parseCount(row.decisions)), compacted: must(parseCount(row.compacted)), waited: must(parseCount(row.waited)) };
        }, NO_COUNTS);
    }

    costSince(at: Instant): Usd {
        return guarded((): Usd => must(parseUsd((this.orm.select({ micro: sql<number>`COALESCE(SUM(${autocompactDecision.costMicroUsd}), 0)` }).from(autocompactDecision)
            .where(gte(autocompactDecision.at, at)).get()?.micro ?? 0) / MICRO)), must(parseUsd(0)));
    }

    private attachTo(decision: Uint8Array, compaction: Uint8Array): void {
        this.orm.update(autocompactDecision).set({ compactionId: compaction }).where(eq(autocompactDecision.id, decision)).run();
    }
}
