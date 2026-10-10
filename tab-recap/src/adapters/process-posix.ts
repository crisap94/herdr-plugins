import { spawn } from 'node:child_process';
import type { ProcessControl } from '#src/ports/process-control.ts';
import { runIn } from './process-core.ts';
import type { Flavour, Spawner } from './process-core.ts';

const killGroup = (pid: number, force: boolean): void => {
    process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM');
};

export function posixProcess(spawner: Spawner = spawn): ProcessControl {
    const flavour: Flavour = { spawner, detached: true, windowsHide: false, killTree: killGroup };
    return { run: (command, args, options) => runIn(flavour, command, args, options), killTree: killGroup };
}
