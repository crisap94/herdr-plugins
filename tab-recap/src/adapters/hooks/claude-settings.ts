import { homedir } from 'node:os';
import { join } from 'node:path';
import { must } from '#src/protocol/result.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import { HOOK_EVENTS } from '#src/wire/hooks/contract.ts';
import { addCommandHooks, removeCommandHooks, type HarnessSettings } from './settings.ts';

export const claudeSettingsPath = (): FsPath => must(parseFsPath(join(homedir(), '.claude', 'settings.json')));

export function claudeSettings(path: FsPath = claudeSettingsPath()): HarnessSettings {
    const events = HOOK_EVENTS.claude;
    return {
        harness: 'claude',
        path,
        events,
        add: (document, shim) => addCommandHooks(document, shim, events),
        remove: (document, shim) => removeCommandHooks(document, shim),
    };
}
