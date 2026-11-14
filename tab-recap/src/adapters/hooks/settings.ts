import { brand, isFields, type Brand, type Fields } from '@stateforge-labs/herdr-sdk/core';
import { err, must, ok, type Result } from '#src/protocol/result.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { HOOK_EVENTS, HookHarness } from '#src/wire/hooks/contract.ts';

export type HookEvent = (typeof HOOK_EVENTS)[HookHarness][number];

export type SettingsDocument = Brand<Fields, 'SettingsDocument'>;

export interface HarnessSettings {
    readonly harness: HookHarness;
    readonly path: FsPath;
    readonly events: readonly HookEvent[];
    add(document: SettingsDocument, shim: FsPath): SettingsDocument;
    remove(document: SettingsDocument, shim: FsPath): SettingsDocument;
}

const DEFAULT_INDENT = '  ';
const INDENT = /^(?<indent>[ \t]+)\S/mu;

export function parseSettingsDocument(input: unknown): Result<SettingsDocument, Text> {
    try {
        const json: unknown = typeof input === 'string' ? JSON.parse(input) : input;
        const hooks = isFields(json) ? json['hooks'] : null;
        const shaped = isFields(json) && (hooks === undefined || (isFields(hooks) && Object.values(hooks).every((groups) => Array.isArray(groups))));
        return shaped ? ok(brand<Fields, 'SettingsDocument'>(json)) : err(must(parseText('not a JSON object whose "hooks" is an object of arrays')));
    } catch (error) {
        return err(must(parseText(error instanceof Error ? error.message : String(error))));
    }
}

export function addCommandHooks(document: SettingsDocument, shim: FsPath, events: readonly HookEvent[]): SettingsDocument {
    const before = document['hooks'];
    const hooks: Record<string, unknown> = isFields(before) ? { ...before } : {};
    const missing = events.filter((event) => {
        const groups = hooks[event];
        return !(Array.isArray(groups) && groups.some((group) => isFields(group) && Array.isArray(group['hooks']) && group['hooks'].some((handler) => isFields(handler) && handler['command'] === `${shim} ${event}`)));
    });
    for (const event of missing) {
        const groups = hooks[event];
        const list: readonly unknown[] = Array.isArray(groups) ? groups : [];
        hooks[event] = [...list, { hooks: [{ type: 'command', command: `${shim} ${event}` }] }];
    }
    return missing.length === 0 ? document : must(parseSettingsDocument({ ...document, hooks }));
}

export function removeCommandHooks(document: SettingsDocument, shim: FsPath): SettingsDocument {
    const before = document['hooks'];
    if (!isFields(before)) return document;
    const mine = `${shim} `;
    let removed = 0;
    const hooks: Record<string, unknown> = {};
    for (const [event, groups] of Object.entries(before)) {
        const list: readonly unknown[] = Array.isArray(groups) ? groups : [];
        const kept = list.flatMap((group) => {
            if (!isFields(group) || !Array.isArray(group['hooks'])) return [group];
            const handlers = group['hooks'].filter((handler) => !(isFields(handler) && typeof handler['command'] === 'string' && handler['command'].startsWith(mine)));
            removed += group['hooks'].length - handlers.length;
            if (handlers.length === group['hooks'].length) return [group];
            return handlers.length === 0 ? [] : [{ ...group, hooks: handlers }];
        });
        if (kept.length > 0 || list.length === 0) hooks[event] = kept;
    }
    if (removed === 0) return document;
    const keepHooks = Object.keys(hooks).length > 0;
    const entries = Object.entries(document).filter(([key]) => key !== 'hooks' || keepHooks);
    return must(parseSettingsDocument(Object.fromEntries(entries.map(([key, value]) => [key, key === 'hooks' ? hooks : value]))));
}

export function serializeSettings(document: SettingsDocument, original: Text | null): Text {
    const indent = original === null ? DEFAULT_INDENT : INDENT.exec(original)?.groups?.['indent'] ?? DEFAULT_INDENT;
    const newline = original === null || original.endsWith('\n') ? '\n' : '';
    return must(parseText(`${JSON.stringify(document, null, indent)}${newline}`));
}
