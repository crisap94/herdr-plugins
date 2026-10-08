// The AutocompactRecords repository: one row per decision of a lane. Writes are one transaction; reads answer empty when they cannot.
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { AutocompactRecords, Decision, DecisionCounts, DecisionGate, DecisionMode, DecisionVerdict, StoredDecision } from '#src/ports/autocompact-records.ts';
import { all, BadRow, blob, guarded, maybeText, maybeWhole, one, text, whole } from './rows.ts';
import type { Row } from './rows.ts';
import { writeTx } from './connection.ts';
import { idOf, typeIdOf } from './typeid.ts';
import { ids } from './uuid7.ts';

const COLUMNS = 'id, tab_id, pane, agent, at, mode, share, tokens, window, gate, verdict, answers, coverage, decider, cost_micro_usd, took_ms, why, compaction_id';

const numbers = (raw: string | null): Record<string, number> | null => {
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) throw new BadRow('answers are not an object');
    return Object.fromEntries(Object.entries(parsed).filter((pair): pair is [string, number] => typeof pair[1] === 'number'));
};

function decisionOf(row: Row): StoredDecision {
    const compaction = row['compaction_id'] === null ? null : typeIdOf('compaction', blob(row, 'compaction_id'));
    return {
        id: typeIdOf('decision', blob(row, 'id')), tab: text(row, 'tab_id'), pane: text(row, 'pane'), agent: text(row, 'agent'), at: whole(row, 'at'),
        mode: text(row, 'mode') as DecisionMode, share: whole(row, 'share'), tokens: whole(row, 'tokens'), window: whole(row, 'window'),
        gate: text(row, 'gate') as DecisionGate, verdict: text(row, 'verdict') as DecisionVerdict,
        answers: numbers(text(row, 'answers')) ?? {}, coverage: numbers(maybeText(row, 'coverage')), decider: maybeText(row, 'decider'),
        costUsd: whole(row, 'cost_micro_usd') / 1e6, tookMs: maybeWhole(row, 'took_ms'), why: maybeText(row, 'why'), compactionId: compaction,
    };
}

export class AutocompactRecordsRepository implements AutocompactRecords {
    private readonly db: DatabaseSync;
    private readonly insert: StatementSync;
    private readonly attach: StatementSync;
    private readonly waited: StatementSync;
    private readonly newestAll: StatementSync;
    private readonly newestOf: StatementSync;
    private readonly counts: StatementSync;
    private readonly spent: StatementSync;

    constructor(db: DatabaseSync) {
        this.db = db;
        this.insert = db.prepare(`INSERT INTO autocompact_decision (${COLUMNS.replace(', compaction_id', '')}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        this.attach = db.prepare('UPDATE autocompact_decision SET compaction_id = ? WHERE id = ?');
        this.waited = db.prepare("SELECT MAX(at) AS at FROM autocompact_decision WHERE tab_id = ? AND pane = ? AND verdict <> 'compact'");
        this.newestAll = db.prepare(`SELECT ${COLUMNS} FROM autocompact_decision ORDER BY at DESC, id DESC LIMIT ?`);
        this.newestOf = db.prepare(`SELECT ${COLUMNS} FROM autocompact_decision WHERE tab_id = ? ORDER BY at DESC, id DESC LIMIT ?`);
        this.counts = db.prepare("SELECT COUNT(*) AS decisions, COUNT(compaction_id) AS compacted, COALESCE(SUM(verdict <> 'compact'), 0) AS waited FROM autocompact_decision WHERE tab_id = ?");
        this.spent = db.prepare('SELECT COALESCE(SUM(cost_micro_usd), 0) AS micro FROM autocompact_decision WHERE at >= ?');
    }

    record(d: Decision): string {
        const id = ids.next();
        writeTx(this.db, () => {
            this.insert.run(id, d.tab, d.pane, d.agent, d.at, d.mode, d.share, d.tokens, d.window, d.gate, d.verdict, JSON.stringify(d.answers), d.coverage === null ? null : JSON.stringify(d.coverage), d.decider, Math.round(d.costUsd * 1e6), d.tookMs, d.why);
        });
        return typeIdOf('decision', id);
    }

    link(id: string, compactionId: string): void {
        const [key, target] = [idOf('decision', id), idOf('compaction', compactionId)];
        if (key !== null && target !== null) writeTx(this.db, () => { this.attach.run(target, key); });
    }

    lastWaitAt(tab: string, pane: string): number | null {
        return guarded(() => maybeWhole(one(this.waited, tab, pane) ?? { at: null }, 'at'), null);
    }

    newest(limit: number, tab?: string): readonly StoredDecision[] {
        return guarded(() => (tab === undefined ? all(this.newestAll, limit) : all(this.newestOf, tab, limit)).map(decisionOf), []);
    }

    countsFor(tab: string): DecisionCounts {
        return guarded(() => {
            const row = one(this.counts, tab) ?? {};
            return { decisions: whole(row, 'decisions'), compacted: whole(row, 'compacted'), waited: whole(row, 'waited') };
        }, { decisions: 0, compacted: 0, waited: 0 });
    }

    costSince(at: number): number {
        return guarded(() => whole(one(this.spent, at) ?? {}, 'micro') / 1e6, 0);
    }
}
