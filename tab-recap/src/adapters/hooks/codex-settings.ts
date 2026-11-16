import { homedir } from 'node:os';
import { join } from 'node:path';
import { must } from '#src/protocol/result.ts';
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
        add: (document, shim) => addCommandHooks(document, shim, events),
        remove: (document, shim) => removeCommandHooks(document, shim),
    };
}
