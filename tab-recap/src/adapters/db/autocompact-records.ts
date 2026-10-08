// The AutocompactRecords repository: one row per decision of a lane. Writes are one transaction; reads answer empty when they cannot.
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { AutocompactRecords, Decision, DecisionCounts, DecisionGate, DecisionMode, DecisionVerdict, LastDecision, Skip, SkipGate, StoredDecision } from '#src/ports/autocompact-records.ts';
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

function skipOf(row: Row): Skip {
    return { tab: text(row, 'tab_id'), pane: text(row, 'pane'), agent: text(row, 'agent'), at: whole(row, 'at'), gate: text(row, 'gate') as SkipGate, share: maybeWhole(row, 'share'), detail: maybeText(row, 'detail') };
}

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
    private readonly latest: StatementSync;
    private readonly cover: StatementSync;
    private readonly last: StatementSync;
    private readonly asked: StatementSync;
    private readonly newestAll: StatementSync;
    private readonly newestOf: StatementSync;
    private readonly counts: StatementSync;
    private readonly spent: StatementSync;
    private readonly lastOne: StatementSync;
    private readonly anyAsked: StatementSync;
    private readonly putSkip: StatementSync;
    private readonly dropSkip: StatementSync;
    private readonly allSkips: StatementSync;

    constructor(db: DatabaseSync) {
        this.db = db;
        this.insert = db.prepare(`INSERT INTO autocompact_decision (${COLUMNS.replace(', compaction_id', '')}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        this.attach = db.prepare('UPDATE autocompact_decision SET compaction_id = ? WHERE id = ?');
        this.latest = db.prepare("SELECT id FROM autocompact_decision WHERE tab_id = ? AND pane = ? AND verdict = 'compact' AND compaction_id IS NULL ORDER BY at DESC, id DESC LIMIT 1");
        this.cover = db.prepare("UPDATE autocompact_decision SET coverage = ?, verdict = CASE WHEN ? = 1 THEN 'wait' ELSE verdict END, gate = CASE WHEN ? = 1 THEN 'coverage' ELSE gate END, why = CASE WHEN ? = 1 THEN ? ELSE why END WHERE id = ?");
        this.last = db.prepare('SELECT MAX(at) AS at FROM autocompact_decision WHERE tab_id = ? AND pane = ?');
        this.asked = db.prepare("SELECT 1 AS found FROM autocompact_decision WHERE tab_id = ? AND pane = ? AND mode = 'on' AND verdict = 'compact' AND compaction_id IS NULL AND at >= ? LIMIT 1");
        this.newestAll = db.prepare(`SELECT ${COLUMNS} FROM autocompact_decision ORDER BY at DESC, id DESC LIMIT ?`);
        this.newestOf = db.prepare(`SELECT ${COLUMNS} FROM autocompact_decision WHERE tab_id = ? ORDER BY at DESC, id DESC LIMIT ?`);
        this.counts = db.prepare("SELECT COUNT(*) AS decisions, COUNT(compaction_id) AS compacted, COALESCE(SUM(verdict <> 'compact'), 0) AS waited FROM autocompact_decision WHERE tab_id = ?");
        this.spent = db.prepare('SELECT COALESCE(SUM(cost_micro_usd), 0) AS micro FROM autocompact_decision WHERE at >= ?');
        this.lastOne = db.prepare('SELECT at, tokens, mode FROM autocompact_decision WHERE tab_id = ? AND pane = ? ORDER BY at DESC, id DESC LIMIT 1');
        this.anyAsked = db.prepare("SELECT 1 AS found FROM autocompact_decision WHERE mode = 'on' AND verdict = 'compact' AND compaction_id IS NULL AND at >= ? LIMIT 1");
        this.putSkip = db.prepare('INSERT INTO autocompact_skip (tab_id, pane, agent, at, gate, share, detail) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (tab_id, pane) DO UPDATE SET agent = excluded.agent, at = excluded.at, gate = excluded.gate, share = excluded.share, detail = excluded.detail');
        this.dropSkip = db.prepare('DELETE FROM autocompact_skip WHERE tab_id = ? AND pane = ?');
        this.allSkips = db.prepare('SELECT tab_id, pane, agent, at, gate, share, detail FROM autocompact_skip ORDER BY at DESC, tab_id, pane');
    }

    record(d: Decision): string {
        const id = ids.next();
        writeTx(this.db, () => {
            this.insert.run(id, d.tab, d.pane, d.agent, d.at, d.mode, d.share, d.tokens, d.window, d.gate, d.verdict, JSON.stringify(d.answers), d.coverage === null ? null : JSON.stringify(d.coverage), d.decider, Math.round(d.costUsd * 1e6), d.tookMs, d.why);
            this.dropSkip.run(d.tab, d.pane);
        });
        return typeIdOf('decision', id);
    }

    link(id: string, compactionId: string): void {
        const [key, target] = [idOf('decision', id), idOf('compaction', compactionId)];
        if (key !== null && target !== null) writeTx(this.db, () => { this.attach.run(target, key); });
    }

    linkLatest(tab: string, pane: string, compactionId: string): string | null {
        const [row, target] = [guarded(() => one(this.latest, tab, pane), null), idOf('compaction', compactionId)];
        if (row === null || target === null) return null;
        writeTx(this.db, () => { this.attach.run(target, blob(row, 'id')); });
        return typeIdOf('decision', blob(row, 'id'));
    }

    amend(id: string, coverage: Readonly<Record<string, number>> | null, waited: boolean, why: string | null): void {
        const key = idOf('decision', id);
        const flag = waited ? 1 : 0;
        if (key !== null) writeTx(this.db, () => { this.cover.run(coverage === null ? null : JSON.stringify(coverage), flag, flag, flag, why, key); });
    }

    lastDecisionAt(tab: string, pane: string): number | null {
        return guarded(() => maybeWhole(one(this.last, tab, pane) ?? { at: null }, 'at'), null);
    }

    lastDecision(tab: string, pane: string): LastDecision | null {
        return guarded(() => {
            const row = one(this.lastOne, tab, pane);
            return row === null ? null : { at: whole(row, 'at'), tokens: whole(row, 'tokens'), mode: text(row, 'mode') as DecisionMode };
        }, null);
    }

    unlinkedCompactSince(tab: string, pane: string, at: number): boolean {
        return guarded(() => one(this.asked, tab, pane, at) !== null, false);
    }

    unlinkedCompactAny(at: number): boolean {
        return guarded(() => one(this.anyAsked, at) !== null, false);
    }

    skip(skip: Skip): void {
        writeTx(this.db, () => { this.putSkip.run(skip.tab, skip.pane, skip.agent, skip.at, skip.gate, skip.share, skip.detail); });
    }

    skips(): readonly Skip[] {
        return guarded(() => all(this.allSkips).map(skipOf), []);
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
