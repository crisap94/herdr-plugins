/** The summarizers a recap can be written with. `custom` is only ever chosen by name. */
export const BACKEND_IDS = ['claude', 'codex', 'opencode', 'hermes', 'custom'] as const;
export type BackendId = (typeof BACKEND_IDS)[number];
export type BackendChoice = BackendId | 'auto';

/** What `auto` tries, in this order. */
export const AUTO_ORDER: readonly BackendId[] = ['claude', 'codex', 'opencode', 'hermes'];

/** The model a harness uses when none is set ('' = the harness's own default). */
export const MODEL_DEFAULTS: Readonly<Record<BackendId, string>> = { claude: 'haiku', codex: '', opencode: '', hermes: '', custom: '' };

/** The backend to run: the one named, or for `auto` the first of AUTO_ORDER that is available; null = none. */
export function pick(choice: BackendChoice, available: readonly string[]): BackendId | null {
    return choice === 'auto' ? (AUTO_ORDER.find((id) => available.includes(id)) ?? null) : choice;
}
