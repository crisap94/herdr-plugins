import type { InFlight } from '#src/ports/in-flight.ts';
import { flightReason, observedFrom, runningCount, unreadable } from '#src/recap/domain/in-flight.ts';
import type { Observed } from '#src/recap/domain/in-flight.ts';
import type { Lane } from '#src/recap/domain/lane.ts';

export async function flightOf(port: InFlight, lane: Lane): Promise<Observed> {
    const reading = await port.read(lane);
    return reading.kind === 'count' ? observedFrom(runningCount(reading.count), reading.background, flightReason(`${reading.count} running`)) : unreadable(flightReason(reading.why));
}
