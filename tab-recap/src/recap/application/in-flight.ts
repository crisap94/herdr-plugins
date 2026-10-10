import type { InFlight } from '#src/ports/in-flight.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { FlightAnswer } from './autocompact-gates.ts';

export async function flightOf(port: InFlight, lane: Lane): Promise<FlightAnswer> {
    const reading = await port.read(lane);
    return reading.kind === 'count' ? { count: reading.count, why: `${reading.count} running` } : { count: 'unknown', why: reading.why };
}
