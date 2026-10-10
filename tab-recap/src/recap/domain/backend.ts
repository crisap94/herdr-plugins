export const JOB_HARNESSES = [
    { id: 'claude', label: 'claude', model: { default: 'haiku', legacyEnv: 'TAB_RECAP_CLAUDE_MODEL' }, automatic: true, setupNote: null, job: { contract: 'strict', enumerates: true } },
    { id: 'codex', label: 'codex', model: { default: '', legacyEnv: 'TAB_RECAP_CODEX_MODEL' }, automatic: true, setupNote: null, job: { contract: 'strict', enumerates: true } },
    { id: 'opencode', label: 'opencode', model: { default: '', legacyEnv: null }, automatic: true, setupNote: null, job: { contract: 'strict', enumerates: true } },
    { id: 'hermes', label: 'hermes', model: { default: '', legacyEnv: null }, automatic: true, setupNote: null, job: { contract: 'strict', enumerates: true } },
    { id: 'custom', label: 'custom', model: null, automatic: false, setupNote: 'custom-command', job: { contract: 'free-text', enumerates: false } },
] as const;

export type BackendId = (typeof JOB_HARNESSES)[number]['id'];
export type BackendChoice = BackendId | 'auto';
export type JobContract = (typeof JOB_HARNESSES)[number]['job']['contract'];

const backendRecord = <Value>(valueOf: (id: BackendId) => Value): Readonly<Record<BackendId, Value>> =>
    Object.fromEntries(JOB_HARNESSES.map(({ id }) => [id, valueOf(id)])) as Record<BackendId, Value>;

export const BACKEND_IDS: readonly BackendId[] = JOB_HARNESSES.map(({ id }) => id);
export const AUTO_ORDER: readonly BackendId[] = JOB_HARNESSES.filter(({ automatic }) => automatic).map(({ id }) => id);
export const MODEL_DEFAULTS = backendRecord((id) => JOB_HARNESSES.find((harness) => harness.id === id)?.model?.default ?? '');
export const LEGACY_MODEL_KEYS = JOB_HARNESSES.flatMap(({ model }) => model?.legacyEnv === null || model === null ? [] : [model.legacyEnv]);

export function hasModel(id: BackendId): boolean {
    return JOB_HARNESSES.find((harness) => harness.id === id)?.model !== null;
}

export function enumeratesJob(id: BackendId): boolean {
    return JOB_HARNESSES.find((harness) => harness.id === id)?.job.enumerates ?? false;
}

export function jobContractOf(id: string): JobContract {
    return JOB_HARNESSES.find((harness) => harness.id === id)?.job.contract ?? 'strict';
}

export function harnessLabels<Value>(valueOf: (id: BackendId) => Value): Readonly<Record<BackendId, Value>> {
    return backendRecord(valueOf);
}

export function harnessChoiceLabels(customCommand: string): Readonly<Record<BackendId, string>> {
    return backendRecord((id) => {
        const harness = JOB_HARNESSES.find((each) => each.id === id);
        return harness?.setupNote === 'custom-command' ? customCommand : harness?.label ?? id;
    });
}

export const INSTALLABLE_HARNESS_NAMES = JOB_HARNESSES.filter(({ job }) => job.enumerates).map(({ label }) => label);

export function installableHarnessSentence(): string {
    const names = INSTALLABLE_HARNESS_NAMES;
    const final = names.at(-1) ?? '';
    return `${names.slice(0, -1).join(', ')} or ${final}`;
}

export function pick(choice: BackendChoice, available: readonly string[]): BackendId | null {
    return choice === 'auto' ? (AUTO_ORDER.find((id) => available.includes(id)) ?? null) : choice;
}
