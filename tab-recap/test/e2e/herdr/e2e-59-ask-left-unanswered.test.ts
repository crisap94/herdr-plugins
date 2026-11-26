import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { instant } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { AskBookRepository } from '#src/adapters/db/ask-ledger.ts';
import { openDatabase } from '#src/adapters/db/open.ts';
import { ASK_KEEP_MS } from '#src/daemon/timing.ts';
import type { AskBook } from '#src/ports/ask-ledger.ts';
import { parseToolName } from '#src/protocol/primitives.ts';
import { COMPACT_EXCHANGE } from '#src/recap/domain/compact-request.ts';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { scratch } from '#test/fixtures/git-repo.ts';
import { paneId } from '#test/support/ids.ts';
import { rid } from '../../fakes/ask-ledger.ts';

const NOW = 5_000_000_000_000;
const DAY = 24 * 60 * 60_000;
const coordinator = must(parseToolName('coordinator'));

describe('asks left unanswered while the daemon keeps running', () => {
    const fixture = scratch('tab-recap-e2e-asks-');
    const file = fsPathOf(join(fixture.root, 'asks.db'));
    let book: AskBook;
    let close: () => void;

    const open = (): AskBook => {
        const opened = openDatabase(file);
        assert.equal(opened.kind, 'ready');
        close = (): void => { opened.db.close(); };
        return new AskBookRepository(opened.db);
    };
    const ask = (id: string, pane: string, ago: number, answered: boolean): void => {
        book.record({ exchange: COMPACT_EXCHANGE, requester: coordinator, id: rid(id), pane: paneId(pane), at: instant(NOW - ago), ref: null });
        if (answered) {
            book.settle({ exchange: COMPACT_EXCHANGE, id: rid(id), pane: paneId(pane) }, { kind: 'done' });
        }
    };
    const known = (id: string): boolean => book.seen(COMPACT_EXCHANGE, coordinator, rid(id)) === 'seen';
    const sweep = (): void => { book.prune(instant(NOW - ASK_KEEP_MS)); };

    before(() => {
        book = open();
        ask('oldDone', 'w1:p1', ASK_KEEP_MS + DAY, true);
        ask('oldOpen', 'w1:p2', ASK_KEEP_MS + DAY, false);
        ask('newDone', 'w1:p3', ASK_KEEP_MS - DAY, true);
        ask('newOpen', 'w1:p4', DAY, false);
    });

    after(() => {
        close();
        fixture.clean();
    });

    test('every ask is known before the sweep', () => {
        assert.deepEqual(['oldDone', 'oldOpen', 'newDone', 'newOpen'].map(known), [true, true, true, true]);
    });

    test('the sweep forgets an answered ask older than the keep time', () => {
        sweep();
        assert.equal(known('oldDone'), false);
    });

    test('an answered ask inside the keep time is still known', () => {
        assert.equal(known('newDone'), true);
    });

    test('an ask left unanswered for longer than the keep time is never forgotten', () => {
        assert.equal(known('oldOpen'), true);
        assert.deepEqual(book.unfinished().map((entry) => entry.id).toSorted(), ['newOpen', 'oldOpen']);
    });

    test('the forgotten id may be asked again, and what stays is what a restart reads', () => {
        ask('oldDone', 'w1:p1', DAY, false);
        close();
        book = open();
        assert.deepEqual(book.unfinished().map((entry) => entry.id).toSorted(), ['newOpen', 'oldDone', 'oldOpen']);
        assert.equal(known('newDone'), true);
    });
});
