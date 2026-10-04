// The daemon's single-instance guard and the on/off switch, both under the state dir.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { writeAtomically } from './fs-recap-store.ts';

export class Pidfile {
    private readonly root: string;

    constructor(root: string) {
        this.root = root;
    }

    get logPath(): string {
        return join(this.root, 'daemon.log');
    }

    private get path(): string {
        return join(this.root, 'daemon.pid');
    }

    private get switchPath(): string {
        return join(this.root, 'disabled');
    }

    alive(): number | null {
        let pid = 0;
        try { pid = Number(readFileSync(this.path, 'utf8').trim()); } catch { return null; }
        if (!Number.isInteger(pid) || pid <= 0) {
            return null;
        }
        try {
            process.kill(pid, 0);
            return pid;
        } catch {
            return null;
        }
    }

    claim(pid: number): void {
        writeAtomically(this.path, `${pid}\n`);
    }

    release(pid: number): void {
        if (this.alive() === pid) {
            rmSync(this.path, { force: true });
        }
    }

    get disabled(): boolean {
        return existsSync(this.switchPath);
    }

    set disabled(value: boolean) {
        if (value) {
            writeAtomically(this.switchPath, `${Date.now()}\n`);
        } else {
            rmSync(this.switchPath, { force: true });
        }
    }
}
