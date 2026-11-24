import { join } from 'node:path';
import type { Pidfile } from '#src/adapters/os/pidfile.ts';
import { boundKeysIn, herdrConfigPathOf } from '#src/adapters/herdr/host-check.ts';
import { codeVersion } from '#src/adapters/os/plugin-version.ts';
import { AUTO_ORDER } from '#src/daemon/backends.ts';
import { configDirectory, loadSettings, recapLanguageSource, stateDirectory } from '#src/daemon/config.ts';
import { STORED_NOTES_ID } from '#src/extensions/stored-notes.ts';
import { bunHost } from '#src/host/bun-host.mjs';
import { supportOf } from '#src/host/policy.mjs';
import type { Messages } from '#src/i18n/index.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseText } from '@stateforge-labs/session-ledger';

const OK = 0;

export const modelSuffix = (model: string): string => (model === '' ? '' : `/${model}`);

export function statusCommand(pidfile: Pidfile, t: Messages['cli']): number {
    const config = loadSettings();
    const running = pidfile.alive();
    const host = bunHost();
    const support = supportOf(host);
    console.log([
        t.statusVersion(codeVersion()),
        t.statusRuntime(must(parseText(host.execPath)), must(parseText(host.bunVersion))),
        ...(support.ok ? [] : [t.hostRefusal(support, must(parseText(host.execPath)))]),
        t.statusKeys(boundKeysIn(), herdrConfigPathOf()),
        t.statusDaemon(running, pidfile.disabled === 'disabled' ? 'present' : 'absent', pidfile.daemonVersion()),
        t.statusBackend(must(parseText(`${config.backend}${config.backend === 'auto' ? ` (${AUTO_ORDER.join(' → ')})` : modelSuffix(config.models[config.backend])}`))),
        `${t.statusLanguage} ${config.recapLanguage} (${t.statusSources[recapLanguageSource()]})`,
        t.statusExtensions(must(parseText(STORED_NOTES_ID))),
        `${t.statusState} ${stateDirectory()}`,
        `${t.statusConfig} ${join(configDirectory(), 'config.env')}`,
    ].join('\n'));
    return OK;
}
