// ProcessControl on Windows: no process groups, so `taskkill /T` ends the tree. Unit-tested with a fake spawner only.
import { spawn } from 'node:child_process';
import type { ProcessControl } from '#src/ports/process-control.ts';
import { runIn } from './process-core.ts';
import type { Flavour, Spawner } from './process-core.ts';

export function windowsProcess(spawner: Spawner = spawn): ProcessControl {
    // `taskkill` has no polite end for a console-less program: both steps are /F
    const killTree = (pid: number): void => {
        const killer = spawner('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        killer.on('error', () => undefined);
        killer.unref();
    };
    const flavour: Flavour = { spawner, detached: false, windowsHide: true, killTree };
    return { run: (command, args, options) => runIn(flavour, command, args, options), killTree };
}
