import { existsSync, readFileSync, rmSync, statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { must } from '#src/protocol/result.ts';
import { parsePid, type Pid } from '#src/recap/domain/pid.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { writeAtomically } from './atomic-file.ts';

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

    alive(): Pid | null {
        let pid = 0;
        try { pid = Number(readFileSync(this.path, 'utf8').trim()); } catch { return null; }
        if (!Number.isInteger(pid) || pid <= 0) {
            return null;
        }
        try {
            process.kill(pid, 0);
        } catch {
            return null;
        }
        const parsed = parsePid(pid);
        return parsed.kind === 'ok' ? parsed.value : null;
    }

    private get versionPath(): string {
        return join(this.root, 'daemon.version');
    }

    claim(pid: number, version: string | null = null): void {
        writeAtomically(this.path, `${pid}\n`);
        writeAtomically(this.versionPath, `${version ?? ''}\n`);
    }

    daemonVersion(): Text | null {
        let version = '';
        try {
            version = readFileSync(this.versionPath, 'utf8').trim();
        } catch {
            return null;
        }
        return version === '' ? null : must(parseText(version));
    }

    release(pid: number): void {
        if (this.alive() === pid) {
            rmSync(this.path, { force: true });
        }
    }

    private get beatPath(): string {
        return join(this.root, 'daemon.beat');
    }

    beat(): void {
        const now = new Date();
        try {
            utimesSync(this.beatPath, now, now);
        } catch {
            writeAtomically(this.beatPath, `${now.getTime()}\n`);
        }
    }

    wedged(ms: number): boolean {
        try {
            return this.alive() !== null && Date.now() - statSync(this.beatPath).mtimeMs > ms;
        } catch {
            return false;
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
