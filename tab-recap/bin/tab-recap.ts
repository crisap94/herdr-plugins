// One-shot commands behind the plugin's actions. Exit codes: 0 done · 1 failed ·
// 2 usage · 3 could not look (the house convention).
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsRecapStore } from '#src/adapters/fs-recap-store.ts';
import { HerdrFleet } from '#src/adapters/herdr-fleet.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { Pidfile } from '#src/adapters/pidfile.ts';
import { hiddenIn } from '#src/recap/domain/visibility.ts';
import { loadExtensions } from '#src/extensions/load.ts';
import { AUTO_ORDER } from '#src/daemon/backends.ts';
import type { BackendChoice } from '#src/daemon/config.ts';
import type { Messages } from '#src/i18n/index.ts';
import { BACKEND_IDS, configDir, configGetter, loadConfig, messagesOf, parseEnv, stateDir } from '#src/daemon/config.ts';
import { setValues } from './set-backend.ts';

const OK = 0;
const FAILED = 1;
const USAGE = 2;
const NOT_COVERED = 3;

/** The operator's language for what a command prints; read when needed, so a config edit applies at once. */
const m = (): Messages => messagesOf();

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pidfile = new Pidfile(stateDir());

function launch(): number {
    const running = pidfile.alive();
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
        t.statusDaemon(running, pidfile.disabled),
        t.statusBackend(`${config.backend}${config.backend === 'auto' ? ` (${AUTO_ORDER.join(' → ')})` : modelSuffix(config.models[config.backend])}`, config.words),
        t.statusExtensions(loadExtensions(configGetter()).map((extension) => extension.id).join(', ') || t.none),
        `${t.statusState} ${stateDir()}`,
        `${t.statusConfig} ${join(configDir(), 'config.env')}`,
    ].join('\n'));
    return OK;
}

/** The settings modal; when herdr already shows another modal, say how to do the same from the shell. */
async function configure(): Promise<number> {
    const tab = currentTab();
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

/** Hide this tab's column if it shows, show it if it is hidden — or the same for every column. The daemon does the rest. */
function toggle(all: boolean): number {
    const tab = all ? 'all' : currentTab();
    if (tab === null) {
        console.error(`tab-recap: 3 — ${m().cli.tabUnknown}`);
        return NOT_COVERED;
    }
    const store = new FsRecapStore(stateDir());
    const saved = store.readHidden();
    const hide = all ? !saved.all : !hiddenIn(saved, tab);
    store.requestVisibility({ target: tab, hidden: hide });
    const t = m().cli;
    const said = all ? [t.columnsShown, t.columnsHidden] : [t.columnShown(tab), t.columnHidden(tab)];
    console.log(`tab-recap: ${said[hide ? 1 : 0] ?? ''}`);
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
        new FsRecapStore(stateDir()).request(tab);
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

const [name, arg, modelArg] = process.argv.slice(2);
const command = name === undefined ? undefined : commands[name];
if (command === undefined) {
    console.error(`tab-recap: 2 — ${m().cli.usage(Object.keys(commands).join('|'))}`);
    process.exitCode = USAGE;
} else {
    try {
        process.exitCode = await command(arg);
    } catch (error) {
        console.error(`tab-recap: 1 — ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = FAILED;
    }
}
