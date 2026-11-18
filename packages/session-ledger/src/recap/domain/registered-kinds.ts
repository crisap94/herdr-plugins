import type { RegisteredKindCapabilities } from './legacy.ts';

export const REGISTERED_KINDS = {
    claude: { hasTranscript: true, compactable: true, defaultPolicy: true, autocompactDefault: true },
    codex: { hasTranscript: true, compactable: true, defaultPolicy: true, autocompactDefault: false },
    opencode: { hasTranscript: true, compactable: true, defaultPolicy: true, autocompactDefault: false },
} as const satisfies Readonly<Record<string, RegisteredKindCapabilities>>;

export type RegisteredKind = keyof typeof REGISTERED_KINDS;

export type RegisteredKindTable = Readonly<Record<string, RegisteredKindCapabilities>>;

export type { RegisteredKindCapabilities } from './legacy.ts';
export { kindsWith, registeredKindOf } from './legacy.ts';
