import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { Ask, AskKey, AskLedger, Requester } from '#src/ports/ask-ledger.ts';
import { exchangeName, toolName } from '#src/protocol/primitives.ts';
import type { ExchangeName } from '#src/protocol/primitives.ts';
import { all, guarded, maybeText, one, text, whole } from './rows.ts';
import type { Row } from './rows.ts';
import { writeTx } from './connection.ts';

const requesterOf = (raw: string): Requester | null => {
    if (raw === 'cli') {
        return 'cli';
    }
    const parsed = toolName(raw);
    return parsed.kind === 'ok' ? parsed.value : null;
};

function askOf(row: Row): readonly Ask[] {
    const exchange = exchangeName(text(row, 'exchange'));
    const requester = requesterOf(text(row, 'requester'));
    if (exchange.kind !== 'ok' || requester === null) {
        return [];
    }
    return [{ exchange: exchange.value, requester, id: text(row, 'id'), pane: text(row, 'pane'), at: whole(row, 'at'), ref: maybeText(row, 'ref'), outcome: maybeText(row, 'outcome') }];
}

export class AskLedgerRepository implements AskLedger {
    private readonly find: StatementSync;
    private readonly insert: StatementSync;
    private readonly settleRow: StatementSync;
    private readonly open: StatementSync;
    private readonly drop: StatementSync;
    private readonly db: DatabaseSync;

    constructor(db: DatabaseSync) {
        this.db = db;
        this.find = db.prepare('SELECT 1 AS found FROM ask WHERE exchange = ? AND requester = ? AND id = ?');
        this.insert = db.prepare('INSERT OR IGNORE INTO ask (exchange, requester, id, pane, at, ref, outcome) VALUES (?, ?, ?, ?, ?, ?, NULL)');
        this.settleRow = db.prepare('UPDATE ask SET outcome = ? WHERE exchange = ? AND id = ? AND pane = ? AND outcome IS NULL');
        this.open = db.prepare('SELECT exchange, requester, id, pane, at, ref, outcome FROM ask WHERE outcome IS NULL ORDER BY at, requester, id');
        this.drop = db.prepare('DELETE FROM ask WHERE at < ? AND outcome IS NOT NULL');
    }

    seen(exchange: ExchangeName, requester: Requester, id: string): boolean {
        return guarded(() => one(this.find, exchange, requester, id) !== null, true);
    }

    record(ask: Omit<Ask, 'outcome'>): void {
        writeTx(this.db, () => { this.insert.run(ask.exchange, ask.requester, ask.id, ask.pane, ask.at, ask.ref); });
    }

    settle(match: AskKey, outcome: string): void {
        writeTx(this.db, () => { this.settleRow.run(outcome, match.exchange, match.id, match.pane); });
    }

    unfinished(): readonly Ask[] {
        return guarded(() => all(this.open).flatMap(askOf), []);
    }

    prune(before: number): void {
        writeTx(this.db, () => { this.drop.run(before); });
    }
}
