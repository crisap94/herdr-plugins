export interface RegisteredKindCapabilities {
    readonly compactable: boolean;
    readonly defaultPolicy: boolean;
    readonly autocompactDefault: boolean;
}

export const REGISTERED_KINDS = {
    claude: { compactable: true, defaultPolicy: true, autocompactDefault: true },
    codex: { compactable: true, defaultPolicy: true, autocompactDefault: false },
    opencode: { compactable: true, defaultPolicy: true, autocompactDefault: false },
} as const satisfies Readonly<Record<string, RegisteredKindCapabilities>>;

export type RegisteredKind = keyof typeof REGISTERED_KINDS;

export function registeredKindOf(raw: string): RegisteredKind | null {
    return Object.hasOwn(REGISTERED_KINDS, raw) ? raw as RegisteredKind : null;
}

export type RegisteredKindTable = Readonly<Record<string, RegisteredKindCapabilities>>;

export function kindsWith<const T extends RegisteredKindTable>(table: T, capability: keyof RegisteredKindCapabilities): readonly (keyof T)[] {
    return (Object.keys(table) as (keyof T)[]).filter((kind) => table[kind]?.[capability] === true);
}
