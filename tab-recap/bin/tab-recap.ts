import { setTimeout as sleep } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { notReadyLine, openCliStore } from '#src/daemon/cli-store.ts';
import type { RequestPort } from '#src/ports/requests.ts';
import { HerdrFleetPorts } from '#src/adapters/herdr/fleet.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { Pidfile } from '#src/adapters/os/pidfile.ts';
import type { Messages } from '#src/i18n/index.ts';
import { BACKEND_IDS, type BackendChoice, configDirectory, settingGetter, loadSettings, messagesOf, parseSettingsFile, stateDirectory } from '#src/daemon/config.ts';
import { environmentName, hasModel, type EnvironmentName } from '#src/recap/domain/backend.ts';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { duration } from '#src/recap/domain/time.ts';
import { USAGE_EXIT } from '#src/recap/domain/handoff-outcome.ts';
import { autocompactCommand } from './autocompact.ts';
import { compactCommand } from './compact.ts';
import { COMMAND_TABLE, listedWords, slottedCommand } from './command-table.ts';
import { handoffCommand, productionWiring } from './handoff.ts';
import { parseArguments } from './arguments.ts';
import { evalCommand } from './eval.ts';
import { setValues } from './set-backend.ts';
import { markStopping, stillStopping } from './stop-marker.ts';
import { modelSuffix, statusCommand } from './commands/status.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
import { must } from '#src/protocol/result.ts';

const OK = 0;
const FAILED = 1;
const USAGE = USAGE_EXIT;
const NOT_COVERED = 3;

const m = (): Messages => messagesOf();

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pidfile = new Pidfile(fsPathOf(stateDirectory()));
const WEDGED_MS = duration(180_000);

async function launch(): Promise<number> {
    if (await stillStopping(stateDirectory())) { console.error(`tab-recap: 1 — ${m().cli.daemonStillStopping}`); return FAILED; }
    let running = pidfile.alive();
    if (running !== null && pidfile.wedged(WEDGED_MS) === 'wedged') {
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
        cwd: root, detached: true, stdio: ['ignore', out, out], env: { ...process.env, TAB_RECAP_STATE: stateDirectory() },
    });
    child.unref();
    console.log(`tab-recap: ${m().cli.daemonStarted(must(parseText(String(child.pid ?? '?'))), must(parseText(pidfile.logPath)))}`);
    return OK;
}

function stop(): number {
    pidfile.disabled = 'disabled';
    const running = pidfile.alive();
    if (running === null) {
        console.log(`tab-recap: ${m().cli.offIdle}`);
        return OK;
    }
    markStopping(stateDirectory(), running);
    process.kill(running, 'SIGTERM');
    console.log(`tab-recap: ${m().cli.offClosing(running)}`);
    return OK;
}

const fieldOf = (parsed: unknown, key: string): unknown => (typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, key) : undefined);

function currentPane(): string | null {
    const context = process.env['HERDR_PLUGIN_CONTEXT_JSON'];
    try {
        const parsed: unknown = JSON.parse(context ?? '{}');
        const found = fieldOf(parsed, 'pane_id') ?? fieldOf(parsed, 'focused_pane_id');
        return typeof found === 'string' && found !== '' ? found : (process.env['HERDR_PANE_ID'] ?? null);
    } catch {
        return process.env['HERDR_PANE_ID'] ?? null;
    }
}

function currentTab(): string | null {
    const context = process.env['HERDR_PLUGIN_CONTEXT_JSON'];
    if (context !== undefined && context !== '') {
        try {
            const parsed: unknown = JSON.parse(context);
            const found = fieldOf(parsed, 'tab_id') ?? fieldOf(parsed, 'focused_tab_id');
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

async function configure(): Promise<number> {
    const tab = currentTab();
    await sleep(Number(process.env['TAB_RECAP_OPEN_DELAY_MS'] ?? 0) || 0);
    const opened = await new HerdrFleetPorts(textOf(stateDirectory())).setup(tab === null ? null : tabId(textOf(tab)));
    if (isUnknown(opened)) {
        console.error(`tab-recap: 1 — ${m().cli.modalFailed(saying(opened.why))}`);
        return FAILED;
    }
    if (opened.kind === 'busy') {
        console.error(`tab-recap: ${m().cli.setupBusy(must(parseText(`${join(root, 'bin', 'tab-recap.mjs')} backend`)))}`);
        return FAILED;
    }
    return OK;
}

function requests(): RequestPort | null {
    const store = openCliStore();
    if (store.kind === 'ready') {
        return store.requests;
    }
    console.error(`tab-recap: 1 — ${notReadyLine(store, m())}`);
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
    queue.requestVisibility({ target: paneId(textOf(tab)), visibility: 'toggle' });
    console.log(`tab-recap: ${all ? m().cli.columnsToggled : m().cli.columnToggled(must(parseText(tab)))}`);
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
    const shown = await new HerdrFleetPorts(textOf(stateDirectory())).show(tabId(textOf(tab)));
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
    start: () => { pidfile.disabled = 'enabled'; return launch(); },
    startup: () => (pidfile.disabled === 'disabled' ? OK : launch()),
    ensure: () => (pidfile.disabled === 'disabled' || pidfile.alive() !== null ? OK : launch()),
    stop,
    toggle: () => (pidfile.disabled === 'disabled' || pidfile.alive() === null ? commands['start']?.(undefined) ?? FAILED : stop()),
    status: () => statusCommand(pidfile, m().cli),
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
        queue.request(tabId(textOf(tab)));
        console.log(`tab-recap: ${m().cli.requested(must(parseText(tab)))}`);
        return OK;
    },
    backend: (arg) => {
        const choice = choiceOf(arg, modelArg);
        if (choice === null) {
            console.error(`tab-recap: 2 — ${m().cli.usageBackend(must(parseText(`auto|${BACKEND_IDS.join('|')}`)))}`);
            return USAGE;
        }
        const values = new Map<EnvironmentName, Text>([[environmentName(textOf('TAB_RECAP_BACKEND')), textOf(choice)]]);
        if (modelArg !== undefined && choice !== 'auto') {
            values.set(environmentName(textOf(`TAB_RECAP_MODEL_${choice.toUpperCase()}`)), textOf(modelArg));
        }
        setValues(fsPathOf(join(configDirectory(), 'config.env')), values, parseSettingsFile);
        const config = loadSettings();
        console.log(`tab-recap: ${m().cli.backendNow(must(parseText(`${choice}${choice === 'auto' ? '' : modelSuffix(config.models[choice])}`)))}`);
        return OK;
    },
};

const HELP_FLAGS = new Set(['--help', '-h']);

const EVAL = 'eval';
const AUTOCOMPACT = 'autocompact';
const RAW = new Set<string | undefined>([EVAL, AUTOCOMPACT, ...Object.keys(COMMAND_TABLE)]);

const usage = async (): Promise<string> => m().cli.usage(must(parseText([...Object.keys(commands), EVAL, AUTOCOMPACT, ...(await listedWords(settingGetter()))].join('|'))));
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
