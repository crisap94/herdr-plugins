import { existsSync, readFileSync, rmSync, statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { must } from '#src/protocol/result.ts';
import { parsePid, type Pid } from '#src/recap/domain/pid.ts';
import { fsPathOf, type FsPath } from '#src/recap/domain/fs-path.ts';
import type { Duration } from '#src/recap/domain/time.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
import { writeAtomically } from './atomic-file.ts';

export type Wedging = 'wedged' | 'beating';
export type Switching = 'disabled' | 'enabled';

export class Pidfile {
    private readonly root: FsPath;

    constructor(root: FsPath) {
        this.root = root;
    }

    get logPath(): FsPath {
        return fsPathOf(join(this.root, 'daemon.log'));
    }

    private get path(): FsPath {
        return fsPathOf(join(this.root, 'daemon.pid'));
    }

    private get switchPath(): FsPath {
        return fsPathOf(join(this.root, 'disabled'));
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

    private get versionPath(): FsPath {
        return fsPathOf(join(this.root, 'daemon.version'));
    }

    claim(pid: Pid, version: Text | null = null): void {
        writeAtomically(this.path, textOf(`${pid}\n`));
        writeAtomically(this.versionPath, textOf(`${version ?? ''}\n`));
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

    release(pid: Pid): void {
        if (this.alive() === pid) {
            rmSync(this.path, { force: true });
        }
    }

    private get beatPath(): FsPath {
        return fsPathOf(join(this.root, 'daemon.beat'));
    }

    beat(): void {
        const now = new Date();
        try {
            utimesSync(this.beatPath, now, now);
        } catch {
            writeAtomically(this.beatPath, textOf(`${now.getTime()}\n`));
        }
    }

    wedged(span: Duration): Wedging {
        try {
            return this.alive() !== null && Date.now() - statSync(this.beatPath).mtimeMs > span ? 'wedged' : 'beating';
        } catch {
            return 'beating';
        }
    }

    get disabled(): Switching {
        return existsSync(this.switchPath) ? 'disabled' : 'enabled';
    }

    set disabled(value: Switching) {
        if (value === 'disabled') {
            writeAtomically(this.switchPath, textOf(`${Date.now()}\n`));
        } else {
            rmSync(this.switchPath, { force: true });
        }
    }
}
