// One-shot commands behind the plugin's actions. Exit codes: 0 done · 1 failed ·
// 2 usage · 3 could not look (the house convention).
import { checked } from '#src/adapters/node-guard-command.mjs';
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { stateStore } from '#src/adapters/db/database.ts';
import type { Requests } from '#src/ports/requests.ts';
import { HerdrFleet } from '#src/adapters/herdr-fleet.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { Pidfile } from '#src/adapters/pidfile.ts';
import { MIN_NODE, boundKeys, herdrConfigPath, nodeAtLeast } from '#src/adapters/host-check.ts';
import { codeVersion } from '#src/adapters/plugin-version.ts';
import { loadExtensions } from '#src/extensions/load.ts';
import { AUTO_ORDER } from '#src/daemon/backends.ts';
import type { BackendChoice } from '#src/daemon/config.ts';
import type { Messages } from '#src/i18n/index.ts';
import { BACKEND_IDS, configDir, configGetter, loadConfig, messagesOf, parseEnv, stateDir } from '#src/daemon/config.ts';
import { setValues } from './set-backend.ts';

void checked;

const OK = 0;
const FAILED = 1;
const USAGE = 2;
const NOT_COVERED = 3;

/** The operator's language for what a command prints; read when needed, so a config edit applies at once. */
const m = (): Messages => messagesOf();

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pidfile = new Pidfile(stateDir());

/** A daemon that is alive but has not beaten for this long is stuck: it is killed and a new one takes over. */
const WEDGED_MS = 180_000;

function launch(): number {
    let running = pidfile.alive();
    if (running !== null && pidfile.wedged(WEDGED_MS)) {
        console.log(`tab-recap: ${m().cli.daemonWedged(running)}`);
        process.kill(running, 'SIGKILL');
        pidfile.release(running);
        running = null;
    }
    if (running !== null) {
        console.log(`tab-recap: ${m().cli.daemonRunning(running)}`);
        return OK;
    }
    const out = openSync(pidfile.logPath, 'a');
    const child = spawn(process.execPath, [join(root, 'src', 'daemon', 'main.ts')], {
        cwd: root, detached: true, stdio: ['ignore', out, out], env: { ...process.env, TAB_RECAP_STATE: stateDir() },
    });
    child.unref();
    console.log(`tab-recap: ${m().cli.daemonStarted(String(child.pid ?? '?'), pidfile.logPath)}`);
    return OK;
}

function stop(): number {
    pidfile.disabled = true;
    const running = pidfile.alive();
    if (running === null) {
        console.log(`tab-recap: ${m().cli.offIdle}`);
        return OK;
    }
    process.kill(running, 'SIGTERM');
    console.log(`tab-recap: ${m().cli.offClosing(running)}`);
    return OK;
}

/** The pane the action was invoked from, when herdr says (a keybinding names the focused one). */
function currentPane(): string | null {
    const context = process.env['HERDR_PLUGIN_CONTEXT_JSON'];
    try {
        const parsed = JSON.parse(context ?? '{}') as { pane_id?: unknown; focused_pane_id?: unknown };
        const found = parsed.pane_id ?? parsed.focused_pane_id;
        return typeof found === 'string' && found !== '' ? found : (process.env['HERDR_PANE_ID'] ?? null);
    } catch {
        return process.env['HERDR_PANE_ID'] ?? null;
    }
}

function currentTab(): string | null {
    const context = process.env['HERDR_PLUGIN_CONTEXT_JSON'];
    if (context !== undefined && context !== '') {
        try {
            const parsed = JSON.parse(context) as { tab_id?: unknown; focused_tab_id?: unknown };
            const found = parsed.tab_id ?? parsed.focused_tab_id;
            if (typeof found === 'string' && found !== '') {
                return found;
            }
        } catch { /* fall through */ }
    }
    return process.env['HERDR_TAB_ID'] ?? null;
}

/** `auto` and `custom` have no model to set; anything else must be a known backend. */
function choiceOf(arg: string | undefined, model: string | undefined): BackendChoice | null {
    const found = arg === 'auto' ? 'auto' : BACKEND_IDS.find((id) => id === arg);
    return found === undefined || (model !== undefined && (found === 'auto' || found === 'custom')) ? null : found;
}

const modelSuffix = (model: string): string => (model === '' ? '' : `/${model}`);

function status(): number {
    const config = loadConfig();
    const t = m().cli;
    const running = pidfile.alive();
    console.log([
        t.statusVersion(codeVersion()),
        t.statusNode(process.execPath, process.version),
        ...(nodeAtLeast(process.version) ? [] : [t.nodeTooOld(process.version, MIN_NODE, process.execPath)]),
        t.statusKeys(boundKeys(), herdrConfigPath()),
        t.statusDaemon(running, pidfile.disabled, pidfile.daemonVersion()),
        t.statusBackend(`${config.backend}${config.backend === 'auto' ? ` (${AUTO_ORDER.join(' → ')})` : modelSuffix(config.models[config.backend])}`),
        t.statusExtensions(loadExtensions(configGetter()).map((extension) => extension.id).join(', ') || t.none),
        `${t.statusState} ${stateDir()}`,
        `${t.statusConfig} ${join(configDir(), 'config.env')}`,
    ].join('\n'));
    return OK;
}

/** The settings modal; when herdr already shows another modal, say how to do the same from the shell. */
async function configure(): Promise<number> {
    const tab = currentTab();
    // a modal that asked for this is closing: herdr shows one popup at a time
    await new Promise((resolve) => { setTimeout(resolve, Number(process.env['TAB_RECAP_OPEN_DELAY_MS'] ?? 0) || 0); });
    const opened = await new HerdrFleet(stateDir()).setup(tab === null ? null : tabId(tab));
    if (isUnknown(opened)) {
        console.error(`tab-recap: 1 — ${m().cli.modalFailed(saying(opened.why))}`);
        return FAILED;
    }
    if (opened.kind === 'busy') {
        console.error(`tab-recap: ${m().cli.setupBusy(`${join(root, 'bin', 'tab-recap.ts')} backend`)}`);
        return FAILED;
    }
    return OK;
}

/** What the commands ask of the daemon go through the database; one written by a newer plugin is not ours to write. */
function requests(): Requests | null {
    const store = stateStore(stateDir());
    if (store.kind === 'ready') {
        return store.requests;
    }
    console.error(`tab-recap: 1 — ${m().database.newer(store.backup)}`);
    return null;
}

/**
 * Flip this tab's column (or every column). The CLI only says "toggle": the daemon decides from the board it holds,
 * so two presses in a row always alternate — deciding here from the saved file let two quick calls repeat each other.
 */
function toggle(all: boolean): number {
    const tab = all ? 'all' : currentTab();
    if (tab === null) {
        console.error(`tab-recap: 3 — ${m().cli.tabUnknown}`);
        return NOT_COVERED;
    }
    const queue = requests();
    if (queue === null) {
        return FAILED;
    }
    queue.requestVisibility({ target: tab, hidden: 'toggle' });
    console.log(`tab-recap: ${all ? m().cli.columnsToggled : m().cli.columnToggled(tab)}`);
    return OK;
}

/** The compaction popup (its note, then the request): the one place the operator is asked before anything is sent. */
async function compact(): Promise<number> {
    const tab = currentTab();
    if (tab === null) {
        console.error(`tab-recap: 3 — ${m().cli.tabUnknown}`);
        return NOT_COVERED;
    }
    // a modal that asked for this is closing: herdr shows one popup at a time
    await new Promise((resolve) => { setTimeout(resolve, Number(process.env['TAB_RECAP_COMPACT_DELAY_MS'] ?? 0) || 0); });
    const opened = await new HerdrFleet(stateDir()).agents().askNote(tab, currentPane());
    if (isUnknown(opened)) {
        console.error(`tab-recap: 1 — ${m().cli.modalFailed(saying(opened.why))}`);
        return FAILED;
    }
    console.log(`tab-recap: ${m().cli.compactAsked}`);
    return OK;
}

async function show(): Promise<number> {
    const tab = currentTab();
    if (tab === null) {
        console.error(`tab-recap: 3 — ${m().cli.tabUnknown}`);
        return NOT_COVERED;
    }
    const shown = await new HerdrFleet(stateDir()).show(tabId(tab));
    if (isUnknown(shown)) {
        console.error(`tab-recap: 1 — ${m().cli.modalFailed(saying(shown.why))}`);
        return FAILED;
    }
    return OK;
}

const commands: Readonly<Record<string, (arg: string | undefined) => number | Promise<number>>> = {
    show,
    compact,
    configure,
    start: () => { pidfile.disabled = false; return launch(); },
    startup: () => (pidfile.disabled ? OK : launch()),
    ensure: () => (pidfile.disabled || pidfile.alive() !== null ? OK : launch()),
    stop,
    toggle: () => (pidfile.disabled || pidfile.alive() === null ? commands['start']?.(undefined) ?? FAILED : stop()),
    status,
    column: () => toggle(false),
    columns: () => toggle(true),
    refresh: () => {
        const tab = currentTab();
        if (tab === null) {
            console.error(`tab-recap: 3 — ${m().cli.tabUnknown}`);
            return NOT_COVERED;
        }
        const queue = requests();
        if (queue === null) {
            return FAILED;
        }
        queue.request(tab);
        console.log(`tab-recap: ${m().cli.requested(tab)}`);
        return OK;
    },
    backend: (arg) => {
        const choice = choiceOf(arg, modelArg);
        if (choice === null) {
            console.error(`tab-recap: 2 — ${m().cli.usageBackend(`auto|${BACKEND_IDS.join('|')}`)}`);
            return USAGE;
        }
        const values = new Map<string, string>([['TAB_RECAP_BACKEND', choice]]);
        if (modelArg !== undefined && choice !== 'auto') {
            values.set(`TAB_RECAP_MODEL_${choice.toUpperCase()}`, modelArg);
        }
        setValues(join(configDir(), 'config.env'), values, parseEnv);
        const config = loadConfig();
        console.log(`tab-recap: ${m().cli.backendNow(`${choice}${choice === 'auto' ? '' : modelSuffix(config.models[choice])}`)}`);
        return OK;
    },
};

const HELP_FLAGS = new Set(['--help', '-h']);

/** `<command> [argument] [model]`; an option other than --help/-h is a usage error naming it. */
function parseArguments(argv: readonly string[]): { positionals: string[] } | { problem: string } {
    try {
        return { positionals: parseArgs({ args: [...argv], allowPositionals: true, strict: true, options: { help: { type: 'boolean', short: 'h' } } }).positionals };
    } catch (error) {
        return { problem: error instanceof Error ? error.message : String(error) };
    }
}

const usage = (): string => m().cli.usage(Object.keys(commands).join('|'));
const argv = process.argv.slice(2);
const parsed = parseArguments(argv);
const [name, arg, modelArg] = 'positionals' in parsed ? parsed.positionals : [];
const command = name === undefined ? undefined : commands[name];
if (argv.some((word) => HELP_FLAGS.has(word))) {
    console.log(usage());
    process.exitCode = OK;
} else if ('problem' in parsed || command === undefined) {
    console.error(`tab-recap: 2 — ${'problem' in parsed ? `${parsed.problem}\n` : ''}${usage()}`);
    process.exitCode = USAGE;
} else {
    try {
        process.exitCode = await command(arg);
    } catch (error) {
        console.error(`tab-recap: 1 — ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = FAILED;
    }
}
