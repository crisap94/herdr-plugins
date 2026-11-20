import { shouldRoll } from '#src/adapters/os/plugin-version.ts';
import { parseLine, parseVersion, type Line, type Running, type Version } from '#src/daemon/slots.ts';
import type { ActiveInstallRead } from '#src/ports/active-install.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';

export type Activity = 'idle' | 'compacting';

export interface Successor {
    readonly version: Version | null;
    readonly launcher: FsPath;
}

export interface RollParts {
    readonly started: Version | null;
    readonly active: () => Promise<ActiveInstallRead>;
    readonly local: () => Successor;
    activity(): Activity;
    readonly spawnWaiter: (launcher: FsPath) => void;
    readonly terminate: () => void;
    readonly log: (line: Line) => void;
}

export async function successorOf(parts: Pick<RollParts, 'active' | 'local'>): Promise<Successor> {
    const install = await parts.active();
    return install.kind === 'install' ? { version: parseVersion(install.version), launcher: install.launcher } : parts.local();
}

export function startRoll(parts: RollParts): Running {
    let seen: Version | null = null;
    let attempted = false;
    let looking = false;
    const decide = (successor: Successor): void => {
        const previous = seen;
        seen = successor.version;
        if (!shouldRoll(parts.started, successor.version, previous) || parts.activity() === 'compacting') {
            return;
        }
        attempted = true;
        try {
            parts.spawnWaiter(successor.launcher);
        } catch {
            parts.log(parseLine('roll: could not start the successor; staying on this version'));
            return;
        }
        parts.terminate();
    };
    return {
        tick: (): void => {
            if (attempted || looking) {
                return;
            }
            looking = true;
            void successorOf(parts).then(decide, (): void => undefined).finally((): void => {
                looking = false;
            });
        },
        stop: (): void => {},
    };
}
