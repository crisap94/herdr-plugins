import { brand } from './brand.ts';
import type { Brand } from './brand.ts';
import { textOf, type Text } from './text.ts';

export type EnvironmentName = Brand<string, 'EnvironmentName'>;

export function environmentName(raw: Text): EnvironmentName {
    if (raw.trim() === '') throw new Error('an environment name cannot be empty');
    return brand<string, 'EnvironmentName'>(raw);
}

export interface HarnessModel { readonly default: Text; readonly legacyEnv: EnvironmentName | null; }

export interface ScrubbedJob { readonly envScrub: readonly EnvironmentName[]; }

export interface ScrubbingHarness { readonly job: ScrubbedJob; }

export type HasModel = Brand<boolean, 'HasModel'>;
export type EnumeratesJob = Brand<boolean, 'EnumeratesJob'>;
export type AvailabilityMarked = Brand<boolean, 'AvailabilityMarked'>;

interface JobHarness {
    readonly id: string;
    readonly label: string;
    readonly model: HarnessModel | null;
    readonly automatic: boolean;
    readonly availabilityMark: boolean;
    readonly customCommand: boolean;
    readonly job: { readonly contract: 'strict' | 'free-text'; readonly enumerates: boolean; readonly envScrub: readonly EnvironmentName[] };
}

export const JOB_HARNESSES = [
    { id: 'claude', label: 'claude', model: { default: textOf('haiku'), legacyEnv: environmentName(textOf('TAB_RECAP_CLAUDE_MODEL')) }, automatic: true, availabilityMark: true, customCommand: false, job: { contract: 'strict', enumerates: true, envScrub: [environmentName(textOf('CLAUDECODE')), environmentName(textOf('CLAUDE_CODE_ENTRYPOINT'))] } },
    { id: 'codex', label: 'codex', model: { default: textOf(''), legacyEnv: environmentName(textOf('TAB_RECAP_CODEX_MODEL')) }, automatic: true, availabilityMark: true, customCommand: false, job: { contract: 'strict', enumerates: true, envScrub: [] } },
    { id: 'opencode', label: 'opencode', model: { default: textOf(''), legacyEnv: null }, automatic: true, availabilityMark: true, customCommand: false, job: { contract: 'strict', enumerates: true, envScrub: [] } },
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
export const MODEL_DEFAULTS = backendRecord((id) => HARNESS_BY_ID[id].model?.default ?? textOf(''));
export const LEGACY_MODEL_KEYS = JOB_HARNESSES.flatMap(({ model }) => model?.legacyEnv === null || model === null ? [] : [model.legacyEnv]);

export function jobContractOf(id: BackendId): JobContract {
    return HARNESS_BY_ID[id].job.contract;
}

export function harnessLabels<Value>(valueOf: (id: BackendId) => Value): Readonly<Record<BackendId, Value>> {
    return backendRecord(valueOf);
}

export const INSTALLABLE_HARNESS_NAMES = JOB_HARNESSES.filter(({ automatic }) => automatic).map(({ label }) => label);

export const hasModel = (id: BackendId): HasModel => brand<boolean, 'HasModel'>(HARNESS_BY_ID[id].model !== null);
export const modelOf = (id: BackendId): HarnessModel | null => HARNESS_BY_ID[id].model;
export const enumeratesJob = (id: BackendId): EnumeratesJob => brand<boolean, 'EnumeratesJob'>(HARNESS_BY_ID[id].job.enumerates);
export const hasAvailabilityMark = (id: BackendId): AvailabilityMarked => brand<boolean, 'AvailabilityMarked'>(HARNESS_BY_ID[id].availabilityMark);

export const jobEnvironmentNames = (harnesses: readonly ScrubbingHarness[]): readonly EnvironmentName[] => [...new Set(harnesses.flatMap(({ job }) => job.envScrub))];

export const harnessChoiceLabels = (customCommand: Text): Readonly<Record<BackendId, Text>> => backendRecord((id) => (HARNESS_BY_ID[id].customCommand ? customCommand : textOf(HARNESS_BY_ID[id].label)));

export const installableHarnessSentence = (): Text => textOf(`${INSTALLABLE_HARNESS_NAMES.slice(0, -1).join(', ')} or ${INSTALLABLE_HARNESS_NAMES.at(-1) ?? ''}`);

export const pick = (choice: BackendChoice, available: readonly (BackendId | Text)[]): BackendId | null => (choice === 'auto' ? (AUTO_ORDER.find((id) => available.some((name) => name === id)) ?? null) : choice);
