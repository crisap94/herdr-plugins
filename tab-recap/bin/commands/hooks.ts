import { harnessSettings, installHooks, systemInstallIo, uninstallHooks, type InstallResult } from '#src/adapters/hooks/install.ts';
import type { HarnessSettings } from '#src/adapters/hooks/settings.ts';
import { configGetter, stateDir } from '#src/daemon/config.ts';
import { must } from '#src/protocol/result.ts';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';
import { YES } from '#src/recap/domain/gui-tab-parts.ts';
import { parseText } from '#src/recap/domain/text.ts';

const WORD = 'hooks';
const SWITCH = 'TAB_RECAP_HOOKS';
const SLOT_FILE = new URL('../../src/daemon/slots/hooks.ts', import.meta.url);
const OK = 0;
const REFUSED = 1;
const USAGE = 2;
const NOT_COVERED = 3;
const HARNESS_FLAG = '--harness';

const ACTIONS: Readonly<Record<string, (settings: HarnessSettings) => InstallResult>> = {
    install: (settings) => installHooks(must(parseFsPath(stateDir())), settings, systemInstallIo),
    uninstall: (settings) => uninstallHooks(must(parseFsPath(stateDir())), settings),
};

async function switchedOn(): Promise<boolean> {
    const value = configGetter()(SWITCH);
    if (value === 'on' || value === 'off') return value === 'on';
    try {
        const loaded: unknown = await import(SLOT_FILE.href);
        return typeof loaded === 'object' && loaded !== null && 'defaultOn' in loaded && loaded.defaultOn === true;
    } catch {
        return false;
    }
}

function usage(): number {
    console.error('tab-recap: 2 — usage: tab-recap hooks install|uninstall [--harness <name>]');
    return USAGE;
}

function report(word: string, settings: HarnessSettings, result: InstallResult): number {
    if (result.kind === 'refused') {
        console.error(`tab-recap: 1 — hooks ${word} ${settings.harness}: ${result.why}: ${result.detail}`);
        return REFUSED;
    }
    console.log(`tab-recap: hooks ${word} ${settings.harness}: ${result.changed === YES ? 'done' : 'nothing to change'} (${settings.path})`);
    return OK;
}

function chosenSettings(rest: readonly string[]): readonly HarnessSettings[] | null {
    const [flag, name, ...extra] = rest;
    if (flag === undefined) return harnessSettings(null);
    return flag === HARNESS_FLAG && name !== undefined && extra.length === 0 ? harnessSettings(must(parseText(name))) : null;
}

export async function run(args: readonly string[]): Promise<number> {
    if (!(await switchedOn())) {
        console.error(`tab-recap: 3 — ${WORD}: not available`);
        return NOT_COVERED;
    }
    const [word, ...rest] = args;
    const action = word === undefined || !Object.hasOwn(ACTIONS, word) ? undefined : ACTIONS[word];
    const chosen = chosenSettings(rest);
    if (word === undefined || action === undefined || chosen === null) return usage();
    const codes = chosen.map((settings) => report(word, settings, action(settings)));
    return codes.includes(REFUSED) ? REFUSED : OK;
}
