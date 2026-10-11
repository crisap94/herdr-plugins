import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ClosedListing } from '#src/recap/application/handoff-listing.ts';
import { handoffReport, type HandoffArguments, type HandoffWiring } from '../bin/handoff.ts';
import { messagesOf } from '#src/daemon/config.ts';
import type { PrintRequest, PrintResult } from '#src/ports/handoff-print.ts';
import type { DeliverRequest } from '#src/recap/application/handoff-request.ts';
import { HANDOFF_OUTCOME_ROWS, handoffOutcomeOf, type HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import { paneId } from '#src/recap/domain/ids.ts';

const FROM = paneId('w1:p1');
const TO = paneId('w1:p2');
const DELIVER: HandoffArguments = { mode: 'deliver', from: FROM, to: TO, note: null, refresh: false, closed: null };
const PRINT: HandoffArguments = { mode: 'print', from: FROM, to: null, note: 'keep the tests', closed: null };

interface Recorded {
    readonly value: HandoffWiring;
    readonly delivered: DeliverRequest[];
    readonly printed: PrintRequest[];
}

function wiring(outcome: HandoffOutcome, printResult: PrintResult = { kind: 'text', text: 'the handoff', info: null }): Recorded {
    const delivered: DeliverRequest[] = [];
    const printed: PrintRequest[] = [];
    const value: HandoffWiring = {
        printer: {
            renderForPrint: async (request: PrintRequest): Promise<PrintResult> => {
                printed.push(request);
                return printResult;
            },
        },
        list: (): ClosedListing => ({ kind: 'listed', records: [] }),
        deliver: async (request: DeliverRequest): Promise<HandoffOutcome> => {
            delivered.push(request);
            return outcome;
        },
    };
    return { value, delivered, printed };
}

test('every outcome row maps to its exit code and its catalog message: stdout for delivered, stderr otherwise', async () => {
    const catalog = messagesOf().cli.handoff;
    for (const row of HANDOFF_OUTCOME_ROWS) {
        if (row.outcome === 'printed') {
            continue;
        }
        const outcome = handoffOutcomeOf(row.outcome, row.reason);
        if (outcome === null) {
            throw new Error(`${row.outcome} ${row.reason ?? ''} is missing from the outcome table`);
        }
        const report = await handoffReport(DELIVER, wiring(outcome).value);
        const text = catalog[row.message];
        const label = `${row.outcome} ${row.reason ?? ''}`;
        assert.deepEqual(report, row.exit === 0
            ? { exit: row.exit, out: `tab-recap: ${text}`, err: null }
            : { exit: row.exit, out: null, err: `tab-recap: ${row.exit} — ${text}` }, label);
    }
});

test('the deliver path hands the request to the wiring and never calls the printer', async () => {
    const { value, delivered, printed } = wiring({ kind: 'delivered' });
    assert.equal((await handoffReport(DELIVER, value)).exit, 0);
    assert.deepEqual(delivered, [DELIVER]);
    assert.deepEqual(printed, []);
});

test('print writes only the handoff text to stdout, exits 0, and never calls the deliver path', async () => {
    const { value, delivered, printed } = wiring({ kind: 'delivered' });
    assert.deepEqual(await handoffReport(PRINT, value), { exit: 0, out: 'the handoff', err: null });
    assert.deepEqual(printed, [{ from: FROM, to: null, note: 'keep the tests', closed: null }]);
    assert.deepEqual(delivered, []);
});

test('print with a refused reason reports that reason exactly as a delivery does', async () => {
    const { value, delivered } = wiring({ kind: 'delivered' }, { kind: 'refused', reason: 'source-unavailable' });
    assert.deepEqual(await handoffReport({ ...PRINT, to: TO }, value), { exit: 1, out: null, err: `tab-recap: 1 — ${messagesOf().cli.handoff['refused.sourceUnavailable']}` });
    assert.deepEqual(delivered, []);
});

