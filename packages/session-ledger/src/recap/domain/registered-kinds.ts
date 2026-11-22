import { brand, type Brand } from './brand.ts';
import type { Text } from './text.ts';

export type Capability = Brand<boolean, 'Capability'>;
export const capable = brand<boolean, 'Capability'>;

export interface RegisteredKindCapabilities { readonly hasTranscript: Capability; readonly compactable: Capability; readonly defaultPolicy: Capability; readonly autocompactDefault: Capability; }

export const REGISTERED_NAMES = ['claude', 'codex', 'opencode'] as const;

export type RegisteredKind = (typeof REGISTERED_NAMES)[number];

export const REGISTERED_KINDS = {
    claude: { hasTranscript: capable(true), compactable: capable(true), defaultPolicy: capable(true), autocompactDefault: capable(true) },
    codex: { hasTranscript: capable(true), compactable: capable(true), defaultPolicy: capable(true), autocompactDefault: capable(false) },
    opencode: { hasTranscript: capable(true), compactable: capable(true), defaultPolicy: capable(true), autocompactDefault: capable(false) },
} as const satisfies Readonly<Record<RegisteredKind, RegisteredKindCapabilities>>;

export type RegisteredKindTable = Readonly<Partial<Record<RegisteredKind, RegisteredKindCapabilities>>>;

export const registeredKindOf = (raw: Text): RegisteredKind | null => REGISTERED_NAMES.find((kind) => kind === raw) ?? null;

export function kindsWith(table: RegisteredKindTable, capability: keyof RegisteredKindCapabilities): readonly RegisteredKind[] {
    return REGISTERED_NAMES.filter((kind) => table[kind]?.[capability] === true);
}
