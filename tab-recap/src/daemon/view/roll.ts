import { shouldRoll } from '#src/adapters/os/plugin-version.ts';
import { parseLine, type Line, type Running, type Version } from '#src/daemon/slots.ts';

export type Activity = 'idle' | 'compacting';

export interface RollParts {
    readonly started: Version | null;
    readonly diskVersion: () => Version | null;
    activity(): Activity;
    readonly spawnWaiter: () => void;
    readonly terminate: () => void;
    readonly log: (line: Line) => void;
}

export function startRoll(parts: RollParts): Running {
    let seen: Version | null = null;
    let attempted = false;
    return {
        tick: (): void => {
            if (attempted) {
                return;
            }
            const current = parts.diskVersion();
            const previous = seen;
            seen = current;
            if (!shouldRoll(parts.started, current, previous) || parts.activity() === 'compacting') {
                return;
            }
            attempted = true;
            try {
                parts.spawnWaiter();
            } catch {
                parts.log(parseLine('roll: could not start the successor; staying on this version'));
                return;
            }
            parts.terminate();
        },
        stop: (): void => {},
    };
}
