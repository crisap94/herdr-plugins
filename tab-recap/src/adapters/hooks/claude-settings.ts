import { homedir } from 'node:os';
import { join } from 'node:path';
import { must } from '#src/protocol/result.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import { HOOK_EVENTS } from '#src/wire/hooks/contract.ts';
import { addCommandHooks, dropCommandHook, removeCommandHooks, type HarnessSettings } from './settings.ts';

export const claudeSettingsPath = (): FsPath => must(parseFsPath(join(homedir(), '.claude', 'settings.json')));

export function claudeSettings(path: FsPath = claudeSettingsPath()): HarnessSettings {
    const events = HOOK_EVENTS.claude;
    const shimEvents = events.filter((event) => event !== 'PreCompact');
    return {
        harness: 'claude',
        path,
        events,
        preCompactScript: 'script',
        add: (document, commands) =>
            addCommandHooks(addCommandHooks(dropCommandHook(document, commands.shim, 'PreCompact'), commands.shim, shimEvents), commands.preCompactScript, ['PreCompact']),
        remove: (document, commands) => removeCommandHooks(removeCommandHooks(document, commands.shim), commands.preCompactScript),
    };
}
