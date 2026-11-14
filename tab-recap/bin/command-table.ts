type CommandLoader = () => Promise<{ run: (args: readonly string[]) => number | Promise<number> }>;

export const COMMAND_TABLE: Readonly<Record<string, CommandLoader>> = {
    hooks: () => import('./commands/hooks.ts'),
    pane: () => import('./commands/pane.ts'),
};

export const COMMAND_SLOTS: Readonly<Record<string, { readonly slot: string; readonly key: string }>> = {
    hooks: { slot: 'hooks', key: 'TAB_RECAP_HOOKS' },
    pane: { slot: 'view', key: 'TAB_RECAP_VIEW_SERVER' },
};

const SLOT_FOLDER = new URL('../src/daemon/slots/', import.meta.url);

export async function slotDefault(slot: string, folder: URL = SLOT_FOLDER): Promise<boolean> {
    try {
        const loaded: unknown = await import(new URL(`${slot}.ts`, folder).href);
        return typeof loaded === 'object' && loaded !== null && 'defaultOn' in loaded && loaded.defaultOn === true;
    } catch {
        return false;
    }
}

export async function listedWords(setting: (key: string) => string | undefined, defaultOf: (slot: string) => Promise<boolean> = slotDefault): Promise<readonly string[]> {
    const listed = await Promise.all(Object.entries(COMMAND_SLOTS).map(async ([word, { slot, key }]) => {
        const value = setting(key);
        return value === 'on' || (value !== 'off' && await defaultOf(slot)) ? [word] : [];
    }));
    return listed.flat();
}

export function slottedCommand(word: string | undefined, args: readonly string[]): (() => Promise<number>) | undefined {
    const load = word === undefined || !Object.hasOwn(COMMAND_TABLE, word) ? undefined : COMMAND_TABLE[word];
    return load === undefined ? undefined : async () => (await load()).run(args);
}
