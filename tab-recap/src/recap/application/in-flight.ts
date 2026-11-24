import type { InFlightReader } from '#src/ports/in-flight.ts';
import { flightReason, observedFrom, runningCount, unreadable } from '@stateforge-labs/session-ledger';
import type { Observed } from '@stateforge-labs/session-ledger';
import type { Lane } from '#src/recap/domain/lane.ts';
import { textOf } from '@stateforge-labs/session-ledger';
import { countOf } from '@stateforge-labs/session-ledger';

export async function flightOf(port: InFlightReader, lane: Lane): Promise<Observed> {
    const reading = await port.read(lane);
    return reading.kind === 'count' ? observedFrom(runningCount(countOf(reading.count)), reading.background, flightReason(textOf(`${reading.count} running`))) : unreadable(flightReason(textOf(reading.why)));
}
