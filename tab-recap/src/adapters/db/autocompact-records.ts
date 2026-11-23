import { uncheckedTypeId } from '#src/recap/domain/type-id.ts';
import type { Database } from 'bun:sqlite';
import { and, asc, count, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { parseSkipRow, parseStoredDecisionRow } from '#src/ports/autocompact-records.ts';
import type { AnswerTally, CoverageRevision, CoverageVerdict, DecisionCounts, DecisionDraft, DecisionGate, DecisionLedger, LastDecisionRow, LinkedDecision, PaneKey, SkipRow, StoredDecisionRow, UnlinkedCompact } from '#src/ports/autocompact-records.ts';
import { unreachable } from '#src/recap/domain/autocompact.ts';
import { must } from '#src/protocol/result.ts';
import { parseDecisionId, type CompactionId, type DecisionId, type PaneId, type TabId } from '#src/recap/domain/ids.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseUsd, type Usd } from '#src/recap/domain/usd.ts';
import { guarded } from './rows.ts';
import { writeTx } from './connection.ts';
import { autocompactDecision, autocompactSkip } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { idOf, typeIdOf } from './typeid.ts';
import { ids } from './uuid7.ts';

const COMPACT = 'compact';
const ON = 'on';
const WAIT = 'wait';
const COVERAGE_GATE = 'coverage';
const UNLINKED: UnlinkedCompact = 'unlinked';
const NONE: UnlinkedCompact = 'none';
const ZERO = must(parseCount(0));
const NO_COUNTS: DecisionCounts = { decisions: ZERO, compacted: ZERO, waited: ZERO };
const MICRO = 1e6;

interface LatestDecision {
    readonly id: Uint8Array;
    readonly gate: DecisionGate;
}

const NEWEST_COLUMNS = {
    id: autocompactDecision.id, tab: autocompactDecision.tabId, pane: autocompactDecision.pane, agent: autocompactDecision.agent, at: autocompactDecision.at,
    mode: autocompactDecision.mode, share: autocompactDecision.share, tokens: autocompactDecision.tokens, window: autocompactDecision.window, gate: autocompactDecision.gate,
    verdict: autocompactDecision.verdict, answers: autocompactDecision.answers, coverage: autocompactDecision.coverage, decider: autocompactDecision.decider,
    costMicroUsd: autocompactDecision.costMicroUsd, tookMs: autocompactDecision.tookMs, why: autocompactDecision.why,
    askedVerdict: autocompactDecision.askedVerdict, coverageOutcome: autocompactDecision.coverageOutcome, uncheckedReason: autocompactDecision.uncheckedReason,
    coverageMissing: autocompactDecision.coverageMissing, coverageMs: autocompactDecision.coverageMs, coverageCostMicroUsd: autocompactDecision.coverageCostMicroUsd,
    compactionId: autocompactDecision.compactionId, laneStatus: autocompactDecision.laneStatus,
};

function missingOf(outcome: CoverageVerdict, coverage: AnswerTally | null): Count | null {
    switch (outcome.kind) {
        case 'missed': return must(parseCount(outcome.facts.length));
        case 'unchecked': return null;
        case 'passed': return coverage !== null && coverage.size > 0 ? ZERO : null;
        default: return unreachable(outcome);
    }
}

export class DecisionLedgerRepository implements DecisionLedger {
    private readonly db: Database;
    private readonly orm: Orm;

    constructor(db: Database) {
        this.db = db;
        this.orm = ormOf(db);
    }

    record(d: DecisionDraft): DecisionId {
        const id = ids.next();
        writeTx(this.db, () => {
            this.orm.insert(autocompactDecision).values({
                id, tabId: d.tab, pane: d.pane, agent: d.agent, at: d.at, mode: d.mode, share: d.share, tokens: d.tokens, window: d.window,
                gate: d.gate, verdict: d.verdict, answers: JSON.stringify(Object.fromEntries(d.answers)), coverage: d.coverage === null ? null : JSON.stringify(Object.fromEntries(d.coverage)),
                decider: d.decider, costMicroUsd: Math.round(d.costUsd * MICRO), tookMs: d.tookMs, why: d.why,
                askedVerdict: d.askedVerdict, laneStatus: d.laneStatus, requested: 0,
            }).run();
            this.orm.delete(autocompactSkip).where(and(eq(autocompactSkip.tabId, d.tab), eq(autocompactSkip.pane, d.pane))).run();
        });
        return must(parseDecisionId(typeIdOf('decision', id)));
    }

    link(id: DecisionId, compactionId: CompactionId): void {
        const [key, target] = [idOf('decision', uncheckedTypeId(id)), idOf('compaction', uncheckedTypeId(compactionId))];
        if (key !== null && target !== null) writeTx(this.db, () => { this.attachTo(key, target); });
    }

    linkLatest(tab: TabId, pane: PaneId, compactionId: CompactionId): LinkedDecision | null {
        const [row, target] = [guarded((): LatestDecision | null => this.orm.select({ id: autocompactDecision.id, gate: autocompactDecision.gate }).from(autocompactDecision)
            .where(and(eq(autocompactDecision.tabId, tab), eq(autocompactDecision.pane, pane), eq(autocompactDecision.verdict, COMPACT), isNull(autocompactDecision.compactionId)))
            .orderBy(desc(autocompactDecision.at), desc(autocompactDecision.id)).limit(1).get() ?? null, null), idOf('compaction', uncheckedTypeId(compactionId))];
        if (row === null || target === null) return null;
        writeTx(this.db, () => { this.attachTo(row.id, target); });
        return { id: must(parseDecisionId(typeIdOf('decision', row.id))), gate: row.gate };
    }

    amend(id: DecisionId, update: CoverageRevision): void {
        const key = idOf('decision', uncheckedTypeId(id));
        const { coverage, outcome, coverageMs, coverageCostUsd, why, block } = update;
        const waited = outcome.kind === 'unchecked' || outcome.kind === 'missed';
        const flag = waited && block === 'blocks' ? 1 : 0;
        const reason = outcome.kind === 'unchecked' ? outcome.reason : null;
        if (key !== null) {
            writeTx(this.db, () => {
                this.orm.update(autocompactDecision).set({
                    coverage: coverage === null ? null : JSON.stringify(Object.fromEntries(coverage)), coverageOutcome: outcome.kind, uncheckedReason: reason,
                    coverageMissing: missingOf(outcome, coverage), coverageMs,
                    coverageCostMicroUsd: coverageCostUsd === null ? null : Math.round(coverageCostUsd * MICRO),
                    verdict: sql`CASE WHEN ${flag} = 1 THEN ${WAIT} ELSE ${autocompactDecision.verdict} END`,
                    gate: sql`CASE WHEN ${flag} = 1 THEN ${COVERAGE_GATE} ELSE ${autocompactDecision.gate} END`,
                    why: sql`CASE WHEN ${why} IS NULL THEN ${autocompactDecision.why} WHEN ${autocompactDecision.why} IS NULL THEN ${why} ELSE ${autocompactDecision.why} || '; ' || ${why} END`,
                }).where(eq(autocompactDecision.id, key)).run();
            });
        }
    }

    lastDecisionAt(tab: TabId, pane: PaneId): Instant | null {
        return guarded(() => {
            const at = this.orm.select({ at: sql<number | null>`MAX(${autocompactDecision.at})` }).from(autocompactDecision)
                .where(and(eq(autocompactDecision.tabId, tab), eq(autocompactDecision.pane, pane))).get()?.at ?? null;
            return at === null ? null : instant(at);
        }, null);
    }

    lastDecision(tab: TabId, pane: PaneId): LastDecisionRow | null {
        return guarded((): LastDecisionRow | null => {
            const row = this.orm.select({ at: autocompactDecision.at, tokens: autocompactDecision.tokens, mode: autocompactDecision.mode, verdict: autocompactDecision.verdict, gate: autocompactDecision.gate })
                .from(autocompactDecision).where(and(eq(autocompactDecision.tabId, tab), eq(autocompactDecision.pane, pane)))
                .orderBy(desc(autocompactDecision.at), desc(autocompactDecision.id)).limit(1).get() ?? null;
            return row === null ? null : { at: instant(row.at), tokens: must(parseCount(row.tokens)), mode: row.mode, verdict: row.verdict, gate: row.gate };
        }, null);
    }

    unlinkedCompactSince(tab: TabId, pane: PaneId, at: Instant): UnlinkedCompact {
        return guarded(() => (this.orm.select({ found: sql`1` }).from(autocompactDecision).where(and(eq(autocompactDecision.tabId, tab), eq(autocompactDecision.pane, pane),
            eq(autocompactDecision.mode, ON), eq(autocompactDecision.verdict, COMPACT), eq(autocompactDecision.requested, 1), isNull(autocompactDecision.compactionId), gte(autocompactDecision.at, at)))
            .limit(1).get() === undefined ? NONE : UNLINKED), NONE);
    }

    unlinkedCompactAny(at: Instant): UnlinkedCompact {
        return guarded(() => (this.orm.select({ found: sql`1` }).from(autocompactDecision).where(and(eq(autocompactDecision.mode, ON), eq(autocompactDecision.verdict, COMPACT),
            eq(autocompactDecision.requested, 1), isNull(autocompactDecision.compactionId), gte(autocompactDecision.at, at))).limit(1).get() === undefined ? NONE : UNLINKED), NONE);
    }

    markRequested(id: DecisionId): void {
        const key = idOf('decision', uncheckedTypeId(id));
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

    skip(skip: SkipRow): void {
        writeTx(this.db, () => {
            this.orm.insert(autocompactSkip).values({
                tabId: skip.tab, pane: skip.pane, agent: skip.agent, at: skip.at, gate: skip.gate, share: skip.share, detail: skip.detail,
            }).onConflictDoUpdate({
                target: [autocompactSkip.tabId, autocompactSkip.pane],
                set: { agent: sql`excluded.agent`, at: sql`excluded.at`, gate: sql`excluded.gate`, share: sql`excluded.share`, detail: sql`excluded.detail` },
            }).run();
        });
    }

    skips(): readonly SkipRow[] {
        return guarded(() => this.orm.select({
            tab: autocompactSkip.tabId, pane: autocompactSkip.pane, agent: autocompactSkip.agent, at: autocompactSkip.at, gate: autocompactSkip.gate,
            share: autocompactSkip.share, detail: autocompactSkip.detail,
        }).from(autocompactSkip).orderBy(desc(autocompactSkip.at), asc(autocompactSkip.tabId), asc(autocompactSkip.pane)).all().flatMap((row) => {
            const parsed = parseSkipRow(row);
            return parsed.kind === 'ok' ? [parsed.value] : [];
        }), []);
    }

    newest(limit: Count, tab?: TabId): readonly StoredDecisionRow[] {
        return guarded(() => this.orm.select(NEWEST_COLUMNS).from(autocompactDecision)
            .where(tab === undefined ? undefined : eq(autocompactDecision.tabId, tab))
            .orderBy(desc(autocompactDecision.at), desc(autocompactDecision.id)).limit(limit).all().flatMap((row) => {
                let answers: unknown = null;
                let coverage: unknown = null;
                try {
                    answers = JSON.parse(row.answers);
                    coverage = row.coverage === null ? null : JSON.parse(row.coverage);
                } catch {
                    return [];
                }
                const outcome = row.coverageOutcome === null ? null : { kind: row.coverageOutcome, count: row.coverageMissing, reason: row.uncheckedReason };
                const parsed = parseStoredDecisionRow({
                    ...row, id: typeIdOf('decision', row.id), compactionId: row.compactionId === null ? null : typeIdOf('compaction', row.compactionId),
                    answers, coverage, costUsd: row.costMicroUsd / MICRO, coverageOutcome: outcome,
                    coverageCostUsd: row.coverageCostMicroUsd === null ? null : row.coverageCostMicroUsd / MICRO,
                });
                return parsed.kind === 'ok' ? [parsed.value] : [];
            }), []);
    }

    countsFor(tab: TabId): DecisionCounts {
        return guarded((): DecisionCounts => {
            const row = this.orm.select({
                decisions: count(), compacted: count(autocompactDecision.compactionId),
                waited: sql<number>`COALESCE(SUM(${autocompactDecision.verdict} <> ${COMPACT}), 0)`,
            }).from(autocompactDecision).where(eq(autocompactDecision.tabId, tab)).get() ?? NO_COUNTS;
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
