import { homedir } from 'node:os';
import { join } from 'node:path';
import { must } from '@stateforge-labs/session-ledger';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import { HOOK_EVENTS } from '#src/wire/hooks/contract.ts';
import { addCommandHooks, removeCommandHooks, type HarnessSettings } from './settings.ts';

export const codexSettingsPath = (): FsPath => must(parseFsPath(join(homedir(), '.codex', 'hooks.json')));

export function codexSettings(path: FsPath = codexSettingsPath()): HarnessSettings {
    const events = HOOK_EVENTS.codex;
    return {
        harness: 'codex',
        path,
        events,
        preCompactScript: 'library',
        add: (document, commands) => addCommandHooks(document, commands.shim, events),
        remove: (document, commands) => removeCommandHooks(document, commands.shim),
    };
}
