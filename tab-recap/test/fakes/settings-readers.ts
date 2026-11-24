import { BACKEND_IDS, harnessLabels, type BackendChoice, type BackendId } from '#src/recap/domain/backend.ts';
import { jevFrom, policyFrom, type Policy, type JevSettings } from '#src/recap/domain/autocompact.ts';
import { tuningFrom, type CompactTuning } from '#src/recap/domain/autocompact-style.ts';
import { compactSettingOf, coverageSettingOf, curateSettingOf, deciderSettingOf, judgeSettingOf, keepDaysCountOf, placementFor } from '#src/recap/domain/job.ts';
import type { DeciderSetting, JobPlacement, JobSetting } from '#src/recap/domain/job.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';
import type { Count } from '#src/recap/domain/count.ts';

export type RawReader = (key: string) => string | undefined;

export const typedReader = (reader: RawReader): ((key: string) => Text | undefined) => (key) => {
    const raw = reader(key);
    return raw === undefined ? undefined : textOf(raw);
};

export const judgeJobOf = (reader: RawReader): JobSetting => judgeSettingOf(typedReader(reader));

export const compactJobOf = (reader: RawReader): JobSetting => compactSettingOf(typedReader(reader));

export const curateJobOf = (reader: RawReader): JobSetting => curateSettingOf(typedReader(reader));

export const deciderJobOf = (reader: RawReader): DeciderSetting => deciderSettingOf(typedReader(reader));

export const coverageJobOf = (reader: RawReader): DeciderSetting => coverageSettingOf(typedReader(reader), deciderSettingOf(typedReader(reader)));

export const keepDaysOf = (raw: string | undefined): Count => keepDaysCountOf(raw === undefined ? undefined : textOf(raw));

export const policyOf = (reader: RawReader): Policy => policyFrom(typedReader(reader));

export const jevOf = (reader: RawReader): JevSettings => jevFrom(typedReader(reader));

export const tuningOf = (reader: RawReader): CompactTuning => tuningFrom(typedReader(reader));

export interface PlainJob { readonly by: JobSetting['by']; readonly model: string; readonly effort: Effort; readonly timeoutMs?: NonNullable<JobSetting['timeoutMs']>; readonly answer?: NonNullable<JobSetting['answer']> }

export interface PlainRecap { readonly backend: BackendChoice; readonly models: Readonly<Record<BackendId, string>> }

export const placementOf = (job: PlainJob, recap: PlainRecap, available: readonly string[]): JobPlacement | null => placementFor(
    { ...job, model: textOf(job.model) },
    { backend: recap.backend, models: harnessLabels((id) => textOf(recap.models[id])) },
    available.filter((id): id is BackendId => BACKEND_IDS.some((known) => known === id)),
);
