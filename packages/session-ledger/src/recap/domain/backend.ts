import { brand } from './brand.ts';
import type { Brand } from './brand.ts';

export type EnvironmentName = Brand<string, 'EnvironmentName'>;

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
    { id: 'claude', label: 'claude', model: { default: 'haiku', legacyEnv: 'TAB_RECAP_CLAUDE_MODEL' }, automatic: true, availabilityMark: true, customCommand: false, job: { contract: 'strict', enumerates: true, envScrub: [brand<string, 'EnvironmentName'>('CLAUDECODE'), brand<string, 'EnvironmentName'>('CLAUDE_CODE_ENTRYPOINT')] } },
    { id: 'codex', label: 'codex', model: { default: '', legacyEnv: 'TAB_RECAP_CODEX_MODEL' }, automatic: true, availabilityMark: true, customCommand: false, job: { contract: 'strict', enumerates: true, envScrub: [] } },
    { id: 'opencode', label: 'opencode', model: { default: '', legacyEnv: null }, automatic: true, availabilityMark: true, customCommand: false, job: { contract: 'strict', enumerates: true, envScrub: [] } },
    { id: 'custom', label: 'custom', model: null, automatic: false, availabilityMark: false, customCommand: true, job: { contract: 'free-text', enumerates: false, envScrub: [] } },
] as const satisfies readonly JobHarness[];

export type BackendId = (typeof JOB_HARNESSES)[number]['id'];
export type BackendChoice = BackendId | 'auto';
export type JobContract = (typeof JOB_HARNESSES)[number]['job']['contract'];
export type JobEnvironmentName = (typeof JOB_HARNESSES)[number]['job']['envScrub'][number];
export type HarnessEntry = (typeof JOB_HARNESSES)[number];

export const HARNESS_BY_ID: Readonly<Record<BackendId, HarnessEntry>> = { claude: JOB_HARNESSES[0], codex: JOB_HARNESSES[1], opencode: JOB_HARNESSES[2], custom: JOB_HARNESSES[3] };

export const backendRecord = <Value>(valueOf: (id: BackendId) => Value): Readonly<Record<BackendId, Value>> =>
    ({ claude: valueOf('claude'), codex: valueOf('codex'), opencode: valueOf('opencode'), custom: valueOf('custom') });

export const BACKEND_IDS: readonly BackendId[] = JOB_HARNESSES.map(({ id }) => id);
export const AUTO_ORDER: readonly BackendId[] = JOB_HARNESSES.filter(({ automatic }) => automatic).map(({ id }) => id);
export const MODEL_DEFAULTS = backendRecord((id) => HARNESS_BY_ID[id].model?.default ?? '');
export const LEGACY_MODEL_KEYS = JOB_HARNESSES.flatMap(({ model }) => model?.legacyEnv === null || model === null ? [] : [model.legacyEnv]);

export function jobContractOf(id: BackendId): JobContract {
    return HARNESS_BY_ID[id].job.contract;
}

export function harnessLabels<Value>(valueOf: (id: BackendId) => Value): Readonly<Record<BackendId, Value>> {
    return backendRecord(valueOf);
}

export const INSTALLABLE_HARNESS_NAMES = JOB_HARNESSES.filter(({ automatic }) => automatic).map(({ label }) => label);

export { enumeratesJob, environmentName, harnessChoiceLabels, hasAvailabilityMark, hasModel, installableHarnessSentence, jobEnvironmentNames, modelOf, pick } from './legacy.ts';
