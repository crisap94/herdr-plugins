import type { FleetFrame } from '#src/ports/fleet-source.ts';
import { textOf } from '@stateforge-labs/session-ledger';

export const fleetFrame = (event: string, data: Readonly<Record<string, unknown>>): FleetFrame => ({ event: textOf(event), payload: textOf(JSON.stringify(data)) });

export const dataOfFrame = (frame: FleetFrame): Readonly<Record<string, unknown>> => JSON.parse(frame.payload);
