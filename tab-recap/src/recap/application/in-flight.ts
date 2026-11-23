import type { InFlightReader } from '#src/ports/in-flight.ts';
import { flightReason, observedFrom, runningCount, unreadable } from '#src/recap/domain/in-flight.ts';
import type { Observed } from '#src/recap/domain/in-flight.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { countOf } from '#src/recap/domain/count.ts';

export async function flightOf(port: InFlightReader, lane: Lane): Promise<Observed> {
    const reading = await port.read(lane);
    return reading.kind === 'count' ? observedFrom(runningCount(countOf(reading.count)), reading.background, flightReason(textOf(`${reading.count} running`))) : unreadable(flightReason(textOf(reading.why)));
}
