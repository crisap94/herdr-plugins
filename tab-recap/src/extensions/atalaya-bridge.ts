import { readFileSync, statSync } from 'node:fs';
import { watch } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { obj, parse, readLines, str } from '#src/adapters/jsonl.ts';
import { run } from '#src/adapters/process.ts';
import type { Runner } from '#src/adapters/process.ts';
import type { Locale } from '#src/i18n/messages.ts';
import type { Extension, ExtensionFactory, ExtensionStore, UpkeepResult } from '#src/ports/extension.ts';
import type { PaneAlertWriter } from '#src/ports/pane-alerts.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { parseDirectory, type Directory } from '#src/recap/domain/directory.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parsePaneId } from '#src/recap/domain/ids.ts';
import { parseAlertSource, type PaneAlert } from '#src/recap/domain/pane-alert.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { duration, instant, type Duration, type Instant } from '#src/recap/domain/time.ts';

const UNIT = 'atalaya-bridge.service';
const STALE_MS = 180_000;
const HEAL_EVERY_MS = 300_000;
const MINUTE_MS = 60_000;
const LOG = 'atalaya-log.jsonl';
const READ_BUDGET = 1_048_576;
const SOURCE = must(parseAlertSource('atalaya-bridge'));
const START = must(parseCount(0));

export type { Runner } from '#src/adapters/process.ts';

type Heal = 'on' | 'off';

function currentUid(): Count | undefined {
    const uid = parseCount(process.getuid?.());
    return uid.kind === 'ok' ? uid.value : undefined;
}

function expandHome(path: Text): Text {
    return path === '~' || path.startsWith('~/') ? must(parseText(join(homedir(), path.slice(1)))) : path;
}

export function userBusEnv(base: NodeJS.ProcessEnv, uid: Count | undefined): NodeJS.ProcessEnv {
    if (uid === undefined) {
        return base;
    }
    const runtime = `/run/user/${uid}`;
    return {
        ...base,
        XDG_RUNTIME_DIR: (base['XDG_RUNTIME_DIR'] ?? '') === '' ? runtime : base['XDG_RUNTIME_DIR'],
        DBUS_SESSION_BUS_ADDRESS: (base['DBUS_SESSION_BUS_ADDRESS'] ?? '') === '' ? `unix:path=${runtime}/bus` : base['DBUS_SESSION_BUS_ADDRESS'],
    };
}

export function alertOf(line: Text): PaneAlert | null {
    const row = parse(line);
    const episode = obj(row?.['episode']);
    const pane = parsePaneId(str(episode['pane']));
    const kind = str(episode['kind']);
    if (row === null || pane.kind === 'err' || kind === null) {
        return null;
    }
    const evidence = obj(row['evidence']);
    const unmerged = evidence['unmerged'];
    const parts = [str(evidence['branch']), typeof unmerged === 'number' ? `${unmerged} unmerged` : null, str(evidence['tree'])];
    const at = typeof row['at'] === 'number' ? row['at'] : 0;
    return { source: SOURCE, pane: pane.value, label: must(parseText(kind)), at: instant(at), details: parts.flatMap((part) => (part === null ? [] : [must(parseText(part))])) };
}

function silence(locale: Locale, silent: Duration): Text {
    const minutes = Math.max(1, Math.round(silent / MINUTE_MS));
    return must(parseText(locale === 'es'
        ? `atalaya-bridge sin señal desde hace ${minutes} min — intentando arrancarlo`
        : `atalaya-bridge silent for ${minutes} min — healing`));
}

export class BridgeTail {
    private readonly dir: Directory;
    private readonly log: Text;
    private readonly alerts: PaneAlertWriter;
    private readonly stopper = new AbortController();
    private position: Count = START;

    constructor(dir: Directory, alerts: PaneAlertWriter) {
        this.dir = dir;
        this.log = must(parseText(join(dir, LOG)));
        this.alerts = alerts;
    }

    start(): void {
        this.alerts.clear(SOURCE);
        this.catchUp();
        void this.follow();
    }

    stop(): void {
        this.stopper.abort();
    }

    catchUp(): void {
        try {
            if (statSync(this.log).size < this.position) {
                this.alerts.clear(SOURCE);
                this.position = START;
            }
            this.readOn();
        } catch {
            return;
        }
    }

    private readOn(): void {
        for (let chunk = readLines(this.log, this.position, READ_BUDGET); chunk.end !== this.position; chunk = readLines(this.log, this.position, READ_BUDGET)) {
            chunk.lines.forEach((line) => {
                const found = alertOf(must(parseText(line)));
                if (found !== null) {
                    this.alerts.put(found);
                }
            });
            this.position = must(parseCount(chunk.end));
        }
    }

    private async follow(): Promise<void> {
        try {
            for await (const event of watch(this.dir, { persistent: false, signal: this.stopper.signal })) {
                if (event.filename === LOG) {
                    this.catchUp();
                }
            }
        } catch {
            return;
        }
    }
}

export class AtalayaBridge implements Extension {
    readonly id = 'atalaya-bridge';
    private readonly dir: Directory;
    private readonly healing: () => Heal;
    private readonly runner: Runner;
    private readonly clock: () => Instant;
    private readonly env: NodeJS.ProcessEnv;
    private lastHeal: Instant = instant(0);

    constructor(dir: Directory, healing: () => Heal, runner: Runner = run, clock: () => Instant = (): Instant => instant(Date.now()), env: NodeJS.ProcessEnv = process.env) {
        this.env = env;
        this.dir = dir;
        this.healing = healing;
        this.runner = runner;
        this.clock = clock;
    }

    follow(store: ExtensionStore): BridgeTail {
        const tail = new BridgeTail(this.dir, store.alerts);
        tail.start();
        return tail;
    }

    private heartbeat(): Instant | null {
        try {
            const at = Number(readFileSync(join(this.dir, 'heartbeat'), 'utf8').trim());
            return Number.isFinite(at) && at > 0 ? instant(at) : null;
        } catch {
            return null;
        }
    }

    warning(locale: Locale): Text | null {
        const beat = this.heartbeat();
        const age = duration(beat === null ? 0 : this.clock() - beat);
        return age < STALE_MS ? null : silence(locale, age);
    }

    async upkeep(): Promise<UpkeepResult> {
        const beat = this.heartbeat();
        const now = this.clock();
        if (this.healing() === 'off' || beat === null || now - beat < STALE_MS || now - this.lastHeal < HEAL_EVERY_MS) {
            return { kind: 'idle' };
        }
        this.lastHeal = now;
        const opts = { input: '', timeoutMs: 15_000, cwd: this.dir, env: userBusEnv(this.env, currentUid()) };
        if ((await this.runner('systemctl', ['--user', 'is-active', '--quiet', UNIT], opts)).code === 0) {
            return { kind: 'idle' };
        }
        const started = await this.runner('systemctl', ['--user', 'start', UNIT], opts);
        return started.code === 0
            ? { kind: 'acted', saying: `${UNIT} was down: started it` }
            : unknown({ why: 'failed', code: started.code, detail: started.stderr.trim() });
    }
}

export const atalayaBridge: ExtensionFactory = (get, store) => {
    const dir = parseDirectory(expandHome(must(parseText(get('TAB_RECAP_BRIDGE_DIR') ?? join(homedir(), '.local', 'state', 'atalaya-bridge')))));
    try {
        if (dir.kind !== 'ok' || !statSync(dir.value).isDirectory()) {
            return null;
        }
        const bridge = new AtalayaBridge(dir.value, () => (get('TAB_RECAP_BRIDGE_HEAL') === '0' ? 'off' : 'on'));
        if (store !== undefined) {
            bridge.follow(store);
        }
        return bridge;
    } catch {
        return null;
    }
};
