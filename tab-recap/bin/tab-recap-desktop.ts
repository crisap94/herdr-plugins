import { DESKTOP_STATE } from './desktop-env.ts';
import { Pidfile } from '#src/adapters/os/pidfile.ts';
import { notReadyLine, openCliStore } from '#src/daemon/cli-store.ts';
import { messagesOf } from '#src/daemon/config.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { USAGE_EXIT } from '#src/recap/domain/handoff-outcome.ts';
import { desktopDocumentCommand } from './desktop-document.ts';
import { settingsCommand } from './desktop-settings.ts';
import { enableDesktopDaemon, ensureDesktopDaemon, stopDesktopDaemon } from './desktop-daemon.ts';
import { textOf } from '#src/recap/domain/text.ts';

const OK = 0;
const FAILED = 1;

const m = messagesOf;

function refresh(tab: string | undefined): number {
    if (tab === undefined) {
        console.error(`tab-recap: 2 — ${m().cli.tabUnknown}`);
        return USAGE_EXIT;
    }
    const store = openCliStore();
    if (store.kind !== 'ready') {
        console.error(`tab-recap: 1 — ${notReadyLine(store, m())}`);
        return FAILED;
    }
    store.requests.request(tabId(textOf(tab)));
    console.log(`tab-recap: ${m().cli.requested(tab)}`);
    return OK;
}

function document(tab: string | undefined): number {
    if (tab === undefined) {
        console.error(`tab-recap: 2 — ${m().cli.tabUnknown}`);
        return USAGE_EXIT;
    }
    return desktopDocumentCommand(tabId(textOf(tab)));
}

function status(): number {
    const pidfile = new Pidfile(DESKTOP_STATE);
    console.log(`tab-recap: ${m().cli.statusDaemon(pidfile.alive(), pidfile.disabled, pidfile.daemonVersion())}\n${m().cli.statusState} ${DESKTOP_STATE}`);
    return OK;
}

const commands: Readonly<Record<string, (arg: string | undefined) => number>> = {
    ensure: ensureDesktopDaemon,
    start: enableDesktopDaemon,
    stop: stopDesktopDaemon,
    status,
    refresh,
    doc: document,
};

const [name, arg] = process.argv.slice(2);
const settings = (): number => settingsCommand(process.argv.slice(3));
const known = name === undefined ? undefined : commands[name];
const command = name === 'settings' ? settings : known;
if (command === undefined) {
    console.error(`tab-recap: 2 — ${[...Object.keys(commands), 'settings'].join('|')}`);
    process.exitCode = USAGE_EXIT;
} else {
    try {
        process.exitCode = command(arg);
    } catch (error) {
        console.error(`tab-recap: 1 — ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = FAILED;
    }
}
