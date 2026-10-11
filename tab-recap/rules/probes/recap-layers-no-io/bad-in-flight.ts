import { IN_FLIGHT_CAPABILITIES } from '#src/adapters/transcript-registry.ts';
import type { InFlight } from '#src/ports/in-flight.ts';
import type { Lane } from '#src/recap/domain/lane.ts';

export async function flightOf(port: InFlight, lane: Lane): Promise<string> {
    const reading = await port.read(lane);
    return `${IN_FLIGHT_CAPABILITIES.claude.kind} ${reading.kind}`;
}
