export const BACKEND_IDS = ['claude', 'codex', 'opencode', 'hermes', 'custom'] as const;
export type BackendId = (typeof BACKEND_IDS)[number];
export type BackendChoice = BackendId | 'auto';

export const AUTO_ORDER: readonly BackendId[] = ['claude', 'codex', 'opencode', 'hermes'];

export const MODEL_DEFAULTS: Readonly<Record<BackendId, string>> = { claude: 'haiku', codex: '', opencode: '', hermes: '', custom: '' };

export function pick(choice: BackendChoice, available: readonly string[]): BackendId | null {
    return choice === 'auto' ? (AUTO_ORDER.find((id) => available.includes(id)) ?? null) : choice;
}
