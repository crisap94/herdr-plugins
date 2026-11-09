import { spawn } from 'node:child_process';
import type { ProcessControl } from '#src/ports/process-control.ts';
import { runIn } from './core.ts';
import type { Flavour, Spawner } from './core.ts';

const killGroup = (pid: number, force: boolean): void => {
    process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM');
};

export function posixProcess(spawner: Spawner = spawn): ProcessControl {
    const flavour: Flavour = { spawner, detached: true, killTree: killGroup };
    return { run: (command, args, options) => runIn(flavour, command, args, options), killTree: killGroup };
}
