import type { Brand } from './brand.ts';

export type EnvironmentName = Brand<string, 'EnvironmentName'>;

export function environmentName(raw: string): EnvironmentName {
    if (raw.trim() === '') {
        throw new Error('an environment name cannot be empty');
    }
    return raw as EnvironmentName;
}

interface JobHarness {
    readonly id: string;
    readonly label: string;
    readonly model: { readonly default: string; readonly legacyEnv: string | null } | null;
    readonly automatic: boolean;
    readonly availabilityMark: boolean;
    readonly customCommand: boolean;
    readonly job: { readonly contract: 'strict' | 'free-text'; readonly enumerates: boolean; readonly envScrub: readonly EnvironmentName[] };
}

export const JOB_HARNESSES = [
    { id: 'claude', label: 'claude', model: { default: 'haiku', legacyEnv: 'TAB_RECAP_CLAUDE_MODEL' }, automatic: true, availabilityMark: true, customCommand: false, job: { contract: 'strict', enumerates: true, envScrub: [environmentName('CLAUDECODE'), environmentName('CLAUDE_CODE_ENTRYPOINT')] } },
    { id: 'codex', label: 'codex', model: { default: '', legacyEnv: 'TAB_RECAP_CODEX_MODEL' }, automatic: true, availabilityMark: true, customCommand: false, job: { contract: 'strict', enumerates: true, envScrub: [] } },
    { id: 'opencode', label: 'opencode', model: { default: '', legacyEnv: null }, automatic: true, availabilityMark: true, customCommand: false, job: { contract: 'strict', enumerates: true, envScrub: [] } },
    { id: 'hermes', label: 'hermes', model: { default: '', legacyEnv: null }, automatic: true, availabilityMark: true, customCommand: false, job: { contract: 'strict', enumerates: true, envScrub: [] } },
    { id: 'custom', label: 'custom', model: null, automatic: false, availabilityMark: false, customCommand: true, job: { contract: 'free-text', enumerates: false, envScrub: [] } },
] as const satisfies readonly JobHarness[];

export type BackendId = (typeof JOB_HARNESSES)[number]['id'];
export type BackendChoice = BackendId | 'auto';
export type JobContract = (typeof JOB_HARNESSES)[number]['job']['contract'];
export type JobEnvironmentName = (typeof JOB_HARNESSES)[number]['job']['envScrub'][number];
type Entry = (typeof JOB_HARNESSES)[number];

const HARNESS_BY_ID: Readonly<Record<BackendId, Entry>> = Object.fromEntries(JOB_HARNESSES.map((entry) => [entry.id, entry])) as Record<BackendId, Entry>;

const backendRecord = <Value>(valueOf: (id: BackendId) => Value): Readonly<Record<BackendId, Value>> =>
    Object.fromEntries(JOB_HARNESSES.map(({ id }) => [id, valueOf(id)])) as Record<BackendId, Value>;

export const BACKEND_IDS: readonly BackendId[] = JOB_HARNESSES.map(({ id }) => id);
export const AUTO_ORDER: readonly BackendId[] = JOB_HARNESSES.filter(({ automatic }) => automatic).map(({ id }) => id);
export const MODEL_DEFAULTS = backendRecord((id) => HARNESS_BY_ID[id].model?.default ?? '');
export const LEGACY_MODEL_KEYS = JOB_HARNESSES.flatMap(({ model }) => model?.legacyEnv === null || model === null ? [] : [model.legacyEnv]);

export function hasModel(id: BackendId): boolean {
    return HARNESS_BY_ID[id].model !== null;
}

export function modelOf(id: BackendId): Entry['model'] {
    return HARNESS_BY_ID[id].model;
}

export function enumeratesJob(id: BackendId): boolean {
    return HARNESS_BY_ID[id].job.enumerates;
}

export function hasAvailabilityMark(id: BackendId): boolean {
    return HARNESS_BY_ID[id].availabilityMark;
}

export function jobContractOf(id: BackendId): JobContract {
    return HARNESS_BY_ID[id].job.contract;
}

export function jobEnvironmentNames(harnesses: readonly { readonly job: { readonly envScrub: readonly EnvironmentName[] } }[]): readonly EnvironmentName[] {
    return [...new Set(harnesses.flatMap(({ job }) => job.envScrub))];
}

export function harnessLabels<Value>(valueOf: (id: BackendId) => Value): Readonly<Record<BackendId, Value>> {
    return backendRecord(valueOf);
}

export function harnessChoiceLabels(customCommand: string): Readonly<Record<BackendId, string>> {
    return backendRecord((id) => HARNESS_BY_ID[id].customCommand ? customCommand : HARNESS_BY_ID[id].label);
}

export const INSTALLABLE_HARNESS_NAMES = JOB_HARNESSES.filter(({ automatic }) => automatic).map(({ label }) => label);

export function installableHarnessSentence(): string {
    const names = INSTALLABLE_HARNESS_NAMES;
    const final = names.at(-1) ?? '';
    return `${names.slice(0, -1).join(', ')} or ${final}`;
}

export function pick(choice: BackendChoice, available: readonly string[]): BackendId | null {
    return choice === 'auto' ? (AUTO_ORDER.find((id) => available.includes(id)) ?? null) : choice;
}
