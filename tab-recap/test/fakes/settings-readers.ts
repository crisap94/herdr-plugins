import { BACKEND_IDS, harnessLabels, type BackendChoice, type BackendId } from '@stateforge-labs/session-ledger';
import { jevFrom, type Policy, type JevSettings } from '@stateforge-labs/session-ledger';
import { policyFrom } from '@stateforge-labs/session-ledger/compaction-timing';
import { type CompactTuning } from '@stateforge-labs/session-ledger';
import { tuningFrom } from '@stateforge-labs/session-ledger/compaction-timing';
import { compactSettingOf, curateSettingOf, deciderSettingOf, judgeSettingOf, placementFor } from '#src/recap/domain/job.ts';
import type { DeciderSetting, JobPlacement, JobSetting } from '#src/recap/domain/job.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import { textOf, type Text } from '@stateforge-labs/session-ledger';

export type RawReader = (key: string) => string | undefined;

export const typedReader = (reader: RawReader): ((key: string) => Text | undefined) => (key) => {
    const raw = reader(key);
    return raw === undefined ? undefined : textOf(raw);
};

export const judgeJobOf = (reader: RawReader): JobSetting => judgeSettingOf(typedReader(reader));

export const compactJobOf = (reader: RawReader): JobSetting => compactSettingOf(typedReader(reader));

export const curateJobOf = (reader: RawReader): JobSetting => curateSettingOf(typedReader(reader));

export const deciderJobOf = (reader: RawReader): DeciderSetting => deciderSettingOf(typedReader(reader));

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
