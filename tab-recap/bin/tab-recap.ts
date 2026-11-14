import { setTimeout as sleep } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openCliStore } from '#src/daemon/cli-store.ts';
import type { Requests } from '#src/ports/requests.ts';
import { HerdrFleet } from '#src/adapters/herdr/fleet.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { Pidfile } from '#src/adapters/os/pidfile.ts';
import { boundKeys, herdrConfigPath } from '#src/adapters/herdr/host-check.ts';
import { bunHost } from '#src/host/bun-host.mjs';
import { supportOf } from '#src/host/policy.mjs';
import { codeVersion } from '#src/adapters/os/plugin-version.ts';
import { STORED_NOTES_ID } from '#src/extensions/stored-notes.ts';
import { AUTO_ORDER } from '#src/daemon/backends.ts';
import type { BackendChoice } from '#src/daemon/config.ts';
import type { Messages } from '#src/i18n/index.ts';
import { BACKEND_IDS, configDir, configGetter, loadConfig, messagesOf, parseEnv, recapLanguageSource, stateDir } from '#src/daemon/config.ts';
import { hasModel } from '#src/recap/domain/backend.ts';
import { USAGE_EXIT } from '#src/recap/domain/handoff-outcome.ts';
import { autocompactCommand } from './autocompact.ts';
import { compactCommand } from './compact.ts';
import { COMMAND_TABLE, listedWords, slottedCommand } from './command-table.ts';
import { handoffCommand, productionWiring } from './handoff.ts';
import { parseArguments } from './arguments.ts';
import { evalCommand } from './eval.ts';
import { setValues } from './set-backend.ts';

const OK = 0;
const FAILED = 1;
const USAGE = USAGE_EXIT;
const NOT_COVERED = 3;

const m = (): Messages => messagesOf();

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pidfile = new Pidfile(stateDir());

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
    const child = spawn(process.execPath, [join(root, 'src', 'daemon', 'launch.mjs')], {
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
        } catch { }
    }
    return process.env['HERDR_TAB_ID'] ?? null;
}

function choiceOf(arg: string | undefined, model: string | undefined): BackendChoice | null {
    const found = arg === 'auto' ? 'auto' : BACKEND_IDS.find((id) => id === arg);
    return found === undefined || (model !== undefined && (found === 'auto' || !hasModel(found))) ? null : found;
}

const modelSuffix = (model: string): string => (model === '' ? '' : `/${model}`);

function status(): number {
    const config = loadConfig();
    const t = m().cli;
    const running = pidfile.alive();
    const host = bunHost();
    const support = supportOf(host);
    console.log([
        t.statusVersion(codeVersion()),
        t.statusRuntime(host.execPath, host.bunVersion),
        ...(support.ok ? [] : [t.hostRefusal(support, host.execPath)]),
        t.statusKeys(boundKeys(), herdrConfigPath()),
        t.statusDaemon(running, pidfile.disabled, pidfile.daemonVersion()),
        t.statusBackend(`${config.backend}${config.backend === 'auto' ? ` (${AUTO_ORDER.join(' → ')})` : modelSuffix(config.models[config.backend])}`),
        `${t.statusLanguage} ${config.recapLanguage} (${t.statusSources[recapLanguageSource()]})`,
        t.statusExtensions(STORED_NOTES_ID),
        `${t.statusState} ${stateDir()}`,
        `${t.statusConfig} ${join(configDir(), 'config.env')}`,
    ].join('\n'));
    return OK;
}

async function configure(): Promise<number> {
    const tab = currentTab();
    await sleep(Number(process.env['TAB_RECAP_OPEN_DELAY_MS'] ?? 0) || 0);
    const opened = await new HerdrFleet(stateDir()).setup(tab === null ? null : tabId(tab));
    if (isUnknown(opened)) {
        console.error(`tab-recap: 1 — ${m().cli.modalFailed(saying(opened.why))}`);
        return FAILED;
    }
    if (opened.kind === 'busy') {
        console.error(`tab-recap: ${m().cli.setupBusy(`${join(root, 'bin', 'tab-recap.mjs')} backend`)}`);
        return FAILED;
    }
    return OK;
}

function requests(): Requests | null {
    const store = openCliStore();
    if (store.kind === 'ready') {
        return store.requests;
    }
    console.error(`tab-recap: 1 — ${m().database.newer(store.backup)}`);
    return null;
}

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

async function compact(): Promise<number> {
    const tab = currentTab();
    if (tab === null) {
        console.error(`tab-recap: 3 — ${m().cli.tabUnknown}`);
        return NOT_COVERED;
    }
    return compactCommand(tab, currentPane(), noteArg);
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
    handoff: () => (handoffArgs === null ? USAGE : handoffCommand(handoffArgs, productionWiring())),
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

const EVAL = 'eval';
const AUTOCOMPACT = 'autocompact';
const RAW = new Set<string | undefined>([EVAL, AUTOCOMPACT, ...Object.keys(COMMAND_TABLE)]);

const usage = async (): Promise<string> => m().cli.usage([...Object.keys(commands), EVAL, AUTOCOMPACT, ...(await listedWords(configGetter()))].join('|'));
const argv = process.argv.slice(2);
const parsed = RAW.has(argv[0]) ? { positionals: [argv[0] ?? ''], note: undefined, handoff: null } : parseArguments(argv);
const [name, arg, modelArg] = 'positionals' in parsed ? parsed.positionals : [];
const noteArg = 'positionals' in parsed ? parsed.note : undefined;
const handoffArgs = 'positionals' in parsed ? parsed.handoff : null;

function commandOf(word: string | undefined): ((arg: string | undefined) => number | Promise<number>) | undefined {
    const own: Readonly<Record<string, () => number | Promise<number>>> = { [EVAL]: () => evalCommand(argv.slice(1)), [AUTOCOMPACT]: () => autocompactCommand(argv.slice(1)) };
    return word === undefined ? undefined : own[word] ?? commands[word] ?? slottedCommand(word, argv.slice(1));
}
const command = commandOf(name);
if (!RAW.has(name) && argv.some((word) => HELP_FLAGS.has(word))) {
    console.log(await usage());
    process.exitCode = OK;
} else if ('problem' in parsed || command === undefined) {
    console.error(`tab-recap: 2 — ${'problem' in parsed ? `${parsed.problem}\n` : ''}${await usage()}`);
    process.exitCode = USAGE;
} else {
    try {
        process.exitCode = await command(arg);
    } catch (error) {
        console.error(`tab-recap: 1 — ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = FAILED;
    }
}
